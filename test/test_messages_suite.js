/**
 * READORA — Private Direct Messaging Test Suite
 * Validates all 12 specifications from Part 6:
 * 1. Two friends can open a conversation and exchange messages.
 * 2. A non-friend gets 403 when opening a conversation or sending a message.
 * 3. A blocked user cannot send or read messages, and conversation is hidden. Unblocking restores access and history.
 * 4. After unfriending, the conversation is read-only: messages are readable, but sending returns 403.
 * 5. A user can delete their own message. The other user sees "This message was deleted."
 * 6. A user cannot delete the other user's message (returns 403).
 * 7. The 61st message in a minute returns 429.
 * 8. Empty messages and whitespace-only messages are rejected with 400.
 * 9. HTML tags in a message are stripped on the server and not stored or displayed as HTML.
 * 10. A user who is not logged in gets 401 on every message endpoint.
 * 11. A user cannot read a conversation they are not part of (returns 404, not 403).
 * 12. Unread count is correct: increments on receive, clears on read, ignores deleted messages.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const TEST_DB_PATH = path.join(__dirname, 'test_messages.db');
process.env.DB_PATH = TEST_DB_PATH;
const TEST_PORT = 5077;
process.env.PORT = String(TEST_PORT);
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_messages_suite_9876543210';

// Clean test database
for (const ext of ['', '-wal', '-shm']) {
  const f = TEST_DB_PATH + ext;
  if (fs.existsSync(f)) {
    try { fs.unlinkSync(f); } catch (e) {}
  }
}

function request(method, pathUrl, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request({
      hostname: 'localhost',
      port: TEST_PORT,
      path: pathUrl,
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

async function runMessagesSuite() {
  console.log('\n======================================================');
  console.log('   READORA DIRECT MESSAGING VERIFICATION SUITE');
  console.log('======================================================\n');

  const express = require('express');
  const cors = require('cors');
  const { db, initDB } = require('../db/database');

  await initDB();

  // Run messages migration on test database
  const { runMigration } = require('../scripts/migrate_messages');
  await runMigration(TEST_DB_PATH);

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/users', require('../routes/users'));
  app.use('/api/friends', require('../routes/friends'));
  app.use('/api/conversations', require('../routes/conversations'));
  app.use('/api/messages', require('../routes/messages'));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, resolve));
  console.log(`Test server listening on port ${TEST_PORT}.\n`);

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`  Testing: ${name}... `);
    try {
      await fn();
      console.log('✔ PASS');
      passed++;
    } catch (err) {
      console.log('❌ FAIL');
      console.error('    Error:', err.message);
      failed++;
    }
  }

  try {
    // Setup test users: Alice, Bob, Charlie, Dave
    let aliceToken, bobToken, charlieToken, daveToken;
    const aliceId = 'usr_alice';
    const bobId = 'usr_bob';
    const charlieId = 'usr_charlie';
    const daveId = 'usr_dave';

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Password123!', 10);

    await db.runAsync(`INSERT INTO users (id, name, email, handle, password_hash, avatar) VALUES ('usr_alice', 'Alice Walker', 'alice@readora.in', '@alice', ?, 'AW')`, [hash]);
    await db.runAsync(`INSERT INTO users (id, name, email, handle, password_hash, avatar) VALUES ('usr_bob', 'Bob Dylan', 'bob@readora.in', '@bob', ?, 'BD')`, [hash]);
    await db.runAsync(`INSERT INTO users (id, name, email, handle, password_hash, avatar) VALUES ('usr_charlie', 'Charlie Chaplin', 'charlie@readora.in', '@charlie', ?, 'CC')`, [hash]);
    await db.runAsync(`INSERT INTO users (id, name, email, handle, password_hash, avatar) VALUES ('usr_dave', 'Dave Miller', 'dave@readora.in', '@dave', ?, 'DM')`, [hash]);

    const resA = await request('POST', '/api/auth/login', { identifier: 'alice@readora.in', password: 'Password123!' });
    aliceToken = resA.body.token;

    const resB = await request('POST', '/api/auth/login', { identifier: 'bob@readora.in', password: 'Password123!' });
    bobToken = resB.body.token;

    const resC = await request('POST', '/api/auth/login', { identifier: 'charlie@readora.in', password: 'Password123!' });
    charlieToken = resC.body.token;

    const resD = await request('POST', '/api/auth/login', { identifier: 'dave@readora.in', password: 'Password123!' });
    daveToken = resD.body.token;

    // Helper: make two users friends
    async function makeFriends(tokenA, tokenB, userAId, userBId) {
      const reqRes = await request('POST', '/api/friends/request', { targetUserId: userBId }, { Authorization: `Bearer ${tokenA}` });
      assert.strictEqual(reqRes.status, 200);
      const accRes = await request('POST', '/api/friends/accept', { requesterId: userAId }, { Authorization: `Bearer ${tokenB}` });
      assert.strictEqual(accRes.status, 200);
    }

    // Alice and Bob become friends
    await makeFriends(aliceToken, bobToken, aliceId, bobId);

    let aliceBobConvId = null;

    // 1. Two friends can open a conversation and exchange messages
    await test('1. Two friends can open a conversation and exchange messages', async () => {
      // Alice initiates conversation with Bob
      const openRes = await request('POST', `/api/conversations/${bobId}`, null, { Authorization: `Bearer ${aliceToken}` });
      assert.strictEqual(openRes.status, 200);
      assert.strictEqual(openRes.body.success, true);
      aliceBobConvId = openRes.body.conversation.id;
      assert(aliceBobConvId);

      // Alice sends a message
      const sendRes1 = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, {
        body: 'Hello Bob! Welcome to Readora direct messaging.'
      }, { Authorization: `Bearer ${aliceToken}` });
      assert.strictEqual(sendRes1.status, 201);
      assert.strictEqual(sendRes1.body.message.body, 'Hello Bob! Welcome to Readora direct messaging.');

      // Bob replies
      const sendRes2 = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, {
        body: 'Hi Alice! Great to connect here.'
      }, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(sendRes2.status, 201);

      // Bob fetches messages
      const getRes = await request('GET', `/api/conversations/${aliceBobConvId}/messages`, null, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.messages.length, 2);
    });

    // 2. A non-friend gets 403 when opening a conversation or sending a message
    await test('2. Non-friend gets 403 when opening a conversation or sending a message', async () => {
      // Charlie is not friends with Alice
      const openRes = await request('POST', `/api/conversations/${aliceId}`, null, { Authorization: `Bearer ${charlieToken}` });
      assert.strictEqual(openRes.status, 403);
      assert.strictEqual(openRes.body.success, false);

      // Charlie attempts to send message to Alice & Bob's conversation
      const sendRes = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, {
        body: 'Intruding here!'
      }, { Authorization: `Bearer ${charlieToken}` });
      // Non-member gets 404 (do not reveal existence to outsiders)
      assert.strictEqual(sendRes.status, 404);
    });

    // 3. A blocked user cannot send or read messages, conversation is hidden. Unblocking restores access.
    await test('3. Blocked user cannot send or read messages; unblocking restores access', async () => {
      // Bob blocks Alice
      const blockRes = await request('POST', `/api/users/${aliceId}/block`, null, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(blockRes.status, 200);

      // In GET /api/conversations, the conversation must be completely hidden from both
      const convsAlice = await request('GET', '/api/conversations', null, { Authorization: `Bearer ${aliceToken}` });
      assert.strictEqual(convsAlice.body.conversations.length, 0);

      const convsBob = await request('GET', '/api/conversations', null, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(convsBob.body.conversations.length, 0);

      // Alice tries to fetch messages of the blocked conversation -> 404
      const getBlocked = await request('GET', `/api/conversations/${aliceBobConvId}/messages`, null, { Authorization: `Bearer ${aliceToken}` });
      assert.strictEqual(getBlocked.status, 404);

      // Alice tries to send message -> 403 or 404
      const sendBlocked = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, {
        body: 'Can you hear me?'
      }, { Authorization: `Bearer ${aliceToken}` });
      assert([403, 404].includes(sendBlocked.status));

      // Bob unblocks Alice
      const unblockRes = await request('DELETE', `/api/users/${aliceId}/block`, null, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(unblockRes.status, 200);

      // Blocking severs friendship as per Phase 7 rules, so restore friendship to test restoration
      await makeFriends(aliceToken, bobToken, aliceId, bobId);

      // Verify conversation and message history restored
      const getRestored = await request('GET', `/api/conversations/${aliceBobConvId}/messages`, null, { Authorization: `Bearer ${aliceToken}` });
      assert.strictEqual(getRestored.status, 200);
      assert.strictEqual(getRestored.body.messages.length, 2);
    });

    // 4. After unfriending, conversation is read-only (readable, sending returns 403)
    await test('4. After unfriending, conversation is read-only (messages readable, sending returns 403)', async () => {
      // Bob removes friendship with Alice
      const removeFriend = await request('DELETE', `/api/friends/${aliceId}`, null, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(removeFriend.status, 200);

      // Messages stay readable
      const getRes = await request('GET', `/api/conversations/${aliceBobConvId}/messages`, null, { Authorization: `Bearer ${aliceToken}` });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.isReadOnly, true);
      assert.strictEqual(getRes.body.messages.length, 2);

      // Sending message is refused with 403
      const sendRes = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, {
        body: 'Are we still friends?'
      }, { Authorization: `Bearer ${aliceToken}` });
      assert.strictEqual(sendRes.status, 403);
      assert.strictEqual(sendRes.body.success, false);

      // Restore friendship for remaining tests
      await makeFriends(aliceToken, bobToken, aliceId, bobId);
    });

    // 5. A user can delete their own message. The other user sees "This message was deleted."
    let aliceMsgId = null;
    await test('5. User can delete own message; other user sees "This message was deleted."', async () => {
      const sendRes = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, {
        body: 'A temporary secret message.'
      }, { Authorization: `Bearer ${aliceToken}` });
      assert.strictEqual(sendRes.status, 201);
      aliceMsgId = sendRes.body.message.id;

      // Alice deletes her own message
      const delRes = await request('DELETE', `/api/messages/${aliceMsgId}`, null, { Authorization: `Bearer ${aliceToken}` });
      assert.strictEqual(delRes.status, 200);
      assert.strictEqual(delRes.body.success, true);

      // Bob fetches messages and sees "This message was deleted."
      const bobFetch = await request('GET', `/api/conversations/${aliceBobConvId}/messages`, null, { Authorization: `Bearer ${bobToken}` });
      const delMsg = bobFetch.body.messages.find(m => m.id === aliceMsgId);
      assert(delMsg);
      assert.strictEqual(delMsg.is_deleted, true);
      assert.strictEqual(delMsg.body, 'This message was deleted.');
    });

    // 6. A user cannot delete the other user's message (returns 403)
    await test('6. User cannot delete other user message (returns 403)', async () => {
      // Bob sends a message
      const bMsg = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, {
        body: 'Bob authorial thoughts.'
      }, { Authorization: `Bearer ${bobToken}` });
      const bobMsgId = bMsg.body.message.id;

      // Alice attempts to delete Bob's message -> 403
      const badDel = await request('DELETE', `/api/messages/${bobMsgId}`, null, { Authorization: `Bearer ${aliceToken}` });
      assert.strictEqual(badDel.status, 403);
      assert.strictEqual(badDel.body.success, false);
    });

    // 7. The 61st message in a minute returns 429
    await test('7. 61st message in a minute returns 429 rate limit', async () => {
      // Charlie and Dave become friends to test rate limiting independently
      await makeFriends(charlieToken, daveToken, charlieId, daveId);
      const convRes = await request('POST', `/api/conversations/${daveId}`, null, { Authorization: `Bearer ${charlieToken}` });
      const cdConvId = convRes.body.conversation.id;

      let lastStatus = 0;
      // Send 60 messages
      for (let i = 1; i <= 60; i++) {
        const r = await request('POST', `/api/conversations/${cdConvId}/messages`, {
          body: `Burst message ${i}`
        }, { Authorization: `Bearer ${charlieToken}` });
        assert.strictEqual(r.status, 201);
      }

      // 61st message must be rejected with 429
      const overflow = await request('POST', `/api/conversations/${cdConvId}/messages`, {
        body: 'Burst message 61 (overflow)'
      }, { Authorization: `Bearer ${charlieToken}` });

      assert.strictEqual(overflow.status, 429);
      assert.strictEqual(overflow.body.success, false);
      assert(overflow.body.message.includes('Too many messages'));
    });

    // 8. Empty messages and whitespace-only messages are rejected with 400
    await test('8. Empty messages and whitespace-only messages are rejected with 400', async () => {
      const empty1 = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, {
        body: ''
      }, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(empty1.status, 400);

      const empty2 = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, {
        body: '     \n\t   '
      }, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(empty2.status, 400);
    });

    // 9. HTML tags in a message are stripped on the server and not stored or displayed as HTML
    await test('9. HTML tags in message are stripped on server', async () => {
      const htmlMsg = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, {
        body: 'Hello <script>alert("xss")</script><b>Bold</b> world!'
      }, { Authorization: `Bearer ${aliceToken}` });
      assert.strictEqual(htmlMsg.status, 201);
      assert.strictEqual(htmlMsg.body.message.body, 'Hello alert(&quot;xss&quot;)Bold world!');
      assert(!htmlMsg.body.message.body.includes('<script>'));
      assert(!htmlMsg.body.message.body.includes('<b>'));
    });

    // 10. A user who is not logged in gets 401 on every message endpoint
    await test('10. Unauthenticated user gets 401 on all message endpoints', async () => {
      const e1 = await request('GET', '/api/conversations');
      assert.strictEqual(e1.status, 401);

      const e2 = await request('POST', `/api/conversations/${bobId}`);
      assert.strictEqual(e2.status, 401);

      const e3 = await request('GET', `/api/conversations/${aliceBobConvId}/messages`);
      assert.strictEqual(e3.status, 401);

      const e4 = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, { body: 'test' });
      assert.strictEqual(e4.status, 401);

      const e5 = await request('POST', `/api/conversations/${aliceBobConvId}/read`);
      assert.strictEqual(e5.status, 401);

      const e6 = await request('GET', '/api/messages/unread-count');
      assert.strictEqual(e6.status, 401);

      const e7 = await request('DELETE', '/api/messages/dummy_id');
      assert.strictEqual(e7.status, 401);
    });

    // 11. A user cannot read a conversation they are not part of (returns 404, not 403)
    await test('11. User cannot read conversation they are not part of (returns 404, not 403)', async () => {
      // Dave is not in Alice & Bob's conversation
      const readRes = await request('GET', `/api/conversations/${aliceBobConvId}/messages`, null, { Authorization: `Bearer ${daveToken}` });
      assert.strictEqual(readRes.status, 404);
      assert.strictEqual(readRes.body.success, false);
      assert.strictEqual(readRes.body.message, 'Conversation not found.');
    });

    // 12. Unread count is correct: increments on receive, clears on read, ignores deleted messages
    await test('12. Unread count increments on receive, clears on read, ignores deleted messages', async () => {
      // Bob marks all current messages as read first
      await request('POST', `/api/conversations/${aliceBobConvId}/read`, null, { Authorization: `Bearer ${bobToken}` });
      const initialCount = await request('GET', '/api/messages/unread-count', null, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(initialCount.body.count, 0);

      // Alice sends 2 messages to Bob
      const m1 = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, { body: 'First unread message' }, { Authorization: `Bearer ${aliceToken}` });
      const m2 = await request('POST', `/api/conversations/${aliceBobConvId}/messages`, { body: 'Second unread message' }, { Authorization: `Bearer ${aliceToken}` });

      // Bob's unread count should now be 2
      const afterSend = await request('GET', '/api/messages/unread-count', null, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(afterSend.body.count, 2);

      // Alice deletes one message before Bob reads it
      await request('DELETE', `/api/messages/${m1.body.message.id}`, null, { Authorization: `Bearer ${aliceToken}` });

      // Bob's unread count should now ignore deleted message -> count becomes 1
      const afterDel = await request('GET', '/api/messages/unread-count', null, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(afterDel.body.count, 1);

      // Bob marks conversation as read
      const markRes = await request('POST', `/api/conversations/${aliceBobConvId}/read`, null, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(markRes.status, 200);

      // Bob's unread count should now be 0
      const afterRead = await request('GET', '/api/messages/unread-count', null, { Authorization: `Bearer ${bobToken}` });
      assert.strictEqual(afterRead.body.count, 0);
    });

  } finally {
    server.close();
  }

  console.log('\n------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runMessagesSuite().catch(err => {
    console.error('Test suite execution error:', err);
    process.exit(1);
  });
}

module.exports = { runMessagesSuite };
