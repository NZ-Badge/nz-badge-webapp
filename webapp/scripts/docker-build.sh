#!/bin/bash
# ============================================
# Docker Build & Push Script for ril_presenze
# Repository: nonzod/ril_presenze
# ============================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="nonzod/ril_presenze"
WEBAPP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed or not in PATH${NC}"
    exit 1
fi

# Check if docker daemon is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker daemon is not running${NC}"
    exit 1
fi

# Get version from package.json or use 'latest'
VERSION=""
if [ -f "$WEBAPP_DIR/package.json" ]; then
    VERSION=$(grep -o '"version": "[^"]*"' "$WEBAPP_DIR/package.json" 2>/dev/null | cut -d'"' -f4 || true)
fi

TAG=${1:-${VERSION:-latest}}

if [ -z "$TAG" ]; then
    TAG="latest"
fi

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Building Docker Image${NC}"
echo -e "${BLUE}  Image: ${GREEN}$IMAGE_NAME:$TAG${NC}"
echo -e "${BLUE}  Context: $WEBAPP_DIR${NC}"
echo -e "${BLUE}============================================${NC}"

# Navigate to webapp directory
cd "$WEBAPP_DIR"

# Build the Docker image
docker build -t "$IMAGE_NAME:$TAG" -t "$IMAGE_NAME:latest" .

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Build completed successfully!${NC}"
echo -e "${GREEN}  Tags: $IMAGE_NAME:$TAG, $IMAGE_NAME:latest${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# Ask for push confirmation
read -p "Push to Docker Hub? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Pushing to Docker Hub...${NC}"
    docker push "$IMAGE_NAME:$TAG"
    docker push "$IMAGE_NAME:latest"
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  Push completed!${NC}"
    echo -e "${GREEN}  Image: $IMAGE_NAME:$TAG${NC}"
    echo -e "${GREEN}============================================${NC}"
else
    echo -e "${YELLOW}Push skipped.${NC}"
    echo ""
    echo "To push manually, run:"
    echo -e "  ${BLUE}docker push $IMAGE_NAME:$TAG${NC}"
    echo -e "  ${BLUE}docker push $IMAGE_NAME:latest${NC}"
fi
