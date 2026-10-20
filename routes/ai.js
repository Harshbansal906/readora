/**
 * READORA - AI Routes (Google Gemini REST API)
 * Uses direct fetch to Gemini REST API (no SDK - compatible with all models)
 * Provides 5 AI-powered endpoints:
 *  1. POST /api/ai/improve         - AI Writing Assistant
 *  2. POST /api/ai/summarize       - Auto-Summarize article
 *  3. POST /api/ai/suggest-category - Tag/Category Suggester
 *  4. POST /api/ai/chat            - AI Chat Bot (context-aware)
 *  5. POST /api/ai/semantic-search - Semantic (meaning-based) search re-ranking
 */

const express = require('express');
const router = express.Router();

const GEMINI_MODEL = 'gemini-3.5-flash'; // Confirmed working model
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Rate limiting — simple in-memory store (resets on server restart)
const rateLimitMap = new Map();
const RATE_LIMIT = 20;       // max requests
const RATE_WINDOW = 60000;   // per 60 seconds

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  rateLimitMap.set(ip, entry);
  return true;
}

// Call Gemini REST API directly with a timeout
async function callGemini(prompt) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024
        }
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || `Gemini API error ${res.status}`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');
    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
}

// Common middleware: rate-limit check + key presence check
router.use((req, res, next) => {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      message: 'AI features are not configured yet. Please add your GEMINI_API_KEY to .env'
    });
  }
  const ip = req.ip || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ success: false, message: 'Too many AI requests. Please wait a minute.' });
  }
  next();
});

/* ─────────────────────────────────────────────────────────────────
   1. POST /api/ai/improve
   Body: { text: string, type: 'thought' | 'article' }
   Returns: { improved: string }
───────────────────────────────────────────────────────────────── */
router.post('/improve', async (req, res) => {
  try {
    const { text, type } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Text is required.' });
    }

    const isArticle = type === 'article';
    const prompt = isArticle
      ? `You are a professional editor for a creative writing platform called READORA.
Improve the following article content. Keep the author's voice and ideas completely intact.
Make the writing clearer, more engaging, and better structured. Fix grammar and flow.
Return ONLY the improved text — no explanations, no commentary.

ARTICLE:
${text.trim()}`
      : `You are a creative editor for READORA, a platform for short thoughts and quotes.
Improve the following short thought/quote. Keep the author's core idea and voice.
Make it more poetic, impactful, or clear. Keep it SHORT (under 280 chars if possible).
Return ONLY the improved text — no explanations, no commentary.

THOUGHT:
${text.trim()}`;

    const improved = await callGemini(prompt);
    res.json({ success: true, improved });
  } catch (error) {
    console.error('AI improve error:', error.message);
    res.status(500).json({ success: false, message: 'AI improvement failed. Please try again.' });
  }
});

/* ─────────────────────────────────────────────────────────────────
   2. POST /api/ai/summarize
   Body: { content: string, title?: string }
   Returns: { summary: string }
───────────────────────────────────────────────────────────────── */
router.post('/summarize', async (req, res) => {
  try {
    const { content, title } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Content is required.' });
    }

    const prompt = `You are a concise summarizer for READORA, a creative writing platform.
Write a compelling 1-2 sentence subtitle or hook for the following article.
It should grab the reader's attention and summarize the core idea.
Return ONLY the subtitle — no explanations, no labels, no quotes.
${title ? `Article Title: "${title}"` : ''}

ARTICLE CONTENT:
${content.trim().substring(0, 3000)}`;

    const summary = await callGemini(prompt);
    res.json({ success: true, summary });
  } catch (error) {
    console.error('AI summarize error:', error.message);
    res.status(500).json({ success: false, message: 'AI summarization failed. Please try again.' });
  }
});

/* ─────────────────────────────────────────────────────────────────
   3. POST /api/ai/suggest-category
   Body: { text: string }
   Returns: { category: string, reason: string }
───────────────────────────────────────────────────────────────── */
router.post('/suggest-category', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Text is required.' });
    }

    const validCategories = ['General', 'Tech', 'Philosophy', 'Creative', 'Life', 'Productivity', 'Design', 'Story'];

    const prompt = `You are a content classifier for READORA, a reading and writing platform.
Classify the following post into ONE of these categories: ${validCategories.join(', ')}.
Then give a very short reason (under 10 words).

Respond in this exact JSON format (nothing else):
{"category": "Category", "reason": "Short reason here"}

POST:
${text.trim().substring(0, 1000)}`;

    let raw = await callGemini(prompt);
    raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    const parsed = JSON.parse(raw);
    const category = validCategories.includes(parsed.category) ? parsed.category : 'General';

    res.json({ success: true, category, reason: parsed.reason || '' });
  } catch (error) {
    console.error('AI suggest-category error:', error.message);
    res.status(500).json({ success: false, message: 'AI category suggestion failed. Please try again.' });
  }
});

/* ─────────────────────────────────────────────────────────────────
   4. POST /api/ai/chat
   Body: { message: string, history?: [{role, text}] }
   Returns: { reply: string }
───────────────────────────────────────────────────────────────── */
router.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }

    const historyText = Array.isArray(history) && history.length > 0
      ? history.slice(-6).map(h => `${h.role === 'user' ? 'User' : 'Readora AI'}: ${h.text}`).join('\n')
      : '';

    const prompt = `You are "Readora AI", the friendly and helpful AI assistant for READORA — a platform where readers share thoughts, quotes, poetry, and long-form articles.
You help users with writing tips, creative inspiration, finding topics, and platform features.
Keep answers concise, warm, and encouraging. Max 3-4 sentences unless more detail is needed.

${historyText ? `Recent conversation:\n${historyText}\n` : ''}
User: ${message.trim()}
Readora AI:`;

    const reply = await callGemini(prompt);
    res.json({ success: true, reply });
  } catch (error) {
    console.error('AI chat error:', error.message);
    res.status(500).json({ success: false, message: 'AI chat failed. Please try again.' });
  }
});

/* ─────────────────────────────────────────────────────────────────
   5. POST /api/ai/semantic-search
   Body: { query: string, posts: [{id, title, content, category}] }
   Returns: { rankedIds: string[] }
───────────────────────────────────────────────────────────────── */
router.post('/semantic-search', async (req, res) => {
  try {
    const { query, posts } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, message: 'Query is required.' });
    }
    if (!Array.isArray(posts) || posts.length === 0) {
      return res.json({ success: true, rankedIds: [] });
    }

    const postList = posts.slice(0, 30).map((p, i) =>
      `[${i}] ID:${p.id} | "${(p.title || p.content || '').substring(0, 100)}" | Category:${p.category || 'General'}`
    ).join('\n');

    const prompt = `You are a semantic search engine for READORA.
A user searched for: "${query.trim()}"

Re-rank these posts from most to least relevant by meaning (not just keywords).
Return ONLY a JSON array of the post IDs in order. Include all IDs.
Example: ["id_1", "id_3", "id_2"]

POSTS:
${postList}`;

    let raw = await callGemini(prompt);
    raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    let rankedIds = JSON.parse(raw);
    if (!Array.isArray(rankedIds)) rankedIds = posts.map(p => p.id);

    res.json({ success: true, rankedIds });
  } catch (error) {
    console.error('AI semantic-search error:', error.message);
    const originalIds = (req.body.posts || []).map(p => p.id);
    res.json({ success: true, rankedIds: originalIds, aiUnavailable: true });
  }
});

module.exports = router;
