# SOMA Guide Widget — Integration Guide

A portable, floating AI assistant widget designed for every SOMA site. Drop in two scripts and a CSS file; supply a per-site config object. The core (`soma-guide.js`) contains no site-specific logic.

---

## Quick Start (3 lines of HTML)

```html
<!-- 1. Styles — in <head> -->
<link rel="stylesheet" href="css/soma-guide.css">

<!-- 2. Per-site config — before soma-guide.js, sets window.SomaGuideConfig -->
<script src="js/legends-guide-config.js"></script>

<!-- 3. Core widget — at end of <body> -->
<script type="module" src="js/soma-guide.js"></script>
```

That's it. The widget auto-initializes when `window.SomaGuideConfig` is present.

---

## Config Object Shape

```js
window.SomaGuideConfig = {

  persona: {
    name:           'Bill',           // Display name in the widget header + FAB
    id:             'legends-bill',   // Namespace for localStorage keys — UNIQUE per site
    avatar:         '🏀',             // Emoji shown in FAB and header
    greeting:       '...',            // First-visit intro text
    shortGreeting:  '...',            // Returning visitor greeting
    walkthroughDone:'...'             // Text shown after finishing a walkthrough
  },

  voiceAgentId: 'agent_2401ks53q6t8e2drt1h7va3f2c52',
  // Optional: override ElevenLabs ESM URL
  // voiceAgentEsmUrl: 'https://esm.sh/@elevenlabs/client@latest',

  siteMap: [
    // Informational — grounding context for persona answers.
    { id: 'home', label: 'Home', path: 'index.html', description: '...' },
    // ...
  ],

  walkthroughs: [
    {
      id:       'site-tour',           // Unique within this config
      label:    'Site Tour',           // Shown in the topic list inside the widget
      keywords: ['tour', 'show me'],   // Natural-language triggers from text chat
      steps: [
        {
          target:      'nav',          // CSS selector — element to highlight on page
          label:       'Navigation',   // Step label (used in jump-back-in list)
          narration:   'This is the nav...', // Main text shown in walkthrough panel
          instruction: 'Click Committee to browse members.' // Sub-text, shown below
        },
        // ...
      ]
    }
  ]
};
```

### Required fields

| Field | Required | Notes |
|---|---|---|
| `persona.name` | Yes | |
| `persona.id` | Yes | Must be unique per site to avoid localStorage collisions |
| `persona.greeting` | Yes | |
| `persona.shortGreeting` | Yes | |
| `voiceAgentId` | Yes | ElevenLabs Conversational AI agent ID |
| `walkthroughs[].id` | Yes | Unique within the array |
| `walkthroughs[].steps[].narration` | Yes | |

All other fields are optional.

---

## Deploying to a New SOMA Site

1. Copy `css/soma-guide.css` → new site's CSS directory.
2. Copy `js/soma-guide.js` → new site's JS directory.
3. Create a new `js/<site>-guide-config.js` — copy `legends-guide-config.js` as a template.
4. Edit the new config:
   - Change `persona.id` to something unique (e.g., `levinese-proteus`).
   - Change `persona.name`, `avatar`, `greeting`, etc.
   - Set `voiceAgentId` to the ElevenLabs agent for this site.
   - Update `siteMap` and `walkthroughs` for this site's content.
5. Add the three HTML lines above to each page (or a shared header include).

**Do not edit `soma-guide.js` for site-specific customization.** Everything site-specific belongs in the config file.

---

## Behaviors Implemented

| # | Behavior | How |
|---|---|---|
| 1 | Draggable + resizable | Mouse/touch drag on header; CSS `resize: both` in text mode |
| 2 | Site-aware | External `SomaGuideConfig.siteMap` — passed to ElevenLabs agent as context |
| 3 | Guided walkthrough | CSS `.sg-highlight` ring on target element + step narration text |
| 4 | Jump out / jump back in | Exit saves `pendingResume`; re-open shows step list to pick up from any step |
| 5 | Next topic → | Next/Finish button advances steps; topic list in idle panel starts any walkthrough |
| 6 | Introduce-once | `localStorage` key `soma-guide:<persona.id>:introduced` — set on first open |
| 7 | "How do I do this?" | Text input matched against `walkthroughs[].keywords`; matching tour launches automatically |

---

## Voice Agent Wiring (ElevenLabs)

The widget uses the `@elevenlabs/client` ESM package (loaded lazily via dynamic `import()` — no network hit until the user activates voice or text mode).

- **Voice mode**: `Conversation.startSession({ agentId })` — full WebRTC mic session.
- **Text mode**: `Conversation.startSession({ agentId, textOnly: true })` + `conversation.sendUserMessage(text)`.
- Agent responses come via `onMessage({ message, source })`. The widget displays `source === 'ai'` messages.
- Voice mode shows a breathing orb (speaking state triggers `.sg-orb--speaking` pulse animation).
- Sessions are ended when the user switches modes or minimizes.

The agent ID for the Legends instance is `agent_2401ks53q6t8e2drt1h7va3f2c52` (Bill on bill-talk.netlify.app).

---

## How to Preview Locally

```bash
# Serve the site (any static server works)
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080/index.html`. The widget appears as a gold "Ask Bill 🏀" button in the bottom-right corner.

- **First visit** (localStorage clear): widget opens automatically with Bill's intro greeting.
- **Return visit**: widget stays minimized; click the FAB to open.
- **FAB**: click to open → idle panel shows topic list and greeting.
- **Topic buttons**: click any walkthrough to start it (elements on the home page are highlighted).
- **Voice/Text buttons** (🎙 / 💬 in the header): switch between voice session and text chat.
- **Dragging**: click and drag the header bar to reposition.
- **Text mode**: type a question — if it matches walkthrough keywords (e.g., "show me a tour"), the walkthrough launches; otherwise it routes to the ElevenLabs agent.

To test introduce-once reset:
```js
localStorage.removeItem('soma-guide:legends-bill:introduced')
```
Then reload — the widget will open automatically again with the first-time greeting.

---

## Tests

```bash
npm test
```

`tests/soma-guide.test.js` covers: widget mount, introduce-once (6 tests), walkthrough navigation (12 tests), jump-out/in (8 tests), keyword matching (4 tests), mode transitions (6 tests). 42 new tests added to the existing 509 = **551 total**.

---

## What's Stubbed / Not Complete in v1

| Item | Status |
|---|---|
| Voice narration of walkthrough steps | Text-only. Steps display narration text but don't inject audio into an active ElevenLabs session. A voice session can run alongside, but the step text isn't spoken automatically. |
| ElevenLabs text session in walkthrough | Text chat connects to ElevenLabs for free-form Q&A but walkthrough steps are standalone (no agent call per step). |
| `siteMap` passed to agent | Config field present; the agent is pre-trained via bill-talk's knowledge base. Passing siteMap dynamically would require ElevenLabs agent override API. |
| Mobile resize | CSS `resize: both` is desktop-only. Touch resize not implemented. |
| Highlight overlay mask | Element highlight is an outline ring. No full-page dimming overlay (kept intentionally unobtrusive). |
| Multi-page walkthroughs | Steps can instruct the user to navigate to another page, but the widget doesn't programmatically navigate or persist walkthrough state across page loads (would need sessionStorage persistence). |
| Widget on pages other than index.html | The three include lines are only added to `index.html` on this branch. Add them to other pages as desired. |
