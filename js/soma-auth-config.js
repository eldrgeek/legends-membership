// SOMA Auth config for Legends of Basketball.
// Anon/public key — safe in client-side code.
//
// `methods` controls which sign-in options the login page offers. Toggle these
// per site. Each method ALSO requires the matching provider to be enabled in the
// Supabase dashboard (see SOMA/standards/SOMA-AUTH.md → "Provider dashboard setup"):
//   magicLink — Auth → Providers → Email (Confirm email / magic link)   [no setup cost]
//   emailOtp  — same Email provider, using a {{ .Token }} email template [no setup cost]
//   password  — Auth → Providers → Email (Enable "Email + password")     [no setup cost]
//   phone     — Auth → Providers → Phone + an SMS provider (Twilio etc.) [paid SMS]
//   oauth[]   — Auth → Providers → enable each + add client ID/secret     [provider setup]
window.SOMA_AUTH_CONFIG = {
  url: 'https://omfwcodoimjmbrhssvfl.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tZndjb2RvaW1qbWJyaHNzdmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NzEyNjMsImV4cCI6MjA5NjI0NzI2M30.8Oe2JABFB5qN2dIFk-rccl7-F5R4YjqsTrGFAqZCAlE',

  methods: {
    magicLink: true,                 // passwordless email link (default SOMA method)
    emailOtp:  false,                // 6-digit emailed code (needs {{ .Token }} template)
    password:  true,                 // classic email + password (sign-up + reset)
    phone:     false,                // SMS one-time code — re-enable AFTER an SMS provider is configured in Supabase
    oauth:     []                    // add 'google' (then 'apple','facebook','azure', etc.) AFTER each is set up in Supabase
  }
};
