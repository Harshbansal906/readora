const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { optionalAuthMiddleware, authMiddleware } = require('../middleware/authMiddleware');

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=800&auto=format&fit=crop';

// "5 min ago", "3 h ago", "2 d ago" ... from SQLite's UTC timestamp ("YYYY-MM-DD HH:MM:SS")
function timeAgo(createdAt) {
  if (!createdAt) return 'Recently';
  const d = new Date(String(createdAt).replace(' ', 'T') + (String(createdAt).includes('Z') ? '' : 'Z'));
  if (isNaN(d.getTime())) return 'Recently';
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
  if (sec < 86400) return Math.floor(sec / 3600) + ' h ago';
  if (sec < 86400 * 7) return Math.floor(sec / 86400) + ' d ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Turns raw rows of the posts table into the shape the frontend uses.
// Comments / likes / bookmarks are fetched in a few batched queries (not 3 queries per post),
// which keeps the feed fast even when the database is hosted online.
async function formatPosts(rawPosts, currentUserId) {
  if (!rawPosts || rawPosts.length === 0) return [];

  const commentsByPost = {};
  const likedSet = new Set();
  const bookmarkedSet = new Set();
  const ids = rawPosts.map((p) => p.id);

  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const marks = part.map(() => '?').join(',');

    const comments = await db.allAsync(
      `SELECT id, post_id, author_name as author, text, created_at FROM comments WHERE post_id IN (${marks}) ORDER BY created_at ASC`,
      part
    );
    (comments || []).forEach((c) => {
      (commentsByPost[c.post_id] = commentsByPost[c.post_id] || []).push({
        id: c.id,
        author: c.author,
        text: c.text,
        created_at: c.created_at
      });
    });

    if (currentUserId) {
      const likes = await db.allAsync(`SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${marks})`, [currentUserId, ...part]);
      (likes || []).forEach((l) => likedSet.add(l.post_id));
      const marksB = await db.allAsync(`SELECT post_id FROM bookmarks WHERE user_id = ? AND post_id IN (${marks})`, [currentUserId, ...part]);
      (marksB || []).forEach((b) => bookmarkedSet.add(b.post_id));
    }
  }

  return rawPosts.map((post) => ({
    id: post.id,
    type: post.type,
    author_id: post.author_id,
    author: post.author_name,
    handle: post.author_handle,
    avatar: post.author_avatar,
    title: post.title,
    subtitle: post.subtitle,
    content: post.content,
    excerpt: post.type === 'article' && post.content.length > 160 ? post.content.substring(0, 160) + '...' : post.content,
    fullContent: post.content,
    theme: post.theme || 'theme-crimson',
    category: post.category || 'General',
    coverImage: post.cover_image,
    readTime: post.read_time || '3 min read',
    likes: post.likes_count || 0,
    likedByUser: likedSet.has(post.id),
    bookmarks: post.bookmarks_count || 0,
    bookmarkedByUser: bookmarkedSet.has(post.id),
    views: post.views_count || 0,
    timestamp: timeAgo(post.created_at),
    createdAt: post.created_at,
    comments: commentsByPost[post.id] || []
  }));
}

// Who is writing? Logged-in users always use their CURRENT name/handle/avatar from the database
// (so a renamed profile is respected immediately), guests fall back to what the request says.
async function resolveAuthor(req, body) {
  if (req.user) {
    const u = await db.getAsync(`SELECT id, name, handle, avatar FROM users WHERE id = ?`, [req.user.id]);
    if (u) {
      return { id: u.id, name: u.name, handle: u.handle, avatar: u.avatar || (u.name || 'CR').substring(0, 2).toUpperCase() };
    }
    return { id: req.user.id, name: req.user.name, handle: req.user.handle, avatar: req.user.avatar };
  }
  return {
    id: 'usr_guest_' + Date.now(),
    name: body.authorName || 'Harsh Bansal',
    handle: body.authorHandle || '@harshbansal',
    avatar: body.authorAvatar || 'HB'
  };
}

