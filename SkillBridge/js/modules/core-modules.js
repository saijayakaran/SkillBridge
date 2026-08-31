/* ================================================
   SkillBridge — Skill Gap Analysis Engine
   ================================================ */

const SkillGap = {

  /* ── Calculate gap between student skills and a career role ── */
  analyze(studentSkillProfile, roleSkills) {
    const strong  = [];
    const moderate = [];
    const gaps    = [];
    let totalMatch = 0;
    let count = 0;

    for (const [skill, required] of Object.entries(roleSkills)) {
      const current = studentSkillProfile[skill] || 0;
      const diff    = current - required;
      count++;

      if (current >= required) {
        totalMatch += 100;
        strong.push({ skill, current, required, surplus: diff });
      } else if (current >= required * 0.7) {
        totalMatch += (current / required) * 100;
        moderate.push({ skill, current, required, deficit: Math.abs(diff), pct: Math.round(current / required * 100) });
      } else {
        totalMatch += (current / required) * 100;
        gaps.push({ skill, current, required, deficit: Math.abs(diff), pct: Math.round(current / required * 100), priority: current < required * 0.4 ? 'high' : 'medium' });
      }
    }

    const matchScore = count > 0 ? Math.round(totalMatch / count) : 0;

    return {
      matchScore,
      strong,
      moderate,
      gaps,
      gapCount: gaps.length,
      readinessLevel: matchScore >= 80 ? 'Ready' : matchScore >= 60 ? 'Mostly Ready' : matchScore >= 40 ? 'Developing' : 'Needs Work',
      estimatedWeeksToReady: this.estimateWeeks(gaps)
    };
  },

  /* ── Estimate weeks to close gaps ── */
  estimateWeeks(gaps) {
    if (!gaps.length) return 0;
    const weeksByDeficit = { high: 10, medium: 6, low: 3 };
    const total = gaps.reduce((sum, g) => sum + (weeksByDeficit[g.priority] || 4), 0);
    return Math.round(total / Math.max(gaps.length / 2, 1)); // assume parallel learning
  },

  /* ── Get gap colour class for UI ── */
  gapColor(pct) {
    if (pct >= 85) return 'emerald';
    if (pct >= 65) return 'cyan';
    if (pct >= 40) return 'amber';
    return 'rose';
  },

  /* ── Match a student to a list of opportunities ── */
  matchOpportunities(studentSkillProfile, opportunities) {
    return opportunities
      .filter(o => o.active !== false)
      .map(o => {
        const { matchScore, gaps } = this.analyze(studentSkillProfile, o.requiredSkills || {});
        return { ...o, matchScore, skillGaps: gaps.map(g => g.skill) };
      })
      .sort((a, b) => b.matchScore - a.matchScore);
  },

  /* ── Skill level label ── */
  levelLabel(score) {
    if (score >= 80) return 'Advanced';
    if (score >= 55) return 'Intermediate';
    if (score > 0)  return 'Beginner';
    return 'Not assessed';
  },

  /* ── Level badge class ── */
  levelBadge(score) {
    if (score >= 80) return 'badge-advanced';
    if (score >= 55) return 'badge-intermediate';
    return 'badge-beginner';
  },

  /* ── Overall skill readiness score ── */
  overallScore(skillProfile) {
    const vals = Object.values(skillProfile);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  },

  /* ── Compute top skills to learn based on career interests and gaps ── */
  prioritizedLearningPlan(studentSkillProfile, careerRoles, selectedInterests) {
    const skillUrgency = {};

    const targetRoles = careerRoles.filter(r => selectedInterests.includes(r.title) || selectedInterests.length === 0);

    targetRoles.forEach(role => {
      const { gaps } = this.analyze(studentSkillProfile, role.skills);
      gaps.forEach(g => {
        skillUrgency[g.skill] = (skillUrgency[g.skill] || 0) + g.deficit * (g.priority === 'high' ? 2 : 1);
      });
    });

    return Object.entries(skillUrgency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([skill, urgency]) => ({
        skill,
        urgency: urgency > 100 ? 'High' : urgency > 50 ? 'Medium' : 'Low',
        currentScore: studentSkillProfile[skill] || 0
      }));
  }
};

/* ================================================
   SkillBridge — Recommendation Engine
   ================================================ */

