# Changelog — READORA Production v1

All notable changes, bug fixes, and security enhancements to READORA are documented in this file.

---

## [1.1.0] - 2026-11-17

### Feature: Private Direct Messages Between Accepted Friends
- **Database Schema & Migrations (`scripts/migrate_messages.js`):**
  - Added `conversations` table (`id`, `user_low_id`, `user_high_id`, `created_at`, `last_message_at`, `UNIQUE(user_low_id, user_high_id)`).
  - Added `messages` table (`id`, `conversation_id`, `sender_id`, `body`, `created_at`, `read_at`, `deleted_at`).
  - Added indexes `idx_conversations_user_low`, `idx_conversations_user_high`, and `idx_messages_conv_created`.
  - Migration is 100% idempotent and tested safely without data loss.
- **Backend Rules & Security Hardening (`routes/conversations.js`, `routes/messages.js`):**
  - Mutual friend verification: Only accepted friends can open a conversation or send messages (`403` for non-friends).
  - Blocking enforcement: If either party blocks the other, conversation is completely hidden (`GET /api/conversations` filters out blocked pairs, `GET /api/conversations/:id/messages` returns `404`). Unblocking restores history.
  - Unfriending read-only mode: When friendship is removed, conversation becomes read-only (readable, but sending returns `403` with a translated explanation).
  - Outsider privacy: Non-members receive `404` to avoid leaking conversation existence.
  - Rate limiting: Sliding-window limiter restricts message sending to 60 messages/min/user (`429`).
  - Plain text sanitization: Server strips all HTML (`<[^>]*>/g`), validates length $\le 2000$ characters, and rejects whitespace-only messages (`400`).
  - Soft deletion: Senders can soft-delete their own messages (`deleted_at`), rendering as "This message was deleted." to both parties; foreign deletion attempts return `403`.
  - Notification throttling: Dispatches at most one `message_received` notification per conversation per hour.
- **Frontend & Editorial UI (`index.html`, `app.js`, `style.css`):**
  - Added Messages badge and navigation link to desktop header and mobile bottom bar.
  - Built editorial 2-column/split layout matching warm paper palette (`#F6F3EE` / `#161513`), hairline borders, serif headings, and tabular numerals.
  - Implemented 5s active conversation polling and 30s unread count polling with automatic pause when `document.visibilityState === 'hidden'`.
  - Added dynamic "Message" action button to friend profile view.
- **Internationalization (`locales/en.json`, `locales/hi.json`):**
  - Added 18 new localized string keys in English and Hindi Devanagari.
- **Automated Verification (`test/test_messages_suite.js`):**
  - 12 comprehensive automated test cases validating friends exchange, non-friend rejection, blocking visibility, unfriending read-only, soft deletion, rate limiting, and unread counters (12/12 passed).

---

## [1.0.0] - 2026-11-17

### Step 1: Root Cause Diagnosis & Router Fixes
- **Root Cause of Empty Feed and Unresponsive Buttons:**
  - In `app.js` (line 743), orphan code outside `updateNavActive()` (`if (home) home.classList.toggle(...)`) triggered an uncaught syntax error (`SyntaxError: Unexpected identifier 'home'`) when the browser parsed `app.js`.
  - Because `app.js` aborted execution before parsing finished:
    - Event listeners were never bound to any interactive element (buttons appeared completely dead).
    - `ReadoraApp.init()` never executed, leaving the posts feed empty.
    - `handleRoute()` never unhid `#settings-view` and left `#feed-view` displayed by default with the filter bar visible.
- **Commit:** `bf3f47c` (`fix(step-1): resolve empty feed root cause (orphan syntax error) and ensure hash router handles all 8 routes seamlessly`)
- **Hash Router Overhaul:**
  - Normalized route parsing to support both trailing slash and slashless variants (`#/settings`, `#settings`, `#/explore`, `#explore`, `#/saved`, `#saved`, `#/notifications`, `#notifications`, `#/write`, `#write`).
  - Added support for `#/profile/:id` and `#/u/:handle` with creator profile lookup supporting both database IDs and handles.
  - Made `openFullArticle(postId)` asynchronous to fetch the essay from `/api/posts/single/:id` on direct URL page reloads if not pre-cached in memory.
  - Connected modal closing (`✕` buttons, scrim click, `Escape` key) to reset URL hash back to `#/`.

