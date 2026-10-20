/**
 * READORA - Database Initializer & Migration Engine
 * SQLite3 with Promise wrappers for clean async/await queries
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'readora.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error connecting to SQLite database:', err.message);
  } else {
    console.log('📦 Connected to Readora SQLite Database at:', dbPath);
  }
});

// Helper functions for Promise-based queries
db.runAsync = function(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

db.getAsync = function(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

db.allAsync = function(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize Database Tables
async function initDB() {
  try {
    // 1. Users Table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        handle TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        avatar TEXT,
        bio TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Posts Table (Thoughts & Articles)
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- 'thought' or 'article'
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Likes Table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS likes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, post_id)
      )
    `);

    // 4. Bookmarks Table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, post_id)
      )
    `);

    // 5. Comments Table
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

    // 6. Follows Table (Real social graph)
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS follows (
        id TEXT PRIMARY KEY,
        follower_id TEXT NOT NULL,
        following_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, following_id)
      )
    `);

    // 7. OTP Verifications Table
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

    // 8. Notifications Table (Likes, Comments, Follows)
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,          -- Recipient of the notification
        actor_id TEXT NOT NULL,         -- Who triggered it
        actor_name TEXT NOT NULL,
        actor_avatar TEXT,
        type TEXT NOT NULL,             -- 'like', 'comment', 'follow'
        post_id TEXT,                   -- Associated post (if any)
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed clean initial data if database is brand new
    const adminUser = await db.getAsync(`SELECT id FROM users WHERE id = 'usr_harsh'`);
    if (!adminUser) {
      await seedInitialData();
    }

    console.log('✅ All Readora database tables verified and ready.');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

async function seedInitialData() {
  console.log('🌱 Setting up baseline admin user and welcome publication...');

  // Seed default admin user
  const hashedPassword = await bcrypt.hash('readora123', 10);
  await db.runAsync(`
    INSERT OR IGNORE INTO users (id, name, email, handle, password_hash, avatar, bio)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    'usr_harsh',
    'Harsh Bansal',
    'harsh@readora.app',
    '@harshbansal',
    hashedPassword,
    'HB',
    'Creator, reader, and software developer. Sharing thoughts on code and life.'
  ]);

  // Seed clean baseline welcome thought by platform creator
  await db.runAsync(`
    INSERT OR IGNORE INTO posts (id, type, author_id, author_name, author_handle, author_avatar, content, theme, category, likes_count, bookmarks_count)
    VALUES 
    ('post_welcome_1', 'thought', 'usr_harsh', 'Harsh Bansal', '@harshbansal', 'HB', 'Welcome to READORA — where readers become creators. Share your insights, read immersive long-form articles, and build a sanctuary for thoughtful ideas.', 'theme-crimson', 'Tech', 0, 0)
  `);

  // Seed clean baseline welcome article by platform creator
  await db.runAsync(`
    INSERT OR IGNORE INTO posts (id, type, author_id, author_name, author_handle, author_avatar, title, subtitle, cover_image, content, category, read_time, likes_count, bookmarks_count)
    VALUES 
    ('post_welcome_2', 'article', 'usr_harsh', 'Harsh Bansal', '@harshbansal', 'HB', 
    'The Art of Deep Reading & Writing in a Distracted World', 
    'Why intentional expression and deep immersion are the bedrock of creative work.', 
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=800&auto=format&fit=crop', 
    'In an era defined by endless short-form noise, the ability to engage with deep, long-form thoughts has become rare—and immensely valuable.

### Why READORA Exists
We built READORA to give writers, engineers, philosophers, and thinkers a quiet sanctuary. Here, ideas are not measured by fleeting algorithms, but by depth and resonance.

### How to Get Started:
1. **Share Short Thoughts:** Use micro-cards with aesthetic gradient themes to publish epiphanies, quotes, and quick reflections.
2. **Publish Long Articles:** Write structured articles with markdown, custom covers, and estimated reading times.
3. **Engage Thoughtfully:** Save bookmarks, leave meaningful comments, and connect with other creators.

Welcome to our community.', 
    'Productivity', '3 min read', 0, 0)
  `);
}

module.exports = { db, initDB };
