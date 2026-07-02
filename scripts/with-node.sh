#!/usr/bin/env bash
# with-node.sh — nvm-aware wrapper so dispatched/non-interactive workers stop
# re-discovering `npm: command not found`.
#
# Dispatched shells (cc-dispatch, launchd, cron) often inherit a thin PATH
# with no nvm sourced, so `node`/`npm` resolve to nothing even though nvm
# has them installed. This wrapper sources nvm, selects the version this
# repo expects (.nvmrc if present, else nvm's default alias), then execs
# whatever command was passed through with that node/npm on PATH.
#
# Usage:
#   scripts/with-node.sh npm install
#   scripts/with-node.sh npm test
#   scripts/with-node.sh node tools/verify-deploy.mjs
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
else
    echo "with-node.sh: nvm not found at $NVM_DIR — falling back to whatever node/npm is already on PATH" >&2
fi

if command -v nvm >/dev/null 2>&1; then
    # nvm.sh's internals can trip `set -e` even when called as the RHS of an
    # `||` (observed: a bare `nvm use default` with an unset/uninstalled
    # alias kills the whole script under errexit despite the `||` guard).
    # Disable -e for this block only, restore it right after.
    set +e
    if [ -f "$REPO_ROOT/.nvmrc" ]; then
        # Run in the repo dir (not a subshell — `nvm use` must run in THIS
        # shell so its PATH change survives to the exec below) so nvm picks
        # up .nvmrc, then return to the original directory.
        pushd "$REPO_ROOT" >/dev/null
        nvm use >/dev/null 2>&1
        popd >/dev/null
    fi
    # Fall back through: configured default alias -> LTS -> highest installed
    # version. "default"/"lts/*" aliases can point at a version that was
    # never actually installed (observed on this machine) — "nvm use node"
    # (highest installed) is the alias that's guaranteed to resolve if any
    # node version is present at all. Each only runs if node still isn't
    # resolvable, so an already-correct .nvmrc selection isn't clobbered.
    command -v node >/dev/null 2>&1 || nvm use default >/dev/null 2>&1
    command -v node >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1
    command -v node >/dev/null 2>&1 || nvm use node >/dev/null 2>&1
    set -e
fi

if ! command -v node >/dev/null 2>&1; then
    echo "with-node.sh: no node on PATH after nvm setup — check ~/.nvm/versions/node/" >&2
    exit 127
fi

exec "$@"
