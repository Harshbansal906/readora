const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/authMiddleware');

// Sliding window rate limiter: max 60 messages per user per minute
const messageRateLimits = new Map();
function checkMessageRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  let timestamps = messageRateLimits.get(userId) || [];
  timestamps = timestamps.filter(ts => now - ts < windowMs);
  if (timestamps.length >= 60) {
    return false;
  }
  timestamps.push(now);
  messageRateLimits.set(userId, timestamps);
  return true;
}

// Helper: check if either user blocked the other
async function isBlocked(idA, idB) {
  const block = await db.getAsync(`
    SELECT 1 FROM blocks 
    WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
  `, [idA, idB, idB, idA]);
  return !!block;
}

// Helper: check if users are accepted mutual friends
async function areFriends(idA, idB) {
  const friendship = await db.getAsync(`
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
    AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
  `, [idA, idB, idB, idA]);
  return !!friendship;
}

// Helper: HTML escape for output safety
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --------------------------------------------------------------------------
// 1. GET /api/conversations
// Returns the signed-in user's active conversations (excluding blocked pairs)
// --------------------------------------------------------------------------
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch conversations where current user is a member
    const convRows = await db.allAsync(`
      SELECT * FROM conversations
      WHERE user_low_id = ? OR user_high_id = ?
      ORDER BY last_message_at DESC
    `, [userId, userId]);

    const conversations = [];

    for (const c of convRows) {
      const otherUserId = c.user_low_id === userId ? c.user_high_id : c.user_low_id;

      // If either user has blocked the other, hide conversation completely
      if (await isBlocked(userId, otherUserId)) {
        continue;
      }

      // Other user details (or "Deleted user" fallback)
      const otherUser = await db.getAsync(`
        SELECT id, name, handle, avatar, avatar_url FROM users WHERE id = ?
      `, [otherUserId]);

      const friendStatus = await areFriends(userId, otherUserId);

      // Latest message
      const lastMsg = await db.getAsync(`
        SELECT id, body, created_at, sender_id, read_at, deleted_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `, [c.id]);

      let preview = '';
      if (lastMsg) {
        if (lastMsg.deleted_at) {
          preview = 'This message was deleted.';
        } else {
          preview = lastMsg.body.length > 80 ? lastMsg.body.substring(0, 80) + '...' : lastMsg.body;
        }
      }

      // Unread count
      const unreadRow = await db.getAsync(`
        SELECT COUNT(*) as count FROM messages
        WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL AND deleted_at IS NULL
      `, [c.id, userId]);

      conversations.push({
        id: c.id,
        created_at: c.created_at,
        last_message_at: c.last_message_at,
        otherUser: otherUser ? {
          id: otherUser.id,
          name: otherUser.name,
          handle: otherUser.handle,
          avatar: otherUser.avatar,
          avatar_url: otherUser.avatar_url
        } : {
          id: otherUserId,
          name: 'Deleted user',
          handle: '@deleted',
          avatar: 'DU',
          avatar_url: null
        },
        lastMessage: lastMsg ? {
          id: lastMsg.id,
          body: lastMsg.deleted_at ? 'This message was deleted.' : escapeHtml(lastMsg.body),
          created_at: lastMsg.created_at,
          sender_id: lastMsg.sender_id,
          is_deleted: !!lastMsg.deleted_at
        } : null,
        preview: escapeHtml(preview),
        unreadCount: unreadRow ? Number(unreadRow.count) : 0,
        isReadOnly: !friendStatus
      });
    }

    res.json({
      success: true,
      conversations
    });
  } catch (error) {
    console.error('Fetch conversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations.' });
  }
});

