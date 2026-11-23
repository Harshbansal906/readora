/**
 * Migration: Create conversations and messages tables for Private Direct Messages
 * Safe to run multiple times (idempotent)
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

async function runMigration(dbFilePath) {
  const targetPath = dbFilePath || path.join(__dirname, '..', 'readora.db');
  console.log(`Running messages migration on: ${targetPath}`);

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(targetPath, async (err) => {
      if (err) return reject(err);

      const run = (sql) => new Promise((res, rej) => db.run(sql, (e) => e ? rej(e) : res()));

      try {
        // 1. Conversations table
        await run(`
          CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            user_low_id TEXT NOT NULL,
            user_high_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_low_id, user_high_id)
          )
        `);

        // Index conversations on user IDs
        await run(`CREATE INDEX IF NOT EXISTS idx_conversations_user_low ON conversations(user_low_id)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_conversations_user_high ON conversations(user_high_id)`);

        // 2. Messages table
        await run(`
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            read_at DATETIME,
            deleted_at DATETIME,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id),
            FOREIGN KEY (sender_id) REFERENCES users(id)
          )
        `);

        // Index messages on (conversation_id, created_at)
        await run(`CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at)`);

        console.log('✅ Migration succeeded: conversations and messages tables and indexes ready.');
        db.close(resolve);
      } catch (sqlErr) {
        db.close(() => reject(sqlErr));
      }
    });
  });
}

if (require.main === module) {
  const targetDb = process.argv[2];
  runMigration(targetDb)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };

