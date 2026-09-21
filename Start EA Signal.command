#!/bin/zsh
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'EA Signal needs Node.js 22 or newer. Install the LTS version from https://nodejs.org.'
  read '?Press Return to close.'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci || exit 1
fi
# Reuse this app if it is already running on the normal port.
if curl -fsS --max-time 2 http://127.0.0.1:4318/ 2>/dev/null | grep -q 'EA Signal'; then
  open 'http://127.0.0.1:4318'
  exit 0
fi
(sleep 2; open 'http://127.0.0.1:4318') &
npm start
