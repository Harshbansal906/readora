/**
 * READORA - Core Application Engine
 * "Where readers become creators."
 * Seamless Hybrid API + Offline Fallback Support
 */

const DEFAULT_POSTS = [];

// Escape text before putting it into HTML, so nobody can inject scripts through a post, name or bio
function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow normal web links for images
function safeUrl(url) {
  const u = String(url || '').trim();
  return /^https?:\/\//i.test(u) ? u : '';
}

function profileLink(handle) {
  return '#/u/' + encodeURIComponent(handle || '');
}

// Lightweight, safe markdown formatter with zero external dependencies and strict XSS protection
function renderSafeMarkdown(str) {
  if (!str) return '';
  let html = esc(str);

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3 style="font-family:var(--font-brand); font-size:1.25rem; font-weight:700; color:var(--text-main); margin:1.25rem 0 0.5rem 0;">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 style="font-family:var(--font-brand); font-size:1.5rem; font-weight:800; color:var(--text-main); margin:1.5rem 0 0.5rem 0;">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 style="font-family:var(--font-brand); font-size:1.85rem; font-weight:800; color:var(--text-main); margin:1.75rem 0 0.75rem 0;">$1</h1>');

  // Blockquotes
  html = html.replace(/^\&gt; (.*$)/gim, '<blockquote style="border-left: 3px solid var(--accent-primary); padding-left: 1rem; color: var(--text-muted); font-style: italic; margin: 1rem 0;">$1</blockquote>');

  // Code blocks & inline code
  html = html.replace(/```([\s\S]*?)```/gm, '<pre style="background:var(--bg-subtle); padding:0.75rem 1rem; border-radius:8px; font-size:0.9rem; overflow-x:auto; border:1px solid var(--border-color); margin:1rem 0;"><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-subtle); padding:0.15rem 0.35rem; border-radius:4px; font-size:0.9em; border:1px solid var(--border-color);">$1</code>');

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--accent-primary); text-decoration:underline;">$1</a>');

  // Lists
  html = html.replace(/^\s*-\s+(.*$)/gim, '<li style="margin-left: 1.5rem; list-style-type: disc;">$1</li>');
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<li style="margin-left: 1.5rem; list-style-type: decimal;">$1</li>');

  // Paragraph breaks
  html = html.replace(/\n\n+/g, '<br><br>');

  return html;
}

class ReadoraApp {
  constructor() {
    this.token = localStorage.getItem('readora_token') || null;
    this.currentUser = this.loadUser();
    this.posts = this.loadLocalPosts();
    this.currentFilter = 'all';
    this.selectedTheme = 'theme-crimson';
    this.activeSearchQuery = '';
    this.isBackendAvailable = false;

    // New: following feed + profile pages
    this.followingIds = null;
    this.profile = null;
    this.profileFilter = 'all';
    this.profileReq = 0;
    this.route = { name: 'home' };
    this.openComments = new Set();

    this.initDOM();
    this.bindEvents();
    this.syncPromise = this.syncWithBackend();
    this.render();
    this.handleRoute();
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
        return JSON.parse(saved);
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
    const savedUser = localStorage.getItem('readora_current_user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch (e) {}
    }
    return null;
  }

  async syncWithBackend() {
    const apiBase = this.apiBase;

    try {
      const headers = this.authHeaders();

      // 1. Fetch live posts
      const res = await fetch(`${apiBase}/api/posts`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.posts)) {
          this.posts = data.posts;
          this.isBackendAvailable = true;
          this.saveLocalPosts();
          this.refresh();
        }
      }

