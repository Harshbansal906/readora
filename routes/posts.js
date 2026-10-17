const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { optionalAuthMiddleware, authMiddleware } = require('../middleware/authMiddleware');

// GET /api/posts - Get all posts with comments and interaction states
router.get('/', optionalAuthMiddleware, async (req, res) => {
  try {
    const { type, category, search, savedOnly } = req.query;
    const currentUserId = req.user ? req.user.id : null;

    let query = `SELECT * FROM posts WHERE 1=1`;
    const params = [];

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

    // Attach comments, likes, and bookmarks per post
    const posts = await Promise.all(rawPosts.map(async (post) => {
      // Fetch comments
      const comments = await db.allAsync(
        `SELECT id, author_name as author, text, created_at FROM comments WHERE post_id = ? ORDER BY created_at ASC`,
        [post.id]
      );

      // Check if current user liked/bookmarked
      let likedByUser = false;
      let bookmarkedByUser = false;

      if (currentUserId) {
        const likeRow = await db.getAsync(`SELECT id FROM likes WHERE user_id = ? AND post_id = ?`, [currentUserId, post.id]);
        likedByUser = !!likeRow;

        const bookmarkRow = await db.getAsync(`SELECT id FROM bookmarks WHERE user_id = ? AND post_id = ?`, [currentUserId, post.id]);
        bookmarkedByUser = !!bookmarkRow;
      }

      return {
        id: post.id,
        type: post.type,
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
        likedByUser,
        bookmarks: post.bookmarks_count || 0,
        bookmarkedByUser,
        timestamp: 'Recently',
        comments: comments || []
      };
    }));

    res.json({ success: true, count: posts.length, posts });
  } catch (error) {
    console.error('Fetch posts error:', error);
    res.status(500).json({ success: false, message: 'Internal server error while fetching posts.' });
  }
});

// POST /api/posts/thought - Create a new thought card
router.post('/thought', optionalAuthMiddleware, async (req, res) => {
  try {
    const { content, theme, category, authorName, authorHandle, authorAvatar } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Thought content is required.' });
    }

    const postId = 'thought_' + Date.now();
    const author_id = req.user ? req.user.id : 'usr_guest_' + Date.now();
    const author_name = req.user ? req.user.name : (authorName || 'Harsh Bansal');
    const author_handle = req.user ? req.user.handle : (authorHandle || '@harshbansal');
    const author_avatar = req.user ? req.user.avatar : (authorAvatar || 'HB');

    await db.runAsync(`
      INSERT INTO posts (id, type, author_id, author_name, author_handle, author_avatar, content, theme, category, likes_count, bookmarks_count)
      VALUES (?, 'thought', ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `, [
      postId,
      author_id,
      author_name,
      author_handle,
      author_avatar,
      content.trim(),
      theme || 'theme-crimson',
      category || 'General'
    ]);

    const newPost = {
      id: postId,
      type: 'thought',
      author: author_name,
      handle: author_handle,
      avatar: author_avatar,
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
router.post('/article', optionalAuthMiddleware, async (req, res) => {
  try {
    const { title, subtitle, content, category, coverImage, authorName, authorHandle, authorAvatar } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required.' });
    }

    const postId = 'article_' + Date.now();
    const author_id = req.user ? req.user.id : 'usr_guest_' + Date.now();
    const author_name = req.user ? req.user.name : (authorName || 'Harsh Bansal');
    const author_handle = req.user ? req.user.handle : (authorHandle || '@harshbansal');
    const author_avatar = req.user ? req.user.avatar : (authorAvatar || 'HB');

    const words = content.split(/\s+/).length;
    const readTime = `${Math.max(1, Math.ceil(words / 180))} min read`;

    await db.runAsync(`
      INSERT INTO posts (id, type, author_id, author_name, author_handle, author_avatar, title, subtitle, content, category, cover_image, read_time, likes_count, bookmarks_count)
      VALUES (?, 'article', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `, [
      postId,
      author_id,
      author_name,
      author_handle,
      author_avatar,
      title.trim(),
      subtitle ? subtitle.trim() : '',
      content.trim(),
      category || 'Tech',
      coverImage || 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=800&auto=format&fit=crop',
      readTime
    ]);

    const newPost = {
      id: postId,
      type: 'article',
      author: author_name,
      handle: author_handle,
      avatar: author_avatar,
      title: title.trim(),
      subtitle: subtitle ? subtitle.trim() : '',
      excerpt: content.length > 160 ? content.substring(0, 160) + '...' : content,
      fullContent: content.trim(),
      category: category || 'Tech',
      coverImage: coverImage || 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=800&auto=format&fit=crop',
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

// POST /api/posts/:id/like - Toggle Like
router.post('/:id/like', optionalAuthMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user ? req.user.id : 'anon_' + req.ip;

    const post = await db.getAsync(`SELECT id FROM posts WHERE id = ?`, [postId]);
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
      const updated = await db.getAsync(`SELECT likes_count FROM posts WHERE id = ?`, [postId]);
      return res.json({ success: true, liked: true, likes: updated ? updated.likes_count : 1 });
    }
  } catch (error) {
    console.error('Like toggle error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle like.' });
  }
});

// POST /api/posts/:id/bookmark - Toggle Bookmark
router.post('/:id/bookmark', optionalAuthMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user ? req.user.id : 'anon_' + req.ip;

    const post = await db.getAsync(`SELECT id FROM posts WHERE id = ?`, [postId]);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const existingBookmark = await db.getAsync(`SELECT * FROM bookmarks WHERE user_id = ? AND post_id = ?`, [userId, postId]);

    if (existingBookmark) {
      await db.runAsync(`DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?`, [userId, postId]);
      await db.runAsync(`UPDATE posts SET bookmarks_count = MAX(0, bookmarks_count - 1) WHERE id = ?`, [postId]);
      const updated = await db.getAsync(`SELECT bookmarks_count FROM posts WHERE id = ?`, [postId]);
      return res.json({ success: true, bookmarked: false, bookmarks: updated ? updated.bookmarks_count : 0 });
    } else {
      await db.runAsync(`INSERT INTO bookmarks (id, user_id, post_id) VALUES (?, ?, ?)`, ['bm_' + Date.now(), userId, postId]);
      await db.runAsync(`UPDATE posts SET bookmarks_count = bookmarks_count + 1 WHERE id = ?`, [postId]);
      const updated = await db.getAsync(`SELECT bookmarks_count FROM posts WHERE id = ?`, [postId]);
      return res.json({ success: true, bookmarked: true, bookmarks: updated ? updated.bookmarks_count : 1 });
    }
  } catch (error) {
    console.error('Bookmark toggle error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle bookmark.' });
  }
});