// --------------------------------------------------------------------------
// 2. POST /api/conversations/:userId
// Creates or retrieves a conversation with a specific friend
// --------------------------------------------------------------------------
router.post('/:userId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    if (!targetUserId || targetUserId === currentUserId) {
      return res.status(400).json({ success: false, message: 'Invalid target user.' });
    }

    // Verify target user exists
    const targetUser = await db.getAsync(`SELECT id, name, handle, avatar, avatar_url FROM users WHERE id = ?`, [targetUserId]);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Check blocking (403)
    if (await isBlocked(currentUserId, targetUserId)) {
      return res.status(403).json({ success: false, message: 'Unable to message this user due to privacy settings.' });
    }

    // Check friendship (403: Only accepted friends can open a conversation)
    if (!(await areFriends(currentUserId, targetUserId))) {
      return res.status(403).json({ success: false, message: 'You can only message accepted friends.' });
    }

    // Canonical ordering
    const [lowId, highId] = [currentUserId, targetUserId].sort();

    let conv = await db.getAsync(`
      SELECT * FROM conversations WHERE user_low_id = ? AND user_high_id = ?
    `, [lowId, highId]);

    if (!conv) {
      const convId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await db.runAsync(`
        INSERT INTO conversations (id, user_low_id, user_high_id, created_at, last_message_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `, [convId, lowId, highId]);

      conv = await db.getAsync(`SELECT * FROM conversations WHERE id = ?`, [convId]);
    }

    res.json({
      success: true,
      conversation: {
        id: conv.id,
        created_at: conv.created_at,
        last_message_at: conv.last_message_at,
        otherUser: targetUser,
        isReadOnly: false
      }
    });
  } catch (error) {
    console.error('Create/get conversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to access conversation.' });
  }
});

// --------------------------------------------------------------------------
// 3. GET /api/conversations/:id/messages?before=<cursor>&limit=30
// Returns paginated messages for a conversation
// --------------------------------------------------------------------------
router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const convId = req.params.id;
    const currentUserId = req.user.id;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const beforeCursor = req.query.before; // created_at or message id

    // Find conversation
    const conv = await db.getAsync(`SELECT * FROM conversations WHERE id = ?`, [convId]);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    // Verify membership: do not reveal existence to outsiders
    if (conv.user_low_id !== currentUserId && conv.user_high_id !== currentUserId) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const otherUserId = conv.user_low_id === currentUserId ? conv.user_high_id : conv.user_low_id;

    // If blocked, conversation is hidden
    if (await isBlocked(currentUserId, otherUserId)) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const friendStatus = await areFriends(currentUserId, otherUserId);

    let query = `
      SELECT m.*, u.name as sender_name, u.avatar as sender_avatar, u.avatar_url as sender_avatar_url
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
    `;
    const params = [convId];

    if (beforeCursor) {
      query += ` AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))`;
      params.push(beforeCursor, beforeCursor, beforeCursor);
    }

    query += ` ORDER BY m.created_at DESC, m.id DESC LIMIT ?`;
    params.push(limit);

    const rows = await db.allAsync(query, params);

    // Format messages
    const formatted = rows.map(m => {
      const isDeleted = !!m.deleted_at;
      const isMine = m.sender_id === currentUserId;
      return {
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        sender_name: m.sender_name || 'Deleted user',
        sender_avatar: m.sender_avatar || 'DU',
        sender_avatar_url: m.sender_avatar_url || null,
        body: isDeleted ? 'This message was deleted.' : escapeHtml(m.body),
        created_at: m.created_at,
        read_at: m.read_at,
        is_deleted: isDeleted,
        is_mine: isMine
      };
    });

    // Reverse so client receives chronological order (oldest to newest in the slice)
    formatted.reverse();

    // Check other user details
    const otherUser = await db.getAsync(`
      SELECT id, name, handle, avatar, avatar_url FROM users WHERE id = ?
    `, [otherUserId]);

    res.json({
      success: true,
      conversationId: conv.id,
      isReadOnly: !friendStatus,
      otherUser: otherUser || {
        id: otherUserId,
        name: 'Deleted user',
        handle: '@deleted',
        avatar: 'DU',
        avatar_url: null
      },
      messages: formatted,
      hasMore: rows.length === limit
    });
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
  }
});

