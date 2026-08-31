/* ================================================
   SkillBridge — AI Service (Multi-Provider)
   Supports: Google Gemini, Claude (Anthropic)
   ================================================ */

const AIService = {

  /* ── Storage Keys ── */
  PROVIDER_KEY:  'sb_ai_provider',   // 'gemini' | 'claude'
  GEMINI_KEY:    'sb_gemini_key',
  CLAUDE_KEY:    'sb_claude_key',

  /* ── Endpoints ── */
  GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
  CLAUDE_ENDPOINT: 'https://api.anthropic.com/v1/messages',
  CLAUDE_MODEL:    'claude-opus-4-5',

  /* ── Provider management ── */
  getProvider()       { return localStorage.getItem(this.PROVIDER_KEY) || 'gemini'; },
  setProvider(p)      { localStorage.setItem(this.PROVIDER_KEY, p); },

  /* ── Key management ── */
  getKey(provider) {
    const p = provider || this.getProvider();
    return localStorage.getItem(p === 'gemini' ? this.GEMINI_KEY : this.CLAUDE_KEY) || '';
  },
  setKey(key, provider) {
    const p = provider || this.getProvider();
    localStorage.setItem(p === 'gemini' ? this.GEMINI_KEY : this.CLAUDE_KEY, key);
  },
  hasKey(provider) { return !!this.getKey(provider); },

  /* ── Core: Gemini API call ── */
  async callGemini(prompt, maxTokens = 2048) {
    const key = this.getKey('gemini');
    if (!key) throw new Error('NOKEY');

    const res = await fetch(`${this.GEMINI_ENDPOINT}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.7,
          responseMimeType: 'application/json'   // Ask Gemini to return JSON directly
        },
        systemInstruction: {
          parts: [{ text: 'You are SkillBridge AI, an expert career counselor and skill assessor for Indian engineering students. Always respond with valid JSON only — no markdown, no code fences, no extra explanation.' }]
        }
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || `HTTP ${res.status}`;
      if (res.status === 400 && msg.includes('API_KEY')) throw new Error('NOKEY');
      if (res.status === 429) throw new Error('RATE_LIMIT');
      throw new Error(msg);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  },

  /* ── Core: Claude API call ── */
  async callClaude(prompt, maxTokens = 2048) {
    const key = this.getKey('claude');
    if (!key) throw new Error('NOKEY');

    const res = await fetch(this.CLAUDE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: this.CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: 'You are SkillBridge AI, an expert career counselor and skill assessor. Always respond with valid, parseable JSON only. No markdown, no extra text.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.content[0].text;
  },

  /* ── Unified call (routes to active provider) ── */
  async call(prompt, maxTokens = 2048) {
    const provider = this.getProvider();
    if (provider === 'claude') return this.callClaude(prompt, maxTokens);
    return this.callGemini(prompt, maxTokens);
  },

  /* ── Parse JSON safely ── */
  parseJSON(text) {
    if (!text) throw new Error('Empty response');
    
    // Strip markdown code fences if present
    let clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    
    // Find first brace/bracket to start of JSON
    const match = clean.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (match) {
      clean = match[0];
    }

    // Repair trailing commas before closing braces/brackets
    clean = clean.replace(/,(\s*[\]}])/g, '$1');

    try {
      return JSON.parse(clean);
    } catch (e) {
      console.warn('[AIService] Standard JSON parse failed, attempting auto-repair...', e);
      try {
        const repaired = this.repairTruncatedJSON(clean);
        return JSON.parse(repaired);
      } catch (repairError) {
        console.error('[AIService] Auto-repair failed:', repairError);
        throw new Error('Malformed JSON response from AI. Please try again.');
      }
    }
  },

  /* ── Helper to repair truncated or cut-off JSON strings ── */
  repairTruncatedJSON(jsonString) {
    let clean = jsonString.trim();
    let openBrackets = [];
    let inString = false;
    let escape = false;
    
    for (let i = 0; i < clean.length; i++) {
      let char = clean[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{' || char === '[') {
          openBrackets.push(char === '{' ? '}' : ']');
        } else if (char === '}' || char === ']') {
          const expected = openBrackets.pop();
          // If there's a mismatch, push back or handle gracefully
        }
      }
    }
    
    // If cut-off inside a string, close it
    if (inString) {
      clean += '"';
    }
    
    // Close remaining open brackets in reverse order
    while (openBrackets.length > 0) {
      const close = openBrackets.pop();
      clean = clean.trim();
      if (clean.endsWith(',')) {
        clean = clean.slice(0, -1);
      }
      clean += close;
    }
    
    return clean;
  },

  /* ============================================
     AI FEATURES
     ============================================ */

  /* ── 1. RESUME ANALYSIS ── */
  async analyzeResume(resumeText, targetRole = '', studentContext = '') {
    const roleNote = targetRole ? `Target role: ${targetRole}.` : '';
    const ctxNote  = studentContext ? `Student context: ${studentContext}.` : '';

    const prompt = `Analyze the following resume and return a JSON object with this exact structure:
{
  "name": "string or null",
  "email": "string or null",
  "overallScore": <integer 0-100>,
  "verdict": "Strong Resume|Good Resume|Needs Improvement|Weak Resume",
  "summary": "2-3 sentence professional summary of the candidate",
  "skills": {
    "technical": [{"name": "skill", "proficiency": "mentioned|basic|intermediate|advanced"}],
    "soft": [{"name": "skill"}],
    "tools": [{"name": "tool"}]
  },
  "sections": {
    "contact": true|false,
    "education": true|false,
    "experience": true|false,
    "projects": true|false,
    "skills": true|false,
    "certifications": true|false,
    "achievements": true|false
  },
  "scoreBreakdown": {
    "content": <0-30>,
    "skills": <0-25>,
    "structure": <0-25>,
    "impact": <0-20>
  },
  "skillGaps": {
    "role": "${targetRole || 'General'}",
    "readinessScore": <0-100>,
    "missingSkills": ["skill1", "skill2"],
    "presentSkills": ["skill1", "skill2"]
  },
  "improvements": [
    {"priority": "high|medium|low", "section": "section name", "suggestion": "actionable suggestion", "example": "optional example"}
  ],
  "atsKeywords": {
    "present": ["keyword1", "keyword2"],
    "missing": ["keyword1", "keyword2"]
  },
  "careerFit": [
    {"role": "Role Name", "score": <0-100>}
  ],
  "stats": {
    "wordCount": <integer>,
    "skillCount": <integer>,
    "sections": <integer 0-7>,
    "hasMeasurableImpact": true|false
  }
}
${roleNote} ${ctxNote}
Provide exactly 4-6 improvement suggestions and exactly 4 career fit roles.

Resume text:
${resumeText.slice(0, 4000)}`;

    const raw = await this.call(prompt, 3000);
    return this.parseJSON(raw);
  },

  /* ── 2. AI ASSESSMENT GENERATION ── */
  async generateAssessment(skill, level, count = 10, roleContext = '') {
    const roleInstruction = roleContext
      ? `\nIMPORTANT: ${roleContext} Frame all questions in real-world scenarios relevant to this role.`
      : '';

    const prompt = `Generate exactly ${count} multiple-choice questions to assess "${skill}" at the "${level}" level for engineering students in India.${roleInstruction}

Return a JSON array:
[
  {
    "id": 1,
    "question": "Practical scenario-based question?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": <0-based index>,
    "explanation": "Why correct and how it applies in this role (1-2 sentences)",
    "difficulty": "easy|medium|hard",
    "topic": "sub-topic"
  }
]

Rules:
- Scenario-based, not just definitions
- Difficulty mix for ${level}: ${level === 'beginner' ? '70% easy, 30% medium' : level === 'intermediate' ? '20% easy, 60% medium, 20% hard' : '10% medium, 90% hard'}
- All 4 options must be plausible`;

    const raw = await this.call(prompt, 3000);
    return this.parseJSON(raw);
  },

  /* ── 3. INDUSTRY SKILL DEMAND ── */
  async getSkillDemand(sector = 'technology', region = 'India') {
    const prompt = `Analyze current (2025-2026) industry skill demand for the "${sector}" sector in ${region}.

Return this JSON:
{
  "sector": "${sector}",
  "trending": [
    {"skill": "skill name", "demand": <0-100>, "growth": "+X%", "category": "Technical|AI/ML|Cloud|DevOps|Security", "avgSalary": "₹X LPA - ₹Y LPA"}
  ],
  "insights": ["insight 1", "insight 2", "insight 3", "insight 4"],
  "emergingSkills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "topRoles": [
    {"title": "role", "avgSalary": "₹X LPA", "growth": "+X%"}
  ],
  "recommendations": ["curriculum recommendation 1", "rec 2", "rec 3"]
}

Include exactly 12 trending skills and 4 top roles.`;

    const raw = await this.call(prompt, 2000);
    return this.parseJSON(raw);
  },

  /* ── 4. CAREER RECOMMENDATION ── */
  async recommendCareers(skillProfile, interests, education, projects = []) {
    const prompt = `Based on this student profile, recommend the best career paths.

Profile:
- Skills: ${JSON.stringify(skillProfile)}
- Career Interests: ${interests.join(', ')}
- Education: ${education}
- Projects: ${projects.map(p => p.name || p).join(', ')}

Return this JSON:
{
  "recommendations": [
    {
      "role": "Career Role Title",
      "match": <0-100>,
      "description": "2-sentence role description",
      "matchedSkills": ["skill1", "skill2"],
      "missingSkills": ["skill1", "skill2"],
      "avgSalary": "₹X-Y LPA",
      "growth": "+X% YoY",
      "timeToReady": "X months",
      "path": "brief career progression"
    }
  ],
  "topMatch": "best role name",
  "personalizedAdvice": "2-3 sentence personalized advice",
  "immediateActions": ["action1", "action2", "action3"]
}

Recommend exactly 5 roles, ordered by match score descending.`;

    const raw = await this.call(prompt, 2000);
    return this.parseJSON(raw);
  },

  /* ── 5. SKILL GAP INSIGHTS ── */
  async getSkillGapInsights(studentSkills, targetRole, requiredSkills) {
    const prompt = `Analyze the skill gap between a student and the requirements for "${targetRole}".

Student skills: ${JSON.stringify(studentSkills)}
Required skills: ${JSON.stringify(requiredSkills)}

Return JSON:
{
  "gapScore": <0-100, readiness>,
  "strengths": [{"skill": "name", "assessment": "brief"}],
  "gaps": [
    {"skill": "name", "currentLevel": "none|beginner", "requiredLevel": "intermediate|advanced", "urgency": "High|Medium|Low", "estimatedTime": "X weeks"}
  ],
  "quickWins": ["quick action 1", "quick action 2"],
  "roadmap": "3-4 sentence personalized roadmap",
  "readinessDate": "Estimated ready in X months"
}`;

    const raw = await this.call(prompt, 1500);
    return this.parseJSON(raw);
  },

  /* ── 6. PORTFOLIO OPTIMIZATION ── */
  async optimizePortfolio(projects, skills, targetRole) {
    const prompt = `Review this student portfolio for a "${targetRole}" role and suggest improvements.

Projects: ${JSON.stringify(projects.slice(0,5))}
Skills: ${skills.join(', ')}

Return JSON:
{
  "overallStrength": <0-100>,
  "verdict": "1 sentence summary",
  "projectFeedback": [
    {"name": "project name", "strengths": ["s1"], "improvements": ["i1"], "impactScore": <0-10>}
  ],
  "missingProjects": ["project idea 1 for this role", "idea 2"],
  "topSkillsToShowcase": ["skill1", "skill2", "skill3"],
  "suggestions": ["actionable suggestion 1", "suggestion 2", "suggestion 3"]
}`;

    const raw = await this.call(prompt, 1500);
    return this.parseJSON(raw);
  },

  /* ── 7. CONSULTANCY MATCHING (Academician) ── */
  async matchConsultancy(expertise, interests) {
    const prompt = `Suggest industry consultancy and collaboration opportunities for a faculty member.

Expertise: ${expertise.join(', ')}
Research Interests: ${interests.join(', ')}

Return JSON:
{
  "opportunities": [
    {
      "title": "opportunity title",
      "type": "Consultancy|Research|FDP|Workshop|Guest Lecture",
      "company": "company or organization",
      "description": "2-sentence description",
      "match": <0-100>,
      "compensation": "₹X/month or Free + Certificate"
    }
  ],
  "insights": ["insight 1", "insight 2"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}

Suggest exactly 5 opportunities.`;

    const raw = await this.call(prompt, 1500);
    return this.parseJSON(raw);
  },

  /* ============================================
     UI: API Key / Provider Setup Modal
     ============================================ */
  promptForKey(onSuccess) {
    const existing = document.getElementById('api-key-modal');
    if (existing) existing.remove();

    const currentProvider = this.getProvider();
    const hasGemini = !!localStorage.getItem(this.GEMINI_KEY);
    const hasClaude = !!localStorage.getItem(this.CLAUDE_KEY);

    const el = document.createElement('div');
    el.id = 'api-key-modal';
    el.className = 'modal-overlay active';
    el.innerHTML = `
      <div class="modal-box" style="max-width:520px">
        <div class="modal-header">
          <div>
            <div class="ai-badge" style="margin-bottom:var(--space-2)">✦ AI Setup</div>
            <h3 class="modal-title">Configure AI Provider</h3>
          </div>
          <button class="btn-icon-only" onclick="document.getElementById('api-key-modal').remove()">✕</button>
        </div>

        <!-- Provider Tabs -->
        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-5);background:var(--bg-tertiary);border-radius:var(--radius-lg);padding:4px">
          <button id="tab-gemini" onclick="switchProviderTab('gemini')" style="flex:1;padding:var(--space-3);border-radius:var(--radius-md);border:none;cursor:pointer;font-family:var(--font-body);font-size:var(--text-sm);font-weight:var(--font-semibold);transition:all 0.2s;background:${currentProvider==='gemini'?'var(--bg-secondary)':'transparent'};color:${currentProvider==='gemini'?'var(--text-primary)':'var(--text-muted)'}">
            🌟 Google Gemini <span style="font-size:9px;background:rgba(16,185,129,0.2);color:var(--emerald-400);padding:1px 6px;border-radius:8px;margin-left:4px">FREE TIER</span>
          </button>
          <button id="tab-claude" onclick="switchProviderTab('claude')" style="flex:1;padding:var(--space-3);border-radius:var(--radius-md);border:none;cursor:pointer;font-family:var(--font-body);font-size:var(--text-sm);font-weight:var(--font-semibold);transition:all 0.2s;background:${currentProvider==='claude'?'var(--bg-secondary)':'transparent'};color:${currentProvider==='claude'?'var(--text-primary)':'var(--text-muted)'}">
            ✦ Claude (Anthropic)
          </button>
        </div>

        <!-- Gemini Panel -->
        <div id="panel-gemini" style="display:${currentProvider==='gemini'?'block':'none'}">
          <div style="padding:var(--space-4);background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:var(--radius-lg);margin-bottom:var(--space-4);font-size:var(--text-sm)">
            <strong style="color:var(--emerald-400)">✓ Free tier available</strong> — Get a free API key in 30 seconds at
            <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--indigo-400)">aistudio.google.com</a>.
            Gemini 1.5 Flash is free with generous rate limits.
          </div>
          <div class="form-group">
            <label class="form-label">Google Gemini API Key</label>
            <input id="gemini-key-input" type="password" class="form-input" placeholder="AIza... or AQ.Ab8..." value="${hasGemini ? '••••••••••••••••' : ''}" autocomplete="off">
            <div class="form-hint">From <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--indigo-400)">aistudio.google.com</a> → Get API key (key format may vary by region)</div>
          </div>
        </div>

        <!-- Claude Panel -->
        <div id="panel-claude" style="display:${currentProvider==='claude'?'block':'none'}">
          <div style="padding:var(--space-4);background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:var(--radius-lg);margin-bottom:var(--space-4);font-size:var(--text-sm)">
            Get your API key at
            <a href="https://console.anthropic.com" target="_blank" style="color:var(--indigo-400)">console.anthropic.com</a>.
            Uses claude-opus-4-5 model.
          </div>
          <div class="form-group">
            <label class="form-label">Anthropic (Claude) API Key</label>
            <input id="claude-key-input" type="password" class="form-input" placeholder="sk-ant-api03-..." value="${hasClaude ? '••••••••••••••••' : ''}" autocomplete="off">
            <div class="form-hint">From Anthropic Console → API Keys</div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('api-key-modal').remove()">Cancel</button>
          <button id="api-key-save" class="btn btn-primary btn-sm">✓ Save & Use This Provider</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    // Tab switcher
    window.switchProviderTab = (p) => {
      ['gemini','claude'].forEach(x => {
        document.getElementById(`tab-${x}`).style.background   = x===p ? 'var(--bg-secondary)' : 'transparent';
        document.getElementById(`tab-${x}`).style.color        = x===p ? 'var(--text-primary)' : 'var(--text-muted)';
        document.getElementById(`panel-${x}`).style.display    = x===p ? 'block' : 'none';
      });
      this._pendingProvider = p;
    };
    this._pendingProvider = currentProvider;

    document.getElementById('api-key-save').onclick = () => {
      const p   = this._pendingProvider;
      const inp = document.getElementById(`${p}-key-input`).value.trim();

      // Validate
      if (!inp || inp === '••••••••••••••••') {
        // If dots, keep existing key — just switch provider
        if (inp === '••••••••••••••••' && this.getKey(p)) {
          this.setProvider(p);
          el.remove();
          showToast(`Switched to ${p === 'gemini' ? 'Google Gemini' : 'Claude'}`, 'success');
          onSuccess?.();
          return;
        }
        showToast('Please enter a valid API key', 'error');
        return;
      }

      if (p === 'gemini' && inp.length < 10) {
        showToast('Please enter a valid Gemini API key', 'error');
        return;
      }
      if (p === 'claude' && !inp.startsWith('sk-')) {
        showToast('Claude keys start with "sk-ant..."', 'error');
        return;
      }

      this.setKey(inp, p);
      this.setProvider(p);
      el.remove();
      showToast(`✅ ${p === 'gemini' ? 'Google Gemini' : 'Claude'} configured!`, 'success');
      onSuccess?.();
    };
  },

  /* ── Wrapper: handles missing key + errors ── */
  async run(fn, onSuccess) {
    if (!this.hasKey()) {
      this.promptForKey(onSuccess);
      return null;
    }
    try {
      return await fn();
    } catch (err) {
      if (err.message === 'NOKEY') {
        this.promptForKey(onSuccess);
      } else if (err.message === 'RATE_LIMIT' || err.message?.includes('429') || err.message?.includes('quota')) {
        showToast('AI rate limit reached. Try again in a moment or switch providers.', 'warning');
      } else if (err.message?.includes('401') || err.message?.includes('Invalid') || err.message?.includes('API_KEY')) {
        showToast('Invalid API key. Click ⚙ AI Settings to update.', 'error');
        this.promptForKey(onSuccess);
      } else if (err.message?.includes('overloaded') || err.message?.includes('529')) {
        showToast('AI is temporarily overloaded. Please try again.', 'warning');
      } else {
        showToast('AI error: ' + (err.message || 'Unknown error'), 'error');
        console.error('[AIService]', err);
      }
      return null;
    }
  }
};
