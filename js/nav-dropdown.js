(function () {
  function init() {
    var dropdown = document.querySelector('.nav-dropdown');
    var toggle = document.querySelector('.nav-dropdown-toggle');
    if (!toggle || !dropdown) return;

    var menu = dropdown.querySelector('.nav-dropdown-menu');

    // Mobile tap: expand inline instead of navigating away
    toggle.addEventListener('click', function (e) {
      if (window.matchMedia('(max-width: 700px)').matches) {
        e.preventDefault();
        var isOpen = dropdown.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(isOpen));
      }
    });

    // Keyboard: Escape closes dropdown
    dropdown.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        dropdown.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });

    // Close on outside click (desktop)
    document.addEventListener('click', function (e) {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    // Sync aria-expanded when hamburger closes the whole menu
    var hamburger = document.querySelector('.nav-toggle');
    if (hamburger) {
      hamburger.addEventListener('click', function () {
        // Give the toggle a tick to update .open on nav-links
        setTimeout(function () {
          var navOpen = document.querySelector('.nav-links.open');
          if (!navOpen) {
            dropdown.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
          }
        }, 0);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
