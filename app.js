/**
 * READORA — Core Editorial Application Engine
 * "A Journal of Long-Form Thought"
 * Plain Vanilla JS · Print-Inspired Reading Platform
 */

// Escape text before injecting into HTML to strictly prevent XSS
function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Localization & Indian Regional Standards
let currentLang = localStorage.getItem('readora_lang') || 'en';
const translations = { en: {}, hi: {} };

async function loadTranslations() {
  try {
    const [enRes, hiRes] = await Promise.all([
      fetch('/locales/en.json'),
      fetch('/locales/hi.json')
    ]);
    if (enRes.ok) translations.en = await enRes.json();
    if (hiRes.ok) translations.hi = await hiRes.json();
  } catch (e) {
    // Offline / fallback
  }
}

function t(key, fallback = '') {
  const dict = translations[currentLang] || translations.en || {};
  return dict[key] || fallback || key;
}

function setLanguage(lang) {
  currentLang = lang === 'hi' ? 'hi' : 'en';
  localStorage.setItem('readora_lang', currentLang);
  document.documentElement.setAttribute('lang', currentLang);
  if (window.readoraApp) {
    window.readoraApp.render();
  }
}

// Indian Date formatting: relative under 7 days, full date in IST (Asia/Kolkata) for older
function formatIndianDate(utcDateStr) {
  if (!utcDateStr) return '';
  const clean = String(utcDateStr).replace(' ', 'T') + (String(utcDateStr).includes('Z') ? '' : 'Z');
  const d = new Date(clean);
  if (isNaN(d.getTime())) return String(utcDateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  const locale = currentLang === 'hi' ? 'hi-IN' : 'en-IN';

  if (diffSec < 60) return currentLang === 'hi' ? 'अभी' : 'Just now';
  if (diffSec < 3600) {
    const min = Math.max(1, Math.floor(diffSec / 60));
    try {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      return rtf.format(-min, 'minute');
    } catch (e) {
      return `${min} min ago`;
    }
  }
  if (diffSec < 86400) {
    const hours = Math.max(1, Math.floor(diffSec / 3600));
    try {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      return rtf.format(-hours, 'hour');
    } catch (e) {
      return `${hours} hours ago`;
    }
  }
  if (diffSec < 86400 * 7) {
    const days = Math.max(1, Math.floor(diffSec / 86400));
    try {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      return rtf.format(-days, 'day');
    } catch (e) {
      return `${days} days ago`;
    }
  }

  try {
    const dtf = new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    return dtf.format(d);
  } catch (e) {
    return d.toLocaleDateString();
  }
}

function formatIndianNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  const locale = currentLang === 'hi' ? 'hi-IN' : 'en-IN';
  try {
    return new Intl.NumberFormat(locale).format(num);
  } catch (e) {
    return String(num);
  }
}

// Allow secure web links and safe image data URIs
function safeUrl(url) {
  const u = String(url || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^data:image\/(jpeg|png|webp|gif);base64,[a-z0-9+/=]+$/i.test(u)) return u;
  return '';
}

function profileLink(handle) {
  return '#/u/' + encodeURIComponent(handle || '');
}

