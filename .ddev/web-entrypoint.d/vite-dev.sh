#!/bin/bash
# Start Vite dev server in background at container startup
cd /var/www/html/webapp
npm install --silent 2>&1 | tail -3 >> /tmp/vite-install.log
nohup npm run dev > /tmp/vite.log 2>&1 &
echo "Vite dev server started (pid $!)"
