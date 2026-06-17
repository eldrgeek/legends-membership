/* Admin "Review items" nav button — Legends of Basketball
 * --------------------------------------------------------
 * Drops a "Review items (N)" button into the top nav for signed-in admins that
 * jumps straight to the Change Log review queue (admin-changelog.html) — so an
 * admin no longer has to open Admin, scroll, and find the changelog by hand.
 *
 * Self-contained: include once per page with
 *   <script src="/js/admin-review-nav.js" defer></script>
 * after soma-auth.js / soma-auth-config.js. It gates itself on admin status and
 * hides when there is nothing pending, so it's safe on every page.
 */
(function () {
  'use strict';

  var ADMIN_EMAILS = ['mw@mike-wolf.com', 'gfos44@gmail.com'];
  // Statuses that need a human's attention in the queue.
  var PENDING = ['new', 'awaiting-approval', 'awaiting-review', 'blocked'];

  if (!window.SomaAuth || !window.SOMA_AUTH_CONFIG) return;

  function isAdmin(user, role) {
    if (!user) return false;
    if (role === 'admin') return true;
    return ADMIN_EMAILS.indexOf((user.email || '').toLowerCase()) !== -1;
  }

  function ensureButton() {
    var existing = document.getElementById('nav-review-link');
    if (existing) return existing;

    var navLinks = document.querySelector('.nav-links');
    if (!navLinks) return null;

    var li = document.createElement('li');
    li.id = 'nav-review-link';
    li.style.display = 'none';

    var a = document.createElement('a');
    a.href = '/admin-changelog.html';
    a.title = 'Review pending change requests';
    a.style.cssText =
      'font-size:0.78rem;color:#1a2235;background:var(--gold,#d4af37);' +
      'border:1px solid var(--gold,#d4af37);padding:5px 11px;border-radius:4px;' +
      'font-weight:700;white-space:nowrap;';
    a.innerHTML = 'Review items <span id="nav-review-count"></span>';
    li.appendChild(a);

    // Place it just before the Admin link (or the login link) for a tidy order.
    var anchor = document.getElementById('nav-admin-link') ||
                 document.getElementById('login-nav') ||
                 document.getElementById('auth-nav');
    if (anchor && anchor.parentNode === navLinks) navLinks.insertBefore(li, anchor);
    else navLinks.appendChild(li);
    return li;
  }

  function pendingCount(session) {
    var cfg = window.SOMA_AUTH_CONFIG;
    var token = (session && session.access_token) || cfg.anonKey;
    var url = cfg.url + '/rest/v1/change_requests?select=id&status=in.(' +
              PENDING.join(',') + ')&limit=200';
    return fetch(url, {
      headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + token }
    }).then(function (res) {
      if (!res.ok) return 0;
      return res.json();
    }).then(function (rows) {
      return Array.isArray(rows) ? rows.length : 0;
    }).catch(function () { return 0; });
  }

  function render(session, role) {
    var li = ensureButton();
    if (!li) return;
    var user = session ? session.user : null;
    if (!isAdmin(user, role)) { li.style.display = 'none'; return; }

    pendingCount(session).then(function (n) {
      if (n > 0) {
        var c = document.getElementById('nav-review-count');
        if (c) c.textContent = '(' + n + ')';
        li.style.display = 'list-item';
      } else {
        li.style.display = 'none';
      }
    });
  }

  function start() {
    SomaAuth.getSession().then(function (res) {
      var session = res && res.data ? res.data.session : null;
      if (!session || !session.user) { var li = document.getElementById('nav-review-link'); if (li) li.style.display = 'none'; return; }
      // Resolve role (admin gate also accepts the bootstrap email allowlist).
      SomaAuth.getRole(session.user).then(function (role) {
        render(session, role);
      }).catch(function () { render(session, null); });
    }).catch(function () {});
  }

  // Re-evaluate on auth changes too (sign in/out without a reload).
  try {
    SomaAuth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_OUT') { var li = document.getElementById('nav-review-link'); if (li) li.style.display = 'none'; return; }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') start();
    });
  } catch (e) {}

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
