/* Registered-user Community nav — Legends of Basketball
 * -----------------------------------------------------
 * Shows the Community menu only after Supabase auth confirms a user.
 * Role taxonomy:
 *   - registered: any signed-in user
 *   - committee: signed-in email appears in the committee directory
 *   - admin: Supabase role "admin" or the bootstrap admin allowlist
 */
(function () {
  'use strict';

  var ADMIN_EMAILS = ['mw@mike-wolf.com', 'gfos44@gmail.com'];
  var COMMITTEE_EMAILS = [
    'gfos44@gmail.com',
    'majorjjones@yahoo.com',
    'lihollins14@gmail.com',
    'capersb23@gmail.com',
    'datrotter4@gmail.com',
    'ladybarkley@yahoo.com',
    'gtinsley@pengeo.com',
    'wdavis5455@yahoo.com',
    'mo@elos360.com',
    'purvis.short@icloud.com'
  ];

  if (!window.SomaAuth) return;

  function rootPrefix() {
    return window.location.pathname.indexOf('/members/') === 0 ? '../' : '';
  }

  function cleanEmail(user) {
    return ((user && user.email) || '').toLowerCase();
  }

  function roleFor(user, role) {
    var email = cleanEmail(user);
    if (!email) return 'visitor';
    if (role === 'admin' || ADMIN_EMAILS.indexOf(email) !== -1) return 'admin';
    if (COMMITTEE_EMAILS.indexOf(email) !== -1) return 'committee';
    return 'registered';
  }

  function ensureMenu() {
    var existing = document.getElementById('nav-community-link');
    if (existing) return existing;

    var navLinks = document.querySelector('.nav-links');
    if (!navLinks) return null;

    var prefix = rootPrefix();
    var li = document.createElement('li');
    li.id = 'nav-community-link';
    li.className = 'nav-dropdown';
    li.style.display = 'none';
    li.innerHTML =
      '<a href="' + prefix + 'community-info.html" class="nav-dropdown-toggle" aria-haspopup="true" aria-expanded="false">Community &#9662;</a>' +
      '<ul class="nav-dropdown-menu" role="menu">' +
      '<li><a href="' + prefix + 'community-info.html" role="menuitem">Information</a></li>' +
      '<li><a href="' + prefix + 'community-chat.html" role="menuitem">Chat</a></li>' +
      '<li><a href="' + prefix + 'community-video.html" role="menuitem">Video Meet</a></li>' +
      '</ul>';

    var anchor = document.getElementById('nav-admin-link') ||
                 document.getElementById('login-nav') ||
                 document.getElementById('auth-nav');
    if (anchor && anchor.parentNode === navLinks) navLinks.insertBefore(li, anchor);
    else navLinks.appendChild(li);

    if (window.LegendsNavDropdown && window.LegendsNavDropdown.initOne) {
      window.LegendsNavDropdown.initOne(li);
    }

    return li;
  }

  function render(session, role) {
    var li = ensureMenu();
    if (!li) return;

    var user = session ? session.user : null;
    var communityRole = roleFor(user, role);
    document.body.setAttribute('data-community-role', communityRole);
    li.style.display = user ? 'list-item' : 'none';
  }

  function start(session) {
    if (!session || !session.user) { render(null, null); return; }
    SomaAuth.getRole(session.user).then(function (role) {
      render(session, role);
    }).catch(function () {
      render(session, null);
    });
  }

  window.LegendsCommunityNav = {
    adminEmails: ADMIN_EMAILS.slice(),
    committeeEmails: COMMITTEE_EMAILS.slice(),
    roleFor: roleFor,
    ensureMenu: ensureMenu,
    render: render
  };

  try {
    SomaAuth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_OUT') { render(null, null); return; }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') start(session);
    });
  } catch (e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      SomaAuth.getSession().then(function (res) {
        start(res && res.data ? res.data.session : null);
      }).catch(function () { render(null, null); });
    });
  } else {
    SomaAuth.getSession().then(function (res) {
      start(res && res.data ? res.data.session : null);
    }).catch(function () { render(null, null); });
  }
})();