// --------------------------------------------------------------------------
// 4. POST /api/conversations/:id/messages
// Sends a new direct message
// --------------------------------------------------------------------------
router.post('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const convId = req.params.id;
    const currentUserId = req.user.id;

    // Verify conversation membership
    const conv = await db.getAsync(`SELECT * FROM conversations WHERE id = ?`, [convId]);
    if (!conv || (conv.user_low_id !== currentUserId && conv.user_high_id !== currentUserId)) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const otherUserId = conv.user_low_id === currentUserId ? conv.user_high_id : conv.user_low_id;

    // Check blocking (403)
    if (await isBlocked(currentUserId, otherUserId)) {
      return res.status(403).json({ success: false, message: 'Unable to send message due to privacy settings.' });
    }

    // Check friendship: if friendship removed, conversation is read-only (403)
    if (!(await areFriends(currentUserId, otherUserId))) {
      return res.status(403).json({ success: false, message: 'You must be friends to send messages.' });
    }

    // Rate limiting: 60 messages per user per minute
    if (!checkMessageRateLimit(currentUserId)) {
      return res.status(429).json({
        success: false,
        message: 'Too many messages. Please slow down.'
      });
    }

    // Message validation: Plain text only, strip HTML, trim, max 2000 chars
    let rawBody = String(req.body.body || '').replace(/<[^>]*>/g, '').trim();
    if (!rawBody) {
      return res.status(400).json({ success: false, message: 'Message cannot be empty.' });
    }
    if (rawBody.length > 2000) {
      return res.status(400).json({ success: false, message: 'Message exceeds 2000 characters limit.' });
    }

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const nowIso = new Date().toISOString();

    await db.runAsync(`
      INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [msgId, convId, currentUserId, rawBody, nowIso]);

    // Update conversation last_message_at
    await db.runAsync(`
      UPDATE conversations SET last_message_at = ? WHERE id = ?
    `, [nowIso, convId]);

    // Notification rule: at most one "message_received" notification per conversation per hour
    try {
      const recentNotif = await db.getAsync(`
        SELECT id FROM notifications 
        WHERE user_id = ? AND type = 'message_received' AND post_id = ?
        AND created_at > datetime('now', '-1 hour')
      `, [otherUserId, convId]);

      if (!recentNotif) {
        const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await db.runAsync(`
          INSERT INTO notifications (id, user_id, actor_id, actor_name, actor_avatar, type, post_id, message, is_read, created_at)
          VALUES (?, ?, ?, ?, ?, 'message_received', ?, ?, 0, datetime('now'))
        `, [
          notifId,
          otherUserId,
          currentUserId,
          req.user.name,
          req.user.avatar || 'CR',
          convId,
          `${req.user.name} sent you a message.`
        ]);
      }
    } catch (notifErr) {
      // Non-blocking notification error
    }

    res.status(201).json({
      success: true,
      message: {
        id: msgId,
        conversation_id: convId,
        sender_id: currentUserId,
        sender_name: req.user.name,
        sender_avatar: req.user.avatar || 'CR',
        sender_avatar_url: req.user.avatar_url || null,
        body: escapeHtml(rawBody),
        created_at: nowIso,
        read_at: null,
        is_deleted: false,
        is_mine: true
      }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
});

// --------------------------------------------------------------------------
// 5. POST /api/conversations/:id/read
// Marks messages from the other user as read
// --------------------------------------------------------------------------
router.post('/:id/read', authMiddleware, async (req, res) => {
  try {
    const convId = req.params.id;
    const currentUserId = req.user.id;

    // Verify conversation membership
    const conv = await db.getAsync(`SELECT * FROM conversations WHERE id = ?`, [convId]);
    if (!conv || (conv.user_low_id !== currentUserId && conv.user_high_id !== currentUserId)) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const nowIso = new Date().toISOString();
    await db.runAsync(`
      UPDATE messages
      SET read_at = ?
      WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL AND deleted_at IS NULL
    `, [nowIso, convId, currentUserId]);

    res.json({ success: true, message: 'Messages marked as read.' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark messages as read.' });
  }
});

module.exports = router;
