/* ================================================
   SkillBridge — App Bootstrap & Utilities
   ================================================ */

const App = {
  version: '1.0.0',

  init() {
    this.initToastContainer();
    this.initAnimations();
    this.initMobileMenu();
    this.initDropdowns();
    this.highlightActiveNav();
    this.initAIProviderBadge();
  },

  /* === AI Provider Badge === */
  initAIProviderBadge() {
    // Inject after topbar is ready
    const inject = () => {
      const topbarActions = document.querySelector('.topbar-actions');
      if (!topbarActions || document.getElementById('ai-provider-btn')) return;

      const provider = localStorage.getItem('sb_ai_provider') || 'gemini';
      const hasKey   = !!(localStorage.getItem(provider === 'gemini' ? 'sb_gemini_key' : 'sb_claude_key'));
      const label    = provider === 'gemini' ? '🌟 Gemini' : '✦ Claude';

      const btn = document.createElement('button');
      btn.id        = 'ai-provider-btn';
      btn.className = 'btn btn-ghost btn-sm';
      btn.style.cssText = 'font-size:11px;gap:4px;';
      btn.innerHTML = `
        <span style="width:7px;height:7px;border-radius:50%;background:${hasKey ? 'var(--emerald-500)' : 'var(--rose-500)'};display:inline-block;flex-shrink:0"></span>
        ${label}
        <span style="color:var(--text-muted);font-size:9px">⚙</span>`;
      btn.title   = hasKey ? `Using ${label}. Click to change.` : 'AI not configured. Click to set up.';
      btn.onclick = () => { if (window.AIService) AIService.promptForKey(() => App.initAIProviderBadge()); };

      // Insert before last child (usually notifications/actions)
      topbarActions.insertBefore(btn, topbarActions.firstChild);
    };

    // Remove existing before re-injecting (for refresh)
    const existing = document.getElementById('ai-provider-btn');
    if (existing) existing.remove();

    if (document.querySelector('.topbar-actions')) inject();
    else window.addEventListener('DOMContentLoaded', inject, { once: true });
  },

  /* === Toast System === */
  initToastContainer() {
    if (!document.getElementById('sb-toasts')) {
      const el = document.createElement('div');
      el.id = 'sb-toasts';
      el.className = 'toast-container';
      document.body.appendChild(el);
    }
  },

  showToast(msg, type = 'info', duration = 4000) {
    const icons = { success:'✓', error:'✕', info:'ℹ', warning:'⚠' };
    const colorMap = { success:'emerald', error:'rose', info:'indigo', warning:'amber' };
    const c = colorMap[type];
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span style="font-size:16px;color:var(--${c}-400)">${icons[type]}</span>
      <span style="font-size:var(--text-sm);color:var(--text-secondary);flex:1">${msg}</span>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;line-height:1;padding:0">×</button>
    `;
    document.getElementById('sb-toasts').appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(120%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /* === Scroll Animations === */
  initAnimations() {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(el => obs.observe(el));

    // Animate progress bars
    const barObs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          setTimeout(() => {
            e.target.querySelectorAll('.progress-fill[data-w]').forEach(bar => {
              bar.style.width = bar.dataset.w + '%';
            });
          }, 200);
          barObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.2 });

    document.querySelectorAll('.skill-bar-init').forEach(el => barObs.observe(el));

    // Counter animations
    document.querySelectorAll('[data-count]').forEach(el => {
      const counterObs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            this.animateCounter(e.target);
            counterObs.unobserve(e.target);
          }
        });
      }, { threshold: 0.5 });
      counterObs.observe(el);
    });
  },

  animateCounter(el) {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    const decimals = el.dataset.decimals || 0;
    const duration = 1800;
    const steps = 50;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current = Math.min(current + increment, target);
      el.textContent = prefix + (Number.isInteger(target) ? Math.floor(current).toLocaleString() : current.toFixed(decimals)) + suffix;
      if (current >= target) clearInterval(timer);
    }, duration / steps);
  },

  /* === Mobile Sidebar === */
  initMobileMenu() {
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!sidebar) return;

    if (!overlay) {
      const ov = document.createElement('div');
      ov.id = 'sidebar-overlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:150;display:none;backdrop-filter:blur(3px)';
      ov.onclick = () => this.closeSidebar();
      document.body.appendChild(ov);
    }

    if (toggleBtn) {
      toggleBtn.onclick = () => {
        sidebar.classList.toggle('open');
        document.getElementById('sidebar-overlay').style.display = sidebar.classList.contains('open') ? 'block' : 'none';
      };
    }
  },

  closeSidebar() {
    document.querySelector('.sidebar')?.classList.remove('open');
    const ov = document.getElementById('sidebar-overlay');
    if (ov) ov.style.display = 'none';
  },

  /* === Dropdowns === */
  initDropdowns() {
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-dropdown]');
      if (trigger) {
        const targetId = trigger.dataset.dropdown;
        const menu = document.getElementById(targetId);
        if (menu) {
          const isOpen = menu.classList.contains('open');
          document.querySelectorAll('.dropdown-menu.open, .notif-panel.open').forEach(m => m.classList.remove('open'));
          if (!isOpen) menu.classList.add('open');
        }
        return;
      }
      // Close all dropdowns on outside click
      if (!e.target.closest('.dropdown-menu') && !e.target.closest('.notif-panel')) {
        document.querySelectorAll('.dropdown-menu.open, .notif-panel.open').forEach(m => m.classList.remove('open'));
      }
    });
  },

  /* === Highlight Active Nav === */
  highlightActiveNav() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-item').forEach(item => {
      const href = item.getAttribute('href') || '';
      if (href && href.includes(path)) {
        item.classList.add('active');
      }
    });
  },

  /* === Modal Helpers === */
  openModal(id) {
    const m = document.getElementById(id);
    if (m) {
      m.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  },

  closeModal(id) {
    const m = document.getElementById(id);
    if (m) {
      m.classList.remove('active');
      document.body.style.overflow = '';
    }
  },

  /* === Confirm Dialog === */
  confirm(msg, onYes) {
    const existing = document.getElementById('sb-confirm');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'sb-confirm';
    el.className = 'modal-overlay active';
    el.innerHTML = `
      <div class="modal-box" style="max-width:400px">
        <div class="modal-header">
          <h3 class="modal-title">Confirm Action</h3>
        </div>
        <p style="color:var(--text-secondary);margin-bottom:var(--space-6)">${msg}</p>
        <div class="modal-footer">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('sb-confirm').remove()">Cancel</button>
          <button id="sb-confirm-yes" class="btn btn-danger btn-sm">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    document.getElementById('sb-confirm-yes').onclick = () => {
      el.remove();
      onYes?.();
    };
  },

  /* === Format Helpers === */
  formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  },

  formatRelativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return this.formatDate(iso);
  },

  timeUntil(iso) {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff < 0) return 'Expired';
    const d = Math.floor(diff / 86400000);
    if (d > 0) return `${d}d left`;
    const h = Math.floor(diff / 3600000);
    return `${h}h left`;
  },

  truncate(str, len = 100) {
    return str && str.length > len ? str.slice(0, len) + '...' : str;
  },

  /* === Debounce === */
  debounce(fn, ms = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  },

  /* === Local Storage helpers === */
  ls: {
    get(key, fallback = null) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
      catch { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); }
      catch (e) { console.warn('localStorage full', e); }
    },
    remove(key) { localStorage.removeItem(key); }
  }
};

/* === Global shorthand === */
const showToast = (msg, type) => App.showToast(msg, type);
const openModal = (id) => App.openModal(id);
const closeModal = (id) => App.closeModal(id);

document.addEventListener('DOMContentLoaded', () => App.init());
