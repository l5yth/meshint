#!/usr/bin/env sh
# Fail if the built site LOADS any external asset (CDN / webfont / JS / analytics).
#
# meshcom is a live dashboard: at RUNTIME it fetch()es the potato-mesh API and loads
# CARTO map tiles (both configurable). Those are JS-driven and intentionally invisible
# to this scan — what we forbid is *loading code, fonts, or styles from a CDN* in the
# built output. Leaflet and fonts must be vendored locally (SPEC.md D4/D5; AC-6/7/8).
#
# Scans only files a browser loads/executes (markup/asset code). Prose docs (.md/.txt —
# bundled font licenses, SOURCES.md) may legitimately name a host and are NOT scanned.
# External <a href> hyperlinks (attribution, citations) are allowed.
#
# Usage: zola build && scripts/check-offline.sh [public_dir]
set -eu
DIR="${1:-public}"
[ -d "$DIR" ] || { echo "FAIL: '$DIR' not found — run 'zola build' first." >&2; exit 2; }
fail=0
report() { echo; echo "FAIL: $1"; shift; printf '%s\n' "$@"; fail=1; }

scan() {
  grep -rEHoin \
    --include='*.html' --include='*.css' --include='*.js' \
    --include='*.svg'  --include='*.xml' \
    "$1" "$DIR" 2>/dev/null || true
}

# Asset tags that pull from an external origin (note: <a> hyperlinks are NOT in this list).
hits=$(scan '<(link|script|img|source|video|audio|iframe|embed)\b[^>]*\b(src|href)=["'"'"']https?://[^"'"'"']*')
[ -n "$hits" ] && report "external asset reference(s) in markup" "$hits"

# External stylesheet imports / url() resources.
hits=$(scan '(@import|url\()[[:space:]]*["'"'"']?https?://')
[ -n "$hits" ] && report "external CSS import/url()" "$hits"

# Known analytics / CDN hosts — caught even if reintroduced via the old mockup.
hits=$(scan 'google-analytics|googletagmanager|gtag\(|plausible|matomo|fonts\.(googleapis|gstatic)|cdnjs|jsdelivr|unpkg|cloudflare')
[ -n "$hits" ] && report "analytics/CDN host reference(s)" "$hits"

[ "$fail" -eq 0 ] && echo "OK: no external asset references in '$DIR'."
exit "$fail"
