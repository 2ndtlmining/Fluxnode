#!/bin/sh

# Testing-only bypass for premium features (see client/src/donor/config.js
# and PREMIUM_FEATURES_PLAN.md) — patches the runtime config file's default
# `false` in place when PREMIUM_TESTING_MODE is set on the container, e.g.
# `docker run -e PREMIUM_TESTING_MODE=true ...`. No rebuild needed. Unset
# (or any value other than exactly "true") leaves the shipped default, so
# real deployments stay locked unless this is deliberately set.
RUNTIME_CONTENT_FILE=/usr/share/nginx/html/runtime/app-content.js
if [ "$PREMIUM_TESTING_MODE" = "true" ] && [ -f "$RUNTIME_CONTENT_FILE" ]; then
  sed -i 's/window\.gContent\.PREMIUM_TESTING_MODE = false;/window.gContent.PREMIUM_TESTING_MODE = true;/' "$RUNTIME_CONTENT_FILE"
fi

# Start nginx in background
/docker-entrypoint.sh nginx -g "daemon on;"

# Start api server in foreground
exec env APP_API_PORT=7106 /app/main