// POST /api/posts/:id/comment - Add comment
router.post('/:id/comment', optionalAuthMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const { text, authorName } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required.' });
    }

    const post = await db.getAsync(`SELECT id FROM posts WHERE id = ?`, [postId]);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const commentId = 'cmt_' + Date.now();
    const author_name = req.user ? req.user.name : (authorName || 'Harsh Bansal');
    const user_id = req.user ? req.user.id : null;

    await db.runAsync(`
      INSERT INTO comments (id, post_id, user_id, author_name, text)
      VALUES (?, ?, ?, ?, ?)
    `, [commentId, postId, user_id, author_name, text.trim()]);

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
        followers: followerCount ? followerCount.count : 0,
        message: `Unfollowed ${targetUser.name}`
      });
    } else {
      await db.runAsync(
        `INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)`,
        ['fol_' + Date.now(), followerId, targetUserId]
      );
      const followerCount = await db.getAsync(`SELECT COUNT(*) as count FROM follows WHERE following_id = ?`, [targetUserId]);
      return res.json({
        success: true,
        following: true,
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
    const { title, subtitle, content, category, theme, coverImage } = req.body;

    const post = await db.getAsync(`SELECT * FROM posts WHERE id = ?`, [postId]);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    // Check ownership
    const isOwner = (post.author_id && post.author_id === req.user.id) ||
                    (post.author_handle && req.user.handle && post.author_handle.toLowerCase() === req.user.handle.toLowerCase());

    if (!isOwner && req.user.id !== 'usr_harsh') {
      return res.status(403).json({ success: false, message: 'Unauthorized. You can only edit your own posts.' });
    }

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
router.delete('/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await db.getAsync(`SELECT * FROM posts WHERE id = ?`, [postId]);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    // Must be authenticated to delete any post
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required to delete this post.' });
    }

    // Verify post ownership by author_id or author_handle
    const isOwner = (post.author_id && post.author_id === req.user.id) ||
                    (post.author_handle && req.user.handle && post.author_handle.toLowerCase() === req.user.handle.toLowerCase());

    if (!isOwner && req.user.id !== 'usr_harsh') {
      return res.status(403).json({ success: false, message: 'Unauthorized. You can only delete your own posts.' });
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

module.exports = router;