// Editorial Markdown Formatter
function renderSafeMarkdown(str) {
  if (!str) return '';
  let html = esc(str);

  // Headings
  let hCount = 0;
  html = html.replace(/^### (.*$)/gim, (_, t) => `<h3 id="heading-${++hCount}">${t}</h3>`);
  html = html.replace(/^## (.*$)/gim, (_, t) => `<h2 id="heading-${++hCount}">${t}</h2>`);
  html = html.replace(/^# (.*$)/gim, (_, t) => `<h2 id="heading-${++hCount}">${t}</h2>`);

  // Blockquotes
  html = html.replace(/^\&gt; (.*$)/gim, '<blockquote>$1</blockquote>');

  // Code blocks & inline code
  html = html.replace(/```([\s\S]*?)```/gm, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--accent); text-decoration:underline;">$1</a>');

  // Lists
  html = html.replace(/^\s*-\s+(.*$)/gim, '<li style="margin-left: 1.5rem; list-style-type: disc;">$1</li>');
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<li style="margin-left: 1.5rem; list-style-type: decimal;">$1</li>');

  // Paragraph breaks
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '');

  return html;
}

// Curated realistic default essays with distinct authors and plausible dates
const DEFAULT_POSTS = [
  {
    id: 'post_solitude_1',
    type: 'article',
    author_id: 'usr_julian',
    author: 'Julian Mercer',
    handle: '@jmercer',
    avatar: 'JM',
    title: 'The Architecture of Solitude: Why Deep Work Demands an Unconnected Mind',
    subtitle: 'On the gradual erosion of continuous attention, and how the physical layout of our thinking spaces shapes the literature we produce.',
    content: `In an era defined by constant telemetry and reflexive notifications, the quiet room has become an endangered sanctuary.

## The Quiet Space as an Instrument of Thought
When Montaigne retreated to his tower library in the Dordogne, surrounded by circular stone walls lined with Greek and Latin volumes, he was not escaping reality—he was constructing an instrument calibrated for sustained thought.

> "We must reserve a back-shop, all our own, entirely free, wherein to establish our true liberty and principal retreat and solitude."

The modern workspace, by contrast, is architected around maximum permeability. Glass partitions, open-plan bullpens, and the infinite ambient chatter of digital channels do not merely interrupt us; they dismantle the fragile scaffolding of prolonged contemplation.

## The Tyranny of the Rapid Answer
When every message demands an instantaneous response, the mind naturally shifts towards shallower, lower-stakes hypotheses. Ideas that require forty minutes of silent gestation before their contradictions become clear are discarded in favor of conclusions that can be communicated in a sentence or two.

To produce work that endures beyond the news cycle, one must deliberately court silence. The door must shut; the Wi-Fi must be severed; the blank page must be granted its rightful, terrifying expanse.`,
    excerpt: 'On the gradual erosion of continuous attention, and how the physical layout of our thinking spaces shapes the literature we produce.',
    category: 'Philosophy',
    readTime: '11 min read',
    timestamp: '3 days ago',
    likes: 142,
    bookmarks: 86,
    views: 1840,
    coverImage: ''
  },
  {
    id: 'post_feed_2',
    type: 'article',
    author_id: 'usr_elena',
    author: 'Elena Vance',
    handle: '@elenavance',
    avatar: 'EV',
    title: 'Against the Feed: In Defense of the Long Sentence and the Slow Journal',
    subtitle: 'How the brevity of modern social interfaces rewires cognitive habits toward immediate affirmation rather than sustained contemplation.',
    content: `The feed is designed for cadence, not depth. It rewards the punchline, the grievance, and the visual shock.

## The Disappearance of Subordinate Clauses
Notice how seldom one encounters a compound-complex sentence online. The grammatical subordination required to balance conflicting ideas—"Although X appears undeniable at first glance, the historical precedent of Y suggests that Z remains unresolved"—has been flattened into bumper-sticker declarative assertions.

When we reduce our syntax, we reduce the complexity of the thoughts we are capable of holding. A slow journal, printed or read on calm paper, allows a writer to wander through nuance without the anxious anticipation of a like counter.`,
    excerpt: 'How the brevity of modern social interfaces rewires cognitive habits toward immediate affirmation rather than sustained contemplation.',
    category: 'Culture',
    readTime: '8 min read',
    timestamp: '5 days ago',
    likes: 98,
    bookmarks: 64,
    views: 1210,
    coverImage: ''
  },
  {
    id: 'post_subtle_3',
    type: 'article',
    author_id: 'usr_aris',
    author: 'Dr. Aris Thorne',
    handle: '@aristhorne',
    avatar: 'AT',
    title: 'Subtle Systems: Designing Software That Does Not Demand Your Glance',
    subtitle: 'A manifesto for calm technology, tactile typography, and interfaces inspired by paper bindings rather than casino mechanics.',
    content: `Software used to be a tool that sat quietly in the drawer until called upon. Today, it behaves like an anxious puppy, constantly vibrating against the wrist and clamoring for attention.

## Principles of Quiet Technology
1. **Never notify unless the house is burning.** If an event can wait twelve hours without catastrophe, it does not belong in a push alert.
2. **Respect the visual field.** Interfaces should possess the low-contrast dignity of a printed ledger or a hardcover book.
3. **Finishable states.** A software tool should have an end. When you finish reading an essay, there should be whitespace—not an infinite vortex of algorithmic recommendations.`,
    excerpt: 'A manifesto for calm technology, tactile typography, and interfaces inspired by paper bindings rather than casino mechanics.',
    category: 'Design',
    readTime: '14 min read',
    timestamp: '1 week ago',
    likes: 215,
    bookmarks: 140,
    views: 3420,
    coverImage: ''
  },
  {
    id: 'post_proof_4',
    type: 'article',
    author_id: 'usr_maya',
    author: 'Maya Lin-Desai',
    handle: '@mayalin',
    avatar: 'ML',
    title: 'The Quiet Craft of Proof: Mathematics as a Literary Tradition',
    subtitle: 'Beyond utilitarian computation lies a three-thousand-year-old dialogue of prose, aesthetics, and deductive elegance.',
    content: `We are taught in secondary school that mathematics is about finding the answer. But mathematicians know that the answer is trivial; it is the path of proof—the rhetorical architecture—that matters.

A proof is an essay written under the strictest conceivable stylistic constraints. Euclid, Fermat, and Noether were stylists as much as logicians, crafting demonstrations whose beauty lies in the absolute economy of their assumptions.`,
    excerpt: 'Beyond utilitarian computation lies a three-thousand-year-old dialogue of prose, aesthetics, and deductive elegance.',
    category: 'Science',
    readTime: '12 min read',
    timestamp: '2 weeks ago',
    likes: 83,
    bookmarks: 49,
    views: 950,
    coverImage: ''
  },
  {
    id: 'post_memory_5',
    type: 'article',
    author_id: 'usr_kaelen',
    author: 'Kaelen Rowe',
    handle: '@krowe',
    avatar: 'KR',
    title: 'Memory Palaces in the Digital Age: Where Do Our Epiphanies Go?',
    subtitle: 'Notes on archiving personal marginalia, the tactile permanence of print, and how we retrieve forgotten insights.',
    content: `The common complaint about digital reading is that one forgets what was read within forty-eight hours. The lack of spatial orientation—the inability to say "that passage was on the lower left of a verso page about two-thirds through the volume"—deprives human memory of its primary mnemonic hook.

To combat this, the serious reader must cultivate the discipline of the commonplace book, transcribing sentences by hand or maintaining an intentional, search-indexed digital archive.`,
    excerpt: 'Notes on archiving personal marginalia, the tactile permanence of print, and how we retrieve forgotten insights.',
    category: 'Technology',
    readTime: '7 min read',
    timestamp: '3 weeks ago',
    likes: 120,
    bookmarks: 91,
    views: 1600,
    coverImage: ''
  },
  {
    id: 'post_venice_6',
    type: 'article',
    author_id: 'usr_claire',
    author: 'Claire Delacroix',
    handle: '@cdelacroix',
    avatar: 'CD',
    title: 'The Translators of Venice: How Renaissance Typographers Created the Modern Book',
    subtitle: 'Aldus Manutius, italic script, and the pocket octavo that democratized scholarship across Europe.',
    content: `In 1501, in a bustling print shop overlooking a Venetian canal, Aldus Manutius released an edition of Virgil that would alter the history of reading.

Prior to Manutius, books were massive folio volumes meant to be read standing up at lecterns. Manutius invented the pocket-sized octavo, paired with an elegant slanted cursive type cut by Francesco Griffo—the first italic font—allowing scholars to carry classical poetry in a coat pocket on a walk across the Piazza San Marco.`,
    excerpt: 'Aldus Manutius, italic script, and the pocket octavo that democratized scholarship across Europe.',
    category: 'History',
    readTime: '16 min read',
    timestamp: '4 weeks ago',
    likes: 174,
    bookmarks: 112,
    views: 2200,
    coverImage: ''
  }
];

// Curated realistic writers directory for India
const DEFAULT_WRITERS = [
  { id: 'usr_ananya', name: 'Ananya Iyer', handle: '@ananyaiyer', readers: '4,820 readers', isFollowing: false },
  { id: 'usr_rohan', name: 'Rohan Mehta', handle: '@rohanmehta', readers: '3,190 readers', isFollowing: false },
  { id: 'usr_sameera', name: 'Sameera Khan', handle: '@sameerakhan', readers: '6,450 readers', isFollowing: false },
  { id: 'usr_vikram', name: 'Vikram Rao', handle: '@vikramrao', readers: '2,870 readers', isFollowing: false },
  { id: 'usr_priya', name: 'Priya Nair', handle: '@priyanair', readers: '1,940 readers', isFollowing: false }
];

// Curated topics with volume counts and volume percentages
const DEFAULT_TOPICS = [
  { name: 'Philosophy', count: 48, pct: 85 },
  { name: 'Culture', count: 36, pct: 65 },
  { name: 'Technology', count: 29, pct: 52 },
  { name: 'Design', count: 24, pct: 42 },
  { name: 'Science', count: 18, pct: 32 },
  { name: 'History', count: 15, pct: 27 }
];

class ReadoraApp {
  constructor() {
    this.token = localStorage.getItem('readora_token') || null;
    this.currentUser = this.loadUser();
    this.posts = this.loadLocalPosts();
    this.writers = DEFAULT_WRITERS;
    this.topics = DEFAULT_TOPICS;
    this.currentFilter = 'all';
    this.activeSearchQuery = '';
    this.isBackendAvailable = false;
    this.route = { name: 'home' };

    // DOM Elements
    this.postsContainer = document.getElementById('posts-stream');
    this.leadContainer = document.getElementById('editorial-lead-section');
    this.trendingContainer = document.getElementById('editorial-trending-grid');
    this.topicsContainer = document.getElementById('trending-topics-list');
    this.writersContainer = document.getElementById('featured-creators-list');
    this.searchInput = document.getElementById('search-input');
    this.readerModal = document.getElementById('read-article-modal');
    this.readerContainer = document.getElementById('read-article-container');
    this.writeModal = document.getElementById('write-article-modal');
    this.aiPanel = document.getElementById('ai-chat-panel');
    this.toast = document.getElementById('toast');

    this.init();
  }

  async init() {
    await loadTranslations();
    document.documentElement.setAttribute('lang', currentLang);
    this.initTheme();
    this.initTabFromUrl();
    this.bindEvents();
    this.render();
    this.handleRoute();
    this.syncWithBackend();

    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('popstate', () => this.handlePopState());
  }

  initTabFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) {
      this.currentFilter = tab;
      const filterBar = document.getElementById('editorial-filter-bar');
      if (filterBar) {
        filterBar.querySelectorAll('.filter-text-btn').forEach(b => {
          b.classList.toggle('active', (b.dataset.filter || '').toLowerCase() === tab.toLowerCase());
        });
      }
    }
  }

  handlePopState() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') || 'all';
    this.currentFilter = tab;
    const filterBar = document.getElementById('editorial-filter-bar');
    if (filterBar) {
      filterBar.querySelectorAll('.filter-text-btn').forEach(b => {
        b.classList.toggle('active', (b.dataset.filter || '').toLowerCase() === tab.toLowerCase());
      });
    }
    this.render();
  }

  setTabFilter(tab) {
    this.currentFilter = tab;
    const url = new URL(window.location);
    if (tab === 'all') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', tab);
    }
    window.history.pushState({}, '', url);
    const filterBar = document.getElementById('editorial-filter-bar');
    if (filterBar) {
      filterBar.querySelectorAll('.filter-text-btn').forEach(b => {
        b.classList.toggle('active', (b.dataset.filter || '').toLowerCase() === tab.toLowerCase());
      });
    }
    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  get apiBase() {
    return window.location.protocol === 'file:' ? 'http://localhost:5000' : '';
  }

  authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return headers;
  }

  loadLocalPosts() {
    const saved = localStorage.getItem('readora_posts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return DEFAULT_POSTS;
  }

  saveLocalPosts() {
    try {
      localStorage.setItem('readora_posts', JSON.stringify(this.posts));
    } catch (e) {}
  }

  loadUser() {
    const saved = localStorage.getItem('readora_current_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return null;
  }

  async syncWithBackend() {
    try {
      const res = await fetch(`${this.apiBase}/api/posts`, { headers: this.authHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.posts) && data.posts.length > 0) {
          // Merge server posts while retaining our high-quality default editorial essays
          const serverIds = new Set(data.posts.map(p => p.id));
          const curatedRemaining = DEFAULT_POSTS.filter(p => !serverIds.has(p.id));
          this.posts = [...data.posts, ...curatedRemaining];
          this.isBackendAvailable = true;
          this.saveLocalPosts();
          this.render();
        }
      }
    } catch (err) {
      // Offline fallback: continue using local/default editorial essays
    }

    if (this.token) {
      try {
        const meRes = await fetch(`${this.apiBase}/api/auth/me`, { headers: this.authHeaders() });
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.success && meData.user) {
            this.currentUser = meData.user;
            localStorage.setItem('readora_current_user', JSON.stringify(meData.user));
            this.updateUserUI();
          }
        }
      } catch (e) {}
    }
  }

  updateUserUI() {
    const badge = document.getElementById('user-profile-badge');
    const avatar = document.getElementById('user-avatar-text');
    const nameLabel = document.getElementById('user-display-name');

    if (this.currentUser) {
      if (avatar) avatar.textContent = this.currentUser.avatar || this.currentUser.name.substring(0, 2).toUpperCase();
      if (nameLabel) nameLabel.textContent = this.currentUser.name.split(' ')[0];
      if (badge) badge.title = `${this.currentUser.name} (${this.currentUser.handle})`;
    } else {
      if (avatar) avatar.textContent = '·';
      if (nameLabel) nameLabel.textContent = 'Account';
    }
  }

  initTheme() {
    const saved = localStorage.getItem('readora_theme') || 'light';
    this.applyTheme(saved);

    const toggleBtn = document.getElementById('btn-theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        this.applyTheme(next);
      });
    }
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('dark-mode', theme === 'dark');
    localStorage.setItem('readora_theme', theme);

    const sun = document.getElementById('theme-toggle-icon-sun');
    const moon = document.getElementById('theme-toggle-icon-moon');
    if (sun && moon) {
      sun.style.display = theme === 'dark' ? 'block' : 'none';
      moon.style.display = theme === 'dark' ? 'none' : 'block';
    }
  }

  bindEvents() {
    // Search input with debounce
    if (this.searchInput) {
      let timer = null;
      this.searchInput.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.activeSearchQuery = e.target.value.toLowerCase().trim();
          this.render();
        }, 150);
      });
    }

    // Topic filter buttons (updates URL query string /?tab=...)
    const filterBar = document.getElementById('editorial-filter-bar');
    if (filterBar) {
      filterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-text-btn');
        if (!btn) return;
        this.setTabFilter(btn.dataset.filter || 'all');
      });
    }

    // Primary Write Action in Header
    const writeBtn = document.getElementById('btn-open-write-article');
    if (writeBtn) {
      writeBtn.addEventListener('click', () => this.openWriteModal());
    }

    const mobWriteBtn = document.getElementById('mob-nav-write');
    if (mobWriteBtn) {
      mobWriteBtn.addEventListener('click', () => this.openWriteModal());
    }

    // Close modals on click
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.readerModal) this.readerModal.classList.remove('active');
        if (this.writeModal) this.writeModal.classList.remove('active');
      });
    });

    // Write form submit
    const writeForm = document.getElementById('publish-article-form');
    if (writeForm) {
      writeForm.addEventListener('submit', (e) => this.handlePublishEssay(e));
    }

    // Word counter in write modal
    const bodyInput = document.getElementById('article-body-input');
    if (bodyInput) {
      bodyInput.addEventListener('input', () => {
        const words = (bodyInput.value.trim().match(/\S+/g) || []).length;
        const readTime = Math.max(1, Math.ceil(words / 180));
        const wcEl = document.getElementById('article-word-count');
        const rtEl = document.getElementById('article-read-time');
        if (wcEl) wcEl.textContent = `${words} words`;
        if (rtEl) rtEl.textContent = `~${readTime} min read`;
      });
    }

    // AI Assistant Panel Toggle (docked, does not float over content)
    const toggleAiBtn = document.getElementById('btn-toggle-ai-panel');
    const closeAiBtn = document.getElementById('btn-close-ai-panel');
    if (toggleAiBtn && this.aiPanel) {
      toggleAiBtn.addEventListener('click', () => {
        this.aiPanel.classList.toggle('open');
      });
    }
    if (closeAiBtn && this.aiPanel) {
      closeAiBtn.addEventListener('click', () => {
        this.aiPanel.classList.remove('open');
      });
    }

    // AI Chat Input
    const sendAiBtn = document.getElementById('btn-send-ai-chat');
    const aiInput = document.getElementById('ai-chat-input');
    if (sendAiBtn && aiInput) {
      const doSend = () => {
        const text = aiInput.value.trim();
        if (!text) return;
        this.appendAiMessage('user', text);
        aiInput.value = '';
        this.triggerAiResponse(text);
      };
      sendAiBtn.addEventListener('click', doSend);
      aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doSend(); }
      });
    }

    // User badge click -> redirect or modal
    const userBadge = document.getElementById('user-profile-badge');
    if (userBadge) {
      userBadge.addEventListener('click', () => {
        if (this.currentUser) {
          window.location.hash = profileLink(this.currentUser.handle);
        } else {
          window.location.href = 'practise.html';
        }
      });
    }
  }

  showToast(message) {
    if (!this.toast) return;
    const txt = document.getElementById('toast-text-content');
    if (txt) txt.textContent = message;
    this.toast.classList.add('visible');
    setTimeout(() => this.toast.classList.remove('visible'), 2800);
  }

  handleRoute() {
    const hash = window.location.hash || '';
    const m = /^#\/(u|profile)\/(.+)$/.exec(hash);
    const artM = /^#\/(article|post|essay)\/(.+)$/.exec(hash);

    // Hide all full views
    ['feed-view', 'explore-view', 'saved-view', 'dashboard-view', 'settings-view', 'profile-view'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    if (artM) {
      const postId = decodeURIComponent(artM[2]);
      this.openFullArticle(postId);
      const feed = document.getElementById('feed-view');
      if (feed) feed.style.display = 'block';
    } else if (m) {
      const handle = decodeURIComponent(m[2]);
      this.renderProfileView(handle);
    } else if (hash === '#/explore') {
      const exp = document.getElementById('explore-view');
      if (exp) exp.style.display = 'block';
      this.renderExplore();
    } else if (hash === '#/saved') {
      const saved = document.getElementById('saved-view');
      if (saved) saved.style.display = 'block';
      this.renderSaved();
    } else {
      const feed = document.getElementById('feed-view');
      if (feed) feed.style.display = 'block';
    }

    this.updateNavActive(hash);
  }

  updateNavActive(hash) {
    const home = document.getElementById('nav-home-btn');
    const explore = document.getElementById('nav-explore-btn');
    const saved = document.getElementById('nav-saved-btn');

    if (home) home.classList.toggle('active', !hash || hash === '#/');
    if (explore) explore.classList.toggle('active', hash === '#/explore');
    if (saved) saved.classList.toggle('active', hash === '#/saved');
  }

  // ------------------------------------------------------------------------
  // TYPOGRAPHIC COVER GENERATOR (No Stock Photography)
  // ------------------------------------------------------------------------
  renderTypographicCover(title, author, category, isLead = false) {
    const initials = (author || 'CR').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    if (isLead) {
      return `
        <div class="typographic-cover-box" onclick="window.readoraApp && window.readoraApp.openLeadArticle()">
          <div class="typographic-cover-label">READORA · JOURNAL ESSAY · ${esc(category || 'PHILOSOPHY')}</div>
          <div class="typographic-cover-title">“${esc(title)}”</div>
          <div class="typographic-cover-foot">
            <span>By ${esc(author)}</span>
            <span class="tabular-nums">${esc(category || 'ESSAY')}</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="essay-card-thumb">
        <span class="essay-thumb-monogram">${esc(initials)}</span>
        <span class="essay-thumb-word">${esc(category || 'ESSAY')}</span>
      </div>
    `;
  }

  // ------------------------------------------------------------------------
  // RENDER LEAD ESSAY
  // ------------------------------------------------------------------------
  renderLeadEssay(lead) {
    if (!this.leadContainer || !lead) return;
    this.currentLeadId = lead.id;

    const hasCustomCover = lead.coverImage && safeUrl(lead.coverImage);
    const coverHtml = hasCustomCover
      ? `<div class="lead-essay-visual"><img src="${esc(lead.coverImage)}" style="width:100%; max-height:360px; object-fit:cover; border:1px solid var(--rule);" alt="Essay Cover" /></div>`
      : `<div class="lead-essay-visual">${this.renderTypographicCover(lead.title, lead.author, lead.category, true)}</div>`;

    const formattedDate = formatIndianDate(lead.createdAt || lead.timestamp);

    this.leadContainer.innerHTML = `
      <div class="lead-essay-body">
        <div class="lead-essay-topic">${esc(lead.category || 'Philosophy')}</div>
        <h2 class="lead-essay-title" onclick="window.readoraApp.openFullArticle('${esc(lead.id)}')">${esc(lead.title)}</h2>
        <p class="lead-essay-deck">${esc(lead.subtitle || lead.excerpt)}</p>
        ${coverHtml}
        <div class="lead-author-meta">
          <div class="lead-meta-line">
            <a class="author-link" href="${profileLink(lead.handle)}"><strong>${esc(lead.author)}</strong></a>
            <span class="essay-meta-dot">·</span>
            <span class="essay-date tabular-nums">${esc(formattedDate || 'Recently')}</span>
            <span class="essay-meta-dot">·</span>
            <span class="essay-readtime tabular-nums">${esc(lead.readTime || '8 min read')}</span>
          </div>
          <button type="button" class="btn-lead-read" onclick="window.readoraApp.openFullArticle('${esc(lead.id)}')">
            <span>${esc(t('read_essay', 'Read essay'))}</span> ➔
          </button>
        </div>
      </div>
    `;
  }

  openLeadArticle() {
    if (this.currentLeadId) {
      this.openFullArticle(this.currentLeadId);
    }
  }

  // ------------------------------------------------------------------------
  // RENDER FEED STREAM ITEMS
  // ------------------------------------------------------------------------
  renderPostCard(post) {
    const hasCustomCover = post.coverImage && safeUrl(post.coverImage);
    const thumbHtml = hasCustomCover
      ? `<img src="${esc(post.coverImage)}" class="essay-card-img-thumb" alt="Thumb" loading="lazy" />`
      : this.renderTypographicCover(post.title, post.author, post.category, false);

    const isBookmarked = post.bookmarkedByUser;
    const formattedDate = formatIndianDate(post.createdAt || post.timestamp);

    return `
      <article class="essay-card" data-id="${esc(post.id)}">
        <div class="essay-card-main">
          <h3 class="essay-card-title" onclick="window.readoraApp.openFullArticle('${esc(post.id)}')">${esc(post.title)}</h3>
          <p class="essay-card-deck">${esc(post.subtitle || post.excerpt)}</p>
          <div class="essay-card-meta">
            <a class="author-link" href="${profileLink(post.handle)}">${esc(post.author)}</a>
            <span class="essay-meta-dot">·</span>
            <span class="essay-date tabular-nums">${esc(formattedDate || 'Recently')}</span>
            <span class="essay-meta-dot">·</span>
            <span class="essay-readtime tabular-nums">${esc(post.readTime || '6 min read')}</span>
            <span class="essay-meta-dot">·</span>
            <span class="essay-topic-tag">${esc(post.category || 'General')}</span>

            <button type="button" class="essay-action-bookmark ${isBookmarked ? 'bookmarked' : ''}" 
                    title="Bookmark essay" 
                    onclick="event.stopPropagation(); window.readoraApp.toggleBookmark('${esc(post.id)}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
            </button>
          </div>
        </div>
        <div onclick="window.readoraApp.openFullArticle('${esc(post.id)}')">
          ${thumbHtml}
        </div>
      </article>
    `;
  }

  // ------------------------------------------------------------------------
  // RENDER SIDEBAR: TRENDING (01-05 in oxblood), TOPICS, WRITERS
  // ------------------------------------------------------------------------
  renderTrending() {
    if (!this.trendingContainer) return;
    // Deduplicate: ensure lead essay is never repeated in Trending
    const pool = this.posts.filter(p => p.id !== this.currentLeadId);
    const top5 = pool.slice(0, 5);

    this.trendingContainer.innerHTML = top5.map((post, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      return `
        <div class="trending-essay-row" onclick="window.readoraApp.openFullArticle('${esc(post.id)}')">
          <span class="trending-num tabular-nums">${num}</span>
          <div class="trending-essay-content">
            <h4 class="trending-essay-title">${esc(post.title)}</h4>
            <div class="trending-essay-excerpt">${esc(post.subtitle || post.excerpt)}</div>
            <div class="trending-essay-byline">${esc(post.author)} · <span class="tabular-nums">${esc(post.readTime || '7 min read')}</span></div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderTopics() {
    if (!this.topicsContainer) return;

    this.topicsContainer.innerHTML = this.topics.map(t => `
      <div class="topic-volume-row" onclick="window.readoraApp.filterByTopic('${esc(t.name)}')">
        <div class="topic-volume-header">
          <span class="topic-name-link">${esc(t.name)}</span>
          <span class="topic-count-num tabular-nums">${formatIndianNumber(t.count)} essays</span>
        </div>
        <div class="topic-bar-track">
          <div class="topic-bar-fill" style="width: ${t.pct}%;"></div>
        </div>
      </div>
    `).join('');
  }

  renderWriters() {
    if (!this.writersContainer) return;

    this.writersContainer.innerHTML = this.writers.map((w, idx) => `
      <div class="writer-entry-row">
        <div class="writer-details">
          <a class="writer-name" href="${profileLink(w.handle)}">${esc(w.name)}</a>
          <div class="writer-handle-meta">${esc(w.handle)} · <span class="tabular-nums">${esc(w.readers)}</span></div>
        </div>
        <button type="button" class="btn-follow-text ${w.isFollowing ? 'following' : ''}" 
                onclick="window.readoraApp.toggleFollowWriter(${idx})">
          ${w.isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>
    `).join('');
  }

  toggleFollowWriter(idx) {
    if (this.writers[idx]) {
      this.writers[idx].isFollowing = !this.writers[idx].isFollowing;
      this.renderWriters();
      this.showToast(this.writers[idx].isFollowing ? `Now following ${this.writers[idx].name}` : `Unfollowed ${this.writers[idx].name}`);
    }
  }

  filterByTopic(topic) {
    this.setTabFilter(topic);
  }

  // ------------------------------------------------------------------------
  // MAIN RENDER PIPELINE
  // ------------------------------------------------------------------------
  render() {
    if (!this.postsContainer) return;

    // Filter posts
    let filtered = this.posts.filter(p => {
      // Category / Topic filter
      if (this.currentFilter !== 'all') {
        if (this.currentFilter === 'saved' && !p.bookmarkedByUser) return false;
        if (this.currentFilter === 'following' && !p.isFollowingAuthor) return false;
        if (!['all', 'saved', 'following'].includes(this.currentFilter.toLowerCase())) {
          if ((p.category || '').toLowerCase() !== this.currentFilter.toLowerCase()) return false;
        }
      }

      // Search query
      if (this.activeSearchQuery) {
        const q = this.activeSearchQuery;
        const inTitle = (p.title || '').toLowerCase().includes(q);
        const inAuthor = (p.author || '').toLowerCase().includes(q);
        const inContent = (p.content || '').toLowerCase().includes(q);
        const inCategory = (p.category || '').toLowerCase().includes(q);
        if (!inTitle && !inAuthor && !inContent && !inCategory) return false;
      }

      return true;
    });

    // Populate Lead Essay (first post if on All filter without search query)
    let leadPost = null;
    if (this.currentFilter === 'all' && !this.activeSearchQuery && filtered.length > 0) {
      leadPost = filtered[0];
      this.currentLeadId = leadPost.id;
      if (this.leadContainer) {
        this.leadContainer.style.display = 'block';
        this.renderLeadEssay(leadPost);
      }
    } else {
      this.currentLeadId = null;
      if (this.leadContainer) {
        this.leadContainer.style.display = 'none';
      }
    }

    // Stream items (skip the lead if on 'all' without search so it is never repeated)
    const streamItems = leadPost
      ? filtered.filter(p => p.id !== leadPost.id)
      : filtered;

    if (streamItems.length === 0) {
      const message = this.currentFilter === 'saved'
        ? 'Your reading list is currently empty. Bookmark essays to return to them later.'
        : (this.activeSearchQuery
          ? 'No essays found matching your search. Try a different author, keyword, or topic.'
          : 'No essays on this topic yet. Be the first to write one.');

      this.postsContainer.innerHTML = `
        <div class="editorial-empty-state">
          <h4 class="empty-state-title">Quiet in this section</h4>
          <p class="empty-state-text">${esc(message)}</p>
          <button type="button" class="empty-state-action" onclick="window.readoraApp.openWriteModal()">
            Write an essay on this subject →
          </button>
        </div>
      `;
    } else {
      this.postsContainer.innerHTML = streamItems.map(p => this.renderPostCard(p)).join('');
    }

    // Sidebar widgets
    this.renderTrending();
    this.renderTopics();
    this.renderWriters();
  }

  // ------------------------------------------------------------------------
  // FULL ESSAY READER MODAL
  // ------------------------------------------------------------------------
  openFullArticle(postId) {
    const post = this.posts.find(p => String(p.id) === String(postId));
    if (!post) return;

    if (!this.readerModal || !this.readerContainer) return;

    const navTitle = document.getElementById('reader-nav-title');
    if (navTitle) navTitle.textContent = post.title;

    const initials = (post.author || 'CR').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    const markdownHtml = renderSafeMarkdown(post.content || post.excerpt);

    this.readerContainer.innerHTML = `
      <article>
        <div class="reader-category-stamp">${esc(post.category || 'Essay')}</div>
        <h1 class="reader-main-title">${esc(post.title)}</h1>
        ${post.subtitle ? `<div class="reader-main-subtitle">${esc(post.subtitle)}</div>` : ''}

        <div class="reader-byline-bar">
          <div>
            By <a class="reader-byline-author author-link" href="${profileLink(post.handle)}">${esc(post.author)}</a>
            <span class="essay-meta-dot">·</span>
            <span class="tabular-nums">${esc(post.timestamp || 'Recently')}</span>
          </div>
          <div class="tabular-nums">
            ${esc(post.readTime || '8 min read')}
          </div>
        </div>

        <div class="reader-essay-content">
          ${markdownHtml}
        </div>

        <div class="reader-discussion-section">
          <h3 class="reader-discussion-title">Reader Reflections & Margin Notes</h3>
          <div class="reader-comment-box">
            <textarea id="reader-comment-input" class="reader-comment-input" placeholder="Add a thoughtful reflection to this essay..."></textarea>
            <button type="button" class="btn-post-comment" onclick="window.readoraApp.addComment('${esc(post.id)}')">Post Reflection</button>
          </div>

          <div class="reader-comments-stream" id="reader-comments-stream">
            ${(post.comments || []).map(c => `
              <div class="reader-comment-entry">
                <div class="reader-comment-author-row">
                  <span class="reader-comment-author">${esc(c.author || c.name || 'Reader')}</span>
                  <span class="essay-date tabular-nums">${esc(c.created_at || 'Recently')}</span>
                </div>
                <div class="reader-comment-body">${esc(c.text)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </article>
    `;

    this.readerModal.classList.add('active');
    this.readerModal.scrollTo({ top: 0, behavior: 'instant' });

    // Track scroll for reading progress bar
    const bar = document.getElementById('reading-progress-bar');
    this.readerModal.onscroll = () => {
      const st = this.readerModal.scrollTop;
      const sh = this.readerModal.scrollHeight - this.readerModal.clientHeight;
      if (bar && sh > 0) {
        const pct = Math.min(100, Math.max(0, (st / sh) * 100));
        bar.style.width = pct + '%';
      }
    };
  }

  addComment(postId) {
    const input = document.getElementById('reader-comment-input');
    if (!input || !input.value.trim()) return;

    const text = input.value.trim();
    const post = this.posts.find(p => String(p.id) === String(postId));
    if (post) {
      if (!post.comments) post.comments = [];
      post.comments.push({
        id: 'c_' + Date.now(),
        author: this.currentUser ? this.currentUser.name : 'Harsh Bansal',
        text,
        created_at: 'Just now'
      });
      this.saveLocalPosts();
      this.openFullArticle(postId);
      this.showToast('Reflection posted.');
    }
  }

  toggleBookmark(postId) {
    const post = this.posts.find(p => String(p.id) === String(postId));
    if (!post) return;
    post.bookmarkedByUser = !post.bookmarkedByUser;
    post.bookmarks = (post.bookmarks || 0) + (post.bookmarkedByUser ? 1 : -1);
    this.saveLocalPosts();
    this.render();
    this.showToast(post.bookmarkedByUser ? 'Saved to reading list.' : 'Removed from reading list.');
  }

  // ------------------------------------------------------------------------
  // WRITE ESSAY MANUSCRIPT MODAL
  // ------------------------------------------------------------------------
  openWriteModal() {
    if (this.writeModal) {
      this.writeModal.classList.add('active');
      const titleInput = document.getElementById('article-title-input');
      if (titleInput) titleInput.focus();
    }
  }

  async handlePublishEssay(e) {
    e.preventDefault();
    const title = document.getElementById('article-title-input').value.trim();
    const subtitle = document.getElementById('article-subtitle-input').value.trim();
    const category = document.getElementById('article-category-input').value;
    const coverImage = document.getElementById('article-cover-input').value.trim();
    const content = document.getElementById('article-body-input').value.trim();

    if (!title || !content) {
      this.showToast('Please provide both an essay title and prose content.');
      return;
    }

    const words = (content.match(/\S+/g) || []).length;
    const readTime = `${Math.max(1, Math.ceil(words / 180))} min read`;

    const newEssay = {
      id: 'essay_' + Date.now(),
      type: 'article',
      author_id: this.currentUser ? this.currentUser.id : 'usr_guest',
      author: this.currentUser ? this.currentUser.name : 'Harsh Bansal',
      handle: this.currentUser ? this.currentUser.handle : '@harshbansal',
      avatar: this.currentUser ? this.currentUser.avatar : 'HB',
      title,
      subtitle,
      excerpt: subtitle || (content.length > 160 ? content.substring(0, 160) + '...' : content),
      content,
      category: category || 'Philosophy',
      readTime,
      timestamp: 'Just now',
      likes: 0,
      bookmarks: 0,
      coverImage,
      comments: []
    };

    // Attempt backend sync
    if (window.location.origin.startsWith('http')) {
      try {
        await fetch(`${this.apiBase}/api/posts/article`, {
          method: 'POST',
          headers: this.authHeaders(),
          body: JSON.stringify({
            title,
            subtitle,
            content,
            category,
            coverImage
          })
        });
      } catch (err) {}
    }

    this.posts.unshift(newEssay);
    this.saveLocalPosts();
    this.render();

    if (this.writeModal) this.writeModal.classList.remove('active');
    document.getElementById('publish-article-form').reset();
    this.showToast('Essay published successfully.');
    this.openFullArticle(newEssay.id);
  }

  // ------------------------------------------------------------------------
  // AI READER ASSISTANT CONVERSATION (Gemini API / Local Knowledge)
  // ------------------------------------------------------------------------
  appendAiMessage(sender, text) {
    const container = document.getElementById('ai-chat-messages');
    if (!container) return;
    const bubble = document.createElement('div');
    bubble.className = `ai-bubble ai-bubble-${sender}`;
    bubble.innerHTML = `<span>${esc(text)}</span>`;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  async triggerAiResponse(promptText) {
    try {
      if (window.location.origin.startsWith('http')) {
        const res = await fetch(`${this.apiBase}/api/ai/chat`, {
          method: 'POST',
          headers: this.authHeaders(),
          body: JSON.stringify({ message: promptText })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.reply) {
            this.appendAiMessage('bot', data.reply);
            return;
          }
        }
      }
    } catch (e) {}

    // Thoughtful contextual fallback
    setTimeout(() => {
      this.appendAiMessage('bot', `Reflecting on "${promptText.substring(0, 30)}...": In long-form literature, this connects deeply to how quiet spaces and intentional composition allow complex arguments to unfold. Would you like me to recommend related essays from the archive?`);
    }, 450);
  }

  // ------------------------------------------------------------------------
  // EXPLORE & SAVED VIEWS
  // ------------------------------------------------------------------------
  renderExplore() {
    const grid = document.getElementById('explore-posts-grid');
    if (!grid) return;
    grid.innerHTML = this.posts.map(p => this.renderPostCard(p)).join('');
  }

  renderSaved() {
    const savedView = document.getElementById('saved-view');
    if (!savedView) return;
    const bookmarked = this.posts.filter(p => p.bookmarkedByUser);
    savedView.innerHTML = `
      <div style="padding-bottom:1.5rem; margin-bottom:1.5rem; border-bottom:1px solid var(--rule);">
        <h2 style="font-family:var(--font-serif); font-size:2rem; font-weight:500; margin-bottom:0.4rem;">Saved Reading List</h2>
        <p style="color:var(--ink-muted); font-size:0.95rem;">Essays and reflections bookmarked for quiet contemplation.</p>
      </div>
      <div>
        ${bookmarked.length > 0
          ? bookmarked.map(p => this.renderPostCard(p)).join('')
          : `<div class="editorial-empty-state"><p class="empty-state-text">Your reading list is currently empty. Bookmark essays from the feed to save them here.</p></div>`}
      </div>
    `;
  }

  renderProfileView(handle) {
    const profView = document.getElementById('profile-view');
    if (!profView) return;
    profView.style.display = 'block';

    const cleanHandle = handle.startsWith('@') ? handle : '@' + handle;
    const authorEssays = this.posts.filter(p => p.handle && p.handle.toLowerCase() === cleanHandle.toLowerCase());

    profView.innerHTML = `
      <div style="padding-bottom:1.5rem; margin-bottom:2rem; border-bottom:1px solid var(--rule);">
        <h2 style="font-family:var(--font-serif); font-size:2.2rem; font-weight:500; margin-bottom:0.35rem;">
          ${esc(authorEssays.length > 0 ? authorEssays[0].author : cleanHandle)}
        </h2>
        <div style="font-size:0.85rem; color:var(--ink-muted); margin-bottom:0.75rem;">
          <span>${esc(cleanHandle)}</span> · <span>Essayist on Readora</span>
        </div>
        <p style="color:var(--ink-secondary); font-size:0.95rem; max-width:540px; line-height:1.55;">
          Dedicated to critical inquiries, long-form literature, and quiet contemplation.
        </p>
      </div>
      <div class="sidebar-section-header">
        <span class="sidebar-section-title">Published Essays (${authorEssays.length})</span>
      </div>
      <div class="essay-feed-stream">
        ${authorEssays.length > 0
          ? authorEssays.map(p => this.renderPostCard(p)).join('')
          : '<div class="editorial-empty-state"><p class="empty-state-text">No essays published under this author handle yet.</p></div>'}
      </div>
    `;
  }
}

// Instantiate on DOM readiness
document.addEventListener('DOMContentLoaded', () => {
  window.readoraApp = new ReadoraApp();
});
