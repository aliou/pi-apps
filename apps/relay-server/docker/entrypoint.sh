#!/bin/bash
set -e

# Run codex-universal setup if language versions specified
if [ -n "$CODEX_ENV_NODE_VERSION" ] || [ -n "$CODEX_ENV_PYTHON_VERSION" ]; then
    if [ -f /setup_universal.sh ]; then
        source /setup_universal.sh
    fi
fi

# If first arg is "pi", run it directly
if [ "$1" = "pi" ]; then
    exec "$@"
fi

# Otherwise, run the command
exec "$@"
