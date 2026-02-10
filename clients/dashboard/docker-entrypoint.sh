#!/bin/sh
set -e

# Replace placeholder with runtime RELAY_URL in all JS files.
# If RELAY_URL is unset, replaces with empty string (same-origin mode).
RELAY_URL="${RELAY_URL:-}"
echo "Configuring RELAY_URL=${RELAY_URL:-(same-origin)}"
find /srv -type f -name '*.js' -exec sed -i "s|__RELAY_URL_PLACEHOLDER__|${RELAY_URL}|g" {} +

# Start Caddy
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
