#!/usr/bin/env bash
# Legends Supabase JWT-secret rotation — Part B propagation + redeploy.
# STAGED by security investigation 2026-07-10. NOT auto-run: causes a brief Legends auth outage.
#
# Run ONLY after Mike regenerates the project JWT secret in the Supabase dashboard
# (Settings -> API -> JWT Settings -> Generate new JWT secret) and copies the two NEW keys.
#
# Usage:
#   scripts/rotate-supabase-jwt.sh <NEW_ANON_KEY> <NEW_SERVICE_ROLE_KEY>
set -euo pipefail
NEW_ANON="${1:?need new anon key}"; NEW_SRK="${2:?need new service_role key}"
REF="omfwcodoimjmbrhssvfl"
OLD_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tZndjb2RvaW1qbWJyaHNzdmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NzEyNjMsImV4cCI6MjA5NjI0NzI2M30.8Oe2JABFB5qN2dIFk-rccl7-F5R4YjqsTrGFAqZCAlE"
cd "$(dirname "$0")/.."

# sanity: new keys are JWTs for the right project
for k in "$NEW_ANON" "$NEW_SRK"; do
  payload=$(echo "$k" | awk -F. '{print $2}' | tr '_-' '/+'); payload="${payload}$(printf '%*s' $(( (4 - ${#payload} % 4) % 4 )) '' | tr ' ' '=')"
  echo "$payload" | base64 -d 2>/dev/null | grep -q "\"ref\": *\"$REF\"" || { echo "ABORT: key not for project $REF"; exit 1; }
done
echo "$NEW_ANON" | awk -F. '{print $2}' | base64 -d 2>/dev/null | grep -q service_role && { echo "ABORT: arg1 must be ANON not service_role"; exit 1; } || true

# 1. update the two client/function files that bake in the anon key
sed -i '' "s|$OLD_ANON|$NEW_ANON|g" js/soma-auth-config.js netlify/functions/update-feedback.js
grep -q "$NEW_ANON" js/soma-auth-config.js || { echo "ABORT: anon key not written"; exit 1; }

# 2. update server-side service_role in Netlify env
netlify env:set SUPABASE_SERVICE_ROLE_KEY "$NEW_SRK"

# 3. commit + deploy to prod
git add js/soma-auth-config.js netlify/functions/update-feedback.js
git commit -m "security: rotate Supabase anon key after JWT-secret regeneration"
netlify deploy --prod --build

# 4. health check (expect HTTP 200; old keys now return 401)
echo "New anon liveness:"; curl -s -o /dev/null -w "%{http_code}\n" "https://$REF.supabase.co/rest/v1/?apikey=$NEW_ANON" -H "Authorization: Bearer $NEW_ANON"
echo "Verify old anon is DEAD (expect 401):"; curl -s -o /dev/null -w "%{http_code}\n" "https://$REF.supabase.co/rest/v1/?apikey=$OLD_ANON" -H "Authorization: Bearer $OLD_ANON"
echo "Done. Test login at https://legends-membership.netlify.app"
