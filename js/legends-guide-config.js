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

  /* ── Inference (Ask / answer-from-content) ───────────────────────────── */
  /* Requires soma-infer running locally: cd ~/Projects/SOMA/services/soma-infer && node server.js */
  /* https→http://localhost is allowed in Chrome as a trustworthy origin for localhost. */
  /* TODO (follow-up): hosted inference endpoint for members without localhost access. */
  inferenceUrl: 'http://localhost:8131/ask',

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

  /* ── Voice agent (ElevenLabs) ────────────────────────────────────────── */
  voiceAgentId: 'agent_2401ks53q6t8e2drt1h7va3f2c52',

  /* ── TTS narration proxy ─────────────────────────────────────────────── */
  ttsProxyUrl: 'https://bill-talk.netlify.app/.netlify/functions/el-proxy',

  /* ── Cursor lead-in (ms after audio starts → cursor appears) ─────────── */
  cursorLeadIn: 1200,

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
      keywords: ['tour', 'overview', 'show me', 'around', 'what is this', 'help me navigate'],
      steps: [

        /* Step 1 — Navigation bar */
        {
          target: '.nav-inner',
          label: 'Navigation',
          demo: 'hover',
          narration:
            'Welcome! Let\'s start at the top. This navigation bar is your map to the whole site.',
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
            'former NBA, WNBA, ABA, and Globetrotter legends. Let me show you the layout.',
          instruction: 'Click "Committee" to browse member profiles.',
          substeps: [
            {
              target: '.members-grid',
              page: 'members',
              label: 'Member grid',
              demo: 'hover',
              narration:
                'Here\'s the member grid — cards for each legend with career highlights ' +
                'and contact info. Click any card to open a full profile.',
              instruction: 'Click any member card to open their full profile.'
            },
            {
              target: 'a[href="members/greg-foster.html"]',
              page: 'members',
              label: 'Greg Foster — Chairman',
              demo: 'click',
              narration:
                'Greg Foster is our Chairman — thirteen NBA seasons, a championship with ' +
                'the Lakers in 2001, and deep leadership experience as coach and broadcaster.',
              instruction: 'Click "View Profile" to see Greg\'s full bio and contact details.'
            },
            {
              target: '.profile-hero',
              page: 'members/greg-foster',
              label: 'Greg\'s profile',
              demo: 'hover',
              narration:
                'Each member profile has a full bio, career highlights, and contact ' +
                'information. Use the breadcrumb at the top to return to the full Committee list.',
              instruction: 'Click the "Committee" breadcrumb link to return to the member list.'
            }
          ]
        },

        /* Step 3 — Resources dropdown (parent) with sub-steps for each section.
         * Each substep navigates to its actual destination page so the user sees the content.
         * page: 'members' on parent ensures we start from a root-level page where nav hrefs
         * are root-relative (e.g. href="minutes.html", not href="../minutes.html"). */
        {
          target: '.nav-dropdown',
          page: 'members',
          label: 'Resources dropdown',
          demo: 'openDropdown',
          requires: { dropdown: '.nav-dropdown' },
          narration:
            'Resources is a dropdown with several sub-sections. Let me walk you through each one.',
          instruction: 'Click "Resources ▾" to see the dropdown menu options.',
          substeps: [
            {
              target: 'a[href="minutes.html"]',
              page: 'minutes',
              label: 'Meeting Minutes',
              demo: 'hover',
              requires: { dropdown: '.nav-dropdown' },
              narration:
                'Meeting Minutes is where you\'ll find the official record of every committee ' +
                'session — decisions, votes, and discussion summaries.',
              instruction: 'Click "Minutes" to view all meeting records.'
            },
            {
              target: 'a[href="systems-map.html"]',
              page: 'systems-map',
              label: 'Systems Map',
              demo: 'hover',
              requires: { dropdown: '.nav-dropdown' },
              narration:
                'The Systems Map gives you an interactive overview of the organization\'s ' +
                'initiatives and how they connect — a great place to orient yourself.',
              instruction: 'Click "Systems Map" to explore the initiative landscape.'
            },
            {
              target: 'a[href="assessment.html"]',
              page: 'assessment',
              label: 'Assessment',
              demo: 'hover',
              requires: { dropdown: '.nav-dropdown' },
              narration:
                'The Assessment is a member satisfaction survey. Your feedback helps the ' +
                'committee prioritize improvements and understand member needs.',
              instruction: 'Click "Assessment" to complete or review the satisfaction survey.'
            },
            {
              target: 'a[href="resources.html"]',
              page: 'resources',
              label: 'Documents',
              demo: 'hover',
              requires: { dropdown: '.nav-dropdown' },
              narration:
                'And the Resources page itself is home to committee documents, the Leslie ' +
                'Johnson proposals, and other reference materials.',
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
            'Let me take you there.',
          instruction: 'Heading to the Recommendations page…'
        },
        {
          target: '#rec-grid',
          page: 'recommendations',
          label: 'Recommendations board',
          demo: 'hover',
          narration:
            'Here\'s the Recommendations board — a living record of committee decisions and ' +
            'initiatives. Each card shows a proposal and its current status.',
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
            'Let me take you there.',
          instruction: 'Heading to the About & Contact page…'
        },
        {
          target: '.hero',
          page: 'about',
          label: 'About page',
          demo: 'hover',
          narration:
            'This is the About & Contact page. You\'ll find the committee\'s mission statement, ' +
            'key contacts, and information on how to get in touch.',
          instruction: 'Scroll down to find contact details and the committee\'s mission.'
        },

        /* Step 6 — Ask Bill nav link */
        {
          target: '#ask-bill-nav',
          label: 'Ask Bill nav',
          demo: 'hover',
          narration:
            'And finally — the "Ask Bill" link in the nav opens this very widget so you can ' +
            'reach me from any page, any time. That wraps up the site tour!',
          instruction: 'Click "Ask Bill" in the nav to open this guide widget on any page.'
        }
      ]
    },

    /* ── 2. How to find a member ── */
    {
      id: 'find-member',
      label: 'How to find a member',
      keywords: ['member', 'find', 'profile', 'who is', 'contact', 'legend', 'player'],
      steps: [
        {
          target: 'a[href="members.html"]',
          label: 'Go to Committee',
          demo: 'click',
          narration:
            'To find a committee member, head to the Committee page. I\'ll take you there now.',
          instruction: 'Heading to the Committee page…'
        },
        {
          target: '.members-grid',
          page: 'members',
          label: 'Member grid',
          demo: 'hover',
          narration:
            'Here\'s the Committee page — you\'ll find cards for each member with their photo, ' +
            'NBA career highlights, and contact information.',
          instruction: 'Click any member card to open their full profile.'
        }
      ]
    },

    /* ── 3. How to suggest a feature ── */
    {
      id: 'submit-feature',
      label: 'How to suggest a feature',
      keywords: ['feature', 'request', 'suggest', 'submit', 'idea', 'improve'],
      steps: [
        {
          target: '.nav-dropdown-toggle',
          label: 'Open Resources',
          demo: 'openDropdown',
          requires: { dropdown: '.nav-dropdown' },
          narration:
            'Feature requests live under the Resources section. Click Resources to open the dropdown.',
          instruction: 'Click "Resources ▾" in the navigation to open the dropdown menu.'
        },
        {
          target: '.nav-dropdown-menu',
          label: 'Resources dropdown menu',
          demo: 'hover',
          requires: { dropdown: '.nav-dropdown' },
          narration:
            'You\'ll see a menu with Resources, Minutes, Systems Map, and Assessment. ' +
            'Feature Requests is reachable from the main Resources page.',
          instruction: 'Click "Resources" in the dropdown to go to the resources page, then look for the Feature Requests link.'
        }
      ]
    },

    /* ── 4. How to use Ask Bill ── */
    {
      id: 'ask-bill-walkthrough',
      label: 'How to use Ask Bill',
      keywords: ['ask bill', 'voice', 'chat', 'elevenlabs', 'ai assistant', 'question'],
      steps: [
        {
          target: '#ask-bill-section',
          label: 'Ask Bill section',
          demo: 'hover',
          narration:
            'The "Have a Question? Ask Bill" section on the home page is a shortcut to me. ' +
            'I\'m an AI trained on Legends of Basketball materials.',
          instruction: 'Scroll down the home page to find the Ask Bill section (visible when signed in).'
        },
        {
          target: '#ask-bill-nav',
          label: 'Ask Bill nav link',
          demo: 'hover',
          narration:
            'The "Ask Bill" link in the nav is always visible — clicking it opens this widget ' +
            'so you can chat with me on any page.',
          instruction: 'Click "Ask Bill" in the navigation to open this guide widget.'
        },
        {
          target: '#soma-guide',
          label: 'This guide widget',
          demo: 'hover',
          narration:
            'And of course — you\'re already talking to me right here! Use this widget anytime for ' +
            'a quick question, or switch to text mode for a longer conversation.',
          instruction: 'Use the 💬 or 🎙 buttons at the top of this panel to switch modes.'
        }
      ]
    }

  ] /* end walkthroughs */
};
