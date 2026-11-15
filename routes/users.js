const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { db } = require('../db/database');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');

// Ensure directory exists
if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

// Memory storage for multer (max 2MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

// Magic bytes verification for JPEG, PNG, and WebP
function verifyImageMagicBytes(buffer) {
  if (!buffer || buffer.length < 12) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) return 'png';
  // WebP: 'RIFF' at 0..3 and 'WEBP' at 8..11
  const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
  if (isRiff && isWebp) return 'webp';
  return false;
}

// POST /api/users/avatar - Upload profile picture (Phase 3)
router.post('/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Please select an image file to upload.' });
    }

    const detectedType = verifyImageMagicBytes(req.file.buffer);
    if (!detectedType) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only real JPEG, PNG, and WebP images under 2MB are supported.'
      });
    }

    const userId = req.user.id;
    const baseFilename = `avatar_${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const file512 = `${baseFilename}_512.webp`;
    const file128 = `${baseFilename}_128.webp`;
    const path512 = path.join(AVATAR_DIR, file512);
    const path128 = path.join(AVATAR_DIR, file128);

    // Sharp square center crop and export to WebP quality 80
    await sharp(req.file.buffer)
      .resize(512, 512, { fit: 'cover', position: 'center' })
      .webp({ quality: 80 })
      .toFile(path512);

    await sharp(req.file.buffer)
      .resize(128, 128, { fit: 'cover', position: 'center' })
      .webp({ quality: 80 })
      .toFile(path128);

    const avatarUrl = `/uploads/avatars/${file512}?v=${Date.now()}`;
    const avatarUrl128 = `/uploads/avatars/${file128}?v=${Date.now()}`;

    // Update database
    await db.runAsync(`UPDATE users SET avatar_url = ? WHERE id = ?`, [avatarUrl, userId]);

    res.json({
      success: true,
      message: 'Profile picture updated successfully.',
      avatarUrl,
      avatarUrl128
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ success: false, message: 'Failed to process and save avatar.' });
  }
});

// DELETE /api/users/avatar - Remove profile picture (fallback to initials)
router.delete('/avatar', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const baseFilename = `avatar_${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const file512 = path.join(AVATAR_DIR, `${baseFilename}_512.webp`);
    const file128 = path.join(AVATAR_DIR, `${baseFilename}_128.webp`);

    if (fs.existsSync(file512)) fs.unlinkSync(file512);
    if (fs.existsSync(file128)) fs.unlinkSync(file128);

    await db.runAsync(`UPDATE users SET avatar_url = NULL WHERE id = ?`, [userId]);

    res.json({
      success: true,
      message: 'Profile picture removed. Initials will be displayed.'
    });
  } catch (error) {
    console.error('Remove avatar error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove avatar.' });
  }
});

// GET /api/users/:id/avatar - Serve avatar with cache headers and ETag
router.get('/:id/avatar', async (req, res) => {
  try {
    const size = req.query.size === '128' ? '128' : '512';
    const baseFilename = `avatar_${req.params.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_${size}.webp`;
    const filePath = path.join(AVATAR_DIR, baseFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Avatar not found' });
    }

    const stat = fs.statSync(filePath);
    const etag = crypto.createHash('md5').update(`${stat.size}-${stat.mtimeMs}`).digest('hex');

    res.set({
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': `"${etag}"`
    });

    if (req.headers['if-none-match'] === `"${etag}"`) {
      return res.status(304).end();
    }

    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    res.status(500).send('Error serving avatar');
  }
});

// --------------------------------------------------------------------------
// PHASE 4: Follow Graph Endpoints
// --------------------------------------------------------------------------

// Rate limiter for follow actions: max 100/hour
const followTimestamps = new Map();
function checkFollowRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  let timestamps = followTimestamps.get(userId) || [];
  timestamps = timestamps.filter(ts => now - ts < windowMs);
  if (timestamps.length >= 100) return false;
  timestamps.push(now);
  followTimestamps.set(userId, timestamps);
  return true;
}

