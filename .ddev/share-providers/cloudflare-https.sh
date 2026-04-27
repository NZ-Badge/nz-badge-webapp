#!/usr/bin/env bash
#ddev-generated
# Cloudflare Tunnel HTTPS share provider

set -euo pipefail

if [[ "${DDEV_DEBUG:-}" == "true" ]] || [[ "${DDEV_VERBOSE:-}" == "true" ]]; then
    set -x
fi

if ! command -v cloudflared &> /dev/null; then
    echo "❌ Error: cloudflared not found" >&2
    echo "Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
    exit 1
fi

PORT=$(echo "$DDEV_LOCAL_URL" | sed -E 's/.*:([0-9]+).*/\1/')
echo "🚀 Starting Cloudflare Tunnel on port $PORT..." >&2

# Create temporary tunnel
cloudflared tunnel --url "http://localhost:$PORT" ${DDEV_SHARE_ARGS:-}
