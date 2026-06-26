(function () {
  function isMobile() {
    return window.innerWidth <= 700;
  }

  function initOne(dropdown) {
    if (!dropdown || dropdown._navDropdownReady) return;
    dropdown._navDropdownReady = true;
    var toggle = dropdown.querySelector('.nav-dropdown-toggle');
    if (!toggle || !dropdown) return;

    // Mobile: click-to-toggle (desktop uses CSS :hover)
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      if (isMobile()) {
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

    // Close on outside click (mobile)
    document.addEventListener('click', function (e) {
      if (!dropdown.contains(e.target) && isMobile()) {
        dropdown.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    // Sync aria-expanded when hamburger closes the whole menu
    var hamburger = document.querySelector('.nav-toggle');
    if (hamburger) {
      hamburger.addEventListener('click', function () {
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

  function init() {
    var dropdowns = document.querySelectorAll('.nav-dropdown');
    for (var i = 0; i < dropdowns.length; i++) initOne(dropdowns[i]);
  }

  window.LegendsNavDropdown = { init: init, initOne: initOne };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
