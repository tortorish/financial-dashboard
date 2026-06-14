#!/bin/bash
# Financial Dashboard Startup Script
# Usage: ./start.sh
# This script starts the Flask backend service for the financial dashboard.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  Financial Dashboard Launcher"
echo "=========================================="

# Check if already running
PID=$(lsof -ti:5050 2>/dev/null || true)
if [ -n "$PID" ]; then
    echo "Dashboard is already running (PID: $PID)"
    echo "Open http://localhost:5050 in your browser"
    exit 0
fi

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 not found"
    exit 1
fi

# Check dependencies
if ! python3 -c "import flask" 2>/dev/null; then
    echo "Installing dependencies..."
    pip install -r requirements.txt
fi

echo "Starting Flask server on port 5050..."
nohup python3 app.py > /tmp/flask_dashboard.log 2>&1 &

sleep 2

# Verify startup
NEW_PID=$(lsof -ti:5050 2>/dev/null || true)
if [ -n "$NEW_PID" ]; then
    echo "Server started successfully (PID: $NEW_PID)"
    echo "Open http://localhost:5050 in your browser"
    echo "Log file: /tmp/flask_dashboard.log"
else
    echo "Failed to start server. Check /tmp/flask_dashboard.log"
    exit 1
fi
