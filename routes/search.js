const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { optionalAuthMiddleware } = require('../middleware/authMiddleware');

// GET /api/search - Full-Text Search across Essays (FTS5), Writers, and Topics
router.get('/', optionalAuthMiddleware, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.json({ success: true, essays: [], writers: [], topics: [] });
    }

    // 1. Search Essays using SQLite FTS5 (with LIKE fallback)
    let essays = [];
    try {
      const cleanTerm = q.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, ' ').trim();
      const ftsWords = cleanTerm.split(/\s+/).filter(Boolean);
      if (ftsWords.length > 0) {
        const ftsQuery = ftsWords.map(w => `"${w}"*`).join(' OR ');
        essays = await db.allAsync(`
          SELECT p.id, p.title, p.subtitle, p.content, p.author_name as author, p.author_handle as handle, p.category, p.read_time as readTime, p.created_at, p.likes_count as likes, p.cover_image as coverImage
          FROM posts p
          JOIN posts_fts f ON p.title = f.title
          WHERE posts_fts MATCH ?
          LIMIT 10
        `, [ftsQuery]);
      }
    } catch (ftsErr) {
      // Fallback below
    }

    if (!essays || essays.length === 0) {
      const s = `%${q.toLowerCase()}%`;
      essays = await db.allAsync(`
        SELECT id, title, subtitle, content, author_name as author, author_handle as handle, category, read_time as readTime, created_at, likes_count as likes, cover_image as coverImage
        FROM posts
        WHERE LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(category) LIKE ? OR LOWER(author_name) LIKE ?
        ORDER BY created_at DESC
        LIMIT 10
      `, [s, s, s, s]);
    }

    // 2. Search Writers / Creators
    const sUser = `%${q.toLowerCase()}%`;
    const rawWriters = await db.allAsync(`
      SELECT id, name, handle, avatar, avatar_url, bio,
        (SELECT COUNT(*) FROM follows WHERE following_id = users.id) as followers
      FROM users
      WHERE LOWER(name) LIKE ? OR LOWER(handle) LIKE ? OR LOWER(bio) LIKE ?
      LIMIT 6
    `, [sUser, sUser, sUser]);

    // 3. Search Topics
    const sTopic = `%${q.toLowerCase()}%`;
    const topics = await db.allAsync(`
      SELECT category as name, COUNT(*) as count
      FROM posts
      WHERE LOWER(category) LIKE ?
      GROUP BY category
      LIMIT 6
    `, [sTopic]);

    res.json({
      success: true,
      query: q,
      essays: (essays || []).map(e => ({
        id: e.id,
        title: e.title,
        subtitle: e.subtitle,
        excerpt: e.subtitle || (e.content && e.content.length > 140 ? e.content.substring(0, 140) + '...' : e.content),
        author: e.author,
        handle: e.handle,
        category: e.category,
        readTime: e.readTime || '5 min read',
        createdAt: e.created_at
      })),
      writers: (rawWriters || []).map(w => ({
        id: w.id,
        name: w.name,
        handle: w.handle,
        avatar: w.avatar || (w.name || 'CR').substring(0, 2).toUpperCase(),
        avatar_url: w.avatar_url || null,
        bio: w.bio || '',
        readers: `${w.followers || 0} readers`
      })),
      topics: topics || []
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, message: 'Search execution failed.' });
  }
});

module.exports = router;

