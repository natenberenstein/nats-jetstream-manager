#!/bin/sh
set -e

# Replace build-time placeholder with the runtime NEXT_PUBLIC_API_URL value.
# Lets one image be deployed against any backend without a rebuild.
PLACEHOLDER="__RUNTIME_API_URL__"
TARGET="${NEXT_PUBLIC_API_URL:-http://localhost:8000}"

if [ -d "/app/.next" ]; then
  find /app/.next -type f -name "*.js" -exec grep -l "$PLACEHOLDER" {} + 2>/dev/null \
    | xargs -r sed -i "s|$PLACEHOLDER|$TARGET|g"
fi

exec "$@"
