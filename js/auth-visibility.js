/* Auth-aware visibility — Legends of Basketball
 * ----------------------------------------------
 * Two jobs, one session key (the SOMA Auth Supabase session):
 *
 * 1. Committee-gated navigation entries (Minutes, Systems Map, Assessment —
 *    the pages the site's own access map in resources.html marks
 *    committee-only) ship HIDDEN in the markup (`data-auth-gate` +
 *    style="display:none") so a signed-out visitor never sees — or flashes —
 *    a menu item that would only lead them to a login dialog. This script
 *    reveals them once a signed-in session is confirmed. Applies at every
 *    nav level: dropdown sub-menus, member-profile page navs, and footers.
 *
 * 2. Member-only figures (player-benefits.html): dollar amounts ship as
 *    placeholders (`.member-figure` with the real value in
 *    `data-member-figure`); signed-in users get the real figures swapped in.
 *    `.member-invite` blocks (the "sign in to see amounts" invitations) show
 *    for visitors and hide for signed-in users.
 *
 * Gating philosophy: hide-gated-by-default, reveal-on-auth. The default
 * (no-JS / logged-out / auth outage) state is always the visitor state.
 * "Signed in" means any authenticated user — matching how minutes.html and
 * resources.html already gate committee content (session, not role).
 *
 * Load order tolerant: mirrors js/community-nav.js — registers an auth-state
 * handler AND queries getSession() directly, so it works whether SomaAuth
 * was initialized in <head> (e.g. minutes.html) or after this script runs.
 *
 * Authored 2026-07-03 by Dee (Claude Code) for Mike Wolf — visitor nav
 * gating + benefits-amounts-members-only directive (WQ-79).
 */
(function () {
  'use strict';

  if (!window.SomaAuth) return;

  function reveal(authed) {
    // 1. Committee-gated nav/footer entries.
    document.querySelectorAll('[data-auth-gate]').forEach(function (el) {
      el.style.display = authed ? '' : 'none';
    });

    // 2. Member-only figures: swap placeholder <-> real value.
    document.querySelectorAll('.member-figure[data-member-figure]').forEach(function (el) {
      if (authed) {
        if (!el.hasAttribute('data-visitor-text')) {
          el.setAttribute('data-visitor-text', el.textContent);
        }
        el.textContent = el.getAttribute('data-member-figure');
      } else if (el.hasAttribute('data-visitor-text')) {
        el.textContent = el.getAttribute('data-visitor-text');
      }
    });

    // 3. Visitor-facing invitations.
    document.querySelectorAll('.member-invite').forEach(function (el) {
      el.style.display = authed ? 'none' : '';
    });
  }

  function apply(session) {
    reveal(!!(session && session.user));
  }

  // Exposed for unit tests.
  window.LegendsAuthVisibility = { reveal: reveal, apply: apply };

  try {
    SomaAuth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_OUT') { reveal(false); return; }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        apply(session);
      }
    });
  } catch (e) {}

  function boot() {
    SomaAuth.getSession().then(function (res) {
      apply(res && res.data ? res.data.session : null);
    }).catch(function () { reveal(false); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
