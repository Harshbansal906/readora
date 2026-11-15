const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/authMiddleware');

// In-memory rate limiter: max 20 friend requests per 24 hours
const friendRequestTimestamps = new Map();
function checkFriendRequestLimit(userId) {
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  let timestamps = friendRequestTimestamps.get(userId) || [];
  timestamps = timestamps.filter(ts => now - ts < windowMs);
  if (timestamps.length >= 20) return false;
  timestamps.push(now);
  friendRequestTimestamps.set(userId, timestamps);
  return true;
}

async function isBlocked(idA, idB) {
  const block = await db.getAsync(
    `SELECT * FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
    [idA, idB, idB, idA]
  );
  return !!block;
}

// GET /api/friends/status/:userId - Get friendship status with target user
router.get('/status/:userId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    if (currentUserId === targetUserId) {
      return res.json({ success: true, status: 'self' });
    }

    if (await isBlocked(currentUserId, targetUserId)) {
      return res.json({ success: true, status: 'blocked' });
    }

    const row = await db.getAsync(`
      SELECT requester_id, addressee_id, status 
      FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `, [currentUserId, targetUserId, targetUserId, currentUserId]);

    if (!row) {
      return res.json({ success: true, status: 'none' });
    }

    if (row.status === 'accepted') {
      return res.json({ success: true, status: 'friends' });
    }

    if (row.requester_id === currentUserId) {
      return res.json({ success: true, status: 'pending_outgoing' });
    } else {
      return res.json({ success: true, status: 'pending_incoming' });
    }
  } catch (error) {
    console.error('Friend status error:', error);
    res.status(500).json({ success: false, message: 'Failed to check friend status.' });
  }
});

// POST /api/friends/request - Send a friend request
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const requesterId = req.user.id;
    const { targetUserId } = req.body;

    if (!targetUserId || requesterId === targetUserId) {
      return res.status(400).json({ success: false, message: 'Invalid target user.' });
    }

    if (!checkFriendRequestLimit(requesterId)) {
      return res.status(429).json({ success: false, message: 'Rate limit exceeded: maximum 20 friend requests per day.' });
    }

    if (await isBlocked(requesterId, targetUserId)) {
      return res.status(403).json({ success: false, message: 'Unable to send friend request.' });
    }

    // Check if target user exists
    const targetUser = await db.getAsync(`SELECT id, name FROM users WHERE id = ?`, [targetUserId]);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Check existing friendship
    const existing = await db.getAsync(`
      SELECT requester_id, addressee_id, status 
      FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `, [requesterId, targetUserId, targetUserId, requesterId]);

    if (existing) {
      if (existing.status === 'accepted') {
        return res.json({ success: true, message: 'You are already friends with this user.', status: 'friends' });
      }
      if (existing.requester_id === requesterId) {
        return res.json({ success: true, message: 'Friend request already sent.', status: 'pending_outgoing' });
      }
      // Incoming request already pending -> accept automatically
      await db.runAsync(`
        UPDATE friendships SET status = 'accepted' 
        WHERE requester_id = ? AND addressee_id = ?
      `, [targetUserId, requesterId]);

      return res.json({ success: true, message: `You and ${targetUser.name} are now friends!`, status: 'friends' });
    }

    // Insert pending request
    await db.runAsync(`
      INSERT INTO friendships (requester_id, addressee_id, status, created_at)
      VALUES (?, ?, 'pending', datetime('now'))
    `, [requesterId, targetUserId]);

    // Create notification
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await db.runAsync(`
      INSERT INTO notifications (id, user_id, actor_id, actor_name, actor_avatar, type, message, payload, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 'friend_request', ?, ?, 0, datetime('now'))
    `, [notifId, targetUserId, requesterId, req.user.name, req.user.avatar || 'RD', `${req.user.name} sent you a friend request.`, JSON.stringify({ message: `${req.user.name} sent you a friend request.` })]);

    res.json({ success: true, message: 'Friend request sent.', status: 'pending_outgoing' });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ success: false, message: 'Failed to send friend request.' });
  }
});

// POST /api/friends/accept - Accept incoming friend request
router.post('/accept', authMiddleware, async (req, res) => {
  try {
    const addresseeId = req.user.id;
    const { requesterId } = req.body;

    if (!requesterId) {
      return res.status(400).json({ success: false, message: 'Requester ID is required.' });
    }

    const row = await db.getAsync(`
      SELECT * FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'
    `, [requesterId, addresseeId]);

    if (!row) {
      return res.status(404).json({ success: false, message: 'No pending friend request found.' });
    }

    await db.runAsync(`
      UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ?
    `, [requesterId, addresseeId]);

    // Send notification to requester
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await db.runAsync(`
      INSERT INTO notifications (id, user_id, actor_id, actor_name, actor_avatar, type, message, payload, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 'friend_accept', ?, ?, 0, datetime('now'))
    `, [notifId, requesterId, addresseeId, req.user.name, req.user.avatar || 'RD', `${req.user.name} accepted your friend request.`, JSON.stringify({ message: `${req.user.name} accepted your friend request.` })]);

    res.json({ success: true, message: 'Friend request accepted!', status: 'friends' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept friend request.' });
  }
});

// POST /api/friends/decline - Decline incoming friend request
router.post('/decline', authMiddleware, async (req, res) => {
  try {
    const addresseeId = req.user.id;
    const { requesterId } = req.body;

    await db.runAsync(`
      DELETE FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'
    `, [requesterId, addresseeId]);

    res.json({ success: true, message: 'Friend request declined.', status: 'none' });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ success: false, message: 'Failed to decline friend request.' });
  }
});

// POST /api/friends/cancel - Cancel outgoing pending request
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const requesterId = req.user.id;
    const { targetUserId } = req.body;

    await db.runAsync(`
      DELETE FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'
    `, [requesterId, targetUserId]);

    res.json({ success: true, message: 'Friend request cancelled.', status: 'none' });
  } catch (error) {
    console.error('Cancel friend request error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel request.' });
  }
});

// DELETE /api/friends/:id - Remove a friend (unfriend)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.id;

    await db.runAsync(`
      DELETE FROM friendships 
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `, [userId, targetUserId, targetUserId, userId]);

    res.json({ success: true, message: 'Friend removed.', status: 'none' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove friend.' });
  }
});

// GET /api/friends - List all accepted friends
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const rows = await db.allAsync(`
      SELECT u.id, u.name, u.handle, u.avatar, u.avatar_url, u.bio, f.created_at as friends_since
      FROM friendships f
      JOIN users u ON (CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END) = u.id
      WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
      ORDER BY f.created_at DESC
    `, [userId, userId, userId]);

    res.json({ success: true, count: rows.length, friends: rows });
  } catch (error) {
    console.error('List friends error:', error);
    res.status(500).json({ success: false, message: 'Failed to list friends.' });
  }
});

// GET /api/friends/requests - List pending incoming & outgoing requests
router.get('/requests', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const incoming = await db.allAsync(`
      SELECT u.id, u.name, u.handle, u.avatar, u.avatar_url, f.created_at
      FROM friendships f
      JOIN users u ON f.requester_id = u.id
      WHERE f.addressee_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `, [userId]);

    const outgoing = await db.allAsync(`
      SELECT u.id, u.name, u.handle, u.avatar, u.avatar_url, f.created_at
      FROM friendships f
      JOIN users u ON f.addressee_id = u.id
      WHERE f.requester_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `, [userId]);

    res.json({ success: true, incoming, outgoing });
  } catch (error) {
    console.error('List friend requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to list requests.' });
  }
});

module.exports = router;