// GET /api/posts - Get all posts with comments and interaction states
// Optional: ?feed=following  -> only posts from creators the logged-in user follows
router.get('/', optionalAuthMiddleware, async (req, res) => {
  try {
    const { type, category, search, savedOnly, feed } = req.query;
    const currentUserId = req.user ? req.user.id : null;

    let query = `SELECT * FROM posts WHERE 1=1`;
    const params = [];

    if (feed === 'following') {
      if (!currentUserId) {
        return res.status(401).json({ success: false, message: 'Please log in to see posts from creators you follow.' });
      }
      query += ` AND author_id IN (SELECT following_id FROM follows WHERE follower_id = ?)`;
      params.push(currentUserId);
    }

    if (type && type !== 'all') {
      query += ` AND type = ?`;
      params.push(type);
    }

    if (category && category !== 'all') {
      query += ` AND LOWER(category) = ?`;
      params.push(category.toLowerCase());
    }

    if (search) {
      query += ` AND (LOWER(content) LIKE ? OR LOWER(title) LIKE ? OR LOWER(author_name) LIKE ? OR LOWER(category) LIKE ?)`;
      const s = `%${search.toLowerCase()}%`;
      params.push(s, s, s, s);
    }

    if (savedOnly === 'true' && currentUserId) {
      query += ` AND id IN (SELECT post_id FROM bookmarks WHERE user_id = ?)`;
      params.push(currentUserId);
    }

    query += ` ORDER BY created_at DESC`;

    const rawPosts = await db.allAsync(query, params);
    const posts = await formatPosts(rawPosts, currentUserId);

    res.json({ success: true, count: posts.length, posts });
  } catch (error) {
    console.error('Fetch posts error:', error);
    res.status(500).json({ success: false, message: 'Internal server error while fetching posts.' });
  }
});

// GET /api/posts/user/:handle or /api/posts/profile/:handle - Public creator profile
router.get(['/user/:handle', '/profile/:handle'], optionalAuthMiddleware, async (req, res) => {
  try {
    let handle = String(req.params.handle || '').trim().toLowerCase();
    if (!handle) {
      return res.status(400).json({ success: false, message: 'Username is required.' });
    }
    if (!handle.startsWith('@')) handle = '@' + handle;

    const user = await db.getAsync(
      `SELECT id, name, handle, avatar, bio, created_at FROM users WHERE LOWER(handle) = ?`,
      [handle]
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'Creator not found.' });
    }

    const thoughts = await db.getAsync(`SELECT COUNT(*) as count FROM posts WHERE author_id = ? AND type = 'thought'`, [user.id]);
    const articles = await db.getAsync(`SELECT COUNT(*) as count FROM posts WHERE author_id = ? AND type = 'article'`, [user.id]);
    const followers = await db.getAsync(`SELECT COUNT(*) as count FROM follows WHERE following_id = ?`, [user.id]);
    const following = await db.getAsync(`SELECT COUNT(*) as count FROM follows WHERE follower_id = ?`, [user.id]);

    const currentUserId = req.user ? req.user.id : null;
    let isFollowing = false;
    if (currentUserId && currentUserId !== user.id) {
      const f = await db.getAsync(`SELECT id FROM follows WHERE follower_id = ? AND following_id = ?`, [currentUserId, user.id]);
      isFollowing = !!f;
    }

    const userRawPosts = await db.allAsync(
      `SELECT * FROM posts WHERE author_id = ? ORDER BY created_at DESC`,
      [user.id]
    );
    const userPosts = await formatPosts(userRawPosts, currentUserId);

    res.json({
      success: true,
      profile: {
        id: user.id,
        name: user.name,
        handle: user.handle,
        avatar: user.avatar || (user.name || 'CR').substring(0, 2).toUpperCase(),
        bio: user.bio || '',
        joinedAt: user.created_at,
        isMe: !!currentUserId && currentUserId === user.id,
        isFollowing,
        stats: {
          thoughts: thoughts ? thoughts.count : 0,
          articles: articles ? articles.count : 0,
          followers: followers ? followers.count : 0,
          following: following ? following.count : 0
        }
      },
      posts: userPosts
    });
  } catch (error) {
    console.error('Fetch profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to load profile.' });
  }
});

