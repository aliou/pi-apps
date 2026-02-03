#!/bin/bash
set -e

# Load secrets from mounted files into environment variables
# Secrets are mounted at /run/secrets/ as files (e.g., /run/secrets/anthropic_api_key)
# Each file contains the secret value
# Also write to /etc/profile.d so they're available in exec'd shells
SECRETS_PROFILE="/etc/profile.d/pi-secrets.sh"
: > "$SECRETS_PROFILE" 2>/dev/null || true

if [ -d "${PI_SECRETS_DIR:-/run/secrets}" ]; then
    for secret_file in "${PI_SECRETS_DIR:-/run/secrets}"/*; do
        if [ -f "$secret_file" ]; then
            # Convert filename to uppercase env var name
            # e.g., anthropic_api_key -> ANTHROPIC_API_KEY
            env_name=$(basename "$secret_file" | tr '[:lower:]' '[:upper:]')
            secret_value="$(cat "$secret_file")"
            export "$env_name"="$secret_value"
            # Also write to profile for docker exec sessions
            echo "export $env_name=\"$secret_value\"" >> "$SECRETS_PROFILE" 2>/dev/null || true
        fi
    done
fi

# If first arg is "pi", run it directly
if [ "$1" = "pi" ]; then
    exec "$@"
fi

# Otherwise, run the command
exec "$@"
