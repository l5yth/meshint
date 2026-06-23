#!/usr/bin/env python3
# .claude/hooks/guard.py — PreToolUse guard for risky shell actions.
# Reads the tool-call JSON on stdin; prints a deny|ask decision for dangerous
# commands and exits 0 (normal handling) otherwise.
import json, re, sys

ALLOWED_HOSTS = r"(localhost|127\.0\.0\.1|([a-z0-9-]+\.)*potatomesh\.net|github\.com|raw\.githubusercontent\.com|objects\.githubusercontent\.com)"

def emit(decision, reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": decision,
        "permissionDecisionReason": reason}}))
    sys.exit(0)

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if data.get("tool_name") != "Bash":
    sys.exit(0)
c = (data.get("tool_input") or {}).get("command", "")
if not c.strip():
    sys.exit(0)

# ---- DENY: catastrophic, never unprompted ----
if re.search(r"\brm\b(?:\s+-\S+)*\s+(?:-\S+\s+)*(/|/\*|~|~/\*?|\$HOME(?:/\*?)?|\*)(\s|;|&|\||$)", c):
    emit("deny", "Refusing rm of / ~ $HOME or a root glob.")
if re.search(r":\s*\(\s*\)\s*\{|\bmkfs\b|\bdd\b[^\n]*\bof=/dev/|>\s*/dev/(sd|nvme|disk)", c):
    emit("deny", "Refusing disk-destroying command.")
if re.search(r"\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b", c):
    emit("deny", "Refusing curl/wget piped into a shell.")
if re.search(r"\b(npm|pnpm|yarn)\s+publish\b|\bcargo\s+publish\b", c):
    emit("deny", "Package publishing is blocked for meshcom.")

# ---- ASK: risky but sometimes legitimate ----
if re.search(r"\bgit\s+push\b[^\n]*(--force\b|-f\b|--force-with-lease\b)", c):
    emit("ask", "Force-push rewrites remote history — confirm.")
if re.search(r"\brm\s+-\S*[rf]", c):
    emit("ask", "Recursive/forced delete — confirm.")
if re.search(r"\bgit\s+(reset\s+--hard|clean\s+-\S*f|checkout\s+--\s|restore\s+\.|push)\b", c):
    emit("ask", "Destructive or remote-affecting git op — confirm.")
if re.search(r"\bsudo\b", c):
    emit("ask", "Elevated privileges (sudo) — confirm.")
if re.search(r"(\.credentials\.json|/\.ssh/|id_rsa|id_ed25519|\.netrc|\.npmrc|\.env(\b|\.)|secret|credential)", c, re.I):
    emit("ask", "Touches credential/secret material — confirm.")
hosts = re.findall(r"https?://([^/\s\"']+)", c)
if re.search(r"\b(curl|wget|nc|ncat|telnet|scp|rsync)\b", c) and (not hosts or any(not re.fullmatch(ALLOWED_HOSTS, h) for h in hosts)):
    emit("ask", "Network egress to a non-allowlisted host — confirm.")

sys.exit(0)
