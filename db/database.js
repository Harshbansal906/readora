/**
 * READORA - Universal Database Engine
 * Supports:
 * 1. PostgreSQL (via process.env.DATABASE_URL) for Render Cloud / Supabase Production
 * 2. SQLite3 (local fallback) for zero-config offline & testing development
 *
 * Provides unified Promise wrappers:
 * - db.runAsync(sql, params) -> { changes, lastID }
 * - db.getAsync(sql, params) -> row | null
 * - db.allAsync(sql, params) -> rows[]
 */

const path = require('path');
const bcrypt = require('bcryptjs');

const isPostgres = !!process.env.DATABASE_URL;
let db = {};
let pgPool = null;

if (isPostgres) {
  const { Pool } = require('pg');
  const databaseUrl = process.env.DATABASE_URL;
  const isProd = process.env.NODE_ENV === 'production' || databaseUrl.includes('render.com') || databaseUrl.includes('supabase.co');

  pgPool = new Pool({
    connectionString: databaseUrl,
    ssl: isProd ? { rejectUnauthorized: false } : false
  });

  pgPool.on('error', (err) => {
    console.error('❌ Unexpected error on idle PostgreSQL client:', err);
  });

  console.log('🐘 Connected to Readora PostgreSQL Database:', databaseUrl.replace(/:[^:@]+@/, ':****@'));

  // Convert SQLite-style '?' placeholders into PostgreSQL '$1, $2, $3...'
  function formatSql(sql) {
    let paramIndex = 1;
    let converted = sql.replace(/\?/g, () => `$${paramIndex++}`);
    // Replace SQLite "INSERT OR IGNORE" with Postgres compatible syntax
    if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(converted)) {
      converted = converted.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO');
      if (!converted.toUpperCase().includes('ON CONFLICT')) {
        converted += ' ON CONFLICT DO NOTHING';
      }
    }
    return converted;
  }

  db.runAsync = async function(sql, params = []) {
    const formatted = formatSql(sql);
    const result = await pgPool.query(formatted, params);
    return {
      changes: result.rowCount,
      rowCount: result.rowCount,
      lastID: null
    };
  };

  db.getAsync = async function(sql, params = []) {
    const formatted = formatSql(sql);
    const result = await pgPool.query(formatted, params);
    return result.rows && result.rows.length > 0 ? result.rows[0] : null;
  };

  db.allAsync = async function(sql, params = []) {
    const formatted = formatSql(sql);
    const result = await pgPool.query(formatted, params);
    return result.rows || [];
  };

  db.isPostgres = true;

} else {
  // SQLite3 for local development & automated test runner
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'readora.db');

  const sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Error connecting to SQLite database:', err.message);
    } else {
      console.log('📦 Connected to Readora SQLite Database at:', dbPath);
    }
  });

  db.runAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes, rowCount: this.changes });
      });
    });
  };

  db.getAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  };

  db.allAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  };

  db.isPostgres = false;
  db.sqliteDb = sqliteDb;
}

