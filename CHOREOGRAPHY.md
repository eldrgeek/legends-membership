# Tour choreography — the `[[cue]]` markup

Bill's tour narrations are scripts. Inline cues in the narration text say
**what happens on screen and when** — a cue fires at the moment the spoken
audio reaches that point in the sentence.

```js
narration:
  'The Committee page shows all nine members of the Membership Services Committee — ' +
  '[[arrow a[href="members.html"] 2s]] former NBA, WNBA, ABA, and Globetrotter legends. ' +
  '[[highlight]] Let me show you the layout. [[click]]',
```

Reading that aloud: Bill starts talking → as he says "former NBA…" the gold
arrow glides (over 2 s) to the Committee link → as he says "Let me show you
the layout" the link lights up → on the last word the click ripple fires, and
the page opens.

**To re-time an action, move its cue to a different spot in the sentence.**
Earlier in the text = earlier in the narration. That's the whole model.

## The rules

1. **Never change the words.** Audio clips are pre-generated from the text
   with cues stripped out. Cues are free to add/move/delete; changing words
   makes that step fall back to slow live TTS until you re-run
   `node scripts/gen-tour-audio.mjs`. `npm test` fails loudly if words drift.
2. Cues sit between words, wrapped in double brackets: `[[verb target options]]`.
3. `npm test` validates every cue: known verb, and the target exists on the
   page that step plays on. Typos can't reach production.

## Cue reference

| Cue | What it does |
|---|---|
| `[[arrow <selector>]]` | Glide the gold arrow to the element |
| `[[arrow <selector> 2s]]` | …taking 2 seconds (also `800ms`, `slow`, `fast`) |
| `[[highlight <selector>]]` | Gold ring around the element |
| `[[highlight]]` | …around whatever the arrow last pointed at |
| `[[unhighlight]]` | Remove all gold rings |
| `[[click]]` | Click ripple where the arrow is pointing |
| `[[click <selector>]]` | Click ripple on a specific element |
| `[[open <selector>]]` | Open a dropdown menu (e.g. Resources ▾) |
| `[[close]]` | Close any dropdown the tour opened |
| `[[scroll <selector>]]` | Scroll the element into view |

Leaving out the selector means "the last element a cue touched" (or the
step's `target` if no cue has run yet). Selectors are ordinary CSS —
`a[href="minutes.html"]`, `.members-grid`, `#rec-grid`.

## Idioms

**Point → name it → go there** (the standard beat):
```
'... — [[arrow a[href="members.html"] 2s]] former NBA, WNBA, ABA, and
Globetrotter legends. [[highlight]] Let me show you the layout. [[click]]'
```
A `[[click]]` as the last cue lands right before the step ends; if the next
step has a `page:`, the navigation follows the click.

**Walk a dropdown menu** (arrow hops item to item as each is mentioned):
```
'[[arrow a[href="minutes.html"] 1500ms]] Meeting Minutes is where you'll find
the official record of every committee [[highlight]] session — decisions,
votes, and discussion summaries.'
```

**Lead with the visual** (arrow moves while the first words are spoken):
```
'[[arrow .nav-inner 2s]] Welcome! Let's start at the top. [[highlight]] This
navigation bar is your map to the whole site.'
```

## How it works (for the curious)

A cue's firing time is its position in the text as a fraction of the audio
duration — a cue 60% through the words fires 60% through the clip. Steps
whose narration has no cues keep the automatic choreography (arrow glides in
mid-narration, highlight on arrival, click at the end for `demo: 'click'`
steps). The moment a narration contains any cue, the script takes over
completely for that step.

Engine support lives in `soma-guide.js` (`parseNarration`, `_scheduleCues`,
`_runCue`) on the soma-guide CDN — see `~/Projects/soma-platform/packages/soma-guide/`.
After engine changes: redeploy the CDN and run `npm run verify:deploy`.