// POST /api/posts/thought - Create a new thought card
router.post('/thought', authMiddleware, async (req, res) => {
  try {
    const { content, theme, category } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Thought content is required.' });
    }

    const postId = 'thought_' + Date.now();
    const author = await resolveAuthor(req, req.body);

    await db.runAsync(`
      INSERT INTO posts (id, type, author_id, author_name, author_handle, author_avatar, content, theme, category, likes_count, bookmarks_count)
      VALUES (?, 'thought', ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `, [
      postId,
      author.id,
      author.name,
      author.handle,
      author.avatar,
      content.trim(),
      theme || 'theme-crimson',
      category || 'General'
    ]);

    const newPost = {
      id: postId,
      type: 'thought',
      author_id: author.id,
      author: author.name,
      handle: author.handle,
      avatar: author.avatar,
      content: content.trim(),
      theme: theme || 'theme-crimson',
      category: category || 'General',
      likes: 0,
      likedByUser: false,
      bookmarks: 0,
      bookmarkedByUser: false,
      timestamp: 'Just now',
      comments: []
    };

    res.status(201).json({ success: true, message: 'Thought shared successfully!', post: newPost });
  } catch (error) {
    console.error('Create thought error:', error);
    res.status(500).json({ success: false, message: 'Failed to share thought.' });
  }
});

// POST /api/posts/article - Publish long-form article
router.post('/article', authMiddleware, async (req, res) => {
  try {
    const { title, subtitle, category, coverImage } = req.body;
    const content = req.body.content || req.body.fullContent;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Article title is required.' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Article content is required.' });
    }

    const postId = 'article_' + Date.now();
    const author = await resolveAuthor(req, req.body);

    const words = content.trim().split(/\s+/).length;
    const readTime = `${Math.max(1, Math.ceil(words / 180))} min read`;

    await db.runAsync(`
      INSERT INTO posts (id, type, author_id, author_name, author_handle, author_avatar, title, subtitle, content, category, cover_image, read_time, likes_count, bookmarks_count)
      VALUES (?, 'article', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `, [
      postId,
      author.id,
      author.name,
      author.handle,
      author.avatar,
      title.trim(),
      subtitle ? subtitle.trim() : '',
      content.trim(),
      category || 'Tech',
      coverImage || DEFAULT_COVER,
      readTime
    ]);

    // Clear any saved draft for this user upon publication
    await db.runAsync(`DELETE FROM drafts WHERE user_id = ?`, [author.id]).catch(() => {});

    const newPost = {
      id: postId,
      type: 'article',
      author_id: author.id,
      author: author.name,
      handle: author.handle,
      avatar: author.avatar,
      title: title.trim(),
      subtitle: subtitle ? subtitle.trim() : '',
      excerpt: content.trim().length > 160 ? content.trim().substring(0, 160) + '...' : content.trim(),
      fullContent: content.trim(),
      category: category || 'Tech',
      coverImage: coverImage || DEFAULT_COVER,
      readTime,
      likes: 0,
      likedByUser: false,
      bookmarks: 0,
      bookmarkedByUser: false,
      timestamp: 'Just now',
      comments: []
    };

    res.status(201).json({ success: true, message: 'Article published successfully!', post: newPost });
  } catch (error) {
    console.error('Create article error:', error);
    res.status(500).json({ success: false, message: 'Failed to publish article.' });
  }
});

// POST /api/posts/image - Publish photo/image social post (Instagram style)
router.post('/image', authMiddleware, async (req, res) => {
  try {
    const { caption, imageUrl, category } = req.body;

    if (!imageUrl || !imageUrl.trim()) {
      return res.status(400).json({ success: false, message: 'Image URL is required.' });
    }

    const postId = 'image_' + Date.now();
    const author = await resolveAuthor(req, req.body);

    await db.runAsync(`
      INSERT INTO posts (id, type, author_id, author_name, author_handle, author_avatar, content, cover_image, category, likes_count, bookmarks_count)
      VALUES (?, 'image', ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `, [
      postId,
      author.id,
      author.name,
      author.handle,
      author.avatar,
      (caption || '').trim(),
      imageUrl.trim(),
      category || 'Visual'
    ]);

    const newPost = {
      id: postId,
      type: 'image',
      author_id: author.id,
      author: author.name,
      handle: author.handle,
      avatar: author.avatar,
      content: (caption || '').trim(),
      coverImage: imageUrl.trim(),
      category: category || 'Visual',
      likes: 0,
      likedByUser: false,
      bookmarks: 0,
      bookmarkedByUser: false,
      timestamp: 'Just now',
      comments: []
    };

    res.status(201).json({ success: true, message: 'Photo post shared successfully!', post: newPost });
  } catch (error) {
    console.error('Create image post error:', error);
    res.status(500).json({ success: false, message: 'Failed to share photo post.' });
  }
});

