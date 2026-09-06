#!/bin/sh

# Testing-only bypass for premium features (see client/src/donor/config.js
# and todo.md) — patches the runtime config file's default
# `false` in place when TESTING is set on the container, e.g.
# `docker run -e TESTING=true ...`. No rebuild needed. Unset
# (or any value other than exactly "true") leaves the shipped default, so
# real deployments stay locked unless this is deliberately set.
RUNTIME_CONTENT_FILE=/usr/share/nginx/html/runtime/app-content.js
if [ "$TESTING" = "true" ] && [ -f "$RUNTIME_CONTENT_FILE" ]; then
  sed -i 's/window\.gContent\.TESTING = false;/window.gContent.TESTING = true;/' "$RUNTIME_CONTENT_FILE"
fi

# Start nginx in background
/docker-entrypoint.sh nginx -g "daemon on;"

# Start api server in foreground
exec env APP_API_PORT=7106 /app/main

