/**
 * SOMA Auth — browser IIFE build
 * Exposes window.SomaAuth. Requires window.supabase (load from CDN first).
 * Config comes from window.SOMA_AUTH_CONFIG (load soma-auth-config.js first).
 *
 * Load order in HTML:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
 *   <script src="/js/soma-auth-config.js"></script>
 *   <script src="/js/soma-auth.js"></script>
 *
 * ── Supported sign-in methods (all site-configurable via SOMA_AUTH_CONFIG.methods) ──
 *   magicLink  — passwordless one-time email link  (signInWithOtp email)
 *   emailOtp   — 6-digit code emailed instead of a link
 *   password   — classic email + password (with sign-up + reset)
 *   phone      — SMS one-time code (signInWithOtp phone + verifyOtp)
 *   oauth      — third-party providers: google, apple, github, facebook,
 *                azure (Microsoft), and any other Supabase-supported provider.
 *
 * Methods that are not enabled in config simply aren't offered. The runtime
 * always exposes every function; the *UI* gates on getMethods(). This keeps
 * the IIFE copy-verbatim across sites — only the config differs.
 */
(function (global) {
  'use strict';

  var _client = null;
  var _handlers = [];
  var _initialized = false;

  // ---- Known OAuth providers → human-friendly labels + brand colors --------
  // Used by login UIs to render buttons. Any Supabase-supported provider string
  // works even if it isn't listed here (it just gets a title-cased label).
  var PROVIDER_META = {
    google:        { label: 'Google',        color: '#ffffff', text: '#3c4043', border: '#dadce0' },
    apple:         { label: 'Apple',          color: '#000000', text: '#ffffff', border: '#000000' },
    github:        { label: 'GitHub',         color: '#24292f', text: '#ffffff', border: '#24292f' },
    facebook:      { label: 'Facebook',       color: '#1877f2', text: '#ffffff', border: '#1877f2' },
    azure:         { label: 'Microsoft',      color: '#ffffff', text: '#5e5e5e', border: '#dadce0' },
    twitter:       { label: 'X / Twitter',    color: '#000000', text: '#ffffff', border: '#000000' },
    discord:       { label: 'Discord',        color: '#5865f2', text: '#ffffff', border: '#5865f2' },
    linkedin_oidc: { label: 'LinkedIn',       color: '#0a66c2', text: '#ffffff', border: '#0a66c2' },
    slack:         { label: 'Slack',          color: '#4a154b', text: '#ffffff', border: '#4a154b' },
    spotify:       { label: 'Spotify',        color: '#1db954', text: '#ffffff', border: '#1db954' },
    twitch:        { label: 'Twitch',         color: '#9146ff', text: '#ffffff', border: '#9146ff' },
    gitlab:        { label: 'GitLab',         color: '#fc6d26', text: '#ffffff', border: '#fc6d26' },
    notion:        { label: 'Notion',         color: '#ffffff', text: '#191919', border: '#dadce0' }
  };

  function dispatch(event, session) {
    for (var i = 0; i < _handlers.length; i++) {
      try {
        _handlers[i](event, session);
      } catch (e) {
        console.error('[SomaAuth] handler error:', e);
      }
    }
  }

  // Normalize the site config's `methods` block into a predictable shape.
  // Backward compatible: if `methods` is absent, default to magic-link only
  // (matches the original SOMA Auth behavior so existing tenants don't change).
  function normalizeMethods(cfg) {
    var m = (cfg && cfg.methods) || null;
    if (!m) {
      return { magicLink: true, emailOtp: false, password: false, phone: false, oauth: [] };
    }

    // oauth may be: an array of provider strings, OR an object {google:true,...}
    var oauth = [];
    if (Array.isArray(m.oauth)) {
      oauth = m.oauth.slice();
    } else if (m.oauth && typeof m.oauth === 'object') {
      for (var k in m.oauth) {
        if (Object.prototype.hasOwnProperty.call(m.oauth, k) && m.oauth[k]) oauth.push(k);
      }
    } else if (typeof m.oauth === 'string') {
      oauth = [m.oauth];
    }

    return {
      // When a methods block is present, magic link is on unless explicitly disabled.
      magicLink: m.magicLink !== false,
      emailOtp:  !!m.emailOtp,
      password:  !!m.password,
      phone:     !!m.phone,
      oauth:     oauth
    };
  }

  var SomaAuth = {
    /**
     * Initialize the Supabase client. Call once per page after registering
     * onAuthStateChange handlers. Reads url/anonKey from SOMA_AUTH_CONFIG if
     * not passed directly.
     */
    init: function (url, anonKey) {
      if (_initialized) return SomaAuth;
      _initialized = true;

      var cfg = global.SOMA_AUTH_CONFIG || {};
      url = url || cfg.url;
      anonKey = anonKey || cfg.anonKey;

      var lib = global.supabase;
      if (!lib || !url || !anonKey) {
        // Graceful degradation: fire INITIAL_SESSION with null so gated pages
        // redirect to login (which shows a graceful error) and public pages
        // just show logged-out state in the nav.
        console.warn('[SomaAuth] Supabase unavailable or config missing — auth disabled');
        setTimeout(function () { dispatch('INITIAL_SESSION', null); }, 0);
        return SomaAuth;
      }

      _client = lib.createClient(url, anonKey, {
        auth: {
          // OAuth + magic links land back on the page with the session in the
          // URL; detectSessionInUrl (default true) consumes it automatically.
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
          flowType: 'pkce'
        }
      });
      // Supabase v2: onAuthStateChange fires INITIAL_SESSION on next tick with
      // the persisted session (or null). All _handlers receive every event.
      _client.auth.onAuthStateChange(dispatch);
      return SomaAuth;
    },

    /**
     * Register a handler for auth state changes.
     * handler(event, session) — event is one of:
     *   'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' |
     *   'PASSWORD_RECOVERY' | 'USER_UPDATED'
     * Must be called BEFORE init() to receive INITIAL_SESSION.
     */
    onAuthStateChange: function (handler) {
      _handlers.push(handler);
      return SomaAuth;
    },

    /**
     * Which sign-in methods are enabled for this site (from config).
     * Returns { magicLink, emailOtp, password, phone, oauth:[...] }.
     * Drive your login UI off this so the same login.html works everywhere.
     */
    getMethods: function () {
      return normalizeMethods(global.SOMA_AUTH_CONFIG || {});
    },

    /** Is a specific method enabled? name: 'magicLink'|'emailOtp'|'password'|'phone' or an oauth provider string. */
    isMethodEnabled: function (name) {
      var m = SomaAuth.getMethods();
      if (name === 'oauth') return m.oauth.length > 0;
      if (Object.prototype.hasOwnProperty.call(m, name)) return !!m[name];
      return m.oauth.indexOf(name) !== -1; // treat as provider name
    },

    /** Metadata (label/colors) for an OAuth provider, for rendering buttons. */
    providerMeta: function (provider) {
      return PROVIDER_META[provider] || {
        label: provider.charAt(0).toUpperCase() + provider.slice(1).replace(/_/g, ' '),
        color: '#ffffff', text: '#3c4043', border: '#dadce0'
      };
    },

    // ─────────────────────────── Magic link / email OTP ──────────────────────

    /**
     * Send a magic-link (or email OTP code) email.
     * Options: { emailRedirectTo, shouldCreateUser }.
     * If your Supabase email template uses {{ .Token }} the user gets a code;
     * if it uses {{ .ConfirmationURL }} they get a clickable link (default).
     */
    signInWithOtp: function (email, options) {
      if (!_client) return Promise.reject(new Error('[SomaAuth] not initialized'));
      return _client.auth.signInWithOtp({ email: email, options: options || {} });
    },

    /** Verify a 6-digit email OTP code (when using code-style templates). */
    verifyEmailOtp: function (email, token) {
      if (!_client) return Promise.reject(new Error('[SomaAuth] not initialized'));
      return _client.auth.verifyOtp({ email: email, token: token, type: 'email' });
    },

    // ──────────────────────────── Email + password ───────────────────────────

    /** Sign in with email + password. */
    signInWithPassword: function (email, password) {
      if (!_client) return Promise.reject(new Error('[SomaAuth] not initialized'));
      return _client.auth.signInWithPassword({ email: email, password: password });
    },

    /**
     * Create a new account with email + password.
     * Options: { emailRedirectTo, data }. If email confirmations are ON in
     * Supabase, the user must click a confirmation link before signing in.
     */
    signUp: function (email, password, options) {
      if (!_client) return Promise.reject(new Error('[SomaAuth] not initialized'));
      return _client.auth.signUp({ email: email, password: password, options: options || {} });
    },

    /** Send a password-reset email. redirectTo should point at a reset page. */
    resetPasswordForEmail: function (email, redirectTo) {
      if (!_client) return Promise.reject(new Error('[SomaAuth] not initialized'));
      return _client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo: redirectTo } : {});
    },

    /** Update the signed-in user (e.g. set a new password). attrs: { password }. */
    updateUser: function (attrs) {
      if (!_client) return Promise.reject(new Error('[SomaAuth] not initialized'));
      return _client.auth.updateUser(attrs || {});
    },

    /** Resend a signup / email-change confirmation. type defaults to 'signup'. */
    resend: function (email, type) {
      if (!_client) return Promise.reject(new Error('[SomaAuth] not initialized'));
      return _client.auth.resend({ type: type || 'signup', email: email });
    },

    // ─────────────────────────────── Phone / SMS ─────────────────────────────

    /** Send an SMS one-time code to a phone number (E.164, e.g. +15551234567). */
    signInWithPhone: function (phone, options) {
      if (!_client) return Promise.reject(new Error('[SomaAuth] not initialized'));
      return _client.auth.signInWithOtp({ phone: phone, options: options || {} });
    },

    /** Verify the SMS one-time code. */
    verifyPhoneOtp: function (phone, token) {
      if (!_client) return Promise.reject(new Error('[SomaAuth] not initialized'));
      return _client.auth.verifyOtp({ phone: phone, token: token, type: 'sms' });
    },

    // ─────────────────────────────── OAuth / SSO ─────────────────────────────

    /**
     * Begin an OAuth sign-in (redirects the browser to the provider).
     * provider: 'google' | 'apple' | 'github' | 'facebook' | 'azure' | ...
     * options: { redirectTo, scopes, queryParams }.
     */
    signInWithOAuth: function (provider, options) {
      if (!_client) return Promise.reject(new Error('[SomaAuth] not initialized'));
      var opts = options || {};
      opts.provider = provider;
      return _client.auth.signInWithOAuth({ provider: provider, options: options || {} });
    },

    // ───────────────────────────────── Session ───────────────────────────────

    signOut: function () {
      if (!_client) return Promise.resolve({ error: null });
      return _client.auth.signOut();
    },

    getSession: function () {
      if (!_client) return Promise.resolve({ data: { session: null }, error: null });
      return _client.auth.getSession();
    },

    getUser: function () {
      if (!_client) return Promise.resolve({ data: { user: null }, error: null });
      return _client.auth.getUser();
    },

    /**
     * Fetch the user's role from the profiles table.
     * Returns 'admin' | 'member' | null (null only when not authenticated).
     * If called without a user argument, fetches the current session user first
     * so that getRole() with no args works correctly (e.g., console checks,
     * or any path where the caller doesn't have the user object at hand).
     */
    getRole: function (user) {
      if (!_client) return Promise.resolve(null);

      function queryRole(uid) {
        return _client
          .from('profiles')
          .select('role')
          .eq('id', uid)
          .single()
          .then(function (result) {
            if (result.error || !result.data) return 'member';
            return result.data.role || 'member';
          })
          .catch(function () { return 'member'; });
      }

      if (user && user.id) {
        return queryRole(user.id);
      }

      // No user/id provided — fetch the currently authenticated user first.
      return _client.auth.getUser().then(function (res) {
        var uid = res && res.data && res.data.user && res.data.user.id;
        if (!uid) return null;
        return queryRole(uid);
      }).catch(function () { return null; });
    }
  };

  global.SomaAuth = SomaAuth;
})(window);
