#!/bin/sh
# Wait for the codespace Docker daemon, then build and start the lab stack.
set -eu
cd "$(dirname "$0")/.."
i=0
until docker info >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    docker info || true
    echo "docker did not become ready" >&2
    exit 1
  fi
  sleep 2
done
exec docker compose up --build -d
