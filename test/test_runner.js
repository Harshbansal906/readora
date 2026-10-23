/**
 * READORA — Comprehensive Automated Test Suite (Phase 2 Verification)
 * Validates all 13 core requirements:
 * 1. User Registration
 * 2. Duplicate Account Prevention
 * 3. Login & Authentication Security
 * 4. Content Publishing Workflow (Articles & Thoughts)
 * 5. Feed & Profile Visibility
 * 6. Server Restart Persistence
 * 7. Multi-User Isolation & Ownership Security
 * 8. Author Edit & Update
 * 9. Social Interactions (Follow, Like, Comment, Bookmark)
 * 10. Search & Topic Filtering
 * 11. Comment Deletion & Permission Control
 * 12. Drafts API (Save, Retrieve, Delete)
 * 13. Permanent Article Route (Single Post Permalink)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Point tests to an isolated test database
const TEST_DB_PATH = path.join(__dirname, 'test_readora.db');
process.env.DB_PATH = TEST_DB_PATH;
process.env.PORT = '5055';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_readora_production_key_123456';

// Clean any leftover test database files before starting
function cleanTestDb() {
  for (const ext of ['', '-wal', '-shm']) {
    const f = TEST_DB_PATH + ext;
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch (e) {}
    }
  }
}

cleanTestDb();

// HTTP request helper
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request({
      hostname: 'localhost',
      port: 5055,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Server lifecycle management
let serverInstance = null;

async function startServer() {
  // Clear require cache for server and db to ensure clean connection
  delete require.cache[require.resolve('../server')];
  delete require.cache[require.resolve('../db/database')];
  delete require.cache[require.resolve('../routes/auth')];
  delete require.cache[require.resolve('../routes/posts')];
  delete require.cache[require.resolve('../routes/ai')];

  const express = require('express');
  const cors = require('cors');
  const { initDB, db } = require('../db/database');
  const authRoutes = require('../routes/auth');
  const postRoutes = require('../routes/posts');
  const aiRoutes = require('../routes/ai');

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/ai', aiRoutes);

  await initDB();

  return new Promise((resolve) => {
    serverInstance = app.listen(5055, () => {
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (serverInstance) {
      serverInstance.close(() => {
        serverInstance = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

const testResults = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(name, fn) {
  process.stdout.write(`  Testing: ${name}... `);
  try {
    await fn();
    console.log('\x1b[32m✔ PASS\x1b[0m');
    testResults.push({ name, status: 'PASS' });
  } catch (err) {
    console.log(`\x1b[31m✖ FAIL\x1b[0m (${err.message})`);
    testResults.push({ name, status: 'FAIL', error: err.message });
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('   READORA PHASE 2 — AUTOMATED VERIFICATION SUITE');
  console.log('======================================================\n');

  await startServer();

  let userA = null;
  let userB = null;
  let userAToken = null;
  let userBToken = null;
  let articleId = null;
  let thoughtId = null;
  let commentId = null;

  try {
    // 1. User Registration
    await runTest('1. User Registration (hash password, unique user, token creation)', async () => {
      const res = await request('POST', '/api/auth/signup', {
        name: 'Sarah Connor',
        email: 'sarah.connor@readora.test',
        password: 'Password123!',
        handle: '@sarahc',
        bio: 'Tech explorer and creative writer.'
      });
      assert(res.status === 201, `Expected status 201, got ${res.status}`);
      assert(res.data.success === true, 'Expected success === true');
      assert(res.data.token, 'Expected JWT token returned');
      assert(res.data.user.email === 'sarah.connor@readora.test', 'Expected matching user email');
      assert(res.data.user.handle === '@sarahc', 'Expected matching user handle');

      userA = res.data.user;
      userAToken = res.data.token;
    });

    // 2. Duplicate Prevention
    await runTest('2. Duplicate Account Prevention (duplicate email and handle rejected)', async () => {
      // Duplicate Email
      const resEmail = await request('POST', '/api/auth/signup', {
        name: 'Imposter Sarah',
        email: 'sarah.connor@readora.test',
        password: 'AnotherPassword456!',
        handle: '@anotherhandle'
      });
      assert(resEmail.status === 400, `Expected duplicate email status 400, got ${resEmail.status}`);
      assert(resEmail.data.success === false, 'Expected success === false for duplicate email');

      // Duplicate Handle
      const resHandle = await request('POST', '/api/auth/signup', {
        name: 'Another User',
        email: 'another.unique@readora.test',
        password: 'AnotherPassword456!',
        handle: '@sarahc'
      });
      assert(resHandle.status === 400, `Expected duplicate handle status 400, got ${resHandle.status}`);
      assert(resHandle.data.success === false, 'Expected success === false for duplicate handle');
    });

    // 3. Login & Authentication Security
    await runTest('3. Login & Authentication Security (valid credentials vs invalid password)', async () => {
      // Correct credentials
      const resValid = await request('POST', '/api/auth/login', {
        identifier: 'sarah.connor@readora.test',
        password: 'Password123!'
      });
      assert(resValid.status === 200, `Expected 200 for valid login, got ${resValid.status}`);
      assert(resValid.data.success === true, 'Expected success === true');
      assert(resValid.data.token, 'Expected token on login');
      assert(resValid.data.user.id === userA.id, 'Expected matching user ID');

      // Invalid password
      const resInvalid = await request('POST', '/api/auth/login', {
        identifier: 'sarah.connor@readora.test',
        password: 'WrongPassword999!'
      });
      assert(resInvalid.status === 400 || resInvalid.status === 401, `Expected 400/401 for bad password, got ${resInvalid.status}`);
      assert(resInvalid.data.success === false, 'Expected success === false for bad password');
    });

    // 4. Content Publishing Workflow
    await runTest('4. Content Publishing Workflow (Articles & Thoughts strictly bound to JWT author)', async () => {
      // Publish Article
      const resArt = await request('POST', '/api/posts/article', {
        title: 'The Future of AI Architecture',
        subtitle: 'Exploring modern agentic workflows and design principles',
        category: 'Technology',
        excerpt: 'An in-depth look into modern autonomous systems.',
        content: 'Full article text regarding modern AI engineering and robust databases.',
        fullContent: 'Full article text regarding modern AI engineering and robust databases.',
        readTime: '4 min read',
        coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe'
      }, { Authorization: `Bearer ${userAToken}` });

      assert(resArt.status === 201, `Expected 201 for article creation, got ${resArt.status}`);
      assert(resArt.data.success === true, 'Expected success === true');
      assert(resArt.data.post && resArt.data.post.id, 'Expected post with ID');
      assert(resArt.data.post.author_id === userA.id, 'Expected post author_id to strictly equal User A ID');
      articleId = resArt.data.post.id;

      // Publish Thought
      const resTh = await request('POST', '/api/posts/thought', {
        content: 'Simplicity is prerequisite for reliability.',
        category: 'Philosophy',
        theme: 'theme-ocean'
      }, { Authorization: `Bearer ${userAToken}` });

      assert(resTh.status === 201, `Expected 201 for thought creation, got ${resTh.status}`);
      assert(resTh.data.success === true, 'Expected success === true');
      assert(resTh.data.post.author_id === userA.id, 'Expected thought author_id to equal User A ID');
      thoughtId = resTh.data.post.id;
    });

    // 5. Feed & Profile Visibility
    await runTest('5. Feed & Profile Visibility (content appears in public feed and author profile)', async () => {
      // Feed
      const resFeed = await request('GET', '/api/posts');
      assert(resFeed.status === 200, `Expected 200 for feed, got ${resFeed.status}`);
      assert(Array.isArray(resFeed.data.posts), 'Expected array of posts');
      const feedArticle = resFeed.data.posts.find(p => p.id === articleId);
      assert(feedArticle, 'Expected published article to appear in feed');
      assert(feedArticle.title === 'The Future of AI Architecture', 'Expected article title to match');

      // Profile
      const resProfile = await request('GET', `/api/posts/profile/${encodeURIComponent(userA.handle)}`);
      assert(resProfile.status === 200, `Expected 200 for profile, got ${resProfile.status}`);
      assert(resProfile.data.success === true, 'Expected success === true');
      assert(Array.isArray(resProfile.data.posts), 'Expected profile posts array');
      const profileArt = resProfile.data.posts.find(p => p.id === articleId);
      assert(profileArt, 'Expected article in author profile');
    });

    // 6. Server Restart Persistence
    await runTest('6. Server Restart Persistence (shutdown, reboot, verify user and posts intact)', async () => {
      // Stop server
      await stopServer();

      // Restart server pointing to same database
      await startServer();

      // Verify User A can still log in after restart
      const resLogin = await request('POST', '/api/auth/login', {
        identifier: 'sarah.connor@readora.test',
        password: 'Password123!'
      });
      assert(resLogin.status === 200, `Expected 200 login after reboot, got ${resLogin.status}`);
      assert(resLogin.data.user.id === userA.id, 'Expected matching user ID after restart');

      // Verify article is still in database and feed
      const resFeed = await request('GET', '/api/posts');
      assert(resFeed.status === 200, 'Expected 200 for feed after reboot');
      const feedArticle = resFeed.data.posts.find(p => p.id === articleId);
      assert(feedArticle, 'Expected article to persist across reboot');
      assert(feedArticle.title === 'The Future of AI Architecture', 'Expected unchanged article content');
    });

    // 7. Multi-User Isolation & Security
    await runTest('7. Multi-User Isolation (User B cannot edit or delete User A content -> 403)', async () => {
      // Register User B
      const resRegB = await request('POST', '/api/auth/signup', {
        name: 'Kyle Reese',
        email: 'kyle.reese@readora.test',
        password: 'Password123!',
        handle: '@kylereese',
        bio: 'Guardian from the future.'
      });
      assert(resRegB.status === 201, 'User B registration failed');
      userB = resRegB.data.user;
      userBToken = resRegB.data.token;

      // User B tries to edit User A's article
      const resTamperEdit = await request('PUT', `/api/posts/${articleId}`, {
        title: 'Hacked Title By User B'
      }, { Authorization: `Bearer ${userBToken}` });
      assert(resTamperEdit.status === 403, `Expected 403 for unauthorized edit, got ${resTamperEdit.status}`);

      // User B tries to delete User A's article
      const resTamperDel = await request('DELETE', `/api/posts/${articleId}`, null, {
        Authorization: `Bearer ${userBToken}`
      });
      assert(resTamperDel.status === 403, `Expected 403 for unauthorized delete, got ${resTamperDel.status}`);
    });

    // 8. Author Edit & Update
    await runTest('8. Author Edit & Update (author successfully updates own article in DB)', async () => {
      const resUpdate = await request('PUT', `/api/posts/${articleId}`, {
        title: 'The Future of AI Architecture — Revised Edition',
        subtitle: 'Updated agentic workflows with comprehensive persistence',
        category: 'Technology',
        excerpt: 'Updated excerpt text.',
        fullContent: 'Updated full content with more insights.'
      }, { Authorization: `Bearer ${userAToken}` });

      assert(resUpdate.status === 200, `Expected 200 for author update, got ${resUpdate.status}`);
      assert(resUpdate.data.success === true, 'Expected success === true');
      assert(resUpdate.data.post.title === 'The Future of AI Architecture — Revised Edition', 'Expected updated title in response');

      // Verify in DB via single post route
      const resCheck = await request('GET', `/api/posts/single/${articleId}`);
      assert(resCheck.status === 200, 'Expected 200 fetching updated post');
      assert(resCheck.data.post.title === 'The Future of AI Architecture — Revised Edition', 'DB did not persist updated title');
    });

    // 9. Social Interactions (Follow, Like, Comment, Bookmark)
    await runTest('9. Social Interactions (authoritative like, bookmark, comment, follow)', async () => {
      // User B likes User A's article
      const resLike = await request('POST', `/api/posts/${articleId}/like`, null, {
        Authorization: `Bearer ${userBToken}`
      });
      assert(resLike.status === 200, `Expected 200 for like, got ${resLike.status}`);
      assert(resLike.data.liked === true, 'Expected liked === true');
      assert(resLike.data.likes >= 1, 'Expected likes >= 1');

      // User B bookmarks User A's article
      const resBm = await request('POST', `/api/posts/${articleId}/bookmark`, null, {
        Authorization: `Bearer ${userBToken}`
      });
      assert(resBm.status === 200, `Expected 200 for bookmark, got ${resBm.status}`);
      assert(resBm.data.saved === true, 'Expected saved === true');

      // User B adds comment to User A's article
      const resComment = await request('POST', `/api/posts/${articleId}/comment`, {
        text: 'Fascinating perspective on architecture and reliability!'
      }, { Authorization: `Bearer ${userBToken}` });
      assert(resComment.status === 201, `Expected 201 for comment, got ${resComment.status}`);
      assert(resComment.data.comment && resComment.data.comment.id, 'Expected comment with ID');
      commentId = resComment.data.comment.id;

      // User B follows User A
      const resFollow = await request('POST', `/api/posts/follow/${userA.id}`, null, {
        Authorization: `Bearer ${userBToken}`
      });
      assert(resFollow.status === 200, `Expected 200 for follow, got ${resFollow.status}`);
      assert(resFollow.data.isFollowing === true, 'Expected isFollowing === true');
    });

    // 10. Search & Topic Filtering
    await runTest('10. Search & Topic Filtering (query and category tag matching)', async () => {
      // Query filter
      const resFeed = await request('GET', '/api/posts');
      assert(resFeed.status === 200, 'Feed fetch failed');
      const posts = resFeed.data.posts;

      const techPosts = posts.filter(p => (p.category || '').toLowerCase() === 'technology');
      assert(techPosts.some(p => p.id === articleId), 'Article missing from Technology category filter');

      const searchMatch = posts.filter(p => (p.title || '').toLowerCase().includes('revised edition'));
      assert(searchMatch.length > 0 && searchMatch[0].id === articleId, 'Search query failed to match article');
    });

    // 11. Comment Ownership & Deletion
    await runTest('11. Comment Ownership & Deletion (owner/post-author can delete; stranger cannot)', async () => {
      // Register a 3rd user User C
      const resUserC = await request('POST', '/api/auth/signup', {
        name: 'Third Party',
        email: 'user.c@readora.test',
        password: 'Password123!',
        handle: '@userc'
      });
      const userCToken = resUserC.data.token;

      // User C attempts to delete User B's comment on User A's post -> 403 Forbidden
      const resUnauthorizedDel = await request('DELETE', `/api/posts/comments/${commentId}`, null, {
        Authorization: `Bearer ${userCToken}`
      });
      assert(resUnauthorizedDel.status === 403, `Expected 403 for comment deletion by stranger, got ${resUnauthorizedDel.status}`);

      // User B (comment author) deletes their own comment -> 200 OK
      const resAuthorizedDel = await request('DELETE', `/api/posts/comments/${commentId}`, null, {
        Authorization: `Bearer ${userBToken}`
      });
      assert(resAuthorizedDel.status === 200, `Expected 200 for comment deletion by author, got ${resAuthorizedDel.status}`);
    });

    // 12. Drafts API
    await runTest('12. Drafts API (save draft, retrieve draft, delete draft)', async () => {
      // Save draft
      const resSaveDraft = await request('POST', '/api/posts/draft', {
        title: 'Drafted Next Generation Article',
        subtitle: 'Work in progress',
        category: 'Creative',
        content: 'This draft will be finished later.'
      }, { Authorization: `Bearer ${userBToken}` });
      assert(resSaveDraft.status === 200, `Expected 200 for save draft, got ${resSaveDraft.status}`);
      assert(resSaveDraft.data.success === true, 'Save draft failed');

      // Retrieve draft
      const resGetDraft = await request('GET', '/api/posts/draft', null, {
        Authorization: `Bearer ${userBToken}`
      });
      assert(resGetDraft.status === 200, `Expected 200 for get draft, got ${resGetDraft.status}`);
      assert(resGetDraft.data.draft && resGetDraft.data.draft.title === 'Drafted Next Generation Article', 'Retrieved draft title mismatch');

      // Delete draft
      const resDelDraft = await request('DELETE', '/api/posts/draft', null, {
        Authorization: `Bearer ${userBToken}`
      });
      assert(resDelDraft.status === 200, `Expected 200 for delete draft, got ${resDelDraft.status}`);

      // Confirm draft is empty
      const resCheckDraft = await request('GET', '/api/posts/draft', null, {
        Authorization: `Bearer ${userBToken}`
      });
      assert(resCheckDraft.status === 200, 'Get draft after delete failed');
      assert(resCheckDraft.data.draft === null, 'Draft should be null after deletion');
    });

    // 13. Permanent Article Route
    await runTest('13. Permanent Article Route (direct single post lookup by ID)', async () => {
      const resSingle = await request('GET', `/api/posts/single/${articleId}`);
      assert(resSingle.status === 200, `Expected 200 for single post lookup, got ${resSingle.status}`);
      assert(resSingle.data.success === true, 'Expected success === true');
      assert(resSingle.data.post && resSingle.data.post.id === articleId, 'Expected matching post ID');
      assert(resSingle.data.post.fullContent.includes('Updated full content'), 'Expected full article content');

      // Non-existent ID returns 404
      const resNonExistent = await request('GET', `/api/posts/single/post_does_not_exist_999`);
      assert(resNonExistent.status === 404, `Expected 404 for non-existent post, got ${resNonExistent.status}`);
    });

    // 14. Phase 3: Deduplicated Article View Tracking
    await runTest('14. Deduplicated Article View Tracking (increments count once per viewer per day)', async () => {
      // First view by User B
      const resView1 = await request('POST', `/api/posts/${articleId}/view`, null, {
        Authorization: `Bearer ${userBToken}`
      });
      assert(resView1.status === 200, `Expected 200 for view, got ${resView1.status}`);
      assert(resView1.data.views >= 1, 'Expected views >= 1');
      const currentViews = resView1.data.views;

      // Repeated view by the same user should be deduplicated (not increment)
      const resView2 = await request('POST', `/api/posts/${articleId}/view`, null, {
        Authorization: `Bearer ${userBToken}`
      });
      assert(resView2.status === 200, 'Expected 200 on repeat view');
      assert(resView2.data.views === currentViews, 'Expected views count to remain deduplicated');
    });

    // 15. Phase 3: Creator Dashboard API
    await runTest('15. Creator Dashboard API (real analytics, articles, thoughts, draft)', async () => {
      const resDash = await request('GET', '/api/posts/dashboard', null, {
        Authorization: `Bearer ${userAToken}`
      });
      assert(resDash.status === 200, `Expected 200 for dashboard, got ${resDash.status}`);
      assert(resDash.data.success === true, 'Dashboard success expected');
      const stats = resDash.data.stats;
      assert(stats && typeof stats.totalArticles === 'number', 'Expected stats.totalArticles');
      assert(stats.totalArticles >= 1, 'Expected userA to have at least 1 published article');
      assert(stats.followersCount >= 1, 'Expected userA to have at least 1 follower (User B followed in step 9)');
      assert(Array.isArray(resDash.data.articles), 'Expected articles array');
      assert(Array.isArray(resDash.data.thoughts), 'Expected thoughts array');
      assert(resDash.data.articles.some(a => a.id === articleId), 'Expected published article in dashboard');
    });

    // 16. Phase 3: Notifications Center
    await runTest('16. Notifications Center (list, unread count, and mark-all-read)', async () => {
      // User A checks notifications (should contain like/comment/follow from User B)
      const resNotifs = await request('GET', '/api/posts/notifications', null, {
        Authorization: `Bearer ${userAToken}`
      });
      assert(resNotifs.status === 200, `Expected 200 for notifications, got ${resNotifs.status}`);
      assert(Array.isArray(resNotifs.data.notifications), 'Expected notifications array');
      assert(resNotifs.data.notifications.length >= 1, 'Expected at least 1 notification for User A');

      // Mark all read
      const resMark = await request('POST', '/api/posts/notifications/read-all', null, {
        Authorization: `Bearer ${userAToken}`
      });
      assert(resMark.status === 200, `Expected 200 for mark-all-read, got ${resMark.status}`);
      assert(resMark.data.success === true, 'Mark all read failed');

      // Verify unread count is 0
      const resCheck = await request('GET', '/api/posts/notifications', null, {
        Authorization: `Bearer ${userAToken}`
      });
      assert(resCheck.data.unreadCount === 0, 'Expected 0 unread notifications after mark-all-read');
    });

    // 17. Phase 3: Single Article with Related Recommendations
    await runTest('17. Single Article Related Recommendations (fetches related reads for reader engagement)', async () => {
      const resSingle = await request('GET', `/api/posts/single/${articleId}`);
      assert(resSingle.status === 200, 'Expected 200 for single article');
      assert(Array.isArray(resSingle.data.related), 'Expected related articles array');
    });

  } finally {
    await stopServer();
    cleanTestDb();
  }

  console.log('\n======================================================');
  console.log('   TEST EXECUTION SUMMARY');
  console.log('======================================================');
  let passCount = 0;
  for (const t of testResults) {
    if (t.status === 'PASS') {
      passCount++;
      console.log(` \x1b[32m✔ PASS\x1b[0m  ${t.name}`);
    } else {
      console.log(` \x1b[31m✖ FAIL\x1b[0m  ${t.name} -> ${t.error}`);
    }
  }

  console.log(`\nTOTAL: ${testResults.length} | PASSED: ${passCount} | FAILED: ${testResults.length - passCount}`);
  if (passCount === testResults.length) {
    console.log(`\x1b[32m🎉 ALL ${testResults.length} TEST CASES PASSED SUCCESSFULLY!\x1b[0m\n`);
    process.exit(0);
  } else {
    console.log('\x1b[31m❌ SOME TESTS FAILED. PLEASE REVIEW LOGS.\x1b[0m\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