// POST /api/users/:id/follow - Follow an author (idempotent)
router.post('/:id/follow', authMiddleware, async (req, res) => {
  try {
    const followerId = req.user.id;
    const targetUserId = req.params.id;

    if (followerId === targetUserId) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself.' });
    }

    if (!checkFollowRateLimit(followerId)) {
      return res.status(429).json({ success: false, message: 'Rate limit exceeded: max 100 follow actions per hour.' });
    }

    // Check if target user exists
    const targetUser = await db.getAsync(`SELECT id, name FROM users WHERE id = ?`, [targetUserId]);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Check if either user has blocked the other
    const block = await db.getAsync(
      `SELECT * FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
      [followerId, targetUserId, targetUserId, followerId]
    );
    if (block) {
      return res.status(403).json({ success: false, message: 'Unable to follow this user due to privacy settings.' });
    }

    // Idempotent follow
    const existing = await db.getAsync(
      `SELECT id FROM follows WHERE follower_id = ? AND following_id = ?`,
      [followerId, targetUserId]
    );

    if (!existing) {
      const followId = `fol_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.runAsync(
        `INSERT INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, datetime('now'))`,
        [followId, followerId, targetUserId]
      );

      // Create notification
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.runAsync(
        `INSERT INTO notifications (id, user_id, actor_id, type, payload, created_at) VALUES (?, ?, ?, 'follow', ?, datetime('now'))`,
        [notifId, targetUserId, followerId, JSON.stringify({ message: `${req.user.name} started following you.` })]
      );
    }

    const followersCountRow = await db.getAsync(`SELECT COUNT(*) as count FROM follows WHERE following_id = ?`, [targetUserId]);

    res.json({
      success: true,
      message: `You are now following ${targetUser.name}.`,
      isFollowing: true,
      followersCount: followersCountRow ? followersCountRow.count : 0
    });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ success: false, message: 'Internal server error while following author.' });
  }
});

// DELETE /api/users/:id/follow - Unfollow an author (idempotent)
router.delete('/:id/follow', authMiddleware, async (req, res) => {
  try {
    const followerId = req.user.id;
    const targetUserId = req.params.id;

    if (!checkFollowRateLimit(followerId)) {
      return res.status(429).json({ success: false, message: 'Rate limit exceeded: max 100 follow actions per hour.' });
    }

    await db.runAsync(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`, [followerId, targetUserId]);
    const followersCountRow = await db.getAsync(`SELECT COUNT(*) as count FROM follows WHERE following_id = ?`, [targetUserId]);

    res.json({
      success: true,
      message: 'Unfollowed successfully.',
      isFollowing: false,
      followersCount: followersCountRow ? followersCountRow.count : 0
    });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ success: false, message: 'Internal server error while unfollowing author.' });
  }
});

// GET /api/users/:id/followers - List followers
router.get('/:id/followers', optionalAuthMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user ? req.user.id : null;

    const rows = await db.allAsync(`
      SELECT u.id, u.name, u.handle, u.avatar, u.avatar_url, u.bio
      FROM follows f
      JOIN users u ON f.follower_id = u.id
      WHERE f.following_id = ?
      ORDER BY f.created_at DESC
    `, [targetUserId]);

    res.json({ success: true, count: rows.length, followers: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch followers.' });
  }
});

// GET /api/users/:id/following - List authors followed
router.get('/:id/following', optionalAuthMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const rows = await db.allAsync(`
      SELECT u.id, u.name, u.handle, u.avatar, u.avatar_url, u.bio
      FROM follows f
      JOIN users u ON f.following_id = u.id
      WHERE f.follower_id = ?
      ORDER BY f.created_at DESC
    `, [targetUserId]);

    res.json({ success: true, count: rows.length, following: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch following authors.' });
  }
});

// --------------------------------------------------------------------------
// PHASE 6: Blocking Endpoints
// --------------------------------------------------------------------------

// POST /api/users/:id/block - Block a user
router.post('/:id/block', authMiddleware, async (req, res) => {
  try {
    const blockerId = req.user.id;
    const blockedId = req.params.id;

    if (blockerId === blockedId) {
      return res.status(400).json({ success: false, message: 'You cannot block yourself.' });
    }

    // Insert block record
    await db.runAsync(`
      INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at)
      VALUES (?, ?, datetime('now'))
    `, [blockerId, blockedId]);

    // Sever follow relationships both ways
    await db.runAsync(`
      DELETE FROM follows 
      WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)
    `, [blockerId, blockedId, blockedId, blockerId]);

    // Sever friendships both ways
    await db.runAsync(`
      DELETE FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `, [blockerId, blockedId, blockedId, blockerId]);

    res.json({ success: true, message: 'User blocked successfully.' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ success: false, message: 'Failed to block user.' });
  }
});

// DELETE /api/users/:id/block - Unblock a user
router.delete('/:id/block', authMiddleware, async (req, res) => {
  try {
    const blockerId = req.user.id;
    const blockedId = req.params.id;

    await db.runAsync(`DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?`, [blockerId, blockedId]);

    res.json({ success: true, message: 'User unblocked successfully.' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ success: false, message: 'Failed to unblock user.' });
  }
});

// GET /api/users/blocked - List blocked users
router.get('/blocked', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await db.allAsync(`
      SELECT u.id, u.name, u.handle, u.avatar, u.avatar_url, b.created_at as blocked_at
      FROM blocks b
      JOIN users u ON b.blocked_id = u.id
      WHERE b.blocker_id = ?
      ORDER BY b.created_at DESC
    `, [userId]);

    res.json({ success: true, count: rows.length, blockedUsers: rows });
  } catch (error) {
    console.error('List blocked users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch blocked users.' });
  }
});

module.exports = router;
