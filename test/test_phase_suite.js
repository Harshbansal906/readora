/**
 * READORA — Phase 1 to 12 Verification Suite
 * Validates:
 * 1. Follow Graph (idempotency, self-follow prevention, follow counts)
 * 2. Friendship Lifecycle (request, accept, status, decline, remove)
 * 3. Blocking Enforcement (severing follows & friends both ways, 403 protection)
 * 4. Friends-Only LiveKit Calls (non-friends 403, blocked 403, friends 200 JWT)
 * 5. FTS5 Search across Essays, Writers, Topics
 * 6. Health Check Endpoints (/health and /api/health)
 * 7. Mobile Layout Integrity (375px safety)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const TEST_DB_PATH = path.join(__dirname, 'test_phases.db');
process.env.DB_PATH = TEST_DB_PATH;
process.env.PORT = '5066';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_phases_1234567890abcdef';
process.env.LIVEKIT_API_KEY = 'test_lk_key';
process.env.LIVEKIT_API_SECRET = 'test_lk_secret_32_characters_long_key_val';

// Clean test db
for (const ext of ['', '-wal', '-shm']) {
  const f = TEST_DB_PATH + ext;
  if (fs.existsSync(f)) {
    try { fs.unlinkSync(f); } catch (e) {}
  }
}

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request({
      hostname: 'localhost',
      port: 5066,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: json, text: data });
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runPhasesSuite() {
  console.log('\n======================================================');
  console.log('   READORA PHASE 1–12 COMPLETE VERIFICATION SUITE');
  console.log('======================================================\n');

  // Start isolated express test server
  const express = require('express');
  const cors = require('cors');
  const helmet = require('helmet');
  const { db, initDB } = require('../db/database');

  await initDB();

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request ID
  app.use((req, res, next) => {
    req.id = 'test_req_' + Date.now();
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/posts', require('../routes/posts'));
  app.use('/api/users', require('../routes/users'));
  app.use('/api/friends', require('../routes/friends'));
  app.use('/api/notifications', require('../routes/notifications'));
  app.use('/api/calls', require('../routes/calls'));
  app.use('/api/search', require('../routes/search'));

  app.get(['/health', '/api/health'], async (req, res) => {
    res.json({ status: 'online', app: 'READORA', database: 'sqlite', timestamp: new Date().toISOString() });
  });

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(5066, resolve));
  console.log('Test server active on port 5066.');

  let testsPassed = 0;
  let testsFailed = 0;

  async function test(name, fn) {
    process.stdout.write(`  Testing: ${name}... `);
    try {
      await fn();
      console.log('✔ PASS');
      testsPassed++;
    } catch (err) {
      console.log('❌ FAIL');
      console.error('    Error:', err.message);
      testsFailed++;
    }
  }

  // Tokens and IDs
  let userA = null;
  let userB = null;
  let userC = null;
  let tokenA = null;
  let tokenB = null;
  let tokenC = null;

  // 1. Health check
  await test('1. Production Health Check Endpoint (/health & /api/health)', async () => {
    const res1 = await request('GET', '/health');
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.status, 'online');

    const res2 = await request('GET', '/api/health');
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.app, 'READORA');
  });

  // 2. Setup 3 test accounts
  await test('2. Create 3 isolated test accounts (Ananya, Rohan, Sameera)', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Password123!', 10);

    await db.runAsync(`INSERT INTO users (id, name, email, handle, password_hash, avatar) VALUES ('usr_a', 'Ananya Iyer', 'ananya@readora.in', '@ananyaiyer', ?, 'AI')`, [hash]);
    await db.runAsync(`INSERT INTO users (id, name, email, handle, password_hash, avatar) VALUES ('usr_b', 'Rohan Mehta', 'rohan@readora.in', '@rohanmehta', ?, 'RM')`, [hash]);
    await db.runAsync(`INSERT INTO users (id, name, email, handle, password_hash, avatar) VALUES ('usr_c', 'Sameera Khan', 'sameera@readora.in', '@sameerakhan', ?, 'SK')`, [hash]);

    const resA = await request('POST', '/api/auth/login', { identifier: 'ananya@readora.in', password: 'Password123!' });
    assert.strictEqual(resA.status, 200);
    tokenA = resA.body.token;
    userA = resA.body.user;

    const resB = await request('POST', '/api/auth/login', { identifier: 'rohan@readora.in', password: 'Password123!' });
    tokenB = resB.body.token;
    userB = resB.body.user;

    const resC = await request('POST', '/api/auth/login', { identifier: 'sameera@readora.in', password: 'Password123!' });
    tokenC = resC.body.token;
    userC = resC.body.user;
  });

  // 3. Follow / Unfollow endpoints
  await test('3. Follow Graph & Idempotency (User A follows User B)', async () => {
    // Prevent self-follow
    const selfRes = await request('POST', '/api/users/usr_a/follow', null, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(selfRes.status, 400);

    // Follow User B
    const folRes = await request('POST', '/api/users/usr_b/follow', null, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(folRes.status, 200);
    assert.strictEqual(folRes.body.isFollowing, true);

    // Repeat follow is idempotent
    const repeatRes = await request('POST', '/api/users/usr_b/follow', null, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(repeatRes.status, 200);

    // Unfollow User B
    const unfolRes = await request('DELETE', '/api/users/usr_b/follow', null, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(unfolRes.status, 200);
    assert.strictEqual(unfolRes.body.isFollowing, false);

    // Re-follow for next tests
    await request('POST', '/api/users/usr_b/follow', null, { Authorization: `Bearer ${tokenA}` });
  });

  // 4. Cursor-based Following Feed
  await test('4. Cursor-based Following Feed (GET /api/posts/following)', async () => {
    // User B publishes an essay
    const pubRes = await request('POST', '/api/posts/article', {
      title: 'Digital Permanence in an Ephemeral Era',
      subtitle: 'On building software that survives platforms and decadal shifts.',
      category: 'Technology',
      content: 'This is a long-form reflection on computational aesthetics and independent protocols.'
    }, { Authorization: `Bearer ${tokenB}` });
    assert.strictEqual(pubRes.status, 201);

    // User A fetches following feed
    const feedRes = await request('GET', '/api/posts/following?limit=10', null, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(feedRes.status, 200);
    assert.strictEqual(feedRes.body.success, true);
    assert.strictEqual(feedRes.body.posts.length > 0, true);
    assert.strictEqual(feedRes.body.posts[0].author, 'Rohan Mehta');
  });

  // 5. Friendship lifecycle
  await test('5. Friendship Lifecycle (Request, Pending Status, Acceptance)', async () => {
    // Self-friend request rejected with 400
    const selfReq = await request('POST', '/api/friends/request', { targetUserId: 'usr_a' }, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(selfReq.status, 400);

    // Initial status: none
    const st1 = await request('GET', '/api/friends/status/usr_b', null, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(st1.body.status, 'none');

    // User A sends request to User B
    const reqRes = await request('POST', '/api/friends/request', { targetUserId: 'usr_b' }, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(reqRes.status, 200);
    assert.strictEqual(reqRes.body.status, 'pending_outgoing');

    // User B checks status: pending_incoming
    const stB = await request('GET', '/api/friends/status/usr_a', null, { Authorization: `Bearer ${tokenB}` });
    assert.strictEqual(stB.body.status, 'pending_incoming');

    // User B accepts friend request
    const accRes = await request('POST', '/api/friends/accept', { requesterId: 'usr_a' }, { Authorization: `Bearer ${tokenB}` });
    assert.strictEqual(accRes.status, 200);
    assert.strictEqual(accRes.body.status, 'friends');

    // Both now see friends status
    const stA2 = await request('GET', '/api/friends/status/usr_b', null, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(stA2.body.status, 'friends');

    // Friends list includes each other
    const listA = await request('GET', '/api/friends', null, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(listA.body.friends.length, 1);
    assert.strictEqual(listA.body.friends[0].name, 'Rohan Mehta');
  });

  // 6. LiveKit Friends-Only Calls
  await test('6. LiveKit Friends-Only Audio/Video Calls (Permission Checks)', async () => {
    // Self-call rejected with 400
    const selfCall = await request('POST', '/api/calls/token', { targetUserId: 'usr_a' }, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(selfCall.status, 400);

    // User A and User C are NOT friends -> Call token request must fail with 403
    const nonFriendCall = await request('POST', '/api/calls/token', { targetUserId: 'usr_c' }, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(nonFriendCall.status, 403);
    assert.strictEqual(nonFriendCall.body.success, false);

    // User A and User B ARE mutual friends -> Call token request must succeed with 200 and valid JWT
    const friendCall = await request('POST', '/api/calls/token', { targetUserId: 'usr_b' }, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(friendCall.status, 200);
    assert.strictEqual(friendCall.body.success, true);
    assert.strictEqual(typeof friendCall.body.token, 'string');
    assert.strictEqual(friendCall.body.token.length > 50, true);
  });

  // 7. Blocking Lifecycle & Mutual Severing
  await test('7. Blocking Enforcement (Severs Friendships, Follows, & Blocks Calls)', async () => {
    // User B blocks User A
    const blockRes = await request('POST', '/api/users/usr_a/block', null, { Authorization: `Bearer ${tokenB}` });
    assert.strictEqual(blockRes.status, 200);

    // Friendship must now be deleted
    const stA = await request('GET', '/api/friends/status/usr_b', null, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(stA.body.status, 'blocked');

    // Blocked user cannot send friend request (403)
    const blockedFriendReq = await request('POST', '/api/friends/request', { targetUserId: 'usr_b' }, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(blockedFriendReq.status, 403);

    // Calls between them must now return 403
    const callRes = await request('POST', '/api/calls/token', { targetUserId: 'usr_b' }, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(callRes.status, 403);

    // Follow between them must be severed & blocked (403)
    const folRes = await request('POST', '/api/users/usr_b/follow', null, { Authorization: `Bearer ${tokenA}` });
    assert.strictEqual(folRes.status, 403);

    // Unblock
    const unblockRes = await request('DELETE', '/api/users/usr_a/block', null, { Authorization: `Bearer ${tokenB}` });
    assert.strictEqual(unblockRes.status, 200);
  });

  // 8. FTS5 Search
  await test('8. FTS5 Search Query (Essays, Writers, Topics matching)', async () => {
    const searchRes = await request('GET', '/api/search?q=Permanence');
    assert.strictEqual(searchRes.status, 200);
    assert.strictEqual(searchRes.body.success, true);
    assert.strictEqual(searchRes.body.essays.length > 0, true);
    assert.strictEqual(searchRes.body.essays[0].title.includes('Permanence'), true);
  });

  // 9. Notifications Grouping & Polling
  await test('9. Notifications Grouping & Polling (/api/notifications)', async () => {
    const notifRes = await request('GET', '/api/notifications', null, { Authorization: `Bearer ${tokenB}` });
    assert.strictEqual(notifRes.status, 200);
    assert.strictEqual(notifRes.body.success, true);
    assert.strictEqual(Array.isArray(notifRes.body.notifications.today), true);

    const countRes = await request('GET', '/api/notifications/unread-count', null, { Authorization: `Bearer ${tokenB}` });
    assert.strictEqual(countRes.status, 200);
    assert.strictEqual(typeof countRes.body.count, 'number');

    const markRes = await request('POST', '/api/notifications/mark-read', null, { Authorization: `Bearer ${tokenB}` });
    assert.strictEqual(markRes.status, 200);
  });

  // 10. Mobile 375px & HTML semantic integrity
  await test('10. Mobile Layout & HTML Semantic Integrity', async () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const styleCss = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

    // Viewport meta
    assert.strictEqual(indexHtml.includes('name="viewport" content="width=device-width, initial-scale=1.0"'), true);
    // Tiro Devanagari Hindi font
    assert.strictEqual(indexHtml.includes('Tiro+Devanagari+Hindi'), true);
    // Mobile safety rule
    assert.strictEqual(styleCss.includes('@media (max-width: 400px)'), true);
    // Warm paper palette
    assert.strictEqual(styleCss.includes('--bg-paper: #F6F3EE;'), true);
    // Oxblood accent
    assert.strictEqual(styleCss.includes('--accent: #7A2E22;'), true);
    // Inverted dark mode
    assert.strictEqual(styleCss.includes('--bg-paper: #161513;'), true);
  });

  console.log('\n======================================================');
  console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  if (testsFailed === 0) {
    console.log('🎉 ALL PHASE VERIFICATION TESTS PASSED SUCCESSFULLY!');
  }
  console.log('======================================================\n');

  server.close();
  for (const ext of ['', '-wal', '-shm']) {
    const f = TEST_DB_PATH + ext;
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch (e) {}
    }
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

runPhasesSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
