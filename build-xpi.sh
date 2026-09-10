#!/bin/bash

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/tb-planner-0.3.0.xpi"

echo "=============================================="
echo " TB Planner – XPI BUILD"
echo "=============================================="

cd "$ROOT"

echo
echo "===== SYNTAXPRÜFUNG ====="

if command -v node >/dev/null 2>&1; then

    node --check planner.js
    echo "planner.js: OK"

    node --check src/background.js
    echo "background.js: OK"

else

    echo "WARNUNG: node nicht installiert."
    echo "JavaScript-Syntaxprüfung wird übersprungen."

fi

echo
echo "===== MANIFEST ====="

python3 - <<'PY'
import json

with open("manifest.json", encoding="utf-8") as f:
    manifest = json.load(f)

print("Name:   ", manifest["name"])
print("Version:", manifest["version"])
print("ID:     ", manifest["applications"]["gecko"]["id"])
PY

echo
echo "===== ALTE XPI ENTFERNEN ====="

rm -f "$OUT"

echo
echo "===== XPI ERZEUGEN ====="

zip -q -r "$OUT" \
    manifest.json \
    planner.html \
    planner.js \
    planner.css \
    src \
    experiments

echo
echo "===== XPI INHALT ====="

unzip -l "$OUT"

echo
echo "=============================================="
echo " XPI FERTIG"
echo "=============================================="
echo
echo "Datei:"
echo "  $OUT"
echo
ls -lh "$OUT"
echo
