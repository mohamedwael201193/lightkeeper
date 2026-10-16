#!/usr/bin/env bash
# Fetch the T04 docs corpus from live Pharos sources.
# Writes corpus/{llms.txt,llms-full.txt,sitemap.md} + corpus/manifest.json.
# Read-only: zero chain interaction, zero spend.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CORPUS="$DIR/corpus"
mkdir -p "$CORPUS"

DATE_UTC="$(date -u +%Y-%m-%d)"

echo "fetching llms.txt ..."
curl -sfL --max-time 60 https://www.pharos.xyz/llms.txt -o "$CORPUS/llms.txt"
echo "fetching llms-full.txt ..."
curl -sfL --max-time 90 https://docs.pharos.xyz/llms-full.txt -o "$CORPUS/llms-full.txt"
echo "fetching sitemap.md ..."
curl -sfL --max-time 60 https://docs.pharos.xyz/sitemap.md -o "$CORPUS/sitemap.md"

cat > "$CORPUS/manifest.json" <<EOF
{
  "retrieved": "$DATE_UTC",
  "sources": [
    {"url": "https://www.pharos.xyz/llms.txt", "file": "llms.txt"},
    {"url": "https://docs.pharos.xyz/llms-full.txt", "file": "llms-full.txt"},
    {"url": "https://docs.pharos.xyz/sitemap.md", "file": "sitemap.md"}
  ],
  "note": "llms-full.txt is the full GitBook corpus published by Pharos (llms.txt points to it under 'Full Documentation Bundle'). Re-run this script to refresh the corpus, then rebuild the index with src/build_index.py."
}
EOF

echo "done. bytes: $(wc -c < "$CORPUS/llms-full.txt") (llms-full.txt)"
