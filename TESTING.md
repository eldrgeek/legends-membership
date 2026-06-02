# Testing

## Setup

```sh
npm install
```

## Run the test suite

```sh
npm test
```

## What is tested

195 tests across 4 suites (node:test + jsdom, no browser required):

- **Task 1 — Login nav visibility**: `#login-nav` exists on all 13 nav pages; hidden when signed in, visible when signed out.
- **Task 1b — Sign Out visibility**: `#auth-nav` exists on all 13 nav pages; visible when signed in, hidden when signed out.
- **Task 2 — Admin link gating**: `#nav-admin-link` exists on all 13 nav pages; hidden for anonymous and non-admin users; visible only for users in `ADMIN_EMAILS`. Same checks for `#footer-admin-link` on the 12 pages that have it.
- **Task 3 — NBRPA replacement**: all site-authored pages contain zero `NBRPA` occurrences; Leslie Johnson's 15 member-submitted proposals in `resources.html` still contain their original `NBRPA` text verbatim.

## How it works

Tests parse each HTML file with jsdom (no browser, no network), then apply the `updateAuthUI` logic using three mock user states: anonymous, regular member, and admin. This approach tests the DOM structure and visibility logic without requiring a live server or Netlify Identity connection.
