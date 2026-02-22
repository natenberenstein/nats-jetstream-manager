#!/bin/bash

# Backend development helper script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 NATS JetStream Manager - Backend Dev Environment${NC}"
echo ""

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo -e "${YELLOW}⚠️  uv is not installed${NC}"
    echo ""
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    echo ""
    echo -e "${GREEN}✅ uv installed successfully!${NC}"
    echo -e "${YELLOW}Please restart your terminal or run: source ~/.cargo/env${NC}"
    exit 0
fi

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}📦 Creating virtual environment...${NC}"
    uv venv
    echo -e "${GREEN}✅ Virtual environment created${NC}"
fi

# Activate virtual environment
echo -e "${GREEN}🔌 Activating virtual environment...${NC}"
source .venv/bin/activate

# Install dependencies
echo -e "${GREEN}📥 Installing dependencies with uv...${NC}"
uv pip install -e ".[dev]"

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Available commands:"
echo "  make run         - Start development server"
echo "  make test        - Run tests"
echo "  make lint        - Lint code"
echo "  make format      - Format code"
echo "  make help        - Show all commands"
echo ""
echo "Starting development server..."
echo ""

# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
