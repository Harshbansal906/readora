/**
 * READORA - Database Schema Migration Script
 * Applies schema additions for Phases 3, 4, 6, 7, and 10 safely
 */

require('dotenv').config();
const { initDB, db } = require('../db/database');

async function migrate() {
  console.log('🚀 Running READORA Phase updates database migration...');
  await initDB();
  console.log('✅ Migration completed successfully!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