// GET /api/posts/draft - Retrieve author's saved article draft
router.get('/draft', authMiddleware, async (req, res) => {
  try {
    const draft = await db.getAsync(`SELECT * FROM drafts WHERE user_id = ?`, [req.user.id]);
    res.json({ success: true, draft: draft || null });
  } catch (error) {
    console.error('Get draft error:', error);
    res.status(500).json({ success: false, message: 'Failed to load draft.' });
  }
});

// POST /api/posts/draft - Save or update author's article draft
router.post('/draft', authMiddleware, async (req, res) => {
  try {
    const { title, subtitle, content, category, coverImage } = req.body;
    const userId = req.user.id;
    const draftId = 'draft_' + userId;

    await db.runAsync(`
      INSERT INTO drafts (id, user_id, title, subtitle, content, category, cover_image, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        title = excluded.title,
        subtitle = excluded.subtitle,
        content = excluded.content,
        category = excluded.category,
        cover_image = excluded.cover_image,
        updated_at = CURRENT_TIMESTAMP
    `, [
      draftId,
      userId,
      (title || '').trim(),
      (subtitle || '').trim(),
      (content || '').trim(),
      category || 'General',
      coverImage || ''
    ]);

    res.json({ success: true, message: 'Draft saved securely!' });
  } catch (error) {
    console.error('Save draft error:', error);
    res.status(500).json({ success: false, message: 'Failed to save draft.' });
  }
});

// DELETE /api/posts/draft - Discard draft
router.delete('/draft', authMiddleware, async (req, res) => {
  try {
    await db.runAsync(`DELETE FROM drafts WHERE user_id = ?`, [req.user.id]);
    res.json({ success: true, message: 'Draft cleared.' });
  } catch (error) {
    console.error('Delete draft error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear draft.' });
  }
});

// GET /api/posts/single/:id - Fetch permanent single post or article
router.get('/single/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const post = await db.getAsync(`SELECT * FROM posts WHERE id = ?`, [req.params.id]);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post or article not found.' });
    }

    const currentUserId = req.user ? req.user.id : null;
    const formatted = await formatPosts([post], currentUserId);

    // Fetch related articles (same category or same author)
    const relatedRaw = await db.allAsync(
      `SELECT * FROM posts WHERE id != ? AND (category = ? OR author_id = ?) AND type = 'article' ORDER BY created_at DESC LIMIT 3`,
      [post.id, post.category, post.author_id]
    );
    const related = await formatPosts(relatedRaw, currentUserId);

    res.json({ success: true, post: formatted[0], related });
  } catch (error) {
    console.error('Fetch single post error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch article.' });
  }
});

// POST /api/posts/:id/view - Record a deduplicated article view
router.post('/:id/view', optionalAuthMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await db.getAsync(`SELECT id, views_count FROM posts WHERE id = ?`, [postId]);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    // Deduplicate views: one count per user/IP per calendar date
    const today = new Date().toISOString().slice(0, 10);
    const viewerId = req.user ? `u_${req.user.id}` : `ip_${req.ip || 'anon'}`;
    const viewerKey = `${viewerId}_${today}`;
    const viewId = 'vw_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    try {
      await db.runAsync(
        `INSERT INTO article_views (id, post_id, viewer_key) VALUES (?, ?, ?)`,
        [viewId, postId, viewerKey]
      );
      await db.runAsync(
        `UPDATE posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = ?`,
        [postId]
      );
    } catch (uniqueErr) {
      // Deduplicated within the same day
    }

    const updated = await db.getAsync(`SELECT views_count FROM posts WHERE id = ?`, [postId]);
    res.json({ success: true, views: updated ? (updated.views_count || 0) : 0 });
  } catch (error) {
    console.error('View tracking error:', error);
    res.status(500).json({ success: false, message: 'Failed to record view.' });
  }
});

