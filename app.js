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
          ${stat(p.stats.followers, 'Followers', '#ef4444')}
          ${stat(p.stats.following, 'Following', '#fda4af')}
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

    // Modals
    this.writeArticleModal = document.getElementById('write-article-modal');
    this.readArticleModal = document.getElementById('read-article-modal');
    this.profileModal = document.getElementById('profile-modal');
    this.editProfileModal = document.getElementById('edit-profile-modal');

    // Action Triggers
    this.btnOpenWriteArticle = document.getElementById('btn-open-write-article');
    this.btnWriteLongArticle = document.getElementById('btn-write-long-article');
    this.userBadge = document.getElementById('user-profile-badge');
    this.profileSidebarBtn = document.getElementById('nav-profile-btn');
    this.btnLogout = document.getElementById('btn-logout');
    this.btnViewProfile = document.getElementById('btn-view-profile');

    // Forms
    this.articleForm = document.getElementById('publish-article-form');
    this.editProfileForm = document.getElementById('edit-profile-form');
    this.toastEl = document.getElementById('toast');

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

  bindEvents() {
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
    return post.type === 'thought' ? this.renderThoughtCard(post) : this.renderArticleCard(post);
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

  renderArticleCard(post) {
    const cover = safeUrl(post.coverImage);
    return `
      <article class="thought-card" data-id="${esc(post.id)}">
        ${this.renderCardHeader(post, ' • ' + esc(post.readTime || '3 min read'), 'Delete Article')}

        <div class="article-content-body">
          ${cover ? `<img src="${esc(cover)}" class="article-card-cover" alt="Article Cover" />` : ''}
          <h2 class="article-title">${esc(post.title)}</h2>
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
