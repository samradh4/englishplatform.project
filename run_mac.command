#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  cat > .env <<ENV
PORT=3000
NODE_ENV=development
SESSION_SECRET=$SECRET
ADMIN_USERNAME=admin
ADMIN_PASSWORD=UHAdmin@123
MAX_ROOM_PARTICIPANTS=8
ENV
fi

(sleep 1.5; open "http://localhost:3000") &
node server.js