// POST /api/posts/:id/like - Toggle Like (requires auth)
router.post('/:id/like', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const post = await db.getAsync(`SELECT id, author_id, type FROM posts WHERE id = ?`, [postId]);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const existingLike = await db.getAsync(`SELECT * FROM likes WHERE user_id = ? AND post_id = ?`, [userId, postId]);

    if (existingLike) {
      await db.runAsync(`DELETE FROM likes WHERE user_id = ? AND post_id = ?`, [userId, postId]);
      await db.runAsync(`UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?`, [postId]);
      const updated = await db.getAsync(`SELECT likes_count FROM posts WHERE id = ?`, [postId]);
      return res.json({ success: true, liked: false, likes: updated ? updated.likes_count : 0 });
    } else {
      await db.runAsync(`INSERT INTO likes (id, user_id, post_id) VALUES (?, ?, ?)`, ['like_' + Date.now(), userId, postId]);
      await db.runAsync(`UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?`, [postId]);
      
      // Notify post author if different user
      if (post.author_id && post.author_id !== userId) {
        await db.runAsync(`
          INSERT INTO notifications (id, user_id, actor_id, actor_name, actor_avatar, type, post_id, message)
          VALUES (?, ?, ?, ?, ?, 'like', ?, ?)
        `, [
          'notif_' + Date.now(),
          post.author_id,
          userId,
          req.user.name,
          req.user.avatar || 'CR',
          postId,
          `${req.user.name} liked your ${post.type || 'post'}`
        ]).catch(() => {});
      }

      const updated = await db.getAsync(`SELECT likes_count FROM posts WHERE id = ?`, [postId]);
      return res.json({ success: true, liked: true, likes: updated ? updated.likes_count : 1 });
    }
  } catch (error) {
    console.error('Like toggle error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle like.' });
  }
});

// POST /api/posts/:id/bookmark - Toggle Bookmark (requires auth)
router.post('/:id/bookmark', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const post = await db.getAsync(`SELECT id FROM posts WHERE id = ?`, [postId]);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const existingBookmark = await db.getAsync(`SELECT * FROM bookmarks WHERE user_id = ? AND post_id = ?`, [userId, postId]);

    if (existingBookmark) {
      await db.runAsync(`DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?`, [userId, postId]);
      await db.runAsync(`UPDATE posts SET bookmarks_count = MAX(0, bookmarks_count - 1) WHERE id = ?`, [postId]);
      const updated = await db.getAsync(`SELECT bookmarks_count FROM posts WHERE id = ?`, [postId]);
      return res.json({ success: true, bookmarked: false, saved: false, bookmarks: updated ? updated.bookmarks_count : 0 });
    } else {
      await db.runAsync(`INSERT INTO bookmarks (id, user_id, post_id) VALUES (?, ?, ?)`, ['bm_' + Date.now(), userId, postId]);
      await db.runAsync(`UPDATE posts SET bookmarks_count = bookmarks_count + 1 WHERE id = ?`, [postId]);
      const updated = await db.getAsync(`SELECT bookmarks_count FROM posts WHERE id = ?`, [postId]);
      return res.json({ success: true, bookmarked: true, saved: true, bookmarks: updated ? updated.bookmarks_count : 1 });
    }
  } catch (error) {
    console.error('Bookmark toggle error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle bookmark.' });
  }
});

