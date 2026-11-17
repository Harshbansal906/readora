const { db, initDB } = require('../db/database');

async function verify() {
  await initDB();
  const tables = await db.allAsync("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log('Detected tables in readora.db:', tables.map(t => t.name));

  const requiredTables = ['users', 'posts', 'drafts', 'follows', 'friendships', 'blocks', 'notifications', 'posts_fts', 'conversations', 'messages'];
  for (const t of requiredTables) {
    const row = await db.getAsync(`SELECT count(*) as count FROM ${t}`);
    console.log(`Table ${t}: ${row.count} records`);
  }
}

verify().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
