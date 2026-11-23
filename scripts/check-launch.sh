#!/usr/bin/env bash
# Launch gate (cutover pre-flight). Fails while any placeholder is unfilled or leaked into the build.
set -euo pipefail
fail=0
if grep -n 'TODO' src/consts.ts; then
  echo "✗ unfilled placeholders in src/consts.ts (they are hidden on the site, but launch needs them)" >&2; fail=1
fi
if [ -d dist ] && grep -rIl --include='*.html' --include='*.xml' 'TODO' dist; then
  echo "✗ placeholders leaked into dist/ (files above)" >&2; fail=1
fi
[ "$fail" = 0 ] && echo "✓ launch check passed"
exit "$fail"