// POST /api/posts/:id/comment - Add comment (requires auth)
router.post('/:id/comment', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text cannot be empty.' });
    }

    const post = await db.getAsync(`SELECT id, author_id, type FROM posts WHERE id = ?`, [postId]);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const commentId = 'cmt_' + Date.now();
    const user_id = req.user.id;
    const u = await db.getAsync(`SELECT name FROM users WHERE id = ?`, [user_id]);
    const author_name = u ? u.name : req.user.name;

    await db.runAsync(`
      INSERT INTO comments (id, post_id, user_id, author_name, text)
      VALUES (?, ?, ?, ?, ?)
    `, [commentId, postId, user_id, author_name, text.trim()]);

    // Notify post author if different user
    if (post.author_id && post.author_id !== user_id) {
      await db.runAsync(`
        INSERT INTO notifications (id, user_id, actor_id, actor_name, actor_avatar, type, post_id, message)
        VALUES (?, ?, ?, ?, ?, 'comment', ?, ?)
      `, [
        'notif_' + Date.now(),
        post.author_id,
        user_id,
        author_name,
        (author_name || 'CR').substring(0, 2).toUpperCase(),
        postId,
        `${author_name} commented on your ${post.type || 'post'}`
      ]).catch(() => {});
    }

    res.status(201).json({
      success: true,
      message: 'Comment added!',
      comment: {
        id: commentId,
        author: author_name,
        text: text.trim(),
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ success: false, message: 'Failed to post comment.' });
  }
});

// DELETE /api/posts/comments/:commentId - Delete comment (comment author or post owner)
router.delete('/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const commentId = req.params.commentId;
    const comment = await db.getAsync(`SELECT * FROM comments WHERE id = ?`, [commentId]);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found.' });
    }

    const post = await db.getAsync(`SELECT author_id FROM posts WHERE id = ?`, [comment.post_id]);
    const isCommentAuthor = comment.user_id && comment.user_id === req.user.id;
    const isPostAuthor = post && post.author_id === req.user.id;

    if (!isCommentAuthor && !isPostAuthor) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You can only delete your own comments.' });
    }

    await db.runAsync(`DELETE FROM comments WHERE id = ?`, [commentId]);
    res.json({ success: true, message: 'Comment deleted successfully.' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete comment.' });
  }
});

// GET /api/posts/community-stats - Real live platform statistics
router.get('/community-stats', async (req, res) => {
  try {
    const creatorsRow = await db.getAsync(`SELECT COUNT(*) as count FROM users`);
    const thoughtsRow = await db.getAsync(`SELECT COUNT(*) as count FROM posts WHERE type = 'thought'`);
    const articlesRow = await db.getAsync(`SELECT COUNT(*) as count FROM posts WHERE type = 'article'`);

    res.json({
      success: true,
      stats: {
        creators: creatorsRow ? creatorsRow.count : 0,
        thoughts: thoughtsRow ? thoughtsRow.count : 0,
        articles: articlesRow ? articlesRow.count : 0
      }
    });
  } catch (error) {
    console.error('Community stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch community statistics.' });
  }
});

// GET /api/posts/trending-topics - Live top categories/topics by post count
router.get('/trending-topics', async (req, res) => {
  try {
    const topics = await db.allAsync(`
      SELECT category as name, COUNT(*) as count
      FROM posts
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY count DESC
      LIMIT 6
    `);

    res.json({
      success: true,
      topics: topics || []
    });
  } catch (error) {
    console.error('Trending topics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch trending topics.' });
  }
});

// GET /api/posts/featured-creators - Real creators in the community
router.get('/featured-creators', optionalAuthMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user ? req.user.id : null;
    const users = await db.allAsync(`
      SELECT u.id, u.name, u.handle, u.avatar, u.bio,
        (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers,
        (SELECT COUNT(*) FROM posts WHERE author_id = u.id) as posts_count
      FROM users u
      ${currentUserId ? 'WHERE u.id != ?' : ''}
      ORDER BY followers DESC, posts_count DESC
      LIMIT 5
    `, currentUserId ? [currentUserId] : []);

    const creators = await Promise.all((users || []).map(async (u) => {
      let isFollowing = false;
      if (currentUserId) {
        const f = await db.getAsync(`SELECT id FROM follows WHERE follower_id = ? AND following_id = ?`, [currentUserId, u.id]);
        isFollowing = !!f;
      }
      return {
        id: u.id,
        name: u.name,
        handle: u.handle,
        avatar: u.avatar || u.name.substring(0, 2).toUpperCase(),
        bio: u.bio,
        followers: u.followers || 0,
        postsCount: u.posts_count || 0,
        isFollowing
      };
    }));

    res.json({
      success: true,
      creators
    });
  } catch (error) {
    console.error('Featured creators error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch featured creators.' });
  }
});

