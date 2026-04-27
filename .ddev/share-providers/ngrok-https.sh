#!/usr/bin/env bash
#ddev-generated
# Ngrok HTTPS share provider for LAN testing

set -euo pipefail

# Enable debug output
if [[ "${DDEV_DEBUG:-}" == "true" ]] || [[ "${DDEV_VERBOSE:-}" == "true" ]]; then
    set -x
fi

# Check ngrok
if ! command -v ngrok &> /dev/null; then
    echo "❌ Error: ngrok not found" >&2
    echo "Install from: https://ngrok.com/download" >&2
    echo "Or: brew install ngrok" >&2
    exit 1
fi

# Check auth
if ! ngrok config check &>/dev/null; then
    echo "⚠️  Ngrok not authenticated. Run: ngrok config add-authtoken <YOUR_TOKEN>" >&2
    echo "Get token from: https://dashboard.ngrok.com/get-started/your-authtoken" >&2
    exit 1
fi

# Extract port
PORT=$(echo "$DDEV_LOCAL_URL" | sed -E 's/.*:([0-9]+).*/\1/')
echo "🔌 Starting ngrok HTTPS tunnel on port $PORT..." >&2
echo "📱 Scan the QR code or use the HTTPS URL below" >&2
echo "" >&2

# Start ngrok with HTTP (automatically creates HTTPS endpoint)
# --bind-tls=true forces HTTPS only
ngrok http --bind-tls=true "http://localhost:$PORT" ${DDEV_SHARE_ARGS:-}