      // 2. Fetch live community statistics
      const statsRes = await fetch(`${apiBase}/api/posts/community-stats`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.success && statsData.stats) {
          const elCreators = document.getElementById('stat-creators');
          const elThoughts = document.getElementById('stat-thoughts');
          const elArticles = document.getElementById('stat-articles');
          if (elCreators) elCreators.textContent = statsData.stats.creators.toLocaleString();
          if (elThoughts) elThoughts.textContent = statsData.stats.thoughts.toLocaleString();
          if (elArticles) elArticles.textContent = statsData.stats.articles.toLocaleString();
        }
      }

      // 3. Fetch trending topics
      const topicsRes = await fetch(`${apiBase}/api/posts/trending-topics`);
      if (topicsRes.ok) {
        const topicsData = await topicsRes.json();
        if (topicsData.success && Array.isArray(topicsData.topics)) {
          this.renderTrendingTopics(topicsData.topics);
        }
      }

      // 4. Fetch featured creators
      const creatorsRes = await fetch(`${apiBase}/api/posts/featured-creators`, { headers });
      if (creatorsRes.ok) {
        const creatorsData = await creatorsRes.json();
        if (creatorsData.success && Array.isArray(creatorsData.creators)) {
          this.renderFeaturedCreators(creatorsData.creators);
        }
      }

      // 5. Verify current logged-in user profile
      if (this.token) {
        const meRes = await fetch(`${apiBase}/api/auth/me`, { headers });
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.success && meData.user) {
            this.currentUser = meData.user;
            localStorage.setItem('readora_current_user', JSON.stringify(this.currentUser));
            this.updateUserUI();
            this.initTheme();
            this.loadNotifications();
          }
        }
      } else {
        this.updateUserUI();
      }
    } catch (e) {
      console.log('Running in local/offline fallback mode:', e.message);
    }
  }

  renderTrendingTopics(topics) {
    this.cachedTopics = topics;
    ['trending-topics-list', 'explore-topics-list'].forEach(id => {
      const listEl = document.getElementById(id);
      if (!listEl) return;
      if (!topics || topics.length === 0) {
        listEl.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; padding: 0.5rem 0; text-align: center;">Trending topics will appear here as publications are shared.</div>';
        return;
      }
      listEl.innerHTML = topics.map(t => `
        <div class="trending-topic-item" data-topic="${esc(t.name)}" style="cursor: pointer;">
          <div>
            <div class="topic-category">Topic</div>
            <div class="topic-name">#${esc(t.name)}</div>
          </div>
          <div class="topic-posts-count">${esc(t.count)} ${t.count === 1 ? 'post' : 'posts'}</div>
        </div>
      `).join('');

      listEl.querySelectorAll('[data-topic]').forEach(el => {
        el.addEventListener('click', () => this.setTopicFilter(el.dataset.topic));
      });
    });
  }

  setTopicFilter(topicName) {
    if (this.searchInput) {
      if (this.isProfileActive()) location.hash = '#/';
      this.searchInput.value = topicName;
      this.activeSearchQuery = topicName.toLowerCase();
      this.render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  renderFeaturedCreators(creators) {
    this.cachedCreators = creators;
    const listEl = document.getElementById('featured-creators-list');
    if (listEl) {
      if (!creators || creators.length === 0) {
        listEl.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; padding: 0.5rem 0; text-align: center;">New creators will be highlighted here.</div>';
      } else {
        listEl.innerHTML = creators.map(c => `
          <div class="creator-item">
            <a class="creator-left author-link" href="${profileLink(c.handle)}">
              <div class="author-avatar" style="width: 34px; height: 34px; font-size: 0.8rem;">${esc(c.avatar)}</div>
              <div>
                <div class="creator-name">${esc(c.name)}</div>
                <div class="creator-handle">${esc(c.handle)} • ${esc(c.followers)} ${c.followers === 1 ? 'follower' : 'followers'}</div>
              </div>
            </a>
            <button class="btn-follow ${c.isFollowing ? 'following' : ''}" data-follow-id="${esc(c.id)}">
              ${c.isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>
        `).join('');

        listEl.querySelectorAll('[data-follow-id]').forEach(btn => {
          btn.addEventListener('click', () => this.toggleFollow(btn.dataset.followId));
        });
      }
    }

    // Populate Instagram-Stories Style Creators Row on Feed & Explore
    this.renderStoriesRows(creators);
  }

  renderStoriesRows(creators) {
    ['stories-row', 'explore-creators-row'].forEach(rowId => {
      const row = document.getElementById(rowId);
      if (!row) return;
      if (!creators || creators.length === 0) {
        row.innerHTML = '';
        return;
      }
      row.innerHTML = creators.map(c => `
        <a class="story-item author-link" href="${profileLink(c.handle)}" title="${esc(c.name)} (${esc(c.handle)})">
          <div class="story-avatar-ring">
            <div class="story-avatar">${esc(c.avatar || c.name.substring(0, 2).toUpperCase())}</div>
          </div>
          <span class="story-name">${esc(c.name.split(' ')[0])}</span>
        </a>
      `).join('');
    });
  }

  filterExploreContent(query) {
    if (!query) {
      if (this.cachedTopics) this.renderTrendingTopics(this.cachedTopics);
      if (this.cachedCreators) this.renderFeaturedCreators(this.cachedCreators);
      return;
    }
    const q = query.toLowerCase();
    const filteredTopics = (this.cachedTopics || []).filter(t => t.name.toLowerCase().includes(q));
    const filteredCreators = (this.cachedCreators || []).filter(c => (c.name || '').toLowerCase().includes(q) || (c.handle || '').toLowerCase().includes(q));
    this.renderTrendingTopics(filteredTopics);
    this.renderFeaturedCreators(filteredCreators);
  }

  async toggleFollow(creatorId) {
    if (!this.currentUser) {
      this.showToast('Please log in to follow creators!');
      setTimeout(() => { window.location.href = 'practise.html'; }, 1000);
      return;
    }
    try {
      const res = await fetch(`${this.apiBase}/api/posts/follow/${encodeURIComponent(creatorId)}`, {
        method: 'POST',
        headers: this.authHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(data.message);
        await this.syncWithBackend();
        if (this.currentFilter === 'following') await this.loadFollowing();
        if (this.isProfileActive() && this.profile) await this.loadProfile(this.profile.handle, true);
        this.refresh();
      } else {
        this.showToast(data.message || 'Could not update follow status.');
      }
    } catch (e) {
      this.showToast('Network error while toggling follow.');
    }
  }

  // ---------- Following feed ----------

  async loadFollowing() {
    if (!this.token) {
      this.followingIds = new Set();
      this.showToast('Log in to see posts from creators you follow.');
      this.render();
      return;
    }
    try {
      const res = await fetch(`${this.apiBase}/api/posts?feed=following`, { headers: this.authHeaders() });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.posts)) {
        this.followingIds = new Set(data.posts.map(p => p.id));
        // Make sure brand-new posts from people you follow are in the local list too
        data.posts.forEach(p => {
          if (!this.posts.find(x => x.id === p.id)) this.posts.unshift(p);
        });
        this.saveLocalPosts();
      } else {
        this.followingIds = new Set();
        this.showToast(data.message || 'Could not load your Following feed.');
      }
    } catch (e) {
      this.followingIds = new Set();
      this.showToast('Network error while loading your Following feed.');
    }
    this.render();
  }

  // ---------- Pages: feed <-> creator profile (hash routing) ----------

  isProfileActive() {
    return this.route && this.route.name === 'profile';
  }

  handleRoute() {
    // Close any open pop-ups when the page changes
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));

    const hash = window.location.hash || '';
    const m = /^#\/(u|profile)\/(.+)$/.exec(hash);
    const artM = /^#\/(article|post)\/(.+)$/.exec(hash);
    const topicM = /^#\/topic\/(.+)$/.exec(hash);

    if (m) {
      let handle = m[2];
      try { handle = decodeURIComponent(handle); } catch (e) {}
      this.route = { name: 'profile', handle };
      this.showProfileView(handle);
    } else if (artM) {
      const postId = decodeURIComponent(artM[2]);
      this.route = { name: 'home' };
      this.showFeedView();
      this.openFullArticle(postId, false);
    } else if (hash === '#/explore') {
      this.route = { name: 'explore' };
      this.showExploreView();
    } else if (topicM) {
      let topic = topicM[1];
      try { topic = decodeURIComponent(topic); } catch (e) {}
      this.route = { name: 'explore' };
      this.showExploreView(topic);
    } else if (hash === '#/dashboard') {
      this.route = { name: 'dashboard' };
      this.showDashboardView();
    } else if (hash === '#/saved') {
      this.route = { name: 'saved' };
      this.showSavedView();
    } else if (hash === '#/write') {
      this.route = { name: 'home' };
      this.showFeedView();
      this.openArticleStudio();
    } else if (hash === '#/notifications') {
      this.openModal(this.notificationsModal);
      this.loadNotifications();
    } else {
      this.route = { name: 'home' };
      this.showFeedView();
    }
  }

  setNavActive() {
    const isProfile = this.isProfileActive();
    const isExplore = this.route && this.route.name === 'explore';
    const isDashboard = this.route && this.route.name === 'dashboard';
    const isSaved = this.route && this.route.name === 'saved';
    const isHome = !isProfile && !isExplore && !isDashboard && !isSaved;

    const home = document.getElementById('nav-home-btn');
    const explore = document.getElementById('nav-explore-btn');
    const dashboard = document.getElementById('nav-dashboard-btn');
    const saved = document.getElementById('nav-saved-btn');
    const mine = document.getElementById('nav-profile-btn');

    const mobHome = document.getElementById('mob-nav-home');
    const mobExplore = document.getElementById('mob-nav-explore');
    const mobProfile = document.getElementById('mob-nav-profile');

    const isMine = isProfile && this.currentUser && this.currentUser.handle &&
      this.route.handle && this.route.handle.replace(/^@/, '').toLowerCase() === this.currentUser.handle.replace(/^@/, '').toLowerCase();

    if (home) home.classList.toggle('active', isHome);
    if (explore) explore.classList.toggle('active', isExplore);
    if (dashboard) dashboard.classList.toggle('active', isDashboard);
    if (saved) saved.classList.toggle('active', isSaved);
    if (mine) mine.classList.toggle('active', !!isMine);

    if (mobHome) mobHome.classList.toggle('active', isHome);
    if (mobExplore) mobExplore.classList.toggle('active', isExplore);
    if (mobProfile) mobProfile.classList.toggle('active', isProfile);
  }

  hideAllViews() {
    const feed = document.getElementById('feed-view');
    const prof = document.getElementById('profile-view');
    const exp = document.getElementById('explore-view');
    const dash = document.getElementById('dashboard-view');
    const saved = document.getElementById('saved-view');
    const rSide = document.querySelector('.right-sidebar');
    if (feed) feed.style.display = 'none';
    if (prof) prof.style.display = 'none';
    if (exp) exp.style.display = 'none';
    if (dash) dash.style.display = 'none';
    if (saved) saved.style.display = 'none';
    if (rSide) rSide.style.display = '';
  }

  showFeedView() {
    this.hideAllViews();
    const feed = document.getElementById('feed-view');
    if (feed) feed.style.display = '';
    document.title = 'READORA | Where readers become creators';
    this.setNavActive();
    this.render();
  }

  showProfileView(handle) {
    this.hideAllViews();
    const prof = document.getElementById('profile-view');
    if (prof) prof.style.display = 'flex';
    this.setNavActive();
    window.scrollTo({ top: 0 });
    this.profileFilter = 'all';
    this.loadProfile(handle);
  }

  showExploreView(topicFilter = '') {
    this.hideAllViews();
    const exp = document.getElementById('explore-view');
    const rSide = document.querySelector('.right-sidebar');
    if (exp) exp.style.display = 'flex';
    // On Explore page, hide right sidebar to eliminate duplicate widgets completely!
    if (rSide) rSide.style.display = 'none';
    document.title = 'Explore | READORA';
    this.setNavActive();
    window.scrollTo({ top: 0 });
    if (this.cachedCreators) this.renderStoriesRows(this.cachedCreators);
    this.renderExploreGrid(topicFilter);
  }

  renderExploreGrid(topicFilter = '') {
    const grid = document.getElementById('explore-posts-grid');
    if (!grid) return;

    let items = (this.posts || []);
    if (topicFilter) {
      items = items.filter(p => (p.category || '').toLowerCase() === topicFilter.toLowerCase());
    }

    if (this.activeSearchQuery) {
      const q = this.activeSearchQuery;
      items = items.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.content || '').toLowerCase().includes(q) ||
        (p.author || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    }

    if (items.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: var(--text-dim); background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md);">No posts found matching this criteria. Be the first to share one!</div>';
      return;
    }

    grid.innerHTML = items.map(post => {
      const cover = safeUrl(post.coverImage);
      if (post.type === 'article') {
        return `
          <div class="explore-grid-item" data-id="${esc(post.id)}">
            ${cover ? `<img src="${esc(cover)}" class="explore-grid-cover" alt="Article Cover" loading="lazy" onerror="this.style.display='none';" />` : ''}
            <div class="explore-grid-body">
              <span class="card-tag ${this.getCategoryClass(post.category)}" style="align-self:flex-start; margin-bottom: 0.25rem;">${esc(post.category || 'Article')}</span>
              <div class="explore-grid-title">${esc(post.title)}</div>
              <div class="explore-grid-author">${esc(post.author)} • ${esc(post.readTime || '3 min read')}</div>
            </div>
          </div>
        `;
      } else if (post.type === 'image') {
        return `
          <div class="explore-grid-item" data-id="${esc(post.id)}">
            ${cover ? `<img src="${esc(cover)}" class="explore-grid-cover" alt="Photo" loading="lazy" />` : ''}
            <div class="explore-grid-body">
              <div class="explore-grid-title" style="font-weight: 500; font-size: 0.875rem;">${esc(post.content || 'Photo Post')}</div>
              <div class="explore-grid-author">${esc(post.author)} • ${esc(post.timestamp || 'Recently')}</div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="explore-grid-item" data-id="${esc(post.id)}" style="background: var(--bg-subtle);">
            <div class="explore-grid-body" style="padding: 1.25rem;">
              <span class="card-tag ${this.getCategoryClass(post.category)}" style="align-self:flex-start; margin-bottom: 0.5rem;">${esc(post.category || 'Thought')}</span>
              <div class="thought-text" style="font-size: 1rem; line-height: 1.5; font-family: var(--font-serif); margin-bottom: 0.75rem;">"${esc(post.content)}"</div>
              <div class="explore-grid-author">— ${esc(post.author)}</div>
            </div>
          </div>
        `;
      }
    }).join('');

    grid.querySelectorAll('.explore-grid-item').forEach(el => {
      el.addEventListener('click', () => {
        const pId = el.dataset.id;
        const targetPost = this.posts.find(p => p.id === pId);
        if (targetPost && targetPost.type === 'article') {
          this.openFullArticle(pId);
        } else {
          // Switch to home feed and scroll to post
          window.location.hash = '#/';
          setTimeout(() => {
            const card = document.querySelector(`[data-id="${pId}"]`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        }
      });
    });
  }

  async showDashboardView() {
    if (!this.requireLogin('Please log in to view your Creator Dashboard!')) return;
    this.hideAllViews();
    const dash = document.getElementById('dashboard-view');
    if (!dash) return;
    dash.style.display = 'flex';
    document.title = 'Creator Dashboard | READORA';
    this.setNavActive();
    window.scrollTo({ top: 0 });

    dash.innerHTML = `
      <div style="text-align:center; padding: 4rem 1rem; color: var(--text-dim);">
        <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">📊</div>
        Loading Creator Studio & Analytics...
      </div>
    `;

    try {
      const res = await fetch(`${this.apiBase}/api/posts/dashboard`, { headers: this.authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) {
        dash.innerHTML = `<div class="dashboard-hero-card" style="text-align:center; color: var(--text-dim);">${data.message || 'Could not load dashboard.'}</div>`;
        return;
      }
      this.dashboardData = data;
      this.renderDashboard('articles');
    } catch (e) {
      dash.innerHTML = `<div class="dashboard-hero-card" style="text-align:center; color: var(--text-dim);">Network error loading Creator Dashboard.</div>`;
    }
  }

  renderDashboard(activeTab = 'articles') {
    const dash = document.getElementById('dashboard-view');
    if (!dash || !this.dashboardData) return;
    const { overview, articles, thoughts, draft, recentActivity } = this.dashboardData;

    dash.innerHTML = `
      <div class="dashboard-hero-card">
        <div class="dashboard-title-row">
          <div>
            <h1 class="dashboard-title">Creator Studio</h1>
            <p style="color: var(--text-dim); font-size: 0.9rem; margin-top: 0.25rem;">Analytics, publications, and real-time community engagement.</p>
          </div>
          <button class="btn-auth-primary" id="btn-dash-new-article" style="width: auto; padding: 0.55rem 1.25rem;">
            + Write New Article
          </button>
        </div>

        <div class="dashboard-grid">
          <div class="dashboard-stat-card">
            <div class="dashboard-stat-val" style="color: var(--accent-primary);">${esc(overview.totalArticles || 0)}</div>
            <div class="dashboard-stat-label">Articles</div>
          </div>
          <div class="dashboard-stat-card">
            <div class="dashboard-stat-val" style="color: #8b5cf6;">${esc(overview.totalThoughts || 0)}</div>
            <div class="dashboard-stat-label">Thoughts</div>
          </div>
          <div class="dashboard-stat-card">
            <div class="dashboard-stat-val" style="color: #10b981;">${esc(overview.totalViews || 0)}</div>
            <div class="dashboard-stat-label">Total Views</div>
          </div>
          <div class="dashboard-stat-card">
            <div class="dashboard-stat-val" style="color: #ef4444;">${esc(overview.totalLikes || 0)}</div>
            <div class="dashboard-stat-label">Likes</div>
          </div>
          <div class="dashboard-stat-card">
            <div class="dashboard-stat-val" style="color: #3b82f6;">${esc(overview.totalComments || 0)}</div>
            <div class="dashboard-stat-label">Comments</div>
          </div>
          <div class="dashboard-stat-card">
            <div class="dashboard-stat-val" style="color: #f59e0b;">${esc(overview.followersCount || 0)}</div>
            <div class="dashboard-stat-label">Followers</div>
          </div>
        </div>
      </div>

      <div class="dashboard-section">
        <div class="feed-filter-bar" style="margin-bottom: 1.25rem;">
          <button class="feed-tab ${activeTab === 'articles' ? 'active' : ''}" data-dashtab="articles">📖 Articles (${(articles || []).length})</button>
          <button class="feed-tab ${activeTab === 'thoughts' ? 'active' : ''}" data-dashtab="thoughts">💭 Thoughts (${(thoughts || []).length})</button>
          <button class="feed-tab ${activeTab === 'drafts' ? 'active' : ''}" data-dashtab="drafts">📝 Drafts (${draft ? 1 : 0})</button>
          <button class="feed-tab ${activeTab === 'activity' ? 'active' : ''}" data-dashtab="activity">⚡ Activity (${(recentActivity || []).length})</button>
        </div>

        <div id="dashboard-tab-content"></div>
      </div>
    `;

    const newBtn = document.getElementById('btn-dash-new-article');
    if (newBtn) newBtn.addEventListener('click', () => this.openArticleStudio());

    dash.querySelectorAll('[data-dashtab]').forEach(b => {
      b.addEventListener('click', () => this.renderDashboard(b.dataset.dashtab));
    });

    const contentBox = document.getElementById('dashboard-tab-content');
    if (!contentBox) return;

    if (activeTab === 'articles') {
      if (!articles || articles.length === 0) {
        contentBox.innerHTML = `
          <div style="text-align:center; padding: 3rem 1rem; color: var(--text-dim);">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">✍️</div>
            <p>You haven't published any long-form articles yet.</p>
            <button class="btn-dash-action" id="btn-dash-start-writing" style="margin-top: 0.75rem;">Start Your First Article</button>
          </div>
        `;
        const startBtn = document.getElementById('btn-dash-start-writing');
        if (startBtn) startBtn.addEventListener('click', () => this.openArticleStudio());
        return;
      }

      contentBox.innerHTML = articles.map(art => `
        <div class="dashboard-item-row">
          <div style="flex:1;">
            <a href="#/article/${esc(art.id)}" class="dashboard-item-title">${esc(art.title)}</a>
            <div class="dashboard-item-meta">
              <span class="card-tag ${this.getCategoryClass(art.category)}">${esc(art.category || 'General')}</span>
              <span>${esc(art.timestamp || 'Recently')}</span>
              <span>👁️ ${esc(art.views || 0)} views</span>
              <span>❤️ ${esc(art.likes || 0)} likes</span>
              <span>💬 ${(art.comments || []).length} comments</span>
            </div>
          </div>
          <div class="dashboard-btn-group">
            <button class="btn-dash-action btn-dash-preview" data-id="${esc(art.id)}">Preview</button>
            <button class="btn-dash-action btn-dash-edit" data-id="${esc(art.id)}">Edit</button>
            <button class="btn-dash-action btn-dash-danger btn-dash-delete" data-id="${esc(art.id)}">Delete</button>
          </div>
        </div>
      `).join('');

      contentBox.querySelectorAll('.btn-dash-preview').forEach(btn => {
        btn.addEventListener('click', () => this.openFullArticle(btn.dataset.id));
      });
      contentBox.querySelectorAll('.btn-dash-edit').forEach(btn => {
        btn.addEventListener('click', () => this.openEditPost(btn.dataset.id));
      });
      contentBox.querySelectorAll('.btn-dash-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          await this.deletePost(btn.dataset.id);
          this.showDashboardView();
        });
      });
    } else if (activeTab === 'thoughts') {
      if (!thoughts || thoughts.length === 0) {
        contentBox.innerHTML = '<div style="text-align:center; padding: 2.5rem 1rem; color: var(--text-dim);">No short thoughts published yet.</div>';
        return;
      }
      contentBox.innerHTML = thoughts.map(th => `
        <div class="dashboard-item-row">
          <div style="flex:1;">
            <div style="font-weight:600; color:var(--text-main); margin-bottom: 0.2rem;">"${esc(th.content)}"</div>
            <div class="dashboard-item-meta">
              <span class="card-tag ${this.getCategoryClass(th.category)}">${esc(th.category || 'General')}</span>
              <span>${esc(th.timestamp || 'Recently')}</span>
              <span>❤️ ${esc(th.likes || 0)} likes</span>
            </div>
          </div>
          <div class="dashboard-btn-group">
            <button class="btn-dash-action btn-dash-danger btn-dash-del-th" data-id="${esc(th.id)}">Delete</button>
          </div>
        </div>
      `).join('');

      contentBox.querySelectorAll('.btn-dash-del-th').forEach(btn => {
        btn.addEventListener('click', async () => {
          await this.deletePost(btn.dataset.id);
          this.showDashboardView();
        });
      });
    } else if (activeTab === 'drafts') {
      if (!draft || (!draft.title && !draft.content)) {
        contentBox.innerHTML = '<div style="text-align:center; padding: 2.5rem 1rem; color: var(--text-dim);">No saved drafts. Open Article Studio and click "Save Draft" to resume writing anytime!</div>';
        return;
      }
      contentBox.innerHTML = `
        <div class="dashboard-item-row">
          <div style="flex:1;">
            <div class="dashboard-item-title">${esc(draft.title || 'Untitled Draft')}</div>
            <div style="font-size:0.85rem; color: var(--text-muted); margin: 0.25rem 0;">${esc((draft.content || '').substring(0, 140))}...</div>
            <div class="dashboard-item-meta">
              <span class="draft-status-pill">Draft in Progress</span>
              <span>Last saved: ${esc(draft.updatedAt || 'Recently')}</span>
            </div>
          </div>
          <div class="dashboard-btn-group">
            <button class="btn-dash-action" id="btn-dash-resume-draft">Continue Writing ➔</button>
            <button class="btn-dash-action btn-dash-danger" id="btn-dash-discard-draft">Discard</button>
          </div>
        </div>
      `;
      const resume = document.getElementById('btn-dash-resume-draft');
      if (resume) resume.addEventListener('click', () => this.openArticleStudio(draft));
      const discard = document.getElementById('btn-dash-discard-draft');
      if (discard) discard.addEventListener('click', async () => {
        if (!confirm('Discard this draft permanently?')) return;
        await fetch(`${this.apiBase}/api/posts/draft`, { method: 'DELETE', headers: this.authHeaders() });
        this.dashboardData.draft = null;
        this.renderDashboard('drafts');
        this.showToast('Draft discarded.');
      });
    } else if (activeTab === 'activity') {
      if (!recentActivity || recentActivity.length === 0) {
        contentBox.innerHTML = '<div style="text-align:center; padding: 2.5rem 1rem; color: var(--text-dim);">No recent interactions on your posts yet. Share your stories to build an audience!</div>';
        return;
      }
      contentBox.innerHTML = recentActivity.map(act => `
        <div class="dashboard-item-row">
          <div style="display:flex; align-items:center; gap: 0.75rem;">
            <div class="author-avatar" style="width:34px; height:34px; font-size:0.85rem;">${esc(act.actor_avatar || 'CR')}</div>
            <div>
              <div style="font-size:0.9rem; color:var(--text-main); font-weight:600;">${esc(act.message)}</div>
              <div style="font-size:0.78rem; color:var(--text-dim);">${esc(act.created_at || 'Recently')}</div>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  showSavedView() {
    this.hideAllViews();
    const saved = document.getElementById('saved-view');
    if (!saved) return;
    saved.style.display = 'flex';
    document.title = 'Saved Articles & Reading History | READORA';
    this.setNavActive();
    window.scrollTo({ top: 0 });
    this.renderSavedView('bookmarks');
  }

  renderSavedView(subTab = 'bookmarks', searchQuery = '') {
    const saved = document.getElementById('saved-view');
    if (!saved) return;

    const bookmarkedPosts = this.posts.filter(p => p.bookmarkedByUser);
    const readingHistory = JSON.parse(localStorage.getItem('readora_reading_history') || '[]');

    saved.innerHTML = `
      <div class="dashboard-hero-card" style="margin-bottom: 1.5rem;">
        <h1 class="dashboard-title">Reading Lists & Library</h1>
        <p style="color: var(--text-dim); font-size: 0.9rem; margin-top: 0.25rem;">
          Revisit saved publications, bookmarks, and your reading journey.
        </p>

        <div class="saved-filter-bar" style="margin-top: 1.25rem;">
          <div class="feed-filter-bar" style="margin: 0;">
            <button class="feed-tab ${subTab === 'bookmarks' ? 'active' : ''}" data-savetab="bookmarks">
              🔖 Bookmarks (${bookmarkedPosts.length})
            </button>
            <button class="feed-tab ${subTab === 'history' ? 'active' : ''}" data-savetab="history">
              🕒 Reading History (${readingHistory.length})
            </button>
          </div>

          ${subTab === 'bookmarks' ? `
            <input type="text" id="saved-search-input" class="saved-search-input" placeholder="Search saved posts..." value="${esc(searchQuery)}">
          ` : `
            <button class="btn-dash-action btn-dash-danger" id="btn-clear-reading-history">
              Clear Reading History
            </button>
          `}
        </div>
      </div>

      <div id="saved-list-container" class="posts-stream"></div>
    `;

    saved.querySelectorAll('[data-savetab]').forEach(b => {
      b.addEventListener('click', () => this.renderSavedView(b.dataset.savetab));
    });

    const searchInput = document.getElementById('saved-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.renderSavedView('bookmarks', e.target.value);
      });
    }

    const clearBtn = document.getElementById('btn-clear-reading-history');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!confirm('Clear your entire reading history?')) return;
        localStorage.removeItem('readora_reading_history');
        this.showToast('Reading history cleared.');
        this.renderSavedView('history');
      });
    }

    const listContainer = document.getElementById('saved-list-container');
    if (!listContainer) return;

    if (subTab === 'bookmarks') {
      let filtered = bookmarkedPosts;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(p =>
          (p.title || '').toLowerCase().includes(q) ||
          (p.content || '').toLowerCase().includes(q) ||
          (p.author || '').toLowerCase().includes(q)
        );
      }

      if (filtered.length === 0) {
        listContainer.innerHTML = `
          <div class="dashboard-hero-card" style="text-align:center; padding: 3rem 1rem; color: var(--text-dim);">
            <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🔖</div>
            <p>${searchQuery ? 'No saved posts match your search.' : 'You have no saved posts yet. Click the bookmark icon on any post to save it here.'}</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = filtered.map(post => this.renderPostCard(post)).join('');
      this.attachCardEventListeners(listContainer);
    } else {
      if (readingHistory.length === 0) {
        listContainer.innerHTML = `
          <div class="dashboard-hero-card" style="text-align:center; padding: 3rem 1rem; color: var(--text-dim);">
            <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">📖</div>
            <p>Articles you read will be recorded here so you can easily return to them.</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = readingHistory.map(item => `
        <div class="dashboard-hero-card" style="padding: 1.15rem; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <span class="card-tag ${this.getCategoryClass(item.category)}" style="margin-bottom: 0.25rem;">${esc(item.category || 'Article')}</span>
            <a href="#/article/${esc(item.id)}" class="dashboard-item-title" style="font-size: 1.05rem;">${esc(item.title || 'Untitled Article')}</a>
            <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 0.2rem;">By ${esc(item.author || 'Creator')} • Read ${timeAgo(item.timestamp)}</div>
          </div>
          <button class="btn-dash-action btn-open-history-art" data-id="${esc(item.id)}">Read Again ➔</button>
        </div>
      `).join('');

      listContainer.querySelectorAll('.btn-open-history-art').forEach(b => {
        b.addEventListener('click', () => this.openFullArticle(b.dataset.id));
      });
    }
  }

  async loadProfile(handle, silent = false) {
    const reqId = ++this.profileReq;
    const view = document.getElementById('profile-view');
    if (!view) return;
    if (!silent) view.innerHTML = '<div class="profile-message">Loading profile…</div>';

    await this.syncPromise;

    try {
      const res = await fetch(`${this.apiBase}/api/posts/user/${encodeURIComponent(handle)}`, { headers: this.authHeaders() });
      const data = await res.json();
      if (reqId !== this.profileReq) return; // user already went somewhere else

      if (res.ok && data.success && data.profile) {
        this.profile = data.profile;
        document.title = `${data.profile.name} (${data.profile.handle}) | READORA`;
        this.renderProfile();
      } else {
        this.profile = null;
        view.innerHTML = `
          <a class="profile-back" href="#/">← Back to feed</a>
          <div class="profile-message">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</div>
            <h3>Creator not found</h3>
            <p>We couldn't find anyone called ${esc(handle)}.</p>
          </div>`;
      }
    } catch (e) {
      if (reqId !== this.profileReq) return;
      view.innerHTML = `
        <a class="profile-back" href="#/">← Back to feed</a>
        <div class="profile-message"><h3>Could not load this profile</h3><p>Please check your connection and try again.</p></div>`;
    }
  }

  renderProfile() {
    const view = document.getElementById('profile-view');
    const p = this.profile;
    if (!view || !p) return;

    const isMe = !!p.isMe || (this.currentUser && this.currentUser.id === p.id);
    let joined = '';
    if (p.joinedAt) {
      const d = new Date(String(p.joinedAt).replace(' ', 'T') + 'Z');
      if (!isNaN(d.getTime())) joined = 'Joined ' + d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    const stat = (num, label, color) => `
      <div class="profile-stat">
        <div class="profile-stat-num" style="${color ? 'color:' + color : ''}">${esc(num)}</div>
        <div class="profile-stat-label">${label}</div>
      </div>`;

    const action = isMe
      ? `<button class="btn-profile-secondary" id="btn-edit-profile">✎ Edit Profile</button>`
      : `<button class="btn-profile-primary ${p.isFollowing ? 'is-following' : ''}" id="btn-profile-follow">${p.isFollowing ? 'Following' : 'Follow'}</button>`;

    view.innerHTML = `
      <a class="profile-back" href="#/">← Back to feed</a>
      <div class="profile-hero">
        <div class="profile-hero-top">
          <div class="profile-avatar-lg">${esc(p.avatar)}</div>
          <div class="profile-hero-info">
            <h1 class="profile-name">${esc(p.name)}</h1>
            <div class="profile-handle">${esc(p.handle)}</div>
            <p class="profile-bio">${esc(p.bio || 'Reader and creator on Readora.')}</p>
            ${joined ? `<div class="profile-joined">${esc(joined)}</div>` : ''}
          </div>
          <div class="profile-actions">${action}</div>
        </div>
        <div class="profile-stats">
          ${stat(p.stats.thoughts, 'Thoughts')}
          ${stat(p.stats.articles, 'Articles')}
          ${stat(p.stats.followers, 'Followers', '#6366f1')}
          ${stat(p.stats.following, 'Following', '#a5b4fc')}
        </div>
      </div>

      <div class="feed-filter-bar profile-tabs">
        <button class="feed-tab ${this.profileFilter === 'all' ? 'active' : ''}" data-pfilter="all">🌟 All Posts</button>
        <button class="feed-tab ${this.profileFilter === 'thought' ? 'active' : ''}" data-pfilter="thought">💭 Thoughts</button>
        <button class="feed-tab ${this.profileFilter === 'article' ? 'active' : ''}" data-pfilter="article">📖 Articles</button>
      </div>

      <div class="posts-stream" id="profile-posts"></div>
    `;

    const editBtn = document.getElementById('btn-edit-profile');
    if (editBtn) editBtn.addEventListener('click', () => this.openEditProfile());
    const followBtn = document.getElementById('btn-profile-follow');
    if (followBtn) followBtn.addEventListener('click', () => this.toggleFollow(p.id));

    view.querySelectorAll('[data-pfilter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.profileFilter = btn.dataset.pfilter;
        view.querySelectorAll('[data-pfilter]').forEach(b => b.classList.toggle('active', b === btn));
        this.renderProfilePosts();
      });
    });

    this.renderProfilePosts();
  }

  renderProfilePosts() {
    const box = document.getElementById('profile-posts');
    if (!box || !this.profile) return;

    const list = this.posts.filter(post => {
      if (post.author_id !== this.profile.id) return false;
      if (this.profileFilter !== 'all' && post.type !== this.profileFilter) return false;
      return true;
    });

    if (list.length === 0) {
      const who = this.profile.isMe ? 'You haven\'t' : `${esc(this.profile.name)} hasn't`;
      box.innerHTML = `
        <div class="profile-message">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">✍️</div>
          <h3>Nothing here yet</h3>
          <p>${who} published any ${this.profileFilter === 'all' ? 'posts' : this.profileFilter + 's'} yet.</p>
        </div>`;
      return;
    }

    box.innerHTML = list.map(post => this.renderPostCard(post)).join('');
    this.attachCardEventListeners(box);
  }

  // ---------- Edit profile ----------

  openEditProfile() {
    if (!this.currentUser) return;
    const nameEl = document.getElementById('edit-profile-name');
    const bioEl = document.getElementById('edit-profile-bio');
    const errEl = document.getElementById('edit-profile-error');
    if (nameEl) nameEl.value = this.currentUser.name || '';
    if (bioEl) bioEl.value = this.currentUser.bio || '';
    if (errEl) errEl.style.display = 'none';
    this.openModal(this.editProfileModal);
  }

  async submitEditProfile() {
    const name = document.getElementById('edit-profile-name').value.trim();
    const bio = document.getElementById('edit-profile-bio').value.trim();
    const errEl = document.getElementById('edit-profile-error');
    const btn = document.getElementById('btn-save-profile');
    const showErr = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };

    errEl.style.display = 'none';
    if (!name) return showErr('Please enter your name.');
    if (name.length > 50) return showErr('Name must be 50 characters or fewer.');
    if (bio.length > 200) return showErr('Bio must be 200 characters or fewer.');

    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const res = await fetch(`${this.apiBase}/api/auth/profile`, {
        method: 'PUT',
        headers: this.authHeaders(),
        body: JSON.stringify({ name, bio })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.currentUser = Object.assign({}, this.currentUser, data.user);
        localStorage.setItem('readora_current_user', JSON.stringify(this.currentUser));
        this.editProfileModal.classList.remove('active');
        this.updateUserUI();
        await this.syncWithBackend();
        if (this.isProfileActive() && this.profile) await this.loadProfile(this.profile.handle, true);
        this.showToast('✅ Profile updated!');
      } else {
        showErr(data.message || 'Could not update your profile.');
      }
    } catch (e) {
      showErr('Network error. Please try again.');
    }
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }

  // ---------- Header / user UI ----------

  updateUserUI() {
    const isAuth = !!this.currentUser;
    const avatarEls = document.querySelectorAll('.user-avatar-sm, .thought-composer-card .author-avatar');
    const nameEl = document.querySelector('.user-name-sm');
    const userBadge = document.getElementById('user-profile-badge');

    const authText = document.getElementById('nav-auth-text');
    const authBtn = document.getElementById('nav-auth-btn');

    if (isAuth && this.currentUser) {
      const initials = this.currentUser.avatar || (this.currentUser.name ? this.currentUser.name.substring(0, 2).toUpperCase() : 'CR');
      avatarEls.forEach(el => { el.textContent = initials; });
      if (nameEl) nameEl.textContent = this.currentUser.name ? this.currentUser.name.split(' ')[0] : 'Creator';
      if (userBadge) userBadge.title = `Logged in as ${this.currentUser.name}`;

      if (authText) authText.textContent = 'Log Out';
      if (authBtn) authBtn.title = 'Log Out of Readora';

      const modalAvatar = document.getElementById('profile-modal-avatar');
      if (modalAvatar) modalAvatar.textContent = initials;
      const modalName = document.getElementById('profile-modal-name');
      if (modalName) modalName.textContent = this.currentUser.name || 'Creator';
      const modalHandle = document.getElementById('profile-modal-handle');
      if (modalHandle) modalHandle.textContent = this.currentUser.handle || '@creator';
      const modalBio = document.getElementById('profile-modal-bio');
      if (modalBio) modalBio.textContent = this.currentUser.bio || 'Reader and creator on Readora.';
      const modalThoughts = document.getElementById('profile-modal-thoughts');
      if (modalThoughts) modalThoughts.textContent = this.currentUser.stats ? this.currentUser.stats.thoughts : 0;
      const modalArticles = document.getElementById('profile-modal-articles');
      if (modalArticles) modalArticles.textContent = this.currentUser.stats ? this.currentUser.stats.articles : 0;
      const modalFollowers = document.getElementById('profile-modal-followers');
      if (modalFollowers) modalFollowers.textContent = this.currentUser.stats ? this.currentUser.stats.followers : 0;
      const modalFollowing = document.getElementById('profile-modal-following');
      if (modalFollowing) modalFollowing.textContent = this.currentUser.stats ? this.currentUser.stats.following : 0;
    } else {
      avatarEls.forEach(el => { el.textContent = '👤'; });
      if (nameEl) nameEl.textContent = 'Guest';
      if (userBadge) userBadge.title = 'Click to log in or register';
      if (authText) authText.textContent = 'Log In / Sign Up';
      if (authBtn) authBtn.title = 'Log In or Create an Account';
    }
    this.setNavActive();
  }

  logout() {
    if (this.currentUser) {
      try {
        localStorage.setItem('readora_last_user', JSON.stringify({
          name: this.currentUser.name,
          handle: this.currentUser.handle,
          avatar: this.currentUser.avatar || (this.currentUser.name ? this.currentUser.name.substring(0, 2).toUpperCase() : 'CR')
        }));
      } catch (e) {}
    }
    localStorage.removeItem('readora_token');
    localStorage.removeItem('readora_current_user');
    window.location.href = 'practise.html?switched=true';
  }

  initDOM() {
    this.postsContainer = document.getElementById('posts-stream');
    this.searchInput = document.getElementById('search-input');
    this.filterTabs = document.querySelectorAll('#feed-view .feed-tab');

    // Quick Thought Composer
    this.thoughtInput = document.getElementById('quick-thought-text');
    this.publishThoughtBtn = document.getElementById('btn-publish-thought');
    this.composerCategory = document.getElementById('composer-category');
    this.themePills = document.querySelectorAll('.theme-pill');

    // Photo Composer
    this.btnPublishPhoto = document.getElementById('btn-publish-photo');
    this.photoUrlInput = document.getElementById('photo-url-input');
    this.photoCaptionInput = document.getElementById('photo-caption-input');
    this.photoCategory = document.getElementById('photo-category');
    this.photoPreviewBox = document.getElementById('photo-preview-box');
    this.photoPreviewImg = document.getElementById('photo-preview-img');
    this.composerTypeBtns = document.querySelectorAll('.composer-type-btn');
    this.composerSections = document.querySelectorAll('.composer-section');

    // Modals
    this.writeArticleModal = document.getElementById('write-article-modal');
    this.readArticleModal = document.getElementById('read-article-modal');
    this.profileModal = document.getElementById('profile-modal');
    this.editProfileModal = document.getElementById('edit-profile-modal');
    this.notificationsModal = document.getElementById('notifications-modal');

    // Action Triggers & Nav
    this.btnOpenWriteArticle = document.getElementById('btn-open-write-article');
    this.btnWriteLongArticle = document.getElementById('btn-write-long-article');
    this.userBadge = document.getElementById('user-profile-badge');
    this.profileSidebarBtn = document.getElementById('nav-profile-btn');
    this.btnLogout = document.getElementById('btn-logout');
    this.btnViewProfile = document.getElementById('btn-view-profile');
    this.themeToggleBtn = document.getElementById('theme-toggle-btn');
    this.notifBtn = document.getElementById('btn-notifications');
    this.btnMarkAllRead = document.getElementById('btn-mark-all-read');

    // Forms
    this.articleForm = document.getElementById('publish-article-form');
    this.editProfileForm = document.getElementById('edit-profile-form');
    this.toastEl = document.getElementById('toast');

    this.initTheme();
    this.updateUserUI();
  }

  goToMyProfile() {
    if (!this.currentUser || !this.currentUser.handle) {
      this.showToast('Please log in to see your profile.');
      setTimeout(() => { window.location.href = 'practise.html'; }, 1000);
      return;
    }
    if (window.location.hash === profileLink(this.currentUser.handle)) {
      this.handleRoute();
    } else {
      window.location.hash = profileLink(this.currentUser.handle);
    }
  }

  initTheme() {
    const saved = localStorage.getItem('readora_theme');
    // Light theme is the default design system
    if (saved === 'dark') {
      document.body.classList.add('theme-dark');
      this.updateThemeButton(true);
    } else {
      document.body.classList.remove('theme-dark');
      this.updateThemeButton(false);
    }
  }

  toggleTheme() {
    const isDark = document.body.classList.toggle('theme-dark');
    localStorage.setItem('readora_theme', isDark ? 'dark' : 'light');
    this.updateThemeButton(isDark);
    this.showToast(isDark ? '🌙 Dark Mode Enabled' : '☀️ Light Mode Enabled');
  }

  updateThemeButton(isDark) {
    if (!this.themeToggleBtn) return;
    this.themeToggleBtn.innerHTML = isDark
      ? `<span class="theme-icon">☀️</span><span class="theme-text">Light</span>`
      : `<span class="theme-icon">🌙</span><span class="theme-text">Dark</span>`;
  }

  bindEvents() {
    // Character counters for quick thought and photo caption
    if (this.thoughtInput) {
      const counterEl = document.getElementById('thought-char-count');
      this.thoughtInput.addEventListener('input', () => {
        const len = this.thoughtInput.value.length;
        if (counterEl) {
          counterEl.textContent = `${len} / 280`;
          counterEl.classList.toggle('warning', len > 220 && len <= 280);
          counterEl.classList.toggle('limit', len > 280);
        }
      });
    }

    if (this.photoCaptionInput) {
      const counterEl = document.getElementById('photo-char-count');
      this.photoCaptionInput.addEventListener('input', () => {
        const len = this.photoCaptionInput.value.length;
        if (counterEl) {
          counterEl.textContent = `${len} / 280`;
          counterEl.classList.toggle('warning', len > 220 && len <= 280);
          counterEl.classList.toggle('limit', len > 280);
        }
      });
    }

    // Photo Drawer Toggle
    const btnTogglePhoto = document.getElementById('btn-toggle-photo');
    const photoDrawer = document.getElementById('composer-photo-drawer');
    const photoInput = document.getElementById('photo-url-input');
    const photoPreviewBox = document.getElementById('photo-preview-box');
    const photoPreviewImg = document.getElementById('photo-preview-img');

    if (btnTogglePhoto && photoDrawer) {
      btnTogglePhoto.addEventListener('click', () => {
        const isHidden = photoDrawer.style.display === 'none';
        photoDrawer.style.display = isHidden ? 'block' : 'none';
        btnTogglePhoto.classList.toggle('active', isHidden);
        if (isHidden && photoInput) photoInput.focus();
      });
    }

    if (photoInput && photoPreviewImg && photoPreviewBox) {
      photoInput.addEventListener('input', () => {
        const url = photoInput.value.trim();
        if (url && /^https?:\/\//i.test(url)) {
          photoPreviewImg.src = url;
          photoPreviewBox.style.display = 'block';
        } else {
          photoPreviewBox.style.display = 'none';
        }
      });
    }

    // Explore Topic Chips Filter
    const exploreChips = document.querySelectorAll('.explore-topic-chip');
    exploreChips.forEach(chip => {
      chip.addEventListener('click', () => {
        exploreChips.forEach(c => c.style.background = '');
        chip.style.background = 'var(--accent-tint)';
        chip.style.color = 'var(--accent-primary)';
        this.renderExploreGrid(chip.dataset.topic);
      });
    });

    // Sidebar Navigation items
    const navWriteBtn = document.getElementById('nav-write-btn');
    if (navWriteBtn) {
      navWriteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openModal(this.writeArticleModal);
      });
    }

    const navNotifsBtn = document.getElementById('nav-notifs-btn');
    if (navNotifsBtn) {
      navNotifsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openModal(this.notificationsModal);
        this.loadNotifications();
      });
    }

    const navSavedBtn = document.getElementById('nav-saved-btn');
    if (navSavedBtn) {
      navSavedBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.showSavedView();
      });
    }

    const navSettingsBtn = document.getElementById('nav-settings-btn');
    if (navSettingsBtn) {
      navSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!this.requireLogin('Please log in to edit your profile!')) return;
        this.openEditProfile();
      });
    }

    const navAuthBtn = document.getElementById('nav-auth-btn');
    if (navAuthBtn) {
      navAuthBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.currentUser) {
          this.logout();
        } else {
          window.location.href = 'practise.html';
        }
      });
    }

    // Mobile Bottom Navigation
    const mobCreate = document.getElementById('mob-nav-create');
    if (mobCreate) {
      mobCreate.addEventListener('click', () => {
        this.openModal(this.writeArticleModal);
      });
    }

    const mobNotifs = document.getElementById('mob-nav-notifs');
    if (mobNotifs) {
      mobNotifs.addEventListener('click', () => {
        this.openModal(this.notificationsModal);
        this.loadNotifications();
      });
    }

    const mobProfile = document.getElementById('mob-nav-profile');
    if (mobProfile) {
      mobProfile.addEventListener('click', (e) => {
        e.preventDefault();
        this.goToMyProfile();
      });
    }

    // Explore View Search
    const exploreSearchInput = document.getElementById('explore-search-input');
    if (exploreSearchInput) {
      exploreSearchInput.addEventListener('input', (e) => {
        this.filterExploreContent(e.target.value.trim());
      });
    }

    // Theme toggle button
    if (this.themeToggleBtn) {
      this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Notifications modal & mark all read
    if (this.notifBtn) {
      this.notifBtn.addEventListener('click', () => {
        this.openModal(this.notificationsModal);
        this.loadNotifications();
      });
    }
    if (this.btnMarkAllRead) {
      this.btnMarkAllRead.addEventListener('click', () => this.markAllNotificationsRead());
    }

    // Composer Mode Tabs (Thought | Photo | Article)
    if (this.composerTypeBtns) {
      this.composerTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.mode;
          if (mode === 'article') {
            this.openModal(this.writeArticleModal);
            return;
          }
          this.composerTypeBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          if (this.composerSections) {
            this.composerSections.forEach(sec => sec.classList.remove('active'));
          }
          const targetSec = document.getElementById(`composer-sec-${mode}`);
          if (targetSec) targetSec.classList.add('active');
        });
      });
    }

    // Photo URL live preview
    if (this.photoUrlInput) {
      this.photoUrlInput.addEventListener('input', () => {
        const url = this.photoUrlInput.value.trim();
        if (url && /^https?:\/\//i.test(url)) {
          if (this.photoPreviewImg) this.photoPreviewImg.src = url;
          if (this.photoPreviewBox) this.photoPreviewBox.style.display = 'block';
        } else {
          if (this.photoPreviewBox) this.photoPreviewBox.style.display = 'none';
        }
      });
    }

    // Photo Post Publish
    if (this.btnPublishPhoto) {
      this.btnPublishPhoto.addEventListener('click', () => this.handleCreateImagePost());
    }

    // Quick thought publication
    if (this.publishThoughtBtn) {
      this.publishThoughtBtn.addEventListener('click', () => this.handleCreateThought());
    }

    // Theme pill selection for thoughts
    this.themePills.forEach(pill => {
      pill.addEventListener('click', () => {
        this.themePills.forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
        this.selectedTheme = pill.dataset.theme;
      });
    });

    // Feed tab filtering
    this.filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentFilter = tab.dataset.filter;
        if (this.currentFilter === 'following') {
          this.loadFollowing();
        } else {
          this.render();
        }
      });
    });

    // Search filter
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        if (this.isProfileActive()) window.location.hash = '#/';
        this.activeSearchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }

    // Page changes (feed <-> profile <-> dashboard)
    window.addEventListener('hashchange', () => this.handleRoute());

    // Search filter with smooth debouncing
    if (this.searchInput) {
      let searchTimer;
      this.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          this.activeSearchQuery = e.target.value.toLowerCase().trim();
          this.render();
          if (this.route && this.route.name === 'explore') {
            this.renderExploreGrid();
          }
        }, 200);
      });
    }

    // Explore topic filter chips
    document.querySelectorAll('.explore-topic-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.explore-topic-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.renderExploreGrid(chip.dataset.topic || '');
      });
    });

    // Modals Open/Close & Article Studio
    if (this.btnOpenWriteArticle) {
      this.btnOpenWriteArticle.addEventListener('click', () => this.openArticleStudio());
    }
    if (this.btnWriteLongArticle) {
      this.btnWriteLongArticle.addEventListener('click', () => this.openArticleStudio());
    }
    if (this.userBadge) {
      this.userBadge.addEventListener('click', () => this.openModal(this.profileModal));
    }
    if (this.profileSidebarBtn) {
      this.profileSidebarBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.goToMyProfile();
      });
    }
    if (this.btnViewProfile) {
      this.btnViewProfile.addEventListener('click', (e) => {
        e.preventDefault();
        this.profileModal.classList.remove('active');
        this.goToMyProfile();
      });
    }

    if (this.btnLogout) {
      this.btnLogout.addEventListener('click', (e) => {
        e.preventDefault();
        this.logout();
      });
    }

    // Notifications Trigger
    if (this.notifBtn) {
      this.notifBtn.addEventListener('click', () => {
        this.openModal(this.notificationsModal);
        this.loadNotifications();
      });
    }

    if (this.btnMarkAllRead) {
      this.btnMarkAllRead.addEventListener('click', async () => {
        try {
          await fetch(`${this.apiBase}/api/posts/notifications/read-all`, { method: 'POST', headers: this.authHeaders() });
          this.showToast('All notifications marked as read.');
          this.loadNotifications();
        } catch (e) {}
      });
    }

    // Article Studio Toolbar & Formatting
    document.querySelectorAll('#editor-toolbar .editor-format-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.applyFormatToArticle(btn.dataset.format);
      });
    });

    // Article Studio Mode Tabs (Write vs Preview)
    const tabWrite = document.getElementById('editor-tab-write');
    const tabPrev = document.getElementById('editor-tab-preview');
    if (tabWrite) tabWrite.addEventListener('click', () => this.setEditorMode('write'));
    if (tabPrev) tabPrev.addEventListener('click', () => this.setEditorMode('preview'));

    // Article Studio Body: Real-time Word & Read-time Counter + Draft Debounce
    const bodyInput = document.getElementById('article-body-input');
    if (bodyInput) {
      let draftTimer;
      bodyInput.addEventListener('input', () => {
        this.updateArticleMetaStats();
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => this.saveArticleDraft(), 3500);
      });
    }

    // Explicit Save Draft Button
    const btnSaveDraft = document.getElementById('btn-save-draft');
    if (btnSaveDraft) {
      btnSaveDraft.addEventListener('click', async () => {
        await this.saveArticleDraft();
        this.showToast('💾 Draft saved successfully!');
      });
    }

    // Discard Button with Confirmation
    const btnClearEditor = document.getElementById('btn-clear-editor');
    if (btnClearEditor) {
      btnClearEditor.addEventListener('click', () => {
        const text = document.getElementById('article-body-input')?.value || '';
        if (text.trim().length > 25 && !confirm('Discard all unsaved changes and close the editor?')) {
          return;
        }
        if (this.articleForm) this.articleForm.reset();
        const editId = document.getElementById('editing-article-id');
        if (editId) editId.value = '';
        const pill = document.getElementById('article-draft-status');
        if (pill) pill.style.display = 'none';
        this.editingPostId = null;
        if (this.writeArticleModal) this.writeArticleModal.classList.remove('active');
      });
    }

    // Protect Against Accidental Discard on Page Leave
    window.addEventListener('beforeunload', (e) => {
      const isModalOpen = this.writeArticleModal && this.writeArticleModal.classList.contains('active');
      const bodyVal = document.getElementById('article-body-input')?.value || '';
      if (isModalOpen && bodyVal.trim().length > 40) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Article Form Submit
    if (this.articleForm) {
      this.articleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleCreateArticle();
      });
    }

    // Edit Profile Form Submit
    if (this.editProfileForm) {
      this.editProfileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitEditProfile();
      });
    }

    // Global Modal Close on Overlay Click or X
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('.modal-close-btn')) {
          overlay.classList.remove('active');
        }
      });
    });
  }

  requireLogin(message) {
    if (this.currentUser) return true;
    this.showToast(message || 'Please log in first!');
    setTimeout(() => { window.location.href = 'practise.html'; }, 1200);
    return false;
  }

  async handleCreateThought() {
    if (!this.requireLogin('Please log in to share!')) return;

    const text = this.thoughtInput ? this.thoughtInput.value.trim() : '';
    const photoInput = document.getElementById('photo-url-input');
    const photoUrl = photoInput ? photoInput.value.trim() : '';
    const category = this.composerCategory ? this.composerCategory.value : 'General';

    // If photo is entered, create photo post
    if (photoUrl) {
      const publishBtn = this.publishThoughtBtn;
      if (publishBtn) { publishBtn.disabled = true; publishBtn.textContent = 'Posting...'; }
      try {
        let newImagePost = null;
        if (window.location.origin.startsWith('http')) {
          const res = await fetch('/api/posts/image', {
            method: 'POST',
            headers: this.authHeaders(),
            body: JSON.stringify({ imageUrl: photoUrl, caption: text, category })
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            this.showToast(data.message || 'Failed to share photo post.');
            return;
          }
          newImagePost = data.post;
        }

        if (newImagePost) {
          this.posts.unshift(newImagePost);
          this.saveLocalPosts();
          if (this.thoughtInput) this.thoughtInput.value = '';
          if (photoInput) photoInput.value = '';
          const photoDrawer = document.getElementById('composer-photo-drawer');
          if (photoDrawer) photoDrawer.style.display = 'none';
          const photoPreviewBox = document.getElementById('photo-preview-box');
          if (photoPreviewBox) photoPreviewBox.style.display = 'none';
          const charCounter = document.getElementById('thought-char-count');
          if (charCounter) charCounter.textContent = '0 / 280';
          this.refresh();
          this.showToast('📸 Photo post shared to Readora!');
        }
        return;
      } catch (err) {
        this.showToast('Network error while sharing photo post.');
        return;
      } finally {
        if (publishBtn) { publishBtn.disabled = false; publishBtn.textContent = 'Share'; }
      }
    }

    if (!text) {
      this.showToast('Please write something before publishing!');
      return;
    }

    const payload = {
      content: text,
      theme: this.selectedTheme,
      category: category
    };

    const publishBtn = this.publishThoughtBtn;
    if (publishBtn) {
      publishBtn.disabled = true;
      publishBtn.style.opacity = '0.7';
      publishBtn.innerHTML = '<span>Publishing...</span>';
    }

    try {
      let newThought = null;
      if (window.location.origin.startsWith('http')) {
        const res = await fetch('/api/posts/thought', {
          method: 'POST',
          headers: this.authHeaders(),
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          this.showToast(data.message || 'Failed to share thought.');
          return;
        }
        newThought = data.post;
      }

      if (newThought) {
        this.posts.unshift(newThought);
        this.saveLocalPosts();
        this.thoughtInput.value = '';
        const charCounter = document.getElementById('thought-char-count');
        if (charCounter) charCounter.textContent = '0 / 280';
        this.refresh();
        this.showToast('✨ Thought published to Readora!');
      }
    } catch (e) {
      this.showToast('Network error connecting to Readora server.');
    } finally {
      if (publishBtn) {
        publishBtn.disabled = false;
        publishBtn.style.opacity = '1';
        publishBtn.innerHTML = '<span>Share</span>';
      }
    }
  }

  async handleCreateArticle() {
    if (!this.requireLogin('Please log in to publish an article!')) return;

    const title = document.getElementById('article-title-input').value.trim();
    const subtitle = document.getElementById('article-subtitle-input').value.trim();
    const category = document.getElementById('article-category-input').value;
    const coverUrl = document.getElementById('article-cover-input').value.trim() || 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=800&auto=format&fit=crop';
    const content = document.getElementById('article-body-input').value.trim();

    if (!title || !content) {
      this.showToast('Please provide both a Title and Article content!');
      return;
    }

    const submitBtn = this.articleForm ? this.articleForm.querySelector('button[type="submit"]') : null;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.7';
      submitBtn.textContent = this.editingPostId ? 'Saving Changes...' : 'Publishing to Readora...';
    }

    try {
      if (this.editingPostId) {
        // Edit Mode: PUT /api/posts/:id
        const res = await fetch(`/api/posts/${this.editingPostId}`, {
          method: 'PUT',
          headers: this.authHeaders(),
          body: JSON.stringify({ title, subtitle, category, coverImage: coverUrl, content })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          this.showToast(data.message || 'Failed to update article.');
          return;
        }
        const post = this.posts.find(p => p.id === this.editingPostId);
        if (post) {
          Object.assign(post, data.post);
          this.saveLocalPosts();
          this.refresh();
        }
        this.editingPostId = null;
        this.articleForm.reset();
        this.writeArticleModal.classList.remove('active');
        if (window.location.hash.startsWith('#/dashboard')) {
          this.showDashboardView();
        }
        this.showToast('Article updated successfully!');
      } else {
        // Create Mode: POST /api/posts/article
        const res = await fetch('/api/posts/article', {
          method: 'POST',
          headers: this.authHeaders(),
          body: JSON.stringify({ title, subtitle, category, coverImage: coverUrl, content })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          this.showToast(data.message || 'Failed to publish article.');
          return;
        }

        const newArticle = data.post;
        this.posts.unshift(newArticle);
        this.saveLocalPosts();
        try { localStorage.removeItem('readora_article_draft'); } catch(e) {}
        fetch('/api/posts/draft', { method: 'DELETE', headers: this.authHeaders() }).catch(() => {});
        this.articleForm.reset();
        this.writeArticleModal.classList.remove('active');
        this.refresh();
        if (window.location.hash.startsWith('#/dashboard')) {
          this.showDashboardView();
        }
        this.showToast('📖 Article published successfully!');
      }
    } catch (e) {
      this.showToast('Network error while publishing article.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.textContent = 'Publish to Readora';
      }
    }
  }

  openEditPost(postId) {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    if (post.type === 'thought' || post.type === 'image') {
      const current = post.content || '';
      const updated = prompt('Edit your thought:', current);
      if (updated === null) return;
      if (!updated.trim()) {
        this.showToast('Content cannot be empty.');
        return;
      }
      this.updatePost(postId, { content: updated.trim() });
    } else if (post.type === 'article') {
      this.editingPostId = postId;
      document.getElementById('article-title-input').value = post.title || '';
      document.getElementById('article-subtitle-input').value = post.subtitle || '';
      document.getElementById('article-category-input').value = post.category || 'Tech';
      document.getElementById('article-cover-input').value = post.coverImage || '';
      document.getElementById('article-body-input').value = post.fullContent || post.content || '';

      const modalTitle = document.querySelector('#write-article-modal .modal-header-title');
      const submitBtn = this.articleForm ? this.articleForm.querySelector('button[type="submit"]') : null;
      if (modalTitle) modalTitle.textContent = 'Edit Article';
      if (submitBtn) submitBtn.textContent = 'Save Changes';

      this.openModal(this.writeArticleModal);
    }
  }

  async updatePost(postId, updates) {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: 'PUT',
        headers: this.authHeaders(),
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const post = this.posts.find(p => p.id === postId);
        if (post) {
          Object.assign(post, updates);
          if (data.post) Object.assign(post, data.post);
          this.saveLocalPosts();
          this.refresh();
        }
        this.showToast('Post updated successfully!');
      } else {
        this.showToast(data.message || 'Could not update post.');
      }
    } catch (e) {
      this.showToast('Network error while updating post.');
    }
  }

  async handleCreateImagePost() {
    if (!this.requireLogin('Please log in to share a photo post!')) return;

    const imageUrl = (this.photoUrlInput ? this.photoUrlInput.value : '').trim();
    const caption = (this.photoCaptionInput ? this.photoCaptionInput.value : '').trim();
    const category = this.photoCategory ? this.photoCategory.value : 'Visual';

    if (!imageUrl) {
      this.showToast('Please paste a valid Image URL!');
      return;
    }

    const payload = {
      imageUrl,
      caption,
      category,
      authorName: this.currentUser.name,
      authorHandle: this.currentUser.handle,
      authorAvatar: this.currentUser.avatar
    };

    let newImagePost = {
      id: 'image_' + Date.now(),
      type: 'image',
      author_id: this.currentUser.id,
      author: this.currentUser.name,
      handle: this.currentUser.handle,
      avatar: this.currentUser.avatar,
      timestamp: 'Just now',
      content: caption,
      coverImage: imageUrl,
      category: category,
      likes: 0,
      likedByUser: false,
      bookmarks: 0,
      bookmarkedByUser: false,
      comments: []
    };

    const photoBtn = this.btnPublishPhoto;
    if (photoBtn) {
      photoBtn.disabled = true;
      photoBtn.style.opacity = '0.7';
      photoBtn.innerHTML = '<span>Publishing...</span>';
    }

    try {
      if (window.location.origin.startsWith('http')) {
        try {
          const res = await fetch('/api/posts/image', {
            method: 'POST',
            headers: this.authHeaders(),
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            const data = await res.json();
            if (data.post) newImagePost = data.post;
          }
        } catch (e) {
          console.log('Offline image post save');
        }
      }

      this.posts.unshift(newImagePost);
      this.saveLocalPosts();
      if (this.photoUrlInput) this.photoUrlInput.value = '';
      if (this.photoCaptionInput) this.photoCaptionInput.value = '';
      if (this.photoPreviewBox) this.photoPreviewBox.style.display = 'none';
      const photoCounter = document.getElementById('photo-char-count');
      if (photoCounter) photoCounter.textContent = '0 / 280';
      this.refresh();
      this.showToast('📸 Photo post shared to Readora!');
    } finally {
      if (photoBtn) {
        photoBtn.disabled = false;
        photoBtn.style.opacity = '1';
        photoBtn.innerHTML = '<span>Share Photo</span>';
      }
    }
  }

  async loadNotifications() {
    if (!this.token) return;
    try {
      const res = await fetch('/api/posts/notifications/list', { headers: this.authHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const badges = [
            document.getElementById('notif-badge'),
            document.getElementById('nav-notif-badge'),
            document.getElementById('mob-notif-badge')
          ];
          badges.forEach(badge => {
            if (!badge) return;
            if (data.unreadCount > 0) {
              badge.textContent = data.unreadCount > 99 ? '99+' : data.unreadCount;
              badge.style.display = 'inline-flex';
            } else {
              badge.style.display = 'none';
            }
          });
          this.notifications = data.notifications || [];
          this.renderNotificationsList();
        }
      }
    } catch (e) {
      console.log('Error fetching notifications:', e);
    }
  }

  renderNotificationsList() {
    const container = document.getElementById('notifications-list');
    if (!container) return;
    if (!this.notifications || this.notifications.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 2.5rem 1rem; color: var(--text-dim); font-size: 0.9rem;">
          No notifications yet. When people like, comment, or follow you, they will appear here!
        </div>`;
      return;
    }
    container.innerHTML = this.notifications.map(n => {
      let icon = '🔔';
      if (n.type === 'like') icon = '❤️';
      else if (n.type === 'comment') icon = '💬';
      else if (n.type === 'follow') icon = '👥';

      return `
        <div class="notif-item ${n.is_read ? '' : 'unread'}">
          <div class="notif-icon-circle">${icon}</div>
          <div class="notif-text">
            <strong>${esc(n.actor_name)}</strong> ${esc(n.message.replace(n.actor_name, '').trim())}
            <div class="notif-time">${esc(n.created_at ? new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Recently')}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  async markAllNotificationsRead() {
    if (!this.token) return;
    try {
      await fetch('/api/posts/notifications/read-all', { method: 'POST', headers: this.authHeaders() });
      const badge = document.getElementById('notif-badge');
      if (badge) badge.style.display = 'none';
      if (this.notifications) {
        this.notifications.forEach(n => n.is_read = 1);
        this.renderNotificationsList();
      }
    } catch (e) {}
  }

  async toggleLike(postId) {
    if (!this.requireLogin('Please log in to like posts!')) return;
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    const prevLiked = post.likedByUser;
    const prevLikes = post.likes;

    // Optimistic UI update
    if (post.likedByUser) {
      post.likes = Math.max(0, post.likes - 1);
      post.likedByUser = false;
    } else {
      post.likes++;
      post.likedByUser = true;
    }
    this.saveLocalPosts();
    this.refresh();

    if (window.location.origin.startsWith('http')) {
      try {
        const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST', headers: this.authHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          if (typeof data.likes === 'number') post.likes = data.likes;
          if (typeof data.liked === 'boolean') post.likedByUser = data.liked;
          this.saveLocalPosts();
          this.refresh();
        } else {
          // Revert if unauthorized or failed
          post.likedByUser = prevLiked;
          post.likes = prevLikes;
          this.saveLocalPosts();
          this.refresh();
          this.showToast(data.message || 'Unable to update like.');
        }
      } catch (e) {
        post.likedByUser = prevLiked;
        post.likes = prevLikes;
        this.saveLocalPosts();
        this.refresh();
      }
    }
  }

  async toggleBookmark(postId) {
    if (!this.requireLogin('Please log in to bookmark posts!')) return;
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    const prevSaved = post.bookmarkedByUser;
    const prevBookmarks = post.bookmarks || 0;

    // Optimistic UI update
    if (post.bookmarkedByUser) {
      post.bookmarks = Math.max(0, (post.bookmarks || 1) - 1);
      post.bookmarkedByUser = false;
      this.showToast('Removed from bookmarks');
    } else {
      post.bookmarks = (post.bookmarks || 0) + 1;
      post.bookmarkedByUser = true;
      this.showToast('🔖 Saved to your bookmarks!');
    }
    this.saveLocalPosts();
    this.refresh();

    if (window.location.origin.startsWith('http')) {
      try {
        const res = await fetch(`/api/posts/${postId}/bookmark`, { method: 'POST', headers: this.authHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          if (typeof data.bookmarks === 'number') post.bookmarks = data.bookmarks;
          if (typeof data.saved === 'boolean') post.bookmarkedByUser = data.saved;
          this.saveLocalPosts();
          this.refresh();
        } else {
          post.bookmarkedByUser = prevSaved;
          post.bookmarks = prevBookmarks;
          this.saveLocalPosts();
          this.refresh();
          this.showToast(data.message || 'Unable to update bookmark.');
        }
      } catch (e) {
        post.bookmarkedByUser = prevSaved;
        post.bookmarks = prevBookmarks;
        this.saveLocalPosts();
        this.refresh();
      }
    }
  }

  toggleComments(postId, drawer) {
    if (!drawer) return;
    const show = drawer.style.display === 'none';
    drawer.style.display = show ? 'block' : 'none';
    if (show) this.openComments.add(postId);
    else this.openComments.delete(postId);
  }

  async addComment(postId, inputEl) {
    if (!this.requireLogin('Please log in to comment!')) return;

    const text = inputEl.value.trim();
    if (!text) return;

    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    inputEl.value = '';

    if (window.location.origin.startsWith('http')) {
      try {
        const res = await fetch(`/api/posts/${postId}/comment`, {
          method: 'POST',
          headers: this.authHeaders(),
          body: JSON.stringify({ text, authorName: this.currentUser.name })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          post.comments = post.comments || [];
          post.comments.push(data.comment || {
            id: 'c_' + Date.now(),
            author: this.currentUser.name,
            author_id: this.currentUser.id,
            text: text,
            created_at: new Date().toISOString()
          });
          this.openComments.add(postId);
          this.saveLocalPosts();
          this.refresh();
          this.showToast('Comment posted!');
        } else {
          this.showToast(data.message || 'Failed to post comment.');
        }
      } catch (e) {
        this.showToast('Network error posting comment.');
      }
    } else {
      post.comments = post.comments || [];
      post.comments.push({
        id: 'c_' + Date.now(),
        author: this.currentUser.name,
        author_id: this.currentUser.id,
        text: text,
        created_at: new Date().toISOString()
      });
      this.openComments.add(postId);
      this.saveLocalPosts();
      this.refresh();
    }
  }

  async deleteComment(postId, commentId) {
    if (!this.requireLogin('Please log in to delete comments.')) return;
    if (!confirm('Delete this comment?')) return;

    if (window.location.origin.startsWith('http')) {
      try {
        const res = await fetch(`/api/posts/comments/${commentId}`, {
          method: 'DELETE',
          headers: this.authHeaders()
        });
        const data = await res.json();
        if (!res.ok) {
          this.showToast(data.message || 'Failed to delete comment.');
          return;
        }
      } catch (e) {
        this.showToast('Network error deleting comment.');
        return;
      }
    }

    const post = this.posts.find(p => p.id === postId);
    if (post && post.comments) {
      post.comments = post.comments.filter(c => String(c.id) !== String(commentId));
      this.saveLocalPosts();
      this.refresh();
    }
    this.showToast('Comment deleted');
  }

  sharePost(post) {
    const title = post.type === 'thought' ? post.content : post.title;
    const permalink = `${window.location.origin}${window.location.pathname}#/${post.type === 'thought' ? 'post' : 'article'}/${post.id}`;
    if (navigator.share) {
      navigator.share({
        title: 'Readora - ' + post.author,
        text: title,
        url: permalink
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`"${title}" — by ${post.author} on Readora (${permalink})`);
      this.showToast('🔗 Permanent article link copied to clipboard!');
    }
  }

  async openFullArticle(postId, updateHash = true) {
    let post = this.posts.find(p => p.id === postId);
    let related = [];

    // If post not present in client memory, or to fetch authoritative related/view data
    if (window.location.origin.startsWith('http')) {
      try {
        const res = await fetch(`${this.apiBase}/api/posts/single/${postId}`, { headers: this.authHeaders() });
        const data = await res.json();
        if (res.ok && data.success && data.post) {
          post = data.post;
          related = data.related || [];
          if (!this.posts.some(p => p.id === post.id)) {
            this.posts.unshift(post);
          }
        }
      } catch (e) {}

      // Track view deduplicated
      fetch(`${this.apiBase}/api/posts/${postId}/view`, { method: 'POST', headers: this.authHeaders() }).catch(() => {});
    }

    if (!post) {
      this.showToast('Article not found.');
      return;
    }

    // Save to reading history
    try {
      const hist = JSON.parse(localStorage.getItem('readora_reading_history') || '[]');
      const idx = hist.findIndex(h => h.id === post.id);
      if (idx !== -1) hist.splice(idx, 1);
      hist.unshift({
        id: post.id,
        title: post.title,
        author: post.author,
        category: post.category,
        readTime: post.readTime,
        timestamp: Date.now()
      });
      if (hist.length > 50) hist.pop();
      localStorage.setItem('readora_reading_history', JSON.stringify(hist));
    } catch (e) {}

    if (updateHash && window.location.hash !== `#/article/${postId}`) {
      window.location.hash = `#/article/${postId}`;
    }

    const contentBox = document.getElementById('read-article-container');
    if (!contentBox) return;

    // Reset and attach scroll listener to reading progress bar
    const bar = document.getElementById('reading-progress-bar');
    if (bar) bar.style.width = '0%';
    contentBox.scrollTop = 0;

    contentBox.onscroll = () => {
      if (!bar) return;
      const maxScroll = contentBox.scrollHeight - contentBox.clientHeight;
      if (maxScroll > 0) {
        const progress = (contentBox.scrollTop / maxScroll) * 100;
        bar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
      }
    };

    const cover = safeUrl(post.coverImage);
    const catClass = this.getCategoryClass(post.category);
    const initials = post.avatar || (post.author ? post.author.substring(0, 2).toUpperCase() : 'CR');

    contentBox.innerHTML = `
      <div style="margin-bottom: 1.5rem;">
        <span class="card-tag ${catClass}" style="margin-bottom: 0.5rem; display: inline-block;">${esc(post.category || 'Article')}</span>
        <h1 style="font-family: var(--font-brand); font-size: 2.1rem; font-weight: 800; color: var(--text-main); line-height: 1.25; margin-bottom: 0.6rem;">${esc(post.title)}</h1>
        ${post.subtitle ? `<p style="font-size: 1.15rem; color: var(--text-dim); margin-bottom: 1.1rem; line-height: 1.5;">${esc(post.subtitle)}</p>` : ''}

        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
          <a class="author-link" href="${profileLink(post.handle)}" style="display: flex; align-items: center; gap: 0.75rem; text-decoration: none;">
            <div class="author-avatar">${esc(initials)}</div>
            <div>
              <div class="author-name" style="font-weight: 700; color: var(--text-main);">${esc(post.author)}</div>
              <div style="font-size: 0.8rem; color: var(--text-dim);">${esc(post.timestamp || 'Recently')} • ${esc(post.readTime || '3 min read')} • 👁️ ${esc(post.views || 0)} views</div>
            </div>
          </a>
        </div>
      </div>

      ${cover ? `<img src="${esc(cover)}" alt="Cover" style="width: 100%; max-height: 380px; object-fit: cover; border-radius: var(--radius-md); margin-bottom: 1.75rem;" onerror="this.style.display='none';" />` : ''}

      <div style="font-family: var(--font-serif); font-size: 1.15rem; line-height: 1.85; color: var(--text-main); margin-bottom: 2rem;">
        ${renderSafeMarkdown(post.fullContent || post.content || post.excerpt)}
      </div>

      <!-- Action bar inside article modal -->
      <div class="card-actions-bar" style="margin-top: 1.5rem; padding: 0.75rem 0; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">
        <div class="action-buttons-group">
          <button class="card-action-btn btn-like ${post.likedByUser ? 'liked' : ''}" data-id="${esc(post.id)}" title="Like">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${post.likedByUser ? '#ef4444' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            <span>${esc(post.likes || 0)}</span>
          </button>
          <button class="card-action-btn btn-share" data-id="${esc(post.id)}" title="Share Article">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          </button>
        </div>
        <button class="card-action-btn btn-bookmark ${post.bookmarkedByUser ? 'bookmarked' : ''}" data-id="${esc(post.id)}" title="Save">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${post.bookmarkedByUser ? '#f59e0b' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        </button>
      </div>

      <!-- About the Author Box -->
      <div style="background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-top: 2rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.85rem;">
          <div class="author-avatar" style="width: 48px; height: 48px; font-size: 1.2rem;">${esc(initials)}</div>
          <div>
            <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">Written by ${esc(post.author)}</div>
            <div style="font-size: 0.82rem; color: var(--text-dim);">${esc(post.handle)}</div>
          </div>
        </div>
        <a href="${profileLink(post.handle)}" class="btn-dash-action" style="text-decoration:none;">View Profile ➔</a>
      </div>

      <!-- Related Reads -->
      ${related && related.length > 0 ? `
        <div class="related-articles-section">
          <div class="related-articles-title">Related Stories & Insights</div>
          <div class="related-articles-grid">
            ${related.map(rel => `
              <div class="related-article-card" data-rel-id="${esc(rel.id)}">
                <span class="card-tag ${this.getCategoryClass(rel.category)}" style="margin-bottom: 0.35rem;">${esc(rel.category || 'Article')}</span>
                <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem; margin-bottom: 0.35rem; line-height: 1.3;">${esc(rel.title)}</div>
                <div style="font-size: 0.78rem; color: var(--text-dim);">${esc(rel.author)} • ${esc(rel.readTime || '3 min read')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Wire actions inside the article modal
    const likeBtn = contentBox.querySelector('.btn-like');
    if (likeBtn) likeBtn.addEventListener('click', () => this.toggleLike(post.id));
    const bmBtn = contentBox.querySelector('.btn-bookmark');
    if (bmBtn) bmBtn.addEventListener('click', () => this.toggleBookmark(post.id));
    const shareBtn = contentBox.querySelector('.btn-share');
    if (shareBtn) shareBtn.addEventListener('click', () => this.sharePost(post));

    contentBox.querySelectorAll('.related-article-card').forEach(card => {
      card.addEventListener('click', () => {
        this.openFullArticle(card.dataset.relId);
      });
    });

    this.openModal(this.readArticleModal);
  }

  openArticleStudio(initialData = null) {
    if (!this.requireLogin('Please log in to write an article!')) return;

    const modal = this.writeArticleModal;
    if (!modal) return;

    const titleInput = document.getElementById('article-title-input');
    const subtitleInput = document.getElementById('article-subtitle-input');
    const catInput = document.getElementById('article-category-input');
    const coverInput = document.getElementById('article-cover-input');
    const bodyInput = document.getElementById('article-body-input');
    const editIdInput = document.getElementById('editing-article-id');
    const draftStatus = document.getElementById('article-draft-status');

    if (initialData) {
      if (titleInput) titleInput.value = initialData.title || '';
      if (subtitleInput) subtitleInput.value = initialData.subtitle || '';
      if (catInput) catInput.value = initialData.category || 'Technology';
      if (coverInput) coverInput.value = initialData.coverImage || '';
      if (bodyInput) bodyInput.value = initialData.content || '';
      if (editIdInput) editIdInput.value = initialData.id || '';
    } else {
      if (editIdInput) editIdInput.value = '';
      // Check for saved draft on backend
      fetch(`${this.apiBase}/api/posts/draft`, { headers: this.authHeaders() })
        .then(r => r.json())
        .then(d => {
          if (d.success && d.draft && (d.draft.title || d.draft.content)) {
            if (titleInput && !titleInput.value) titleInput.value = d.draft.title || '';
            if (subtitleInput && !subtitleInput.value) subtitleInput.value = d.draft.subtitle || '';
            if (catInput && d.draft.category) catInput.value = d.draft.category;
            if (coverInput && !coverInput.value) coverInput.value = d.draft.cover_image || '';
            if (bodyInput && !bodyInput.value) bodyInput.value = d.draft.content || '';
            if (draftStatus) {
              draftStatus.textContent = 'Draft restored';
              draftStatus.style.display = 'inline-flex';
            }
            this.updateArticleMetaStats();
          }
        })
        .catch(() => {});
    }

    this.updateArticleMetaStats();
    this.setEditorMode('write');
    this.openModal(modal);
  }

  setEditorMode(mode) {
    const writeBtn = document.getElementById('editor-tab-write');
    const prevBtn = document.getElementById('editor-tab-preview');
    const writePane = document.getElementById('editor-write-pane');
    const prevPane = document.getElementById('editor-preview-pane');

    if (writeBtn) writeBtn.classList.toggle('active', mode === 'write');
    if (prevBtn) prevBtn.classList.toggle('active', mode === 'preview');

    if (mode === 'preview') {
      if (writePane) writePane.style.display = 'none';
      if (prevPane) {
        prevPane.style.display = 'block';
        const title = (document.getElementById('article-title-input')?.value || 'Untitled Article').trim();
        const subtitle = (document.getElementById('article-subtitle-input')?.value || '').trim();
        const cover = (document.getElementById('article-cover-input')?.value || '').trim();
        const category = document.getElementById('article-category-input')?.value || 'General';
        const content = document.getElementById('article-body-input')?.value || '';

        prevPane.innerHTML = `
          <div style="margin-bottom: 1.25rem;">
            <span class="card-tag ${this.getCategoryClass(category)}" style="margin-bottom: 0.5rem; display: inline-block;">${esc(category)}</span>
            <h1 style="font-family: var(--font-brand); font-size: 1.85rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.35rem;">${esc(title)}</h1>
            ${subtitle ? `<p style="font-size: 1.05rem; color: var(--text-dim); margin-bottom: 0.75rem;">${esc(subtitle)}</p>` : ''}
          </div>
          ${cover ? `<img src="${esc(cover)}" alt="Cover" style="width:100%; max-height:280px; object-fit:cover; border-radius:var(--radius-md); margin-bottom:1.5rem;" />` : ''}
          <div style="font-family:var(--font-serif); font-size:1.1rem; line-height:1.8; color:var(--text-main);">
            ${renderSafeMarkdown(content)}
          </div>
        `;
      }
    } else {
      if (writePane) writePane.style.display = 'block';
      if (prevPane) prevPane.style.display = 'none';
    }
  }

  updateArticleMetaStats() {
    const body = document.getElementById('article-body-input');
    const countEl = document.getElementById('article-word-count');
    const timeEl = document.getElementById('article-read-time');
    if (!body || !countEl || !timeEl) return;

    const text = body.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    const readTime = Math.max(1, Math.ceil(words / 180));

    countEl.textContent = `${words} words • ${chars} characters`;
    timeEl.textContent = `~${readTime} min read`;
  }

  applyFormatToArticle(format) {
    const textarea = document.getElementById('article-body-input');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    let replacement = '';

    switch (format) {
      case 'bold':
        replacement = `**${selected || 'bold text'}**`;
        break;
      case 'italic':
        replacement = `*${selected || 'italic text'}*`;
        break;
      case 'h2':
        replacement = `\n## ${selected || 'Heading 2'}\n`;
        break;
      case 'h3':
        replacement = `\n### ${selected || 'Heading 3'}\n`;
        break;
      case 'quote':
        replacement = `\n> ${selected || 'Quotation text'}\n`;
        break;
      case 'bullet':
        replacement = `\n- ${selected || 'List item'}\n`;
        break;
      case 'numbered':
        replacement = `\n1. ${selected || 'List item'}\n`;
        break;
      case 'link':
        replacement = `[${selected || 'link text'}](https://example.com)`;
        break;
      case 'code':
        replacement = `\`${selected || 'code snippet'}\``;
        break;
      default:
        return;
    }

    textarea.setRangeText(replacement, start, end, 'select');
    textarea.focus();
    this.updateArticleMetaStats();
  }

  async saveArticleDraft() {
    if (!this.token) return;
    const title = document.getElementById('article-title-input')?.value || '';
    const subtitle = document.getElementById('article-subtitle-input')?.value || '';
    const category = document.getElementById('article-category-input')?.value || 'General';
    const coverImage = document.getElementById('article-cover-input')?.value || '';
    const content = document.getElementById('article-body-input')?.value || '';

    if (!title.trim() && !content.trim()) return;

    try {
      const res = await fetch(`${this.apiBase}/api/posts/draft`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({ title, subtitle, category, coverImage, content })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const pill = document.getElementById('article-draft-status');
        if (pill) {
          pill.textContent = 'Draft saved at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          pill.style.display = 'inline-flex';
        }
      }
    } catch (e) {}
  }

  async loadNotifications() {
    if (!this.token) return;
    try {
      const res = await fetch(`${this.apiBase}/api/posts/notifications`, { headers: this.authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) return;

      const listEl = document.getElementById('notifications-list');
      const badgeEl = document.getElementById('nav-notif-badge');
      if (badgeEl) {
        if (data.unreadCount > 0) {
          badgeEl.textContent = data.unreadCount;
          badgeEl.style.display = 'inline-block';
        } else {
          badgeEl.style.display = 'none';
        }
      }

      if (listEl && data.notifications) {
        if (data.notifications.length === 0) {
          listEl.innerHTML = '<div style="text-align:center; padding: 2rem 0; color: var(--text-dim); font-size: 0.9rem;">No notifications yet. When people like, comment, or follow you, they will appear here!</div>';
          return;
        }

        listEl.innerHTML = data.notifications.map(n => `
          <div class="notification-item ${n.is_read ? '' : 'unread'}" style="display:flex; align-items:center; gap:0.75rem; padding:0.75rem; border-bottom:1px solid var(--border-color); cursor:pointer;" data-post-id="${esc(n.post_id || '')}">
            <div class="author-avatar" style="width:36px; height:36px; font-size:0.85rem;">${esc(n.actor_avatar || 'CR')}</div>
            <div style="flex:1;">
              <div style="font-size:0.88rem; color:var(--text-main); font-weight:600;">${esc(n.message)}</div>
              <div style="font-size:0.75rem; color:var(--text-dim);">${esc(n.created_at || 'Recently')}</div>
            </div>
          </div>
        `).join('');

        listEl.querySelectorAll('.notification-item').forEach(item => {
          item.addEventListener('click', () => {
            if (item.dataset.postId) {
              this.notificationsModal.classList.remove('active');
              this.openFullArticle(item.dataset.postId);
            }
          });
        });
      }
    } catch (e) {}
  }

  openModal(modal) {
    if (modal) {
      modal.classList.add('active');
    }
  }

  showToast(message) {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 3000);
  }

  // Re-draw whichever lists are currently on screen
  refresh() {
    this.render();
    if (this.isProfileActive()) this.renderProfilePosts();
    if (this.route && this.route.name === 'explore') this.renderExploreGrid();
  }

  render() {
    if (!this.postsContainer) return;

    let filtered = this.posts.filter(post => {
      if (this.currentFilter === 'thoughts' && post.type !== 'thought') return false;
      if (this.currentFilter === 'articles' && post.type !== 'article') return false;
      if (this.currentFilter === 'images' && post.type !== 'image') return false;
      if (this.currentFilter === 'saved' && !post.bookmarkedByUser) return false;
      if (this.currentFilter === 'following' && !(this.followingIds && this.followingIds.has(post.id))) return false;
      if (['tech', 'philosophy', 'creative', 'stories'].includes(this.currentFilter.toLowerCase())) {
        if ((post.category || '').toLowerCase() !== this.currentFilter.toLowerCase()) return false;
      }

      if (this.activeSearchQuery) {
        const q = this.activeSearchQuery;
        const matchAuthor = (post.author || '').toLowerCase().includes(q) || (post.handle || '').toLowerCase().includes(q);
        const matchContent = (post.content || '').toLowerCase().includes(q) || (post.title || '').toLowerCase().includes(q) || (post.excerpt || '').toLowerCase().includes(q);
        const matchCategory = (post.category || '').toLowerCase().includes(q);
        if (!matchAuthor && !matchContent && !matchCategory) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      let icon = '✍️';
      let title = 'No posts found';
      let text = 'Try selecting a different filter or be the first to share your thoughts!';
      if (this.currentFilter === 'following') {
        icon = '👥';
        title = this.token ? 'Your Following feed is empty' : 'Log in to see your Following feed';
        text = this.token
          ? 'Follow creators from the Featured Creators list or from their profile pages, and their posts will show up here.'
          : 'Posts from the creators you follow will appear here once you log in.';
      } else if (this.currentFilter === 'saved') {
        icon = '🔖';
        title = 'No saved posts yet';
        text = 'Tap the bookmark on any post to keep it here.';
      }
      this.postsContainer.innerHTML = `
        <div style="text-align: center; padding: 4rem 1rem; background: var(--bg-card); border: 1px solid var(--border-glass); border-radius: var(--radius-lg);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">${icon}</div>
          <h3 style="color: #fff; font-size: 1.25rem; margin-bottom: 0.35rem;">${title}</h3>
          <p style="color: var(--text-dim); font-size: 0.9rem;">${text}</p>
        </div>
      `;
      return;
    }

    this.postsContainer.innerHTML = filtered.map(post => this.renderPostCard(post)).join('');
    this.attachCardEventListeners(this.postsContainer);
  }

  async deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) return;

    if (window.location.origin.startsWith('http')) {
      try {
        const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE', headers: this.authHeaders() });
        const data = await res.json();

        if (!res.ok) {
          this.showToast(data.message || 'Failed to delete post.');
          return;
        }
      } catch (e) {
        console.log('Error syncing post deletion with server:', e);
      }
    }

    this.posts = this.posts.filter(p => p.id !== postId);
    this.saveLocalPosts();
    this.refresh();
    this.showToast('🗑️ Post deleted successfully!');
    if (this.isProfileActive() && this.profile) this.loadProfile(this.profile.handle, true);
  }

  isPostAuthor(post) {
    if (!this.currentUser) return false;
    return (post.author_id && post.author_id === this.currentUser.id) ||
           (post.handle && this.currentUser.handle && post.handle.toLowerCase() === this.currentUser.handle.toLowerCase());
  }

  // ---------- Post cards ----------

  renderPostCard(post) {
    if (post.type === 'thought') return this.renderThoughtCard(post);
    if (post.type === 'image') return this.renderImageCard(post);
    return this.renderArticleCard(post);
  }

  getCategoryClass(category) {
    const c = String(category || '').toLowerCase();
    if (c.includes('tech')) return 'card-tag-tech';
    if (c.includes('code') || c.includes('program')) return 'card-tag-code';
    if (c.includes('ai') || c.includes('intelligence')) return 'card-tag-ai';
    if (c.includes('product') || c.includes('life')) return 'card-tag-productivity';
    if (c.includes('career') || c.includes('job')) return 'card-tag-career';
    if (c.includes('science') || c.includes('philo')) return 'card-tag-science';
    return 'card-tag-general';
  }

  renderCardHeader(post, metaExtra, deleteTitle) {
    const isOwner = this.isPostAuthor(post);
    const catClass = this.getCategoryClass(post.category);
    const initials = post.avatar || (post.author ? post.author.substring(0, 2).toUpperCase() : 'CR');
    const authorBlock = `
      <div class="author-avatar">${esc(initials)}</div>
      <div>
        <div class="author-name">${esc(post.author)}</div>
        <div class="post-meta">${esc(post.handle)} • ${esc(post.timestamp || 'Recently')}${metaExtra}</div>
      </div>`;
    return `
      <div class="card-header">
        ${post.handle
          ? `<a class="card-author-info author-link" href="${profileLink(post.handle)}">${authorBlock}</a>`
          : `<div class="card-author-info">${authorBlock}</div>`}
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="card-tag ${catClass}">${esc(post.category || 'General')}</span>
          ${isOwner ? `
            <button class="btn-edit-post" data-id="${esc(post.id)}" title="Edit Post" style="background: transparent; border: 1px solid var(--border-default); color: var(--text-dim); cursor: pointer; padding: 0.25rem 0.45rem; border-radius: var(--radius-sm); display: inline-flex; align-items: center; justify-content: center; transition: all var(--transition-fast);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn-delete-post" data-id="${esc(post.id)}" title="${deleteTitle}" style="background: transparent; border: 1px solid var(--border-default); color: var(--text-dim); cursor: pointer; padding: 0.25rem 0.45rem; border-radius: var(--radius-sm); display: inline-flex; align-items: center; justify-content: center; transition: all var(--transition-fast);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          ` : ''}
        </div>
      </div>`;
  }

  renderActionBar(post) {
    const id = esc(post.id);
    return `
      <div class="card-actions-bar">
        <div class="action-buttons-group">
          <button class="card-action-btn btn-like ${post.likedByUser ? 'liked' : ''}" data-id="${id}" title="Like">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${post.likedByUser ? '#ef4444' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            <span>${esc(post.likes)}</span>
          </button>

          <button class="card-action-btn btn-comment-toggle" data-id="${id}" title="Comments">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <span>${post.comments ? post.comments.length : 0}</span>
          </button>

          <button class="card-action-btn btn-share" data-id="${id}" title="Share Post">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          </button>
        </div>

        <button class="card-action-btn btn-bookmark ${post.bookmarkedByUser ? 'bookmarked' : ''}" data-id="${id}" title="Save">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${post.bookmarkedByUser ? '#f59e0b' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        </button>
      </div>`;
  }

  renderCommentsDrawer(post) {
    const id = esc(post.id);
    const isPostOwner = this.isPostAuthor(post);
    return `
      <div class="comments-drawer" style="display: ${this.openComments.has(post.id) ? 'block' : 'none'};">
        <div class="comments-list">
          ${(post.comments || []).map(c => {
            const canDelete = this.currentUser && (
              isPostOwner ||
              (c.author_id && c.author_id === this.currentUser.id) ||
              (c.user_id && c.user_id === this.currentUser.id) ||
              (c.author && this.currentUser.name && c.author === this.currentUser.name)
            );
            return `
            <div class="comment-item" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.35rem 0;">
              <div style="flex: 1; font-size: 0.88rem;">
                <span class="comment-author" style="font-weight: 600; color: var(--text-main);">${esc(c.author || c.name || 'User')}:</span>
                <span class="comment-body" style="color: var(--text-muted); margin-left: 0.25rem;">${esc(c.text)}</span>
              </div>
              ${canDelete && c.id ? `
                <button class="btn-delete-comment" data-post-id="${id}" data-comment-id="${esc(c.id)}" title="Delete comment" style="background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 0 4px; font-size: 1.1rem; line-height: 1;">&times;</button>
              ` : ''}
            </div>
          `;
          }).join('')}
        </div>
        <div class="comment-input-row">
          <input type="text" placeholder="Add a comment..." class="input-comment" data-id="${id}">
          <button class="btn-submit-comment" data-id="${id}">Post</button>
        </div>
      </div>`;
  }

  renderThoughtCard(post) {
    return `
      <article class="thought-card" data-id="${esc(post.id)}">
        ${this.renderCardHeader(post, '', 'Delete Thought')}

        <div class="thought-canvas">
          <p class="thought-text">${esc(post.content)}</p>
        </div>

        ${this.renderActionBar(post)}
        ${this.renderCommentsDrawer(post)}
      </article>
    `;
  }

  renderImageCard(post) {
    const cover = safeUrl(post.coverImage);
    return `
      <article class="thought-card" data-id="${esc(post.id)}">
        ${this.renderCardHeader(post, '', 'Delete Photo')}

        <div class="photo-post-media">
          ${cover ? `<img src="${esc(cover)}" class="photo-card-img" alt="Photo" loading="lazy" onerror="this.onerror=null; this.style.display='none';" />` : ''}
        </div>
        ${post.content ? `<div class="photo-post-caption"><span class="photo-caption-author">${esc(post.author)}</span> ${esc(post.content)}</div>` : ''}

        ${this.renderActionBar(post)}
        ${this.renderCommentsDrawer(post)}
      </article>
    `;
  }

  renderArticleCard(post) {
    const cover = safeUrl(post.coverImage);
    return `
      <article class="thought-card article-card" data-id="${esc(post.id)}">
        <div style="padding: 0 0 0.5rem 0;">
          <div class="article-badge-row">
            <span>📖 In-Depth Read</span>
            <span>•</span>
            <span>${esc(post.readTime || '3 min read')}</span>
          </div>
        </div>

        ${this.renderCardHeader(post, '', 'Delete Article')}

        <div class="article-content-body">
          ${cover ? `<img src="${esc(cover)}" class="article-card-cover" alt="Article Cover" loading="lazy" onerror="this.onerror=null; this.style.display='none';" />` : ''}
          <h2 class="article-title">${esc(post.title)}</h2>
          ${post.subtitle ? `<div class="article-subtitle" style="font-size: 0.95rem; color: var(--text-dim); margin-bottom: 0.75rem; font-style: italic;">${esc(post.subtitle)}</div>` : ''}
          <p class="article-excerpt">${esc(post.excerpt)}</p>
          <div class="read-more-btn btn-read-article" data-id="${esc(post.id)}">
            Read Full Article ➔
          </div>
        </div>

        ${this.renderActionBar(post)}
        ${this.renderCommentsDrawer(post)}
      </article>
    `;
  }

  // Buttons are wired inside the given list only, so the feed and a profile list never interfere
  attachCardEventListeners(root) {
    root = root || document;

    root.querySelectorAll('.btn-like').forEach(btn => {
      btn.addEventListener('click', () => this.toggleLike(btn.dataset.id));
    });

    root.querySelectorAll('.btn-bookmark').forEach(btn => {
      btn.addEventListener('click', () => this.toggleBookmark(btn.dataset.id));
    });

    root.querySelectorAll('.btn-edit-post').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditPost(btn.dataset.id);
      });
    });

    root.querySelectorAll('.btn-delete-post').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePost(btn.dataset.id);
      });
    });

    root.querySelectorAll('.btn-delete-comment').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteComment(btn.dataset.postId, btn.dataset.commentId);
      });
    });

    root.querySelectorAll('.btn-comment-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const drawer = btn.closest('.thought-card').querySelector('.comments-drawer');
        this.toggleComments(btn.dataset.id, drawer);
      });
    });

    root.querySelectorAll('.btn-submit-comment').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.closest('.comments-drawer').querySelector('.input-comment');
        if (input) this.addComment(btn.dataset.id, input);
      });
    });

    root.querySelectorAll('.input-comment').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.addComment(input.dataset.id, input);
      });
    });

    root.querySelectorAll('.btn-share').forEach(btn => {
      btn.addEventListener('click', () => {
        const post = this.posts.find(p => p.id === btn.dataset.id);
        if (post) this.sharePost(post);
      });
    });

    root.querySelectorAll('.btn-read-article').forEach(btn => {
      btn.addEventListener('click', () => this.openFullArticle(btn.dataset.id));
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.readora = new ReadoraApp();
});


/* ═══════════════════════════════════════════════════════════
   READORA × Gemini AI — Frontend Module
   Handles: Writing Assistant, Auto-Summarize, Category Suggester,
            Chat Bot, Semantic Search
═══════════════════════════════════════════════════════════ */

class ReadoraAI {
  constructor() {
    this.chatHistory = [];
    this.chatOpen = false;
    this.isTyping = false;
    this._bindAll();
    window.readoraAI = this;
  }

  get apiBase() {
    return window.location.protocol === 'file:' ? 'http://localhost:5000' : '';
  }

  // ── Internal: call an AI endpoint ──────────────────────────────────
  async _aiCall(endpoint, body) {
    const res = await fetch(`${this.apiBase}/api/ai/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'AI request failed');
    return data;
  }

  // ── Shared: show/hide status text ──────────────────────────────────
  _setStatus(el, msg, isError = false) {
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'flex' : 'none';
    el.style.color = isError ? '#f87171' : '#fbbf24';
  }

  // ─────────────────────────────────────────────────────────────────
  // 1. AI WRITING ASSISTANT — Thought Composer
  // ─────────────────────────────────────────────────────────────────
  async improveThought() {
    const input = document.getElementById('quick-thought-text');
    const btn = document.getElementById('btn-ai-improve-thought');
    const status = document.getElementById('ai-thought-status');
    if (!input || !input.value.trim()) {
      this._setStatus(status, '⚠️ Write something first!', true);
      return;
    }
    btn.disabled = true;
    this._setStatus(status, '✨ AI is improving your thought...');
    try {
      const data = await this._aiCall('improve', { text: input.value, type: 'thought' });
      input.value = data.improved;
      this._setStatus(status, '✅ Improved! Feel free to edit further.');
      setTimeout(() => this._setStatus(status, ''), 4000);
    } catch (e) {
      this._setStatus(status, '❌ ' + e.message, true);
      setTimeout(() => this._setStatus(status, ''), 5000);
    } finally {
      btn.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 1b. AI WRITING ASSISTANT — Article Modal
  // ─────────────────────────────────────────────────────────────────
  async improveArticle() {
    const body = document.getElementById('article-body-input');
    const btn = document.getElementById('btn-ai-improve-article');
    const status = document.getElementById('ai-article-status');
    if (!body || !body.value.trim()) {
      this._setStatus(status, '⚠️ Write some content first!', true);
      return;
    }
    btn.disabled = true;
    this._setStatus(status, '✨ Improving your article...');
    try {
      const data = await this._aiCall('improve', { text: body.value, type: 'article' });
      body.value = data.improved;
      this._setStatus(status, '✅ Article improved!');
      setTimeout(() => this._setStatus(status, ''), 4000);
    } catch (e) {
      this._setStatus(status, '❌ ' + e.message, true);
      setTimeout(() => this._setStatus(status, ''), 5000);
    } finally {
      btn.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 1c. AI CAPTION ASSISTANT — Photo Post
  // ─────────────────────────────────────────────────────────────────
  async improvePhotoCaption() {
    const input = document.getElementById('photo-caption-input');
    const btn = document.getElementById('btn-ai-improve-photo');
    const status = document.getElementById('ai-photo-status');
    if (!input || !input.value.trim()) {
      this._setStatus(status, '⚠️ Write a rough caption first!', true);
      return;
    }
    btn.disabled = true;
    this._setStatus(status, '✨ AI is polishing your caption...');
    try {
      const data = await this._aiCall('improve', { text: input.value, type: 'thought' });
      input.value = data.improved;
      this._setStatus(status, '✅ Caption improved!');
      setTimeout(() => this._setStatus(status, ''), 4000);
    } catch (e) {
      this._setStatus(status, '❌ ' + e.message, true);
      setTimeout(() => this._setStatus(status, ''), 5000);
    } finally {
      btn.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. AUTO-SUMMARIZE — Article Modal → fills subtitle
  // ─────────────────────────────────────────────────────────────────
  async summarizeArticle() {
    const body = document.getElementById('article-body-input');
    const title = document.getElementById('article-title-input');
    const subtitle = document.getElementById('article-subtitle-input');
    const btn = document.getElementById('btn-ai-summarize-article');
    const status = document.getElementById('ai-article-status');
    if (!body || !body.value.trim()) {
      this._setStatus(status, '⚠️ Write some article content first!', true);
      return;
    }
    btn.disabled = true;
    this._setStatus(status, '📝 Generating subtitle...');
    try {
      const data = await this._aiCall('summarize', {
        content: body.value,
        title: title ? title.value : ''
      });
      if (subtitle) subtitle.value = data.summary;
      this._setStatus(status, '✅ Subtitle generated!');
      setTimeout(() => this._setStatus(status, ''), 4000);
    } catch (e) {
      this._setStatus(status, '❌ ' + e.message, true);
      setTimeout(() => this._setStatus(status, ''), 5000);
    } finally {
      btn.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 3. CATEGORY SUGGESTER — Thought
  // ─────────────────────────────────────────────────────────────────
  async suggestCategoryThought() {
    const input = document.getElementById('quick-thought-text');
    const select = document.getElementById('composer-category');
    const btn = document.getElementById('btn-ai-category-thought');
    const status = document.getElementById('ai-thought-status');
    if (!input || !input.value.trim()) {
      this._setStatus(status, '⚠️ Write something first!', true);
      return;
    }
    btn.disabled = true;
    this._setStatus(status, '💡 Analyzing your thought...');
    try {
      const data = await this._aiCall('suggest-category', { text: input.value });
      if (select) {
        // Try to find and select the suggested option
        for (const opt of select.options) {
          if (opt.value.toLowerCase() === data.category.toLowerCase()) {
            select.value = opt.value;
            break;
          }
        }
      }
      this._setStatus(status, `💡 Suggested: ${data.category} — ${data.reason}`);
      setTimeout(() => this._setStatus(status, ''), 5000);
    } catch (e) {
      this._setStatus(status, '❌ ' + e.message, true);
      setTimeout(() => this._setStatus(status, ''), 5000);
    } finally {
      btn.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 3b. CATEGORY SUGGESTER — Article
  // ─────────────────────────────────────────────────────────────────
  async suggestCategoryArticle() {
    const body = document.getElementById('article-body-input');
    const title = document.getElementById('article-title-input');
    const select = document.getElementById('article-category-input');
    const btn = document.getElementById('btn-ai-category-article');
    const status = document.getElementById('ai-article-status');
    const text = (title ? title.value + ' ' : '') + (body ? body.value : '');
    if (!text.trim()) {
      this._setStatus(status, '⚠️ Write some content first!', true);
      return;
    }
    btn.disabled = true;
    this._setStatus(status, '💡 Analyzing content...');
    try {
      const data = await this._aiCall('suggest-category', { text });
      if (select) {
        for (const opt of select.options) {
          if (opt.value.toLowerCase() === data.category.toLowerCase()) {
            select.value = opt.value;
            break;
          }
        }
      }
      this._setStatus(status, `💡 Suggested: ${data.category} — ${data.reason}`);
      setTimeout(() => this._setStatus(status, ''), 5000);
    } catch (e) {
      this._setStatus(status, '❌ ' + e.message, true);
      setTimeout(() => this._setStatus(status, ''), 5000);
    } finally {
      btn.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 4. AI CHAT BOT
  // ─────────────────────────────────────────────────────────────────
  toggleChat() {
    const panel = document.getElementById('ai-chat-panel');
    if (!panel) return;
    this.chatOpen = !this.chatOpen;
    panel.style.display = this.chatOpen ? 'flex' : 'none';
    if (this.chatOpen) {
      const input = document.getElementById('ai-chat-input');
      if (input) setTimeout(() => input.focus(), 100);
    }
  }

  _appendChatMessage(role, text) {
    const container = document.getElementById('ai-chat-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg-${role}`;
    div.innerHTML = `<span>${this._escapeHtml(text)}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  _showTyping() {
    const container = document.getElementById('ai-chat-messages');
    if (!container) return null;
    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg-bot ai-msg-typing';
    div.id = 'ai-typing-indicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  _removeTyping() {
    const el = document.getElementById('ai-typing-indicator');
    if (el) el.remove();
  }

  _escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '<br>');
  }

  async sendChat() {
    if (this.isTyping) return;
    const input = document.getElementById('ai-chat-input');
    const sendBtn = document.querySelector('.ai-send-btn');
    if (!input) return;
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    this._appendChatMessage('user', message);
    this.chatHistory.push({ role: 'user', text: message });

    this.isTyping = true;
    if (sendBtn) sendBtn.disabled = true;
    this._showTyping();

    try {
      const data = await this._aiCall('chat', {
        message,
        history: this.chatHistory.slice(-6)
      });
      this._removeTyping();
      this._appendChatMessage('bot', data.reply);
      this.chatHistory.push({ role: 'bot', text: data.reply });
    } catch (e) {
      this._removeTyping();
      this._appendChatMessage('bot', '⚠️ Sorry, I had trouble responding. Please try again!');
    } finally {
      this.isTyping = false;
      if (sendBtn) sendBtn.disabled = false;
      if (input) input.focus();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 5. SEMANTIC SEARCH — Intercepts the search input
  //    Runs only when user stops typing (debounced)
  // ─────────────────────────────────────────────────────────────────
  _debounceSemanticSearch() {
    clearTimeout(this._semanticTimer);
    this._semanticTimer = setTimeout(() => this._runSemanticSearch(), 800);
  }

  async _runSemanticSearch() {
    // Only kick in if the search bar has a meaningful query
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;
    const query = searchInput.value.trim();
    if (!query || query.length < 4) return;

    // Get the currently rendered app posts
    const app = window.readora;
    if (!app || !app.posts || app.posts.length === 0) return;

    try {
      const postPayload = app.posts.slice(0, 30).map(p => ({
        id: p.id,
        title: p.title || '',
        content: (p.content || '').substring(0, 200),
        category: p.category || '',
        author: p.author || ''
      }));

      const data = await this._aiCall('semantic-search', { query, posts: postPayload });
      if (!data.rankedIds || data.aiUnavailable) return;

      // Re-order app.posts according to Gemini's ranking
      const idOrder = data.rankedIds;
      const postMap = new Map(app.posts.map(p => [p.id, p]));
      const reordered = [];
      idOrder.forEach(id => { if (postMap.has(id)) reordered.push(postMap.get(id)); });
      // Add any posts AI didn't mention (safety net)
      app.posts.forEach(p => { if (!reordered.find(r => r.id === p.id)) reordered.push(p); });

      app.posts = reordered;
      app.render();
    } catch (_) {
      // Silently fail — normal keyword search still works
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Bind all AI buttons and events
  // ─────────────────────────────────────────────────────────────────
  _bindAll() {
    document.addEventListener('DOMContentLoaded', () => {
      // Thought composer AI buttons
      const btnImproveThought = document.getElementById('btn-ai-improve-thought');
      if (btnImproveThought) btnImproveThought.addEventListener('click', () => this.improveThought());

      const btnCategoryThought = document.getElementById('btn-ai-category-thought');
      if (btnCategoryThought) btnCategoryThought.addEventListener('click', () => this.suggestCategoryThought());

      // Photo composer AI caption button
      const btnImprovePhoto = document.getElementById('btn-ai-improve-photo');
      if (btnImprovePhoto) btnImprovePhoto.addEventListener('click', () => this.improvePhotoCaption());

      // Article modal AI buttons
      const btnImproveArticle = document.getElementById('btn-ai-improve-article');
      if (btnImproveArticle) btnImproveArticle.addEventListener('click', () => this.improveArticle());

      const btnSummarizeArticle = document.getElementById('btn-ai-summarize-article');
      if (btnSummarizeArticle) btnSummarizeArticle.addEventListener('click', () => this.summarizeArticle());

      const btnCategoryArticle = document.getElementById('btn-ai-category-article');
      if (btnCategoryArticle) btnCategoryArticle.addEventListener('click', () => this.suggestCategoryArticle());

      // Semantic search: debounce on search input
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.addEventListener('input', () => this._debounceSemanticSearch());
      }

      console.log('🤖 Readora AI: All features initialized!');
    });
  }
}

// Initialize AI module
const _readoraAI = new ReadoraAI();
