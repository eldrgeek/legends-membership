#!/usr/bin/env bash
# Safe deploy script — hardcodes the siteId so this can never cross-deploy.
# Always use this instead of bare `netlify deploy --prod`.
set -euo pipefail

SITE_ID="47a0da43-cc93-435d-964b-79dc3ed04c4e"
SITE_NAME="legends-membership"

echo "Deploying to $SITE_NAME (siteId: $SITE_ID) ..."
netlify deploy --prod --site="$SITE_ID" "$@"
