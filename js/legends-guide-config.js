/* Legends of Basketball — SOMA Guide per-site config
 *
 * Persona: Bill  |  Voice: ElevenLabs agent agent_2401ks53q6t8e2drt1h7va3f2c52
 *
 * Step schema (engine reads this; no Legends-specific code in soma-guide.js):
 *   { id, label, target, narration, instruction, page, demo, requires, substeps[] }
 *   - page:     navigate here before animating (clean URL form, no .html — engine resolves root-absolute)
 *   - demo:     'click' | 'hover' | 'openDropdown'
 *   - requires: { dropdown: '.nav-dropdown' }  — engine opens it before animating
 *   - substeps: child steps played after the parent narration
 */

window.SomaGuideConfig = {

  /* ── Shell ───────────────────────────────────────────────────────────── */
  /* Open into the decluttered conversational shell (one prompt + a few adaptive
   * chips that fade as used) instead of the legacy stacked idle menu. */
  conversationalShell: true,

  /* ── Inference (Ask / answer-from-content) ───────────────────────────── */
  /* Public VPS endpoint — works for all members without any local setup.    */
  /* Dev override: set inferenceUrl = 'http://localhost:8131/ask' in console. */
  inferenceUrl: 'https://vpsmikewolf.duckdns.org/infer/ask',

  /* Site knowledge pack — loaded from legends-knowledge.js (must be included before this script). */
  knowledge: (typeof window.LegendsKnowledge === 'string') ? window.LegendsKnowledge : '',

  /* ── Persona ─────────────────────────────────────────────────────────── */
  persona: {
    name: 'Bill',
    id: 'legends-bill',
    avatar: '🏀',
    greeting:
      'Hi! I\'m Bill, your AI guide to the Legends of Basketball membership site. ' +
      'I can walk you through the site, answer questions, or connect you with resources. ' +
      'What would you like to do?',
    shortGreeting: 'Welcome back! How can I help you today?',
    walkthroughDone:
      'Great — you\'ve seen the essentials! Explore on your own, or ask me ' +
      'anything by typing in the text chat.'
  },

  /* ── Specialist personas (handoff costumes) ──────────────────────────── */
  /* When a member files a bug/change, Bill hands off to a domain specialist —
   * a different name + avatar (and voice agent, if voice mode) — who collects a
   * context-rich report. Reuses Bill's voice agent unless a separate one is set. */
  personas: {
    intake: {
      name: 'Dana · Member Services',
      avatar: '🎫',
      greeting:
        'Thanks — I help the Legends team turn requests into action. ' +
        'Let me grab a few details so the right person can pick this up.',
      voiceAgentId: 'agent_7601kvbcdj4mecwagv960x87fwhc'
    },
    /* Reviewer teammate (own voice) who walks you through completed work when you
     * click "Review work" in the Change Log, then converses about whether it's right. */
    review: {
      name: 'Quinn · Review',
      avatar: '🔎',
      greeting:
        'I review completed work. Let me show you what we changed and make sure it’s right.',
      voiceAgentId: 'agent_7501kvb3j188eyq90ssgfe827qw0'
    }
  },

  /* ── Voice agent (ElevenLabs) ────────────────────────────────────────── */
  voiceAgentId: 'agent_2401ks53q6t8e2drt1h7va3f2c52',

  /* ── TTS narration proxy ─────────────────────────────────────────────── */
  ttsProxyUrl: 'https://bill-talk.netlify.app/.netlify/functions/el-proxy',

  /* ── Cursor lead-in (ms after audio starts → cursor appears) ─────────── */
  cursorLeadIn: 1200,

  /* ── Clean on close: discard tour state when widget is minimised ─────── */
  cleanOnClose: true,

  /* ── Feedback intake (Capability 1) ─────────────────────────────────── */
  /* Bill captures bug reports and feature requests inline and POSTs them   */
  /* server-side to this Netlify function. Greg reviews in admin.html.      */
  feedbackUrl: '/.netlify/functions/submit-feedback',

  /* ── Conversation recording (diagnostics) ───────────────────────────── */
  /* Bill POSTs each turn + decision trace here; reviewed in admin-bill-log.html. */
  telemetry: { logUrl: '/.netlify/functions/log-bill' },

  /* ── Intake queue ────────────────────────────────────────────────────── */
  /* Bill's structured bug/change requests land in change_requests (one queue,
   * processed by the daemon). */
  intakeUrl: '/.netlify/functions/submit-intake',

  /* ── Admin gate + admin-only Do actions ─────────────────────────────── */
  /* Members have no safe write targets on this (mostly static) site, so they get
   * no autonomous actions. Admins (Greg/Mike) do — gated by requiresAdmin below. */
  isAdmin: function () {
    try {
      var s = (window.SomaAuth && SomaAuth.session) ? SomaAuth.session : null;
      var admins = ['mw@mike-wolf.com', 'gfos44@gmail.com'];
      return !!(s && s.user && admins.indexOf((s.user.email || '').toLowerCase()) !== -1);
    } catch (e) { return false; }
  },
  actions: [
    {
      /* Admin files a site-change request via the change-log form. Filing a request
       * is reversible (risk:low); the change itself still goes through the
       * approval → preview → publish gate. Works on the Site Change Log page. */
      id: 'file-change-request',
      label: 'file a change request',
      requiresAdmin: true,
      keywords: ['file a change request', 'request a change', 'put in a request', 'log a change request', 'request that'],
      risk: 'low',
      params: [
        { name: 'title',   label: 'Short title', placeholder: 'e.g. Add a sponsors section to the homepage' },
        { name: 'details', label: 'What should change?', placeholder: 'Describe the change…' }
      ],
      steps: [
        { op: 'click', target: '#add-request-btn' },
        { op: 'fill',  target: '#req-title',   param: 'title' },
        { op: 'fill',  target: '#req-details', param: 'details' },
        { op: 'click', target: '#req-submit-btn' }
      ],
      confirmText: 'File a change request — “{title}”?',
      doneText: 'Filed — it’s in the change-log queue for review.'
    }
  ],

  /* ── Identity (account-keyed SOMA profile) ──────────────────────────── */
  /* Anonymous visitors fall back to per-browser localStorage. Logged-in members
   * get a cross-app profile (public.soma_profiles) so Bill recognizes them,
   * skips the intro, and decays chips by what they've already been shown. */
  identity: {
    appId: 'legends',
    getProfile: function () {
      try {
        var s = (window.SomaAuth && SomaAuth.session) ? SomaAuth.session : null;
        if (!s || !s.user) return Promise.resolve(null);
        var c = window.SOMA_AUTH_CONFIG;
        return fetch(c.url + '/rest/v1/soma_profiles?select=*&user_id=eq.' + s.user.id, {
          headers: { apikey: c.anonKey, Authorization: 'Bearer ' + s.access_token }
        }).then(function (r) { return r.ok ? r.json() : []; })
          .then(function (rows) { return (rows && rows[0]) || null; })
          .catch(function () { return null; });
      } catch (e) { return Promise.resolve(null); }
    },
    recordSeen: function (id) {
      try {
        var s = (window.SomaAuth && SomaAuth.session) ? SomaAuth.session : null;
        if (!s || !s.user) return Promise.resolve();
        var c = window.SOMA_AUTH_CONFIG;
        var base = c.url + '/rest/v1/soma_profiles';
        var H = { apikey: c.anonKey, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' };
        return fetch(base + '?select=guide_seen,bill_familiarity&user_id=eq.' + s.user.id, { headers: H })
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (rows) {
            var cur = rows[0] || { guide_seen: {}, bill_familiarity: 0 };
            var gs = cur.guide_seen || {};
            gs.legends = gs.legends || [];
            if (gs.legends.indexOf(id) === -1) gs.legends.push(id);
            var row = {
              user_id: s.user.id, guide_seen: gs,
              bill_familiarity: (cur.bill_familiarity || 0) + 1,
              updated_at: new Date().toISOString()
            };
            return fetch(base + '?on_conflict=user_id', {
              method: 'POST',
              headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, H),
              body: JSON.stringify(row)
            });
          }).catch(function () {});
      } catch (e) { return Promise.resolve(); }
    }
  },

  /* ── Domain scope guard (Capability 2) ──────────────────────────────── */
  /* Off-topic pattern list — matched client-side before inference.         */
  /* contextNote is prepended to knowledge sent to the inference endpoint   */
  /* so the LLM also deflects nuanced off-domain questions.                 */
  scopeGuard: {
    deflect: "That's a bit outside my lane — I'm here to help with the Legends of Basketball membership site, member benefits, and how this works. What can I help you with here?",
    offTopicPatterns: [
      /\bweather\b/i,
      /write (me )?(a |an )?(poem|story|essay|song|haiku|sonnet|limerick)/i,
      /tell me a (joke|story)/i,
      /\b(stock price|stock market|stock ticker|share price)\b/i,
      /^(translate|how do you say |what is .* in [a-z]+\?)/i,
      /\brecipe for\b/i,
      /\b(sports score|game score|who won (the |a )?(game|match|series))\b/i,
      /\b(latest news|news today|current events|headlines)\b/i,
      /\b(solve this|calculate|what is \d+[\s+\-*/])/i,
      /\b(write me|draft me|compose me)\b/i,
      /\b(president|prime minister|congress|senator|governor)\b(?!.*legends|.*basketball|.*nbrpa)/i,
    ],
    contextNote: [
      'SCOPE INSTRUCTIONS FOR BILL:',
      'You are Bill, the AI assistant for the Legends of Basketball membership site.',
      'Always call the organization "Legends" or "Legends of Basketball" — never use the',
      'acronym NBRPA in your answers, even though Legends is the official home of the',
      'National Basketball Retired Players Association.',
      'You ONLY answer questions about these three domains:',
      '1. LEGENDS DOMAIN: retired professional basketball, Legends history and mission, player benefits',
      '   (pension, health programs, financial support), the five pillars (Camaraderie, Health,',
      '   Financial Stability, Community, Family), committee members and their careers.',
      '2. WEBSITE NAVIGATION: how to use this membership site, where to find things, what each',
      '   page does, how to submit forms, how the Committee section works, etc.',
      '3. SOMA: what SOMA (Shared Orchestration & Memory Architecture) is, how the human+AI',
      '   collaboration model works, what Bill\'s role is, who Greg Foster is in this context.',
      'For ANY question outside these three domains (general trivia, current events, writing',
      'tasks, other sports, unrelated topics), respond with exactly:',
      '"That\'s a bit outside my lane — I\'m here to help with the Legends of Basketball',
      'membership site, member benefits, and how this works. What can I help you with here?"',
      'Do not attempt to answer off-domain questions even if you know the answer.',
    ].join('\n')
  },

  /* ── Site map ────────────────────────────────────────────────────────── */
  siteMap: [
    { id: 'home',            label: 'Home',              path: 'index.html',           description: 'Overview of the Legends of Basketball Membership Services Committee' },
    { id: 'committee',       label: 'Committee',         path: 'members.html',         description: 'Browse all committee members with bios, photos, and career highlights' },
    { id: 'resources',       label: 'Resources',         path: 'resources.html',       description: 'Committee documents, Leslie Johnson proposals, and reference materials' },
    { id: 'minutes',         label: 'Meeting Minutes',   path: 'minutes.html',         description: 'Official minutes from committee meetings' },
    { id: 'systems-map',     label: 'Systems Map',       path: 'systems-map.html',     description: 'Interactive map of the organization\'s systems and initiatives' },
    { id: 'assessment',      label: 'Assessment',        path: 'assessment.html',      description: 'Member satisfaction assessment and feedback form' },
    { id: 'recommendations', label: 'Recommendations',   path: 'recommendations.html', description: 'Committee recommendations board — current proposals and status' },
    { id: 'features',        label: 'Feature Requests',  path: 'features.html',        description: 'Submit new feature ideas for the membership site' },
    { id: 'bugs',            label: 'Bug Reports',       path: 'bugs.html',            description: 'Report issues with the membership site' },
    { id: 'about',           label: 'About & Contact',   path: 'about.html',           description: 'About the committee, its mission, and how to contact us' },
    { id: 'ask-bill-full',   label: 'Ask Bill (full)',   path: 'https://bill-talk.netlify.app', description: 'Full voice and text conversation with Bill' }
  ],

  /* ── Walkthroughs ────────────────────────────────────────────────────── */
  walkthroughs: [

    /* ── 1. Site Tour ── */
    {
      id: 'site-tour',
      label: 'Site Tour',
      /* Keep single-word keywords rare — the engine only matches them in short
       * messages (≤4 words), but multi-word phrases match anywhere. Never use
       * conversational filler ('show me', 'question', 'chat') as a keyword. */
      keywords: ['tour', 'overview', 'site tour', 'show me around', 'show me the site',
                 'what is this site', 'help me navigate', 'walk me through the site'],
      steps: [

        /* Step 1 — Navigation bar; page:'/' ensures we always start from home.
         *
         * Narrations use inline [[cue]] choreography markup (see CHOREOGRAPHY.md):
         * a cue fires when the spoken narration reaches that point in the text.
         * Move a cue earlier/later in the sentence to change when it happens.
         * The words themselves must not change, or the pre-generated audio in
         * audio/tour/ goes stale (npm test catches this). */
        {
          target: '.nav-inner',
          page: '/',
          label: 'Navigation',
          demo: 'hover',
          narration:
            '[[arrow .nav-inner 2s]] Welcome! Let\'s start at the top. ' +
            '[[highlight]] This navigation bar is your map to the whole site.',
          instruction:
            'The nav links on the right take you to every section. On mobile, tap the ☰ menu icon.'
        },

        /* Step 2 — Committee page (parent) with sub-steps for the member grid + one representative profile.
         * Scoped to Greg Foster as the demo member — no need to tour all nine in the walkthrough. */
        {
          target: 'a[href="members.html"]',
          label: 'Committee members',
          demo: 'click',
          narration:
            'The Committee page shows all nine members of the Membership Services Committee — ' +
            '[[arrow a[href="members.html"] 2s]] former NBA, WNBA, ABA, and Globetrotter legends. ' +
            '[[highlight]] Let me show you the layout. [[click]]',
          instruction: 'Click "Committee" to browse member profiles.',
          substeps: [
            {
              target: '.members-grid',
              page: 'members',
              label: 'Member grid',
              demo: 'hover',
              narration:
                '[[arrow .members-grid 2s]] Here\'s the member grid — cards for each legend with career highlights ' +
                '[[highlight]] and contact info.',
              instruction: 'Click any member card to open their full profile.'
            },
            {
              target: 'a[href="members/greg-foster.html"]',
              page: 'members',
              label: 'Greg Foster — Chairman',
              demo: 'click',
              narration:
                'Greg Foster is our Chairman — [[arrow a[href="members/greg-foster.html"] 2s]] thirteen NBA seasons, a championship with ' +
                '[[highlight]] the Lakers in 2001, and deep leadership experience as coach and broadcaster. [[click]]',
              instruction: 'Click "View Profile" to see Greg\'s full bio and contact details.'
            },
            {
              target: '.profile-hero',
              page: 'members/greg-foster',
              label: 'Greg\'s profile',
              demo: 'hover',
              narration:
                '[[arrow .profile-hero 1500ms]] Each member profile has a full bio, career highlights, and contact ' +
                '[[highlight]] information.',
              instruction: 'Click the "Committee" breadcrumb link to return to the member list.'
            }
          ]
        },

        /* Step 3 — Resources dropdown (parent) with sub-steps for each section.
         * page: 'members' on parent ensures we start from a root-level page where nav hrefs
         * are root-relative (e.g. href="minutes.html", not href="../minutes.html").
         * Selector uses :has() to uniquely target the Resources <li>, not the Committee one
         * (both share .nav-dropdown; querySelector would otherwise return the first match). */
        {
          target: '.nav-dropdown:has(> .nav-dropdown-toggle[href="resources.html"])',
          page: 'members',
          label: 'Resources dropdown',
          demo: 'openDropdown',
          requires: { dropdown: '.nav-dropdown:has(> .nav-dropdown-toggle[href="resources.html"])' },
          narration:
            '[[arrow .nav-dropdown:has(> .nav-dropdown-toggle[href="resources.html"]) 2s]] ' +
            'Resources is a dropdown with several sub-sections. ' +
            '[[highlight .nav-dropdown-toggle[href="resources.html"]]] Let me walk you through each one.',
          instruction: 'Click "Resources ▾" to see the dropdown menu options.',
          substeps: [
            {
              target: '.hero',
              page: 'minutes',
              label: 'Meeting Minutes',
              demo: 'hover',
              narration:
                '[[arrow .hero 1500ms]] Meeting Minutes is where you\'ll find the official record of every committee ' +
                '[[highlight]] session — decisions, votes, and discussion summaries.',
              instruction: 'Click "Minutes" to view all meeting records.'
            },
            {
              target: '#map-container',
              page: 'systems-map',
              label: 'Systems Map',
              demo: 'hover',
              narration:
                '[[arrow #map-container 1500ms]] The Systems Map gives you an interactive overview of the organization\'s ' +
                '[[highlight]] initiatives and how they connect — a great place to orient yourself.',
              instruction: 'Click "Systems Map" to explore the initiative landscape.'
            },
            {
              target: '.assessment-header',
              page: 'assessment',
              label: 'Assessment',
              demo: 'hover',
              narration:
                '[[arrow .assessment-header 1500ms]] The Assessment is a member satisfaction survey. ' +
                '[[highlight]] Your feedback helps the ' +
                'committee prioritize improvements and understand member needs.',
              instruction: 'Click "Assessment" to complete or review the satisfaction survey.'
            },
            {
              target: '.hero',
              page: 'resources',
              label: 'Documents',
              demo: 'hover',
              narration:
                '[[arrow .hero 1500ms]] And the Resources page itself is home to committee documents, the Leslie ' +
                '[[highlight]] Johnson proposals, and other reference materials.',
              instruction: 'Click "Resources" to browse all committee documents.'
            }
          ]
        },

        /* Step 4 — Recommendations nav link.
         * page: 'resources' ensures we're on a root-level page when resuming/jumping here,
         * so the nav selector a[href="recommendations.html"] resolves correctly. */
        {
          target: 'a[href="recommendations.html"]',
          page: 'resources',
          label: 'Recommendations',
          demo: 'click',
          narration:
            'The Recommendations board shows current committee proposals and their status. ' +
            '[[arrow a[href="recommendations.html"] 2s]] [[highlight]] Let me take you there. [[click]]',
          instruction: 'Heading to the Recommendations page…'
        },
        {
          target: '#rec-grid',
          page: 'recommendations',
          label: 'Recommendations board',
          demo: 'hover',
          narration:
            '[[arrow #rec-grid 2s]] Here\'s the Recommendations board — a living record of committee decisions and ' +
            '[[highlight]] initiatives. Each card shows a proposal and its current status.',
          instruction: 'Browse the proposals, or click any card for details.'
        },

        /* Step 5 — About & Contact.
         * page: 'recommendations' ensures we're on a root-level page when resuming/jumping
         * here, so a[href="about.html"] in the nav resolves correctly from any starting page. */
        {
          target: 'a[href="about.html"]',
          page: 'recommendations',
          label: 'About & Contact',
          demo: 'click',
          narration:
            'About & Contact tells you more about the committee\'s mission and who to reach out to. ' +
            '[[arrow a[href="about.html"] 2s]] [[highlight]] Let me take you there. [[click]]',
          instruction: 'Heading to the About & Contact page…'
        },
        {
          target: '.hero',
          page: 'about',
          label: 'About page',
          demo: 'hover',
          narration:
            '[[arrow .hero 1500ms]] This is the About & Contact page. [[highlight]] You\'ll find the committee\'s mission statement, ' +
            'key contacts, and information on how to get in touch.',
          instruction: 'Scroll down to find contact details and the committee\'s mission.'
        },

        /* Step 6 — Ask Bill nav link */
        {
          target: '#ask-bill-nav',
          label: 'Ask Bill nav',
          demo: 'hover',
          narration:
            '[[arrow #ask-bill-nav 2s]] And finally — the "Ask Bill" link in the nav opens this very widget so you can ' +
            '[[highlight]] reach me from any page, any time. That wraps up the site tour!',
          instruction: 'Click "Ask Bill" in the nav to open this guide widget on any page.'
        }
      ]
    },

    /* ── 2. How to find a member ── */
    {
      id: 'find-member',
      label: 'How to find a member',
      keywords: [
        'find a member', 'find a committee member', 'committee member profile',
        'member profile', 'member list', 'member directory', 'member bio',
        'browse the committee', 'browse members', 'show me the committee',
        'members page', 'committee members page', 'contact a member',
        'how do i find a member', 'where can i find a member',
        'player profile', 'player bio',
      ],
      steps: [
        {
          target: 'a[href="members.html"]',
          label: 'Go to Committee',
          demo: 'click',
          narration:
            '[[arrow a[href="members.html"] 2s]] To find a committee member, head to the Committee page. ' +
            '[[highlight]] I\'ll take you there now. [[click]]',
          instruction: 'Heading to the Committee page…'
        },
        {
          target: '.members-grid',
          page: 'members',
          label: 'Member grid',
          demo: 'hover',
          narration:
            '[[arrow .members-grid 2s]] Here\'s the Committee page — you\'ll find cards for each member with their photo, ' +
            '[[highlight]] NBA career highlights, and contact information.',
          instruction: 'Click any member card to open their full profile.'
        }
      ]
    },

    /* ── 3. How to suggest a feature ── */
    {
      id: 'submit-feature',
      label: 'How to suggest a feature',
      keywords: [
        'show me feature requests', 'feature request page', 'features page',
        'how do i submit a feature', 'where do i submit a feature',
        'feature request form', 'submit a feature request', 'feature requests page',
        'navigate to features', 'go to the features page',
      ],
      steps: [
        {
          target: '.nav-dropdown:has(> .nav-dropdown-toggle[href="resources.html"])',
          label: 'Open Resources',
          demo: 'openDropdown',
          requires: { dropdown: '.nav-dropdown:has(> .nav-dropdown-toggle[href="resources.html"])' },
          narration:
            '[[arrow .nav-dropdown:has(> .nav-dropdown-toggle[href="resources.html"]) 2s]] ' +
            'Feature requests live under the Resources section. ' +
            '[[highlight .nav-dropdown-toggle[href="resources.html"]]] [[click]]',
          instruction: 'Click "Resources ▾" in the navigation to open the dropdown menu.'
        },
        {
          target: '.nav-dropdown:has(> .nav-dropdown-toggle[href="resources.html"]) .nav-dropdown-menu',
          label: 'Resources dropdown menu',
          demo: 'hover',
          requires: { dropdown: '.nav-dropdown:has(> .nav-dropdown-toggle[href="resources.html"])' },
          narration:
            '[[arrow .nav-dropdown:has(> .nav-dropdown-toggle[href="resources.html"]) .nav-dropdown-menu 1500ms]] ' +
            'You\'ll see a menu with Resources, Minutes, Systems Map, and Assessment. ' +
            '[[highlight .nav-dropdown-menu a[href="resources.html"]]] Feature Requests is reachable from the main Resources page.',
          instruction: 'Click "Resources" in the dropdown to go to the resources page, then look for the Feature Requests link.'
        }
      ]
    },

    /* ── 4. How to use Ask Bill ── */
    {
      id: 'ask-bill-walkthrough',
      label: 'How to use Ask Bill',
      keywords: ['how do i use ask bill', 'how to use ask bill', 'use ask bill',
                 'talk to bill', 'voice chat', 'speak with bill', 'how do i ask a question'],
      steps: [
        {
          target: '#ask-bill-section',
          page: '/',
          label: 'Ask Bill section',
          demo: 'hover',
          narration:
            '[[arrow #ask-bill-section 2s]] The "Have a Question? Ask Bill" section on the home page is a shortcut to me. ' +
            '[[highlight]] I\'m an AI trained on Legends of Basketball materials.',
          instruction: 'Scroll down the home page to find the Ask Bill section (visible when signed in).'
        },
        {
          target: '#ask-bill-nav',
          label: 'Ask Bill nav link',
          demo: 'hover',
          narration:
            '[[arrow #ask-bill-nav 2s]] The "Ask Bill" link in the nav is always visible — ' +
            '[[highlight]] clicking it opens this widget ' +
            'so you can chat with me on any page.',
          instruction: 'Click "Ask Bill" in the navigation to open this guide widget.'
        },
        {
          target: '#soma-guide',
          label: 'This guide widget',
          demo: 'hover',
          narration:
            '[[arrow #soma-guide 2s]] And of course — you\'re already talking to me right here! ' +
            '[[highlight]] Use this widget anytime for ' +
            'a quick question, or switch to text mode for a longer conversation.',
          instruction: 'Use the 💬 or 🎙 buttons at the top of this panel to switch modes.'
        }
      ]
    }

  ] /* end walkthroughs */
};
