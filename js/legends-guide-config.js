/* Legends of Basketball — SOMA Guide per-site config
 *
 * Persona: Bill  |  Voice: ElevenLabs agent agent_2401ks53q6t8e2drt1h7va3f2c52
 *
 * To add or remove walkthroughs, edit the walkthroughs array below.
 * To change the persona or voice agent, edit the persona/voiceAgentId fields.
 * The soma-guide.js core reads this file — nothing here is baked into the core.
 */

window.SomaGuideConfig = {

  /* ── Persona ─────────────────────────────────────────────────────────── */
  persona: {
    name: 'Bill',
    id: 'legends-bill',   // localStorage namespace — unique per site instance
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
  // voiceAgentEsmUrl: 'https://esm.sh/@elevenlabs/client@latest',  // default

  /* ── TTS narration proxy ─────────────────────────────────────────────── */
  /* Routes walkthrough narration TTS through bill-talk's existing proxy.
   * The EL API key stays on that site; this site exposes nothing. */
  ttsProxyUrl: 'https://bill-talk.netlify.app/.netlify/functions/el-proxy',

  /* ── Site map (grounding context for Bill) ───────────────────────────── */
  siteMap: [
    {
      id: 'home',
      label: 'Home',
      path: 'index.html',
      description: 'Overview of the Legends of Basketball Membership Services Committee'
    },
    {
      id: 'committee',
      label: 'Committee',
      path: 'members.html',
      description: 'Browse all committee members with bios, photos, and career highlights'
    },
    {
      id: 'resources',
      label: 'Resources',
      path: 'resources.html',
      description: 'Committee documents, Leslie Johnson proposals, and reference materials'
    },
    {
      id: 'minutes',
      label: 'Meeting Minutes',
      path: 'minutes.html',
      description: 'Official minutes from committee meetings'
    },
    {
      id: 'systems-map',
      label: 'Systems Map',
      path: 'systems-map.html',
      description: 'Interactive map of the organization\'s systems and initiatives'
    },
    {
      id: 'assessment',
      label: 'Assessment',
      path: 'assessment.html',
      description: 'Member satisfaction assessment and feedback form'
    },
    {
      id: 'recommendations',
      label: 'Recommendations',
      path: 'recommendations.html',
      description: 'Committee recommendations board — current proposals and status'
    },
    {
      id: 'features',
      label: 'Feature Requests',
      path: 'features.html',
      description: 'Submit new feature ideas for the membership site'
    },
    {
      id: 'bugs',
      label: 'Bug Reports',
      path: 'bugs.html',
      description: 'Report issues with the membership site'
    },
    {
      id: 'about',
      label: 'About & Contact',
      path: 'about.html',
      description: 'About the committee, its mission, and how to contact us'
    },
    {
      id: 'ask-bill-full',
      label: 'Ask Bill (full chat)',
      path: 'https://bill-talk.netlify.app',
      description: 'Full voice and text conversation with Bill — the site\'s AI manager'
    }
  ],

  /* ── Walkthroughs ────────────────────────────────────────────────────── */
  walkthroughs: [

    /* 1 — Site Tour */
    {
      id: 'site-tour',
      label: 'Site Tour',
      keywords: ['tour', 'overview', 'show me', 'around', 'what is this', 'help me navigate'],
      steps: [
        {
          target: '.nav-inner',
          label: 'Navigation',
          demo: 'hover',
          narration:
            'Welcome! Let\'s start at the top. This navigation bar is your map to the whole site.',
          instruction:
            'The nav links on the right take you to every section. On mobile, tap the ☰ menu icon.'
        },
        {
          target: 'a[href="members.html"]',
          label: 'Committee members',
          narration:
            'The Committee page shows all members of the Membership Services Committee — ' +
            'former NBA, WNBA, ABA, and Globetrotter legends.',
          instruction: 'Click "Committee" to browse member profiles.',
          demo: 'click'
        },
        {
          target: '.nav-dropdown',
          label: 'Resources dropdown',
          narration:
            'Resources is a dropdown with several sub-sections: meeting minutes, the systems map, ' +
            'assessment, and committee documents.',
          instruction: 'Click "Resources ▾" to see the dropdown menu options.',
          demo: 'openDropdown'
        },
        {
          target: 'a[href="recommendations.html"]',
          label: 'Recommendations',
          demo: 'click',
          narration:
            'The Recommendations board shows current committee proposals and their status. ' +
            'Let me take you there.',
          instruction: 'Heading to the Recommendations page…'
        },
        {
          target: '#rec-grid',
          page: 'recommendations.html',
          label: 'Recommendations board',
          demo: 'hover',
          narration:
            'Here\'s the Recommendations board — a living record of committee decisions and initiatives. ' +
            'Each card shows a proposal and its current status.',
          instruction: 'Browse the proposals, or click any card for details.'
        },
        {
          target: 'a[href="about.html"]',
          label: 'About & Contact',
          demo: 'hover',
          narration:
            'About & Contact tells you more about the committee\'s mission and who to reach out to.',
          instruction: 'Click "About & Contact" for more information.'
        },
        {
          target: '#ask-bill-nav',
          label: 'Ask Bill nav',
          demo: 'hover',
          narration:
            'The "Ask Bill" link in the nav opens this very widget — so you can reach me from any page, anytime.',
          instruction: 'Click "Ask Bill" in the nav to open this guide widget on any page of the site.'
        }
      ]
    },

    /* 2 — How to find a member */
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
          page: 'members.html',
          label: 'Member grid',
          demo: 'hover',
          narration:
            'Here\'s the Committee page — you\'ll find cards for each member with their photo, ' +
            'NBA career highlights, and contact information.',
          instruction: 'Click any member card to open their full profile.'
        }
      ]
    },

    /* 3 — How to submit a feature request */
    {
      id: 'submit-feature',
      label: 'How to suggest a feature',
      keywords: ['feature', 'request', 'suggest', 'submit', 'idea', 'improve'],
      steps: [
        {
          target: '.nav-dropdown-toggle',
          label: 'Open Resources',
          narration:
            'Feature requests live under the Resources section. Click Resources to open the dropdown.',
          instruction: 'Click "Resources ▾" in the navigation to open the dropdown menu.',
          demo: 'openDropdown'
        },
        {
          target: '.nav-dropdown-menu',
          label: 'Resources dropdown menu',
          demo: 'hover',
          narration:
            'You\'ll see a menu with Resources, Minutes, Systems Map, and Assessment. ' +
            'Feature Requests is reachable from the main Resources page.',
          instruction: 'Click "Resources" in the dropdown to go to the resources page, then look for the Feature Requests link.'
        }
      ]
    },

    /* 4 — How to use Ask Bill */
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
