/* ================================================
   SkillBridge — Authentication Module
   ================================================ */

const Auth = {
  USERS_KEY:   'sb_users',
  SESSION_KEY: 'sb_session',

  /* ── Getters ── */
  getUsers()  { return App.ls.get(this.USERS_KEY, []); },
  getUser()   { return App.ls.get(this.SESSION_KEY); },

  /* ── Session ── */
  setSession(user) { App.ls.set(this.SESSION_KEY, user); },
  clearSession()   { App.ls.remove(this.SESSION_KEY); },

  /* ── Register ── */
  register(data) {
    const users = this.getUsers();
    if (users.find(u => u.email === data.email)) {
      return { ok: false, err: 'This email is already registered.' };
    }

    const user = {
      id:        'u_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      name:      data.name,
      email:     data.email,
      password:  data.password,
      role:      data.role,
      phone:     data.phone || '',
      createdAt: new Date().toISOString(),
      avatar:    data.name.charAt(0).toUpperCase(),
      ...this._roleDefaults(data)
    };

    users.push(user);
    App.ls.set(this.USERS_KEY, users);
    this.setSession(user);
    return { ok: true, user };
  },

  _roleDefaults(d) {
    switch (d.role) {
      case 'student': return {
        institution:     d.institution || '',
        department:      d.department  || '',
        year:            d.year        || '',
        graduationYear:  d.graduationYear || '',
        skills:          [],
        careerInterests: [],
        assessmentHistory: [],
        applications:    [],
        skillProfile:    {},
        portfolio:       { visible: true, bio: '' },
        savedOpportunities: [],
        notifications:   [],
        resumeText:      '',
        aiAnalysis:      null,
        projects:        [],
        certifications:  [],
        achievements:    [],
        hackathons:      []
      };
      case 'academician': return {
        institution:       d.institution || '',
        department:        d.department  || '',
        designation:       d.designation || '',
        expertise:         [],
        researchInterests: [],
        publications:      [],
        savedOpportunities:[],
        projects:          [],
        notifications:     []
      };
      case 'industry': return {
        company:      d.company     || d.name,
        industry:     d.industry    || '',
        website:      d.website     || '',
        size:         d.size        || '',
        description:  d.description || '',
        opportunities:[],
        programs:     [],
        notifications:[]
      };
      case 'institution': return {
        institution:  d.name,
        address:      d.address     || '',
        type:         d.type        || '',
        notifications:[]
      };
      default: return {};
    }
  },

  /* ── Login ── */
  login(email, password) {
    const user = this.getUsers().find(u => u.email === email && u.password === password);
    if (!user) return { ok: false, err: 'Invalid email or password.' };
    const fresh = this.refreshUser(user.id);
    this.setSession(fresh);
    return { ok: true, user: fresh };
  },

  /* ── Logout ── */
  logout() {
    this.clearSession();
    // Check if we're inside a role sub-folder (student/, industry/, etc.)
    const inSubDir = /\/(student|industry|academician|institution|auth)\//i.test(window.location.pathname);
    window.location.href = inSubDir ? '../auth/login.html' : 'auth/login.html';
  },

  /* ── Update user data ── */
  updateUser(partial) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === partial.id);
    if (idx === -1) return;
    users[idx] = { ...users[idx], ...partial };
    App.ls.set(this.USERS_KEY, users);
    this.setSession(users[idx]);
    return users[idx];
  },

  /* ── Get fresh copy from storage ── */
  refreshUser(id) {
    return this.getUsers().find(u => u.id === id) || this.getUser();
  },

  /* ── Get user by ID ── */
  getUserById(id) {
    return this.getUsers().find(u => u.id === id) || null;
  },

  /* ── Get users by role ── */
  getUsersByRole(role) {
    return this.getUsers().filter(u => u.role === role);
  },

  /* ── Route guard ── */
  requireRole(role) {
    const user = this.getUser();
    if (!user) {
      const inSubDir = /\/(student|industry|academician|institution|auth)\//i.test(window.location.pathname);
      window.location.href = inSubDir ? '../auth/login.html' : 'auth/login.html';
      return null;
    }
    if (role && user.role !== role) {
      this.redirectDashboard(user.role);
      return null;
    }
    return user;
  },

  redirectDashboard(role) {
    const dashboards = {
      student:     'student/dashboard.html',
      industry:    'industry/dashboard.html',
      academician: 'academician/dashboard.html',
      institution: 'institution/dashboard.html'
    };
    const target = dashboards[role] || 'index.html';
    // Determine prefix based on current location
    const inSubDir = /\/(student|industry|academician|institution|auth)\//i.test(window.location.pathname);
    window.location.href = inSubDir ? '../' + target : target;
  },

  /* ── Render sidebar user widget ── */
  renderUserWidget(containerSelector = '.sidebar-user') {
    const user = this.getUser();
    if (!user) return;
    const el = document.querySelector(containerSelector);
    if (!el) return;
    el.innerHTML = `
      <div class="user-avatar">${user.avatar || user.name.charAt(0)}</div>
      <div class="user-info">
        <div class="user-name">${user.name}</div>
        <div class="user-role">${user.role}</div>
      </div>
    `;
  },

  /* ── Seed demo users (called once) ── */
  seedDemo() {
    if (App.ls.get('sb_demo_seeded')) return;
    const { MockData } = window;
    if (!MockData) return;

    // Import demo users from MockData
    const existing = this.getUsers();
    const toAdd = MockData.demoUsers.filter(d => !existing.find(u => u.email === d.email));
    App.ls.set(this.USERS_KEY, [...existing, ...toAdd]);
    App.ls.set('sb_demo_seeded', true);
  }
};
