const express = require('express');
const router = express.Router();
const { AccessToken } = require('livekit-server-sdk');
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/authMiddleware');

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'readora_livekit_key';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'readora_livekit_secret_32_characters_long_key';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://readora.livekit.cloud';

// Rate limiting: max 10 calls per 10 minutes
const callAttempts = new Map();
function checkCallLimit(userId) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  let timestamps = callAttempts.get(userId) || [];
  timestamps = timestamps.filter(ts => now - ts < windowMs);
  if (timestamps.length >= 10) return false;
  timestamps.push(now);
  callAttempts.set(userId, timestamps);
  return true;
}

// POST /api/calls/token - Generate LiveKit token (strictly mutual friends only, 10 min TTL)
router.post('/token', authMiddleware, async (req, res) => {
  try {
    const callerId = req.user.id;
    const { targetUserId, roomName } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'Target user ID is required.' });
    }

    if (callerId === targetUserId) {
      return res.status(400).json({ success: false, message: 'You cannot call yourself.' });
    }

    if (!checkCallLimit(callerId)) {
      return res.status(429).json({ success: false, message: 'Call rate limit exceeded: maximum 10 call attempts per 10 minutes.' });
    }

    // 1. Verify mutual friendship (Calls are only available between mutual friends)
    const friendship = await db.getAsync(`
      SELECT * FROM friendships
      WHERE status = 'accepted'
      AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
    `, [callerId, targetUserId, targetUserId, callerId]);

    if (!friendship) {
      return res.status(403).json({
        success: false,
        message: 'Audio and video calls are only permitted between mutual friends on Readora.'
      });
    }

    // 2. Verify neither user has blocked the other
    const block = await db.getAsync(`
      SELECT * FROM blocks
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
    `, [callerId, targetUserId, targetUserId, callerId]);

    if (block) {
      return res.status(403).json({ success: false, message: 'Unable to connect call due to privacy settings.' });
    }

    // Check target user
    const targetUser = await db.getAsync(`SELECT id, name, handle FROM users WHERE id = ?`, [targetUserId]);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Target user not found.' });
    }

    // 3. Generate scoped LiveKit AccessToken with 10 min (600s) TTL
    const room = roomName || `call_${[callerId, targetUserId].sort().join('_')}_${Date.now()}`;
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: req.user.handle || req.user.id,
      name: req.user.name,
      ttl: 600 // 10 minutes
    });

    token.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    const jwtToken = await token.toJwt();

    // 4. Create incoming call notification for target user
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await db.runAsync(`
      INSERT INTO notifications (id, user_id, actor_id, actor_name, actor_avatar, type, message, payload, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 'call_incoming', ?, ?, 0, datetime('now'))
    `, [
      notifId,
      targetUserId,
      callerId,
      req.user.name,
      req.user.avatar || 'RD',
      `${req.user.name} is calling you.`,
      JSON.stringify({
        room,
        callerName: req.user.name,
        callerHandle: req.user.handle,
        message: `${req.user.name} is calling you.`
      })
    ]);

    res.json({
      success: true,
      token: jwtToken,
      room,
      livekitUrl: LIVEKIT_URL,
      caller: { id: req.user.id, name: req.user.name, handle: req.user.handle },
      target: { id: targetUser.id, name: targetUser.name, handle: targetUser.handle }
    });
  } catch (error) {
    console.error('Call token generation error:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate call session.' });
  }
});

// POST /api/calls/missed - Record a missed call notification
router.post('/missed', authMiddleware, async (req, res) => {
  try {
    const callerId = req.user.id;
    const { targetUserId, room } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'Target user ID is required.' });
    }

    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await db.runAsync(`
      INSERT INTO notifications (id, user_id, actor_id, actor_name, actor_avatar, type, message, payload, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 'call_missed', ?, ?, 0, datetime('now'))
    `, [
      notifId,
      targetUserId,
      callerId,
      req.user.name,
      req.user.avatar || 'RD',
      `Missed call from ${req.user.name}.`,
      JSON.stringify({
        room,
        callerName: req.user.name,
        callerHandle: req.user.handle,
        message: `Missed call from ${req.user.name}.`
      })
    ]);

    res.json({ success: true, message: 'Missed call recorded.' });
  } catch (error) {
    console.error('Missed call recording error:', error);
    res.status(500).json({ success: false, message: 'Failed to record missed call.' });
  }
});

module.exports = router;