---

### Step 2: Database Migration & Idempotent Seeding
- **Database Reset & Clean Initialization:**
  - Deleted local database file and re-initialized schema cleanly via `initDB()`.
  - Confirmed creation of all 8 core tables: `users`, `posts`, `drafts`, `follows`, `friendships`, `blocks`, `notifications`, and `posts_fts`.
- **Idempotency Hardening:**
  - Updated `scripts/seed.js` with `DELETE FROM posts_fts WHERE id = ?` prior to virtual table insertions to prevent duplicate FTS5 rows on repeated seed executions.
  - Re-ran seed on existing database and verified row counts remain strictly identical (14 authors, 26 posts, 41 follows, 24 FTS5 entries).
- **Feed Deduplication:**
  - Verified and guaranteed that the lead essay is selected only from titled long-form essays, and is strictly excluded from both the main feed stream and the top 5 Trending sidebar entries.

---

### Step 3 & 4: Hand Verification, Bug Fixes & Mobile Quality
- **Permission & Security Enforcements:**
  - Added strict self-follow prevention (`400 Bad Request` if user follows themselves).
  - Added self-call and self-friend-request prevention (`400 Bad Request`).
  - Block enforcement: blocking severs mutual follows and friendships both ways and returns `403 Forbidden` if a blocked user attempts to follow, friend-request, or initiate a LiveKit call.
  - Friend request rate limiter: enforces max 20 friend requests per 24 hours (21st request returns `429 Too Many Requests`).
- **Profile Photo WebP Pipeline:**
  - `POST /api/users/avatar` with magic byte validation (JPEG, PNG, WebP) rejecting renamed non-image files and files > 2MB.
  - Automatically generates 512px and 128px square WebP versions with `Cache-Control` and `ETag` headers.
- **Rich-Text Editor:**
  - Server-side `sanitize-html` removes `<script>` and malicious attributes while preserving semantic formatting (`h2`, `h3`, `blockquote`, `strong`, `em`, `a`).
  - Enforced minimum 150-word editorial length requirement in production.
- **Mobile Lighthouse Optimization:**
  - Preloaded Google Fonts asynchronously with `display=swap` to eliminate render-blocking CSS.
  - Added `width`, `height`, and `aspect-ratio: 16/9` to lead essay covers and `aspect-ratio: 4/3` to thumbnails, dropping Cumulative Layout Shift (CLS) from `0.32` to `0.051`.
  - Wrapped background data syncing and notifications polling in `requestIdleCallback`, freeing the main thread on page load.
  - **Lighthouse Mobile Results:**
    - **Performance:** `90 / 100` (exceeds $\ge 85$ target)
    - **Accessibility:** `96 / 100` (exceeds $\ge 95$ target)
    - **Best Practices:** `92 / 100`
    - **SEO:** `92 / 100`
- **Automated Verification:**
  - All 25 core tests + all 10 phase tests passing: `35 / 35 PASS (100%)`.

---

### Step 5: Security Hardening & Secret Protection
- **Secrets Audit:** Verified that `.env` is ignored by `.gitignore` and was never committed to any commit in git history.
- **HTTP-Only Cookies & CSRF:** Added `cookie-parser` to `server.js` and set `httpOnly: true`, `secure: production`, `sameSite: 'lax'` cookie flags on login and signup alongside stateless `Authorization: Bearer` support.
- **Rate Limiting:** Active across `/api/auth` (15 attempts / 15 min), `/api/auth/verify-otp` (6 attempts / 15 min), `/api/friends/request` (20 / day), `/api/users/:id/follow` (100 / hr), and `/api/calls/token` (10 / 10 min).

