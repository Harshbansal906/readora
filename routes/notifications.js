const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/authMiddleware');

// Grouping helper based on timestamp
function categorizeNotification(createdAt) {
  if (!createdAt) return 'earlier';
  const d = new Date(String(createdAt).replace(' ', 'T') + (String(createdAt).includes('Z') ? '' : 'Z'));
  if (isNaN(d.getTime())) return 'earlier';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 24) return 'today';
  if (diffHours < 24 * 7) return 'this_week';
  return 'earlier';
}

// GET /api/notifications - List all notifications grouped by Today, This week, Earlier
router.get(['/', '/list'], authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const rawNotifs = await db.allAsync(`
      SELECT n.*, u.name as actor_name, u.handle as actor_handle, u.avatar as actor_avatar, u.avatar_url as actor_avatar_url
      FROM notifications n
      LEFT JOIN users u ON n.actor_id = u.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 100
    `, [userId]);

    const grouped = {
      today: [],
      this_week: [],
      earlier: []
    };

    (rawNotifs || []).forEach(notif => {
      let parsedPayload = {};
      if (notif.payload) {
        try { parsedPayload = JSON.parse(notif.payload); } catch (e) {}
      }

      const item = {
        id: notif.id,
        type: notif.type,
        actor: {
          id: notif.actor_id,
          name: notif.actor_name || 'Reader',
          handle: notif.actor_handle || '@reader',
          avatar: notif.actor_avatar || 'RD',
          avatar_url: notif.actor_avatar_url || null
        },
        message: notif.message || parsedPayload.message || 'New activity on your profile.',
        read: !!(notif.read_at || notif.is_read),
        read_at: notif.read_at,
        created_at: notif.created_at
      };

      const group = categorizeNotification(notif.created_at);
      grouped[group].push(item);
    });

    const unreadCount = (rawNotifs || []).filter(n => !n.read_at && !n.is_read).length;

    res.json({
      success: true,
      unreadCount,
      notifications: grouped,
      all: rawNotifs
    });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
});

// GET /api/notifications/unread-count - Lightweight polling endpoint
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const row = await db.getAsync(`
      SELECT COUNT(*) as count FROM notifications 
      WHERE user_id = ? AND (read_at IS NULL AND (is_read = 0 OR is_read IS NULL))
    `, [userId]);

    res.json({ success: true, count: row ? row.count : 0 });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch unread count.' });
  }
});

// POST /api/notifications/mark-read or /read-all
router.post(['/mark-read', '/read-all'], authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    await db.runAsync(`
      UPDATE notifications 
      SET read_at = datetime('now'), is_read = 1 
      WHERE user_id = ?
    `, [userId]);

    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    console.error('Mark notifications read error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notifications.' });
  }
});

module.exports = router;

