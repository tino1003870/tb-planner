#!/bin/bash

set -e

echo "=============================================="
echo " TB Planner – Git Sync"
echo "=============================================="
echo

echo "=== STATUS VORHER ==="
git status
echo

echo "=== ÄNDERUNGEN ÜBERNEHMEN ==="
git add .

if git diff --cached --quiet; then
    echo "Keine neuen Änderungen zum Committen."
else
    git commit -m "Sync local changes"
fi

echo
echo "=== PUSH NACH GITHUB ==="
git push origin main

echo
echo "=== STATUS NACHHER ==="
git status

echo
echo "=============================================="
echo " GitHub-Sync abgeschlossen."
echo "=============================================="