// Unified Database Initializer & Migration Engine
async function initDB() {
  try {
    if (isPostgres) {
      await initPostgres();
    } else {
      await initSqlite();
    }

    // Seed baseline platform creator if database is brand new
    const adminUser = await db.getAsync(`SELECT id FROM users WHERE id = ?`, ['usr_harsh']);
    if (!adminUser) {
      await seedInitialData();
    }

    console.log(`✅ All Readora database tables verified and ready on ${isPostgres ? 'PostgreSQL' : 'SQLite'}.`);
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

// PostgreSQL Table Initialization
async function initPostgres() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      handle VARCHAR(64) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      avatar VARCHAR(255),
      bio TEXT,
      website VARCHAR(255),
      preferences_json TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS posts (
      id VARCHAR(64) PRIMARY KEY,
      type VARCHAR(32) NOT NULL,
      author_id VARCHAR(64) NOT NULL,
      author_name VARCHAR(255) NOT NULL,
      author_handle VARCHAR(64) NOT NULL,
      author_avatar VARCHAR(255) NOT NULL,
      title TEXT,
      subtitle TEXT,
      content TEXT NOT NULL,
      theme VARCHAR(64) DEFAULT 'theme-crimson',
      category VARCHAR(64) DEFAULT 'General',
      cover_image TEXT,
      read_time VARCHAR(32),
      likes_count INTEGER DEFAULT 0,
      bookmarks_count INTEGER DEFAULT 0,
      views_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS likes (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      post_id VARCHAR(64) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unq_likes_user_post UNIQUE(user_id, post_id)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      post_id VARCHAR(64) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unq_bookmarks_user_post UNIQUE(user_id, post_id)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS comments (
      id VARCHAR(64) PRIMARY KEY,
      post_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64),
      author_name VARCHAR(255) NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS follows (
      id VARCHAR(64) PRIMARY KEY,
      follower_id VARCHAR(64) NOT NULL,
      following_id VARCHAR(64) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unq_follows_pair UNIQUE(follower_id, following_id)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS otps (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      otp_code VARCHAR(16) NOT NULL,
      expires_at BIGINT NOT NULL,
      verified INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      actor_id VARCHAR(64) NOT NULL,
      actor_name VARCHAR(255) NOT NULL,
      actor_avatar VARCHAR(255),
      type VARCHAR(32) NOT NULL,
      post_id VARCHAR(64),
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS drafts (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      title TEXT,
      subtitle TEXT,
      content TEXT,
      category VARCHAR(64) DEFAULT 'General',
      cover_image TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unq_drafts_user UNIQUE(user_id)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS article_views (
      id VARCHAR(64) PRIMARY KEY,
      post_id VARCHAR(64) NOT NULL,
      viewer_key VARCHAR(128) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unq_article_views_post_viewer UNIQUE(post_id, viewer_key)
    )
  `);

  // PostgreSQL Indexes
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_follows_pair ON follows(follower_id, following_id)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_article_views_post ON article_views(post_id)`);

  // Phase 3, 4, 6, 7 & 10 PostgreSQL Migrations
  try { await db.runAsync(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`); } catch(e) {}
  try { await db.runAsync(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(16) DEFAULT 'en'`); } catch(e) {}
  try { await db.runAsync(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS language VARCHAR(16) DEFAULT 'en'`); } catch(e) {}
  try { await db.runAsync(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload TEXT`); } catch(e) {}
  try { await db.runAsync(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE`); } catch(e) {}

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS friendships (
      requester_id VARCHAR(64) NOT NULL,
      addressee_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (requester_id, addressee_id),
      CHECK (requester_id != addressee_id)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id VARCHAR(64) NOT NULL,
      blocked_id VARCHAR(64) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (blocker_id, blocked_id),
      CHECK (blocker_id != blocked_id)
    )
  `);
}

// SQLite Table Initialization
async function initSqlite() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      handle TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT,
      bio TEXT,
      website TEXT,
      preferences_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_handle TEXT NOT NULL,
      author_avatar TEXT NOT NULL,
      title TEXT,
      subtitle TEXT,
      content TEXT NOT NULL,
      theme TEXT DEFAULT 'theme-crimson',
      category TEXT DEFAULT 'General',
      cover_image TEXT,
      read_time TEXT,
      likes_count INTEGER DEFAULT 0,
      bookmarks_count INTEGER DEFAULT 0,
      views_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, post_id)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, post_id)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      user_id TEXT,
      author_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      follower_id TEXT NOT NULL,
      following_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(follower_id, following_id)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS otps (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      verified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_avatar TEXT,
      type TEXT NOT NULL,
      post_id TEXT,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      subtitle TEXT,
      content TEXT,
      category TEXT DEFAULT 'General',
      cover_image TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS article_views (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      viewer_key TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, viewer_key)
    )
  `);

  // High Performance Database Indexes
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_follows_pair ON follows(follower_id, following_id)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC)`);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_article_views_post ON article_views(post_id)`);

  // Phase 3, 4, 6, 7 & 10 PostgreSQL Migrations
  try { await db.runAsync(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`); } catch(e) {}
  try { await db.runAsync(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(16) DEFAULT 'en'`); } catch(e) {}
  try { await db.runAsync(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS language VARCHAR(16) DEFAULT 'en'`); } catch(e) {}
  try { await db.runAsync(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload TEXT`); } catch(e) {}
  try { await db.runAsync(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE`); } catch(e) {}

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS friendships (
      requester_id VARCHAR(64) NOT NULL,
      addressee_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (requester_id, addressee_id),
      CHECK (requester_id != addressee_id)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id VARCHAR(64) NOT NULL,
      blocked_id VARCHAR(64) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (blocker_id, blocked_id),
      CHECK (blocker_id != blocked_id)
    )
  `);

  // Phase 3, 4, 6, 7 & 10 Migrations (safe to run on existing tables)
  try { await db.runAsync(`ALTER TABLE users ADD COLUMN avatar_url TEXT`); } catch(e) {}
  try { await db.runAsync(`ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en'`); } catch(e) {}
  try { await db.runAsync(`ALTER TABLE posts ADD COLUMN language TEXT DEFAULT 'en'`); } catch(e) {}
  try { await db.runAsync(`ALTER TABLE notifications ADD COLUMN payload TEXT`); } catch(e) {}
  try { await db.runAsync(`ALTER TABLE notifications ADD COLUMN read_at DATETIME`); } catch(e) {}

  // Friendships Table (Phase 6)
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS friendships (
      requester_id TEXT NOT NULL,
      addressee_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending' or 'accepted'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (requester_id, addressee_id),
      CHECK (requester_id != addressee_id)
    )
  `);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status)`);

  // Blocks Table (Phase 6)
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (blocker_id, blocked_id),
      CHECK (blocker_id != blocked_id)
    )
  `);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id)`);

  // FTS5 Virtual Table for Fast Search (Phase 10)
  try {
    await db.runAsync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
        id UNINDEXED,
        title,
        subtitle,
        content,
        category,
        author_name
      )
    `);
  } catch(e) {}
}

async function seedInitialData() {
  console.log('🌱 Setting up baseline admin user and welcome publication...');

  const hashedPassword = await bcrypt.hash('readora123', 10);
  await db.runAsync(`
    INSERT INTO users (id, name, email, handle, password_hash, avatar, bio)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `, [
    'usr_harsh',
    'Harsh Bansal',
    'harsh@readora.app',
    '@harshbansal',
    hashedPassword,
    'HB',
    'Creator, reader, and software developer. Sharing thoughts on code and life.'
  ]);

  await db.runAsync(`
    INSERT INTO posts (id, type, author_id, author_name, author_handle, author_avatar, content, theme, category, likes_count, bookmarks_count)
    VALUES (?, 'thought', ?, ?, ?, ?, ?, ?, ?, 0, 0)
    ON CONFLICT DO NOTHING
  `, [
    'post_welcome_1',
    'usr_harsh',
    'Harsh Bansal',
    '@harshbansal',
    'HB',
    'Welcome to READORA — where readers become creators. Share your insights, read immersive long-form articles, and build a sanctuary for thoughtful ideas.',
    'theme-crimson',
    'Tech'
  ]);

  await db.runAsync(`
    INSERT INTO posts (id, type, author_id, author_name, author_handle, author_avatar, title, subtitle, cover_image, content, category, read_time, likes_count, bookmarks_count)
    VALUES (?, 'article', ?, ?, ?, ?, ?, ?, ?, ?, ?, '3 min read', 0, 0)
    ON CONFLICT DO NOTHING
  `, [
    'post_welcome_2',
    'usr_harsh',
    'Harsh Bansal',
    '@harshbansal',
    'HB',
    'The Art of Deep Reading & Writing in a Distracted World',
    'Why intentional expression and deep immersion are the bedrock of creative work.',
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=800&auto=format&fit=crop',
    `In an era defined by endless short-form noise, the ability to engage with deep, long-form thoughts has become rare—and immensely valuable.

### Why READORA Exists
We built READORA to give writers, engineers, philosophers, and thinkers a quiet sanctuary. Here, ideas are not measured by fleeting algorithms, but by depth and resonance.

### How to Get Started:
1. **Share Short Thoughts:** Use micro-cards with aesthetic gradient themes to publish epiphanies, quotes, and quick reflections.
2. **Publish Long Articles:** Write structured articles with markdown, custom covers, and estimated reading times.
3. **Engage Thoughtfully:** Save bookmarks, leave meaningful comments, and connect with other creators.

Welcome to our community.`,
    'Productivity'
  ]);
}

module.exports = { db, initDB };
