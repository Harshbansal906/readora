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
    const listEl = document.getElementById('trending-topics-list');
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
    const listEl = document.getElementById('featured-creators-list');
    if (!listEl) return;
    if (!creators || creators.length === 0) {
      listEl.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; padding: 0.5rem 0; text-align: center;">New creators will be highlighted here.</div>';
      return;
    }
    listEl.innerHTML = creators.map(c => `
      <div class="creator-item">
        <a class="creator-left author-link" href="${profileLink(c.handle)}">
          <div class="author-avatar" style="width: 34px; height: 34px; font-size: 0.8rem;">${esc(c.avatar)}</div>
          <div>
            <div class="creator-name">${esc(c.name)}</div>
            <div class="creator-handle">${esc(c.handle)} • ${esc(c.followers)} ${c.followers === 1 ? 'follower' : 'followers'}</div>
          </div>
        </a>
        <button class="btn-follow ${c.isFollowing ? 'following' : ''}" data-follow-id="${esc(c.id)}" style="${c.isFollowing ? 'background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); color: #fff;' : ''}">
          ${c.isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-follow-id]').forEach(btn => {
      btn.addEventListener('click', () => this.toggleFollow(btn.dataset.followId));
    });
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

    const m = /^#\/u\/(.+)$/.exec(window.location.hash || '');
    if (m) {
      let handle = m[1];
      try { handle = decodeURIComponent(handle); } catch (e) {}
      this.route = { name: 'profile', handle };
      this.showProfileView(handle);
    } else {
      this.route = { name: 'home' };
      this.showFeedView();
    }
  }

  setNavActive() {
    const home = document.getElementById('nav-home-btn');
    const mine = document.getElementById('nav-profile-btn');
    const isMine = this.isProfileActive() && this.currentUser && this.currentUser.handle &&
      this.route.handle.replace(/^@/, '').toLowerCase() === this.currentUser.handle.replace(/^@/, '').toLowerCase();
    if (home) home.classList.toggle('active', !this.isProfileActive());
    if (mine) mine.classList.toggle('active', !!isMine);
  }

  showFeedView() {
    const feed = document.getElementById('feed-view');
    const prof = document.getElementById('profile-view');
    if (feed) feed.style.display = '';
    if (prof) prof.style.display = 'none';
    document.title = 'READORA | Where readers become creators';
    this.setNavActive();
    this.render();
  }

  showProfileView(handle) {
    const feed = document.getElementById('feed-view');
    const prof = document.getElementById('profile-view');
    if (feed) feed.style.display = 'none';
    if (prof) prof.style.display = 'flex';
    this.setNavActive();
    window.scrollTo({ top: 0 });
    this.profileFilter = 'all';
    this.loadProfile(handle);
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

    if (isAuth && this.currentUser) {
      const initials = this.currentUser.avatar || (this.currentUser.name ? this.currentUser.name.substring(0, 2).toUpperCase() : 'CR');
      avatarEls.forEach(el => { el.textContent = initials; });
      if (nameEl) nameEl.textContent = this.currentUser.name ? this.currentUser.name.split(' ')[0] : 'Creator';
      if (userBadge) userBadge.title = `Logged in as ${this.currentUser.name}`;

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
    }
    this.setNavActive();
  }

  logout() {
    localStorage.removeItem('readora_token');
    localStorage.removeItem('readora_current_user');
    window.location.href = 'practise.html';
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
    // If user is logged in, default to bright unless they explicitly chose dark
    if (saved === 'bright' || (!saved && this.currentUser)) {
      document.body.classList.add('theme-bright');
      this.updateThemeButton(true);
    } else {
      document.body.classList.remove('theme-bright');
      this.updateThemeButton(false);
    }
  }

  toggleTheme() {
    const isBright = document.body.classList.toggle('theme-bright');
    localStorage.setItem('readora_theme', isBright ? 'bright' : 'dark');
    this.updateThemeButton(isBright);
    this.showToast(isBright ? '☀️ Bright Mode Enabled' : '🌙 Dark Mode Enabled');
  }

  updateThemeButton(isBright) {
    if (!this.themeToggleBtn) return;
    this.themeToggleBtn.innerHTML = isBright
      ? `<span class="theme-icon">🌙</span><span class="theme-text">Dark</span>`
      : `<span class="theme-icon">☀️</span><span class="theme-text">Bright</span>`;
  }

  bindEvents() {
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

    // Page changes (feed <-> profile)
    window.addEventListener('hashchange', () => this.handleRoute());

    // Modals Open/Close
    if (this.btnOpenWriteArticle) {
      this.btnOpenWriteArticle.addEventListener('click', () => this.openModal(this.writeArticleModal));
    }
    if (this.btnWriteLongArticle) {
      this.btnWriteLongArticle.addEventListener('click', () => this.openModal(this.writeArticleModal));
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
    if (!this.requireLogin('Please log in to share a thought!')) return;

    const text = this.thoughtInput.value.trim();
    if (!text) {
      this.showToast('Please write something before publishing!');
      return;
    }

    const category = this.composerCategory ? this.composerCategory.value : 'General';

    const payload = {
      content: text,
      theme: this.selectedTheme,
      category: category,
      authorName: this.currentUser.name,
      authorHandle: this.currentUser.handle,
      authorAvatar: this.currentUser.avatar
    };

    let newThought = {
      id: 'post_' + Date.now(),
      type: 'thought',
      author_id: this.currentUser.id,
      author: this.currentUser.name,
      handle: this.currentUser.handle,
      avatar: this.currentUser.avatar,
      timestamp: 'Just now',
      content: text,
      theme: this.selectedTheme,
      category: category,
      likes: 0,
      likedByUser: false,
      bookmarks: 0,
      bookmarkedByUser: false,
      comments: []
    };

    if (window.location.origin.startsWith('http')) {
      try {
        const res = await fetch('/api/posts/thought', {
          method: 'POST',
          headers: this.authHeaders(),
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          if (data.post) newThought = data.post;
        }
      } catch (e) {
        console.log('Offline post save');
      }
    }

    this.posts.unshift(newThought);
    this.saveLocalPosts();
    this.thoughtInput.value = '';
    this.refresh();
    this.showToast('✨ Thought published to Readora!');
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

    const words = content.split(/\s+/).length;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 180));

    const payload = {
      title,
      subtitle,
      category,
      coverImage: coverUrl,
      content,
      authorName: this.currentUser.name,
      authorHandle: this.currentUser.handle,
      authorAvatar: this.currentUser.avatar
    };

    let newArticle = {
      id: 'article_' + Date.now(),
      type: 'article',
      author_id: this.currentUser.id,
      author: this.currentUser.name,
      handle: this.currentUser.handle,
      avatar: this.currentUser.avatar,
      timestamp: 'Just now',
      title: title,
      subtitle: subtitle,
      coverImage: coverUrl,
      excerpt: content.length > 160 ? content.substring(0, 160) + '...' : content,
      fullContent: content,
      category: category,
      readTime: `${readTimeMinutes} min read`,
      likes: 0,
      likedByUser: false,
      bookmarks: 0,
      bookmarkedByUser: false,
      comments: []
    };

    if (window.location.origin.startsWith('http')) {
      try {
        const res = await fetch('/api/posts/article', {
          method: 'POST',
          headers: this.authHeaders(),
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          if (data.post) newArticle = data.post;
        }
      } catch (e) {}
    }

    this.posts.unshift(newArticle);
    this.saveLocalPosts();
    this.articleForm.reset();
    this.writeArticleModal.classList.remove('active');
    this.refresh();
    this.showToast('📖 Article published successfully!');
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
    this.refresh();
    this.showToast('📸 Photo post shared to Readora!');
  }

  async loadNotifications() {
    if (!this.token) return;
    try {
      const res = await fetch('/api/posts/notifications/list', { headers: this.authHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const badge = document.getElementById('notif-badge');
          if (badge) {
            if (data.unreadCount > 0) {
              badge.textContent = data.unreadCount > 99 ? '99+' : data.unreadCount;
              badge.style.display = 'flex';
            } else {
              badge.style.display = 'none';
            }
          }
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
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

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
        await fetch(`/api/posts/${postId}/like`, { method: 'POST', headers: this.authHeaders() });
      } catch (e) {}
    }
  }

  async toggleBookmark(postId) {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    if (post.bookmarkedByUser) {
      post.bookmarks = Math.max(0, post.bookmarks - 1);
      post.bookmarkedByUser = false;
      this.showToast('Removed from bookmarks');
    } else {
      post.bookmarks++;
      post.bookmarkedByUser = true;
      this.showToast('🔖 Saved to your bookmarks!');
    }
    this.saveLocalPosts();
    this.refresh();

    if (window.location.origin.startsWith('http')) {
      try {
        await fetch(`/api/posts/${postId}/bookmark`, { method: 'POST', headers: this.authHeaders() });
      } catch (e) {}
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
    if (post) {
      post.comments = post.comments || [];
      post.comments.push({
        author: this.currentUser.name,
        text: text
      });
      this.openComments.add(postId);
      this.saveLocalPosts();
      inputEl.value = '';
      this.refresh();

      if (window.location.origin.startsWith('http')) {
        try {
          await fetch(`/api/posts/${postId}/comment`, {
            method: 'POST',
            headers: this.authHeaders(),
            body: JSON.stringify({ text, authorName: this.currentUser.name })
          });
        } catch (e) {}
      }
    }
  }

  sharePost(post) {
    const title = post.type === 'thought' ? post.content : post.title;
    if (navigator.share) {
      navigator.share({
        title: 'Readora - ' + post.author,
        text: title,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`"${title}" — by ${post.author} on Readora (${window.location.href})`);
      this.showToast('🔗 Post quote & link copied to clipboard!');
    }
  }

  openFullArticle(postId) {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    const contentBox = document.getElementById('read-article-container');
    if (!contentBox) return;

    const cover = safeUrl(post.coverImage);

    contentBox.innerHTML = `
      <div style="margin-bottom: 1.5rem;">
        <span class="card-tag" style="margin-bottom: 0.5rem; display: inline-block;">${esc(post.category)}</span>
        <h1 style="font-family: var(--font-brand); font-size: 2rem; color: #fff; line-height: 1.25; margin-bottom: 0.5rem;">${esc(post.title)}</h1>
        ${post.subtitle ? `<p style="font-size: 1.1rem; color: var(--text-dim); margin-bottom: 1rem;">${esc(post.subtitle)}</p>` : ''}

        <a class="author-link" href="${profileLink(post.handle)}" style="display: flex; align-items: center; gap: 0.75rem; border-bottom: 1px solid var(--border-glass); padding-bottom: 1rem;">
          <div class="author-avatar">${esc(post.avatar)}</div>
          <div>
            <div class="author-name" style="font-weight: 700; color: #fff;">${esc(post.author)}</div>
            <div style="font-size: 0.8rem; color: var(--text-dim);">${esc(post.timestamp)} • ${esc(post.readTime)}</div>
          </div>
        </a>
      </div>

      ${cover ? `<img src="${esc(cover)}" alt="Cover" style="width: 100%; max-height: 320px; object-fit: cover; border-radius: var(--radius-md); margin-bottom: 1.5rem;" />` : ''}

      <div style="font-family: var(--font-serif); font-size: 1.1rem; line-height: 1.8; color: var(--text-muted); white-space: pre-line;">
        ${esc(post.fullContent || post.excerpt)}
      </div>
    `;

    this.openModal(this.readArticleModal);
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
           (post.handle && this.currentUser.handle && post.handle.toLowerCase() === this.currentUser.handle.toLowerCase()) ||
           this.currentUser.id === 'usr_harsh';
  }

  // ---------- Post cards ----------

  renderPostCard(post) {
    if (post.type === 'thought') return this.renderThoughtCard(post);
    if (post.type === 'image') return this.renderImageCard(post);
    return this.renderArticleCard(post);
  }

  renderCardHeader(post, metaExtra, deleteTitle) {
    const isOwner = this.isPostAuthor(post);
    const authorBlock = `
      <div class="author-avatar">${esc(post.avatar || 'CR')}</div>
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
          <span class="card-tag">${esc(post.category)}</span>
          ${isOwner ? `
            <button class="btn-delete-post" data-id="${esc(post.id)}" title="${deleteTitle}" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); color: var(--text-dim); cursor: pointer; padding: 0.25rem 0.45rem; border-radius: var(--radius-sm); display: inline-flex; align-items: center; justify-content: center; transition: all var(--transition-fast);">
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
    return `
      <div class="comments-drawer" style="display: ${this.openComments.has(post.id) ? 'block' : 'none'};">
        <div class="comments-list">
          ${(post.comments || []).map(c => `
            <div class="comment-item">
              <span class="comment-author">${esc(c.author)}:</span>
              <span class="comment-body">${esc(c.text)}</span>
            </div>
          `).join('')}
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

        <div class="thought-canvas ${esc(post.theme || 'theme-crimson')}">
          <div class="thought-quote-icon">“</div>
          <p class="thought-text">${esc(post.content)}</p>
          <div class="thought-author-signature">— ${esc(post.author)}</div>
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
          ${cover ? `<img src="${esc(cover)}" class="photo-card-img" alt="Photo" loading="lazy" />` : ''}
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
          ${cover ? `<img src="${esc(cover)}" class="article-card-cover" alt="Article Cover" loading="lazy" />` : ''}
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

    root.querySelectorAll('.btn-delete-post').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePost(btn.dataset.id);
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