const Recommender = {

  /* ── Recommend career roles ── */
  careers(studentSkillProfile, interests, careerRoles) {
    return careerRoles
      .map(role => {
        const { matchScore, gaps, strong } = SkillGap.analyze(studentSkillProfile, role.skills);
        const interestBoost = interests.includes(role.title) ? 8 : 0;
        const finalScore = Math.min(matchScore + interestBoost, 99);
        return {
          ...role,
          matchScore: finalScore,
          strongSkills: strong.map(s => s.skill),
          missingSkills: gaps.map(g => g.skill)
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);
  },

  /* ── Recommend opportunities ── */
  opportunities(studentSkillProfile, opportunities, interests = []) {
    return SkillGap.matchOpportunities(studentSkillProfile, opportunities)
      .map(o => {
        const interestBoost = interests.some(i => (o.title + o.category).toLowerCase().includes(i.toLowerCase())) ? 5 : 0;
        return { ...o, matchScore: Math.min(o.matchScore + interestBoost, 99) };
      })
      .sort((a, b) => b.matchScore - a.matchScore);
  },

  /* ── Recommend courses for skill gaps ── */
  courses(gaps, allCourses) {
    return gaps.flatMap(g => allCourses.filter(c => c.skill === g.skill || c.skill.toLowerCase().includes(g.skill.toLowerCase())));
  }
};

/* ================================================
   SkillBridge — Notifications Module
   ================================================ */

const Notifications = {

  /* ── Get notifications for current user ── */
  getAll() {
    const user = Auth.getUser();
    if (!user) return [];
    return user.notifications || [];
  },

  /* ── Count unread ── */
  unreadCount() {
    return this.getAll().filter(n => !n.read).length;
  },

  /* ── Add notification ── */
  add(type, message) {
    const user = Auth.getUser();
    if (!user) return;

    const notif = {
      id: 'n_' + Date.now(),
      type,
      message,
      read: false,
      time: new Date().toISOString()
    };

    const notifications = [notif, ...(user.notifications || [])].slice(0, 50);
    Auth.updateUser({ id: user.id, notifications });
    this.updateBadge();
    return notif;
  },

  /* ── Mark as read ── */
  markRead(id) {
    const user = Auth.getUser();
    if (!user) return;
    const notifications = (user.notifications || []).map(n => n.id === id ? { ...n, read: true } : n);
    Auth.updateUser({ id: user.id, notifications });
    this.updateBadge();
  },

  /* ── Mark all as read ── */
  markAllRead() {
    const user = Auth.getUser();
    if (!user) return;
    const notifications = (user.notifications || []).map(n => ({ ...n, read: true }));
    Auth.updateUser({ id: user.id, notifications });
    this.updateBadge();
  },

  /* ── Update badge count in UI ── */
  updateBadge() {
    const count = this.unreadCount();
    document.querySelectorAll('.notif-count').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  },

  /* ── Render notification panel items ── */
  renderList(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const notifs = this.getAll();
    if (!notifs.length) {
      el.innerHTML = `
        <div class="empty-state" style="padding:var(--space-8)">
          <div class="empty-icon">🔔</div>
          <p style="font-size:var(--text-sm)">No notifications yet</p>
        </div>`;
      return;
    }

    el.innerHTML = notifs.slice(0, 20).map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}" onclick="Notifications.markRead('${n.id}')">
        <div class="notif-dot ${n.read ? 'hidden-dot' : ''}"></div>
        <div class="notif-body">
          <div class="notif-text">${n.message}</div>
          <div class="notif-time">${App.formatRelativeTime(n.time)}</div>
        </div>
      </div>`).join('');
  }
};

/* ================================================
   SkillBridge — Canvas Charts Module
   ================================================ */

const Charts = {

  /* ── Radar Chart (Skill Profile) ── */
  drawRadar(canvasId, labels, data, color = '#6366f1') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const radius = Math.min(W, H) / 2 - 40;
    const n = labels.length;
    const angle = (Math.PI * 2) / n;

    ctx.clearRect(0, 0, W, H);

    // Draw grid
    for (let level = 1; level <= 5; level++) {
      const r = (radius * level) / 5;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = angle * i - Math.PI / 2;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (level === 5) {
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        ctx.fill();
      }
    }

    // Draw spokes
    for (let i = 0; i < n; i++) {
      const a = angle * i - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw data polygon
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = angle * i - Math.PI / 2;
      const val = (data[i] || 0) / 100;
      const x = cx + radius * val * Math.cos(a);
      const y = cy + radius * val * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color + '28';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw points
    for (let i = 0; i < n; i++) {
      const a = angle * i - Math.PI / 2;
      const val = (data[i] || 0) / 100;
      const x = cx + radius * val * Math.cos(a);
      const y = cy + radius * val * Math.sin(a);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Draw labels
    ctx.fillStyle = 'rgba(148,163,184,0.9)';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const a = angle * i - Math.PI / 2;
      const x = cx + (radius + 28) * Math.cos(a);
      const y = cy + (radius + 28) * Math.sin(a) + 4;
      ctx.fillText(labels[i], x, y);
    }
  },

  /* ── Bar Chart ── */
  drawBar(canvasId, labels, data, colors = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const padLeft = 50, padRight = 20, padTop = 20, padBottom = 50;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    ctx.clearRect(0, 0, W, H);

    const max = Math.max(...data, 1);
    const barW = chartW / data.length * 0.6;
    const gap  = chartW / data.length;

    const defaultColors = ['#6366f1','#06b6d4','#f59e0b','#10b981','#8b5cf6','#f43f5e','#22d3ee','#fbbf24'];

    // Y-axis grid lines
    for (let i = 0; i <= 5; i++) {
      const y = padTop + chartH - (chartH * i / 5);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(W - padRight, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = 'rgba(148,163,184,0.5)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(max * i / 5), padLeft - 6, y + 4);
    }

    // Bars
    data.forEach((val, i) => {
      const barH = (val / max) * chartH;
      const x = padLeft + gap * i + (gap - barW) / 2;
      const y = padTop + chartH - barH;
      const c = colors ? colors[i] : defaultColors[i % defaultColors.length];

      const grad = ctx.createLinearGradient(x, y, x, padTop + chartH);
      grad.addColorStop(0, c);
      grad.addColorStop(1, c + '44');

      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]) : ctx.rect(x, y, barW, barH);
      ctx.fillStyle = grad;
      ctx.fill();

      // Value label
      ctx.fillStyle = 'rgba(241,245,249,0.8)';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(val + '%', x + barW / 2, y - 6);

      // X label
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(labels[i], x + barW / 2, padTop + chartH + 16);
    });
  },

  /* ── Donut Chart ── */
  drawDonut(canvasId, data, labels, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const outerR = Math.min(W, H) / 2 - 10;
    const innerR = outerR * 0.62;

    ctx.clearRect(0, 0, W, H);

    const total = data.reduce((a, b) => a + b, 0);
    let startAngle = -Math.PI / 2;

    data.forEach((val, i) => {
      const sliceAngle = (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = colors[i];
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Inner circle (hole)
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() || '#0d1117';
    ctx.fill();

    // Center text
    ctx.fillStyle = 'rgba(241,245,249,0.9)';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data[0] + '%', cx, cy + 4);
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(148,163,184,0.7)';
    ctx.fillText(labels[0] || '', cx, cy + 20);
  },

  /* ── Line Chart ── */
  drawLine(canvasId, labels, datasets) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const pad = { top:20, right:20, bottom:40, left:45 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    const allVals = datasets.flatMap(d => d.data);
    const max = Math.max(...allVals, 1);
    const xStep = labels.length > 1 ? cW / (labels.length - 1) : cW;

    // Grid
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + cH - (cH * i / 4);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(148,163,184,0.5)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(max * i / 4), pad.left - 5, y + 3);
    }

    // X labels
    ctx.fillStyle = 'rgba(148,163,184,0.6)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    labels.forEach((lbl, i) => {
      const x = pad.left + i * xStep;
      ctx.fillText(lbl, x, H - pad.bottom + 18);
    });

    // Lines
    datasets.forEach(ds => {
      const pts = ds.data.map((v, i) => ({
        x: pad.left + i * xStep,
        y: pad.top + cH - (v / max) * cH
      }));

      // Fill area
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pad.top + cH);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length - 1].x, pad.top + cH);
      ctx.closePath();
      ctx.fillStyle = ds.color + '18';
      ctx.fill();

      // Line
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = ds.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Dots
      pts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = ds.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(7,11,20,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });
  },

  /* ── Horizontal bar (skill demand) ── */
  drawHorizBar(canvasId, labels, data, color = '#6366f1') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const barH = 22;
    const gap   = 10;
    const labelW = 130;
    const padRight = 50;
    const totalH = (barH + gap) * data.length + 20;
    canvas.height = totalH;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    const max = Math.max(...data, 1);
    const trackW = W - labelW - padRight;

    data.forEach((val, i) => {
      const y = (barH + gap) * i + 10;
      const fillW = (val / max) * trackW;
      const c = Array.isArray(color) ? color[i % color.length] : color;

      // Label
      ctx.fillStyle = 'rgba(148,163,184,0.8)';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(labels[i], labelW - 8, y + barH / 2 + 4);

      // Track
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(labelW, y, trackW, barH, 4) : ctx.rect(labelW, y, trackW, barH);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();

      // Fill
      const grad = ctx.createLinearGradient(labelW, y, labelW + fillW, y);
      grad.addColorStop(0, c + 'cc');
      grad.addColorStop(1, c);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(labelW, y, fillW, barH, 4) : ctx.rect(labelW, y, fillW, barH);
      ctx.fillStyle = grad;
      ctx.fill();

      // Value
      ctx.fillStyle = 'rgba(241,245,249,0.8)';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(val + '%', labelW + fillW + 6, y + barH / 2 + 4);
    });
  }
};
