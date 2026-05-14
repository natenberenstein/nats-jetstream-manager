#!/bin/sh
set -e

# Replace build-time placeholder with the runtime NEXT_PUBLIC_API_URL value.
# Lets one image be deployed against any backend without a rebuild.
PLACEHOLDER="__RUNTIME_API_URL__"
TARGET="${NEXT_PUBLIC_API_URL:-http://localhost:8000}"
ESCAPED_TARGET="$(printf '%s' "$TARGET" | sed 's/[&|]/\\&/g')"

for dir in /app/.next /app/frontend/.next; do
  if [ -d "$dir" ]; then
    find "$dir" -type f -name "*.js" -exec grep -l "$PLACEHOLDER" {} + 2>/dev/null \
      | xargs -r sed -i "s|$PLACEHOLDER|$ESCAPED_TARGET|g"
  fi
done

exec "$@"
