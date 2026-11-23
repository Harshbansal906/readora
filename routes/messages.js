const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/authMiddleware');

// --------------------------------------------------------------------------
// 1. GET /api/messages/unread-count
// Returns total unread messages across all active non-blocked conversations
// --------------------------------------------------------------------------
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    // Fetch conversations for user
    const convs = await db.allAsync(`
      SELECT id, user_low_id, user_high_id FROM conversations
      WHERE user_low_id = ? OR user_high_id = ?
    `, [currentUserId, currentUserId]);

    let totalUnread = 0;

    for (const c of convs) {
      const otherUserId = c.user_low_id === currentUserId ? c.user_high_id : c.user_low_id;

      // Check if blocked
      const block = await db.getAsync(`
        SELECT 1 FROM blocks 
        WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
      `, [currentUserId, otherUserId, otherUserId, currentUserId]);

      if (block) continue; // Hidden

      const unreadRow = await db.getAsync(`
        SELECT COUNT(*) as count FROM messages
        WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL AND deleted_at IS NULL
      `, [c.id, currentUserId]);

      if (unreadRow) {
        totalUnread += Number(unreadRow.count);
      }
    }

    res.json({
      success: true,
      count: totalUnread
    });
  } catch (error) {
    console.error('Fetch unread messages count error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch unread count.' });
  }
});

// --------------------------------------------------------------------------
// 2. DELETE /api/messages/:id
// Soft delete message (sender only). The other user sees "This message was deleted."
// --------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const messageId = req.params.id;
    const currentUserId = req.user.id;

    const message = await db.getAsync(`SELECT * FROM messages WHERE id = ?`, [messageId]);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }

    // Sender only
    if (message.sender_id !== currentUserId) {
      return res.status(403).json({ success: false, message: 'You can only delete your own messages.' });
    }

    const nowIso = new Date().toISOString();
    await db.runAsync(`
      UPDATE messages SET deleted_at = ? WHERE id = ?
    `, [nowIso, messageId]);

    res.json({
      success: true,
      message: 'Message deleted successfully.'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete message.' });
  }
});

module.exports = router;

