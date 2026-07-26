#!/bin/bash
# SessionStart hook — installs dependencies so a fresh remote container can
# actually run the checks in CLAUDE.md §8 (npm run lint / npm test / npm run build).
#
# Without this, node_modules is absent on a new Claude Code on the web session
# and every verification command fails with ERR_MODULE_NOT_FOUND — which reads
# like a broken repo rather than a missing install.
set -euo pipefail

# Local machines already have their own node_modules; only the remote container
# starts empty.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# `npm install` (not `npm ci`) so a warm container cache is reused — ci wipes
# node_modules every time. Idempotent either way.
npm install --no-audit --no-fund

# Playwright's browser is NOT installed here: the e2e suite runs in CI
# (.github/workflows/e2e.yml) and `npx playwright install --with-deps` costs
# minutes plus hundreds of MB of the session's fixed disk allowance. Run it by
# hand if you specifically need to drive the browser.
