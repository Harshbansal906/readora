/**
 * READORA - Core Application Engine
 * "Where readers become creators."
 * Seamless Hybrid API + Offline Fallback Support
 */

const DEFAULT_POSTS = [];

class ReadoraApp {
  constructor() {
    this.token = localStorage.getItem('readora_token') || null;
    this.currentUser = this.loadUser();
    this.posts = this.loadLocalPosts();
    this.currentFilter = 'all';
    this.selectedTheme = 'theme-crimson';
    this.activeSearchQuery = '';
    this.isBackendAvailable = false;

    this.initDOM();
    this.bindEvents();
    this.syncWithBackend();
    this.render();
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
    localStorage.setItem('readora_posts', JSON.stringify(this.posts));
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
    const apiBase = window.location.protocol === 'file:' ? 'http://localhost:5000' : '';

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      // 1. Fetch live posts
      const res = await fetch(`${apiBase}/api/posts`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.posts)) {
          this.posts = data.posts;
          this.isBackendAvailable = true;
          this.saveLocalPosts();
          this.render();
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
      <div class="trending-topic-item" style="cursor: pointer;" onclick="if(window.readora){ window.readora.setTopicFilter('${t.name}'); }">
        <div>
          <div class="topic-category">Topic</div>
          <div class="topic-name">#${t.name}</div>
        </div>
        <div class="topic-posts-count">${t.count} ${t.count === 1 ? 'post' : 'posts'}</div>
      </div>
    `).join('');
  }

  setTopicFilter(topicName) {
    if (this.searchInput) {
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
        <div class="creator-left">
          <div class="author-avatar" style="width: 34px; height: 34px; font-size: 0.8rem;">${c.avatar}</div>
          <div>
            <div class="creator-name">${c.name}</div>
            <div class="creator-handle">${c.handle} • ${c.followers} ${c.followers === 1 ? 'follower' : 'followers'}</div>
          </div>
        </div>
        <button class="btn-follow ${c.isFollowing ? 'following' : ''}" onclick="if(window.readora){ window.readora.toggleFollow('${c.id}'); }" style="${c.isFollowing ? 'background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); color: #fff;' : ''}">
          ${c.isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>
    `).join('');
  }

  async toggleFollow(creatorId) {
    if (!this.currentUser) {
      this.showToast('Please log in to follow creators!');
      setTimeout(() => { window.location.href = 'practise.html'; }, 1000);
      return;
    }
    const apiBase = window.location.protocol === 'file:' ? 'http://localhost:5000' : '';
    try {
      const res = await fetch(`${apiBase}/api/posts/follow/${creatorId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(data.message);
        this.syncWithBackend();
      } else {
        this.showToast(data.message || 'Could not update follow status.');
      }
    } catch (e) {
      this.showToast('Network error while toggling follow.');
    }
  }

  updateUserUI() {
    const isAuth = !!this.currentUser;
    const avatarEls = document.querySelectorAll('.author-avatar, .user-avatar-sm');
    const nameEl = document.querySelector('.user-name-sm');
    const userBadge = document.getElementById('user-profile-badge');

    if (isAuth && this.currentUser) {
      const initials = this.currentUser.avatar || (this.currentUser.name ? this.currentUser.name.substring(0, 2).toUpperCase() : 'CR');
      avatarEls.forEach(el => {
        if (!el.closest('.thought-card') && !el.closest('.creator-item')) {
          el.textContent = initials;
        }
      });
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
      avatarEls.forEach(el => {
        if (!el.closest('.thought-card') && !el.closest('.creator-item')) {
          el.textContent = '👤';
        }
      });
      if (nameEl) nameEl.textContent = 'Guest';
      if (userBadge) userBadge.title = 'Click to log in or register';
    }
  }

  logout() {
    localStorage.removeItem('readora_token');
    localStorage.removeItem('readora_current_user');
    window.location.href = 'practise.html';
  }

  initDOM() {
    this.postsContainer = document.getElementById('posts-stream');
    this.searchInput = document.getElementById('search-input');
    this.filterTabs = document.querySelectorAll('.feed-tab');
    
    // Quick Thought Composer
    this.thoughtInput = document.getElementById('quick-thought-text');
    this.publishThoughtBtn = document.getElementById('btn-publish-thought');
    this.composerCategory = document.getElementById('composer-category');
    this.themePills = document.querySelectorAll('.theme-pill');

    // Modals
    this.writeArticleModal = document.getElementById('write-article-modal');
    this.readArticleModal = document.getElementById('read-article-modal');
    this.profileModal = document.getElementById('profile-modal');
    
    // Action Triggers
    this.btnOpenWriteArticle = document.getElementById('btn-open-write-article');
    this.btnWriteLongArticle = document.getElementById('btn-write-long-article');
    this.userBadge = document.getElementById('user-profile-badge');
    this.profileSidebarBtn = document.getElementById('nav-profile-btn');
    this.btnLogout = document.getElementById('btn-logout');
    
    // Form inside Article Modal
    this.articleForm = document.getElementById('publish-article-form');
    this.toastEl = document.getElementById('toast');
    
    this.updateUserUI();
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
        this.render();
      });
    });

    // Search filter
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.activeSearchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }

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
        this.openModal(this.profileModal);
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

    // Global Modal Close on Overlay Click or X
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('.modal-close-btn')) {
          overlay.classList.remove('active');
        }
      });
    });
  }

  async handleCreateThought() {
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
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        
        const res = await fetch('/api/posts/thought', {
          method: 'POST',
          headers,
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
    this.render();
    this.showToast('✨ Thought published to Readora!');
  }

  async handleCreateArticle() {
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
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        
        const res = await fetch('/api/posts/article', {
          method: 'POST',
          headers,
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
    this.render();
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
    this.render();

    if (window.location.origin.startsWith('http')) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        await fetch(`/api/posts/${postId}/like`, { method: 'POST', headers });
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
    this.render();

    if (window.location.origin.startsWith('http')) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        await fetch(`/api/posts/${postId}/bookmark`, { method: 'POST', headers });
      } catch (e) {}
    }
  }

  toggleComments(postId) {
    const drawer = document.getElementById(`comments-${postId}`);
    if (drawer) {
      drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    }
  }

  async addComment(postId, inputEl) {
    const text = inputEl.value.trim();
    if (!text) return;

    const post = this.posts.find(p => p.id === postId);
    if (post) {
      post.comments = post.comments || [];
      post.comments.push({
        author: this.currentUser.name,
        text: text
      });
      this.saveLocalPosts();
      inputEl.value = '';
      this.render();

      if (window.location.origin.startsWith('http')) {
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
          await fetch(`/api/posts/${postId}/comment`, {
            method: 'POST',
            headers,
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

    contentBox.innerHTML = `
      <div style="margin-bottom: 1.5rem;">
        <span class="card-tag" style="margin-bottom: 0.5rem; display: inline-block;">${post.category}</span>
        <h1 style="font-family: var(--font-brand); font-size: 2rem; color: #fff; line-height: 1.25; margin-bottom: 0.5rem;">${post.title}</h1>
        ${post.subtitle ? `<p style="font-size: 1.1rem; color: var(--text-dim); margin-bottom: 1rem;">${post.subtitle}</p>` : ''}
        
        <div style="display: flex; align-items: center; gap: 0.75rem; border-bottom: 1px solid var(--border-glass); padding-bottom: 1rem;">
          <div class="author-avatar">${post.avatar}</div>
          <div>
            <div style="font-weight: 700; color: #fff;">${post.author}</div>
            <div style="font-size: 0.8rem; color: var(--text-dim);">${post.timestamp} • ${post.readTime}</div>
          </div>
        </div>
      </div>

      ${post.coverImage ? `<img src="${post.coverImage}" alt="Cover" style="width: 100%; max-height: 320px; object-fit: cover; border-radius: var(--radius-md); margin-bottom: 1.5rem;" />` : ''}

      <div style="font-family: var(--font-serif); font-size: 1.1rem; line-height: 1.8; color: var(--text-muted); white-space: pre-line;">
        ${post.fullContent || post.excerpt}
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

  render() {
    if (!this.postsContainer) return;

    let filtered = this.posts.filter(post => {
      if (this.currentFilter === 'thoughts' && post.type !== 'thought') return false;
      if (this.currentFilter === 'articles' && post.type !== 'article') return false;
      if (this.currentFilter === 'saved' && !post.bookmarkedByUser) return false;
      if (['tech', 'philosophy', 'creative', 'stories'].includes(this.currentFilter.toLowerCase())) {
        if (post.category.toLowerCase() !== this.currentFilter.toLowerCase()) return false;
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
      this.postsContainer.innerHTML = `
        <div style="text-align: center; padding: 4rem 1rem; background: var(--bg-card); border: 1px solid var(--border-glass); border-radius: var(--radius-lg);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">✍️</div>
          <h3 style="color: #fff; font-size: 1.25rem; margin-bottom: 0.35rem;">No posts found</h3>
          <p style="color: var(--text-dim); font-size: 0.9rem;">Try selecting a different filter or be the first to share your thoughts!</p>
        </div>
      `;
      return;
    }

    this.postsContainer.innerHTML = filtered.map(post => {
      if (post.type === 'thought') {
        return this.renderThoughtCard(post);
      } else {
        return this.renderArticleCard(post);
      }
    }).join('');

    this.attachCardEventListeners();
  }

  async deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) return;

    if (window.location.origin.startsWith('http')) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE', headers });
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
    this.render();
    this.showToast('🗑️ Post deleted successfully!');
  }

  isPostAuthor(post) {
    if (!this.currentUser) return false;
    return (post.author_id && post.author_id === this.currentUser.id) ||
           (post.handle && this.currentUser.handle && post.handle.toLowerCase() === this.currentUser.handle.toLowerCase()) ||
           this.currentUser.id === 'usr_harsh';
  }

  renderThoughtCard(post) {
    const isOwner = this.isPostAuthor(post);
    return `
      <article class="thought-card" data-id="${post.id}">
        <div class="card-header">
          <div class="card-author-info">
            <div class="author-avatar">${post.avatar || 'CR'}</div>
            <div>
              <div class="author-name">${post.author}</div>
              <div class="post-meta">${post.handle} • ${post.timestamp || 'Recently'}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="card-tag">${post.category}</span>
            ${isOwner ? `
              <button class="btn-delete-post" data-id="${post.id}" title="Delete Thought" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); color: var(--text-dim); cursor: pointer; padding: 0.25rem 0.45rem; border-radius: var(--radius-sm); display: inline-flex; align-items: center; justify-content: center; transition: all var(--transition-fast);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : ''}
          </div>
        </div>

        <div class="thought-canvas ${post.theme || 'theme-crimson'}">
          <div class="thought-quote-icon">“</div>
          <p class="thought-text">${post.content}</p>
          <div class="thought-author-signature">— ${post.author}</div>
        </div>

        <div class="card-actions-bar">
          <div class="action-buttons-group">
            <button class="card-action-btn btn-like ${post.likedByUser ? 'liked' : ''}" data-id="${post.id}" title="Like">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="${post.likedByUser ? '#ef4444' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              <span>${post.likes}</span>
            </button>

            <button class="card-action-btn btn-comment-toggle" data-id="${post.id}" title="Comments">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              <span>${post.comments ? post.comments.length : 0}</span>
            </button>

            <button class="card-action-btn btn-share" data-id="${post.id}" title="Share Post">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            </button>
          </div>

          <button class="card-action-btn btn-bookmark ${post.bookmarkedByUser ? 'bookmarked' : ''}" data-id="${post.id}" title="Save">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${post.bookmarkedByUser ? '#f59e0b' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          </button>
        </div>

        <div class="comments-drawer" id="comments-${post.id}" style="display: none;">
          <div class="comments-list">
            ${(post.comments || []).map(c => `
              <div class="comment-item">
                <span class="comment-author">${c.author}:</span>
                <span class="comment-body">${c.text}</span>
              </div>
            `).join('')}
          </div>
          <div class="comment-input-row">
            <input type="text" placeholder="Add a comment..." class="input-comment" data-id="${post.id}">
            <button class="btn-submit-comment" data-id="${post.id}">Post</button>
          </div>
        </div>
      </article>
    `;
  }

  renderArticleCard(post) {
    const isOwner = this.isPostAuthor(post);
    return `
      <article class="thought-card" data-id="${post.id}">
        <div class="card-header">
          <div class="card-author-info">
            <div class="author-avatar">${post.avatar || 'CR'}</div>
            <div>
              <div class="author-name">${post.author}</div>
              <div class="post-meta">${post.handle} • ${post.timestamp || 'Recently'} • ${post.readTime || '3 min read'}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="card-tag">${post.category}</span>
            ${isOwner ? `
              <button class="btn-delete-post" data-id="${post.id}" title="Delete Article" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); color: var(--text-dim); cursor: pointer; padding: 0.25rem 0.45rem; border-radius: var(--radius-sm); display: inline-flex; align-items: center; justify-content: center; transition: all var(--transition-fast);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : ''}
          </div>
        </div>

        <div class="article-content-body">
          ${post.coverImage ? `<img src="${post.coverImage}" class="article-card-cover" alt="Article Cover" />` : ''}
          <h2 class="article-title">${post.title}</h2>
          <p class="article-excerpt">${post.excerpt}</p>
          <div class="read-more-btn btn-read-article" data-id="${post.id}">
            Read Full Article ➔
          </div>
        </div>

        <div class="card-actions-bar">
          <div class="action-buttons-group">
            <button class="card-action-btn btn-like ${post.likedByUser ? 'liked' : ''}" data-id="${post.id}" title="Like">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="${post.likedByUser ? '#ef4444' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              <span>${post.likes}</span>
            </button>

            <button class="card-action-btn btn-comment-toggle" data-id="${post.id}" title="Comments">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              <span>${post.comments ? post.comments.length : 0}</span>
            </button>

            <button class="card-action-btn btn-share" data-id="${post.id}" title="Share Post">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            </button>
          </div>

          <button class="card-action-btn btn-bookmark ${post.bookmarkedByUser ? 'bookmarked' : ''}" data-id="${post.id}" title="Save">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${post.bookmarkedByUser ? '#f59e0b' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          </button>
        </div>

        <div class="comments-drawer" id="comments-${post.id}" style="display: none;">
          <div class="comments-list">
            ${(post.comments || []).map(c => `
              <div class="comment-item">
                <span class="comment-author">${c.author}:</span>
                <span class="comment-body">${c.text}</span>
              </div>
            `).join('')}
          </div>
          <div class="comment-input-row">
            <input type="text" placeholder="Add a comment..." class="input-comment" data-id="${post.id}">
            <button class="btn-submit-comment" data-id="${post.id}">Post</button>
          </div>
        </div>
      </article>
    `;
  }

  attachCardEventListeners() {
    document.querySelectorAll('.btn-like').forEach(btn => {
      btn.addEventListener('click', () => this.toggleLike(btn.dataset.id));
    });

    document.querySelectorAll('.btn-bookmark').forEach(btn => {
      btn.addEventListener('click', () => this.toggleBookmark(btn.dataset.id));
    });

    document.querySelectorAll('.btn-delete-post').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePost(btn.dataset.id);
      });
    });

    document.querySelectorAll('.btn-comment-toggle').forEach(btn => {
      btn.addEventListener('click', () => this.toggleComments(btn.dataset.id));
    });

    document.querySelectorAll('.btn-submit-comment').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const input = document.querySelector(`.input-comment[data-id="${id}"]`);
        if (input) this.addComment(id, input);
      });
    });

    document.querySelectorAll('.btn-share').forEach(btn => {
      btn.addEventListener('click', () => {
        const post = this.posts.find(p => p.id === btn.dataset.id);
        if (post) this.sharePost(post);
      });
    });

    document.querySelectorAll('.btn-read-article').forEach(btn => {
      btn.addEventListener('click', () => this.openFullArticle(btn.dataset.id));
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.readora = new ReadoraApp();
});
