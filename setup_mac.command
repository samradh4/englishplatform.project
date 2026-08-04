#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "========================================"
echo "  UH Education Hub - First-time setup"
echo "========================================"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 or newer is required."
  echo "Install it from https://nodejs.org and run this file again."
  read -p "Press Enter to close..."
  exit 1
fi

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
  echo "Created .env with the default admin account."
fi

mkdir -p data

echo ""
echo "Setup complete. No npm install or Python packages are needed."
echo "Admin username: admin"
echo "Admin password: UHAdmin@123"
echo "Run run_mac.command to start the website."
read -p "Press Enter to close..."
