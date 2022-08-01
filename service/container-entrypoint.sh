#!/bin/sh

# Start nginx in background
/docker-entrypoint.sh nginx -g "daemon on;"

# Start api server in foreground
exec env APP_API_PORT=7106 /app/main