// POST /api/posts/follow/:userId - Follow or unfollow a creator
router.post('/follow/:userId', authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const followerId = req.user.id;

    if (targetUserId === followerId) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself.' });
    }

    const targetUser = await db.getAsync(`SELECT id, name FROM users WHERE id = ?`, [targetUserId]);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User to follow not found.' });
    }

    const existingFollow = await db.getAsync(
      `SELECT * FROM follows WHERE follower_id = ? AND following_id = ?`,
      [followerId, targetUserId]
    );

    if (existingFollow) {
      await db.runAsync(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`, [followerId, targetUserId]);
      const followerCount = await db.getAsync(`SELECT COUNT(*) as count FROM follows WHERE following_id = ?`, [targetUserId]);
      return res.json({
        success: true,
        following: false,
        isFollowing: false,
        followers: followerCount ? followerCount.count : 0,
        message: `Unfollowed ${targetUser.name}`
      });
    } else {
      await db.runAsync(
        `INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)`,
        ['fol_' + Date.now(), followerId, targetUserId]
      );
      
      // Notify target user
      await db.runAsync(`
        INSERT INTO notifications (id, user_id, actor_id, actor_name, actor_avatar, type, message)
        VALUES (?, ?, ?, ?, ?, 'follow', ?)
      `, [
        'notif_' + Date.now(),
        targetUserId,
        followerId,
        req.user.name,
        req.user.avatar || 'CR',
        `${req.user.name} started following you`
      ]).catch(() => {});

      const followerCount = await db.getAsync(`SELECT COUNT(*) as count FROM follows WHERE following_id = ?`, [targetUserId]);
      return res.json({
        success: true,
        following: true,
        isFollowing: true,
        followers: followerCount ? followerCount.count : 1,
        message: `Now following ${targetUser.name}`
      });
    }
  } catch (error) {
    console.error('Follow toggle error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle follow.' });
  }
});

// PUT /api/posts/:id - Edit an existing thought or article
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await db.getAsync(`SELECT * FROM posts WHERE id = ?`, [postId]);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    // Strict ownership validation: only the original author can edit
    const isOwner = (post.author_id && post.author_id === req.user.id);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You can only edit your own content.' });
    }

    const { title, subtitle, category, theme, coverImage } = req.body;
    const rawContent = req.body.content !== undefined ? req.body.content : req.body.fullContent;
    const content = rawContent !== undefined ? rawContent : post.content;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Content cannot be empty.' });
    }

    const updatedTitle = title !== undefined ? title.trim() : post.title;
    const updatedSubtitle = subtitle !== undefined ? subtitle.trim() : post.subtitle;
    const updatedCategory = category || post.category;
    const updatedTheme = theme || post.theme;
    const updatedCover = coverImage !== undefined ? coverImage : post.cover_image;

    let readTime = post.read_time;
    if (post.type === 'article') {
      const words = content.trim().split(/\s+/).length;
      readTime = `${Math.max(1, Math.ceil(words / 180))} min read`;
    }

    await db.runAsync(`
      UPDATE posts
      SET title = ?, subtitle = ?, content = ?, category = ?, theme = ?, cover_image = ?, read_time = ?
      WHERE id = ?
    `, [updatedTitle, updatedSubtitle, content.trim(), updatedCategory, updatedTheme, updatedCover, readTime, postId]);

    const updatedPost = await db.getAsync(`SELECT * FROM posts WHERE id = ?`, [postId]);

    res.json({
      success: true,
      message: 'Post updated successfully!',
      post: updatedPost
    });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ success: false, message: 'Failed to update post.' });
  }
});

// DELETE /api/posts/:id - Delete thought or article with strict ownership validation
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await db.getAsync(`SELECT * FROM posts WHERE id = ?`, [postId]);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    // Strict ownership validation: only author can delete
    const isOwner = (post.author_id && post.author_id === req.user.id);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You can only delete your own content.' });
    }

    // Delete associated records
    await db.runAsync(`DELETE FROM likes WHERE post_id = ?`, [postId]);
    await db.runAsync(`DELETE FROM bookmarks WHERE post_id = ?`, [postId]);
    await db.runAsync(`DELETE FROM comments WHERE post_id = ?`, [postId]);
    await db.runAsync(`DELETE FROM posts WHERE id = ?`, [postId]);

    res.json({ success: true, message: 'Article/Thought deleted successfully!' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete post.' });
  }
});

// GET /api/posts/dashboard - Creator Dashboard analytics and content management
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Author's posts
    const userRawPosts = await db.allAsync(
      `SELECT * FROM posts WHERE author_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    const formattedPosts = await formatPosts(userRawPosts, userId);

    // 2. Draft
    const draft = await db.getAsync(`SELECT * FROM drafts WHERE user_id = ?`, [userId]);

    // 3. Aggregate statistics
    const statsRow = await db.getAsync(`
      SELECT 
        COUNT(CASE WHEN type = 'article' THEN 1 END) as totalArticles,
        COUNT(CASE WHEN type = 'thought' THEN 1 END) as totalThoughts,
        COALESCE(SUM(likes_count), 0) as totalLikes,
        COALESCE(SUM(views_count), 0) as totalViews
      FROM posts 
      WHERE author_id = ?
    `, [userId]);

    const commentsRow = await db.getAsync(`
      SELECT COUNT(*) as totalComments 
      FROM comments 
      WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)
    `, [userId]);

    const followersRow = await db.getAsync(`
      SELECT COUNT(*) as followersCount 
      FROM follows 
      WHERE following_id = ?
    `, [userId]);

    const followingRow = await db.getAsync(`
      SELECT COUNT(*) as followingCount 
      FROM follows 
      WHERE follower_id = ?
    `, [userId]);

    // 4. Recent activity on creator's content
    const recentActivity = await db.allAsync(`
      SELECT * FROM notifications 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 10
    `, [userId]);

    const overview = {
      totalArticles: statsRow ? statsRow.totalArticles : 0,
      totalThoughts: statsRow ? statsRow.totalThoughts : 0,
      totalDrafts: draft ? 1 : 0,
      totalLikes: statsRow ? statsRow.totalLikes : 0,
      totalViews: statsRow ? statsRow.totalViews : 0,
      totalComments: commentsRow ? commentsRow.totalComments : 0,
      followersCount: followersRow ? followersRow.followersCount : 0,
      followingCount: followingRow ? followingRow.followingCount : 0
    };

    res.json({
      success: true,
      overview,
      stats: overview,
      articles: formattedPosts.filter(p => p.type === 'article'),
      thoughts: formattedPosts.filter(p => p.type === 'thought'),
      draft: draft ? {
        id: draft.id,
        title: draft.title || '',
        subtitle: draft.subtitle || '',
        content: draft.content || '',
        category: draft.category || 'General',
        coverImage: draft.cover_image || '',
        updatedAt: draft.updated_at
      } : null,
      recentActivity: recentActivity || []
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load creator dashboard.' });
  }
});

// GET /api/posts/notifications - Fetch user notifications
router.get(['/notifications', '/notifications/list'], authMiddleware, async (req, res) => {
  try {
    const list = await db.allAsync(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 30
    `, [req.user.id]);

    const unreadCountRow = await db.getAsync(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND is_read = 0
    `, [req.user.id]);

    res.json({
      success: true,
      unreadCount: unreadCountRow ? unreadCountRow.count : 0,
      notifications: list || []
    });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
});

// POST /api/posts/notifications/read-all or mark-read - Mark all notifications as read
router.post(['/notifications/read-all', '/notifications/mark-read'], authMiddleware, async (req, res) => {
  try {
    await db.runAsync(`
      UPDATE notifications SET is_read = 1 WHERE user_id = ?
    `, [req.user.id]);

    res.json({ success: true, message: 'Notifications marked as read.' });
  } catch (error) {
    console.error('Mark notifications read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark notifications.' });
  }
});

module.exports = router;
