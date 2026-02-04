#!/bin/bash
set -e

# Run codex-universal setup if language versions specified
if [ -n "$CODEX_ENV_NODE_VERSION" ] || [ -n "$CODEX_ENV_PYTHON_VERSION" ]; then
    if [ -f /setup_universal.sh ]; then
        source /setup_universal.sh
    fi
fi

# Load secrets from mounted files into environment variables.
# Supports two modes:
#   1. Manifest-based (preferred): reads manifest file mapping env var names to safe filenames
#   2. Legacy: reads each file, uppercases filename as env var name
SECRETS_DIR="${PI_SECRETS_DIR:-/run/secrets}"

if [ -f "$SECRETS_DIR/manifest" ]; then
    # Manifest mode: each line is ENV_VAR<TAB>FILENAME
    while IFS=$'\t' read -r env_name file_name; do
        [ -z "$env_name" ] && continue
        secret_path="$SECRETS_DIR/$file_name"
        [ -f "$secret_path" ] || continue
        secret_value="$(cat "$secret_path")"
        export "$env_name"="$secret_value" 2>/dev/null || true
    done < "$SECRETS_DIR/manifest"
elif [ -d "$SECRETS_DIR" ]; then
    # Legacy mode: uppercase filename as env var
    for secret_file in "$SECRETS_DIR"/*; do
        if [ -f "$secret_file" ]; then
            env_name=$(basename "$secret_file" | tr '[:lower:]' '[:upper:]')
            secret_value="$(cat "$secret_file")"
            export "$env_name"="$secret_value" 2>/dev/null || true
        fi
    done
fi

# If first arg is "pi", run it directly
if [ "$1" = "pi" ]; then
    exec "$@"
fi

# Otherwise, run the command
exec "$@"
