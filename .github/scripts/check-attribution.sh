#!/usr/bin/env bash
# Fails if any commit in the range, or the working tree, carries AI-agent attribution
# or authorship from anyone other than the two PayShare team members.
# Usage: check-attribution.sh <base-sha> <head-sha>
set -uo pipefail
base="${1:-}"; head="${2:-HEAD}"
fail=0

# Allowed identities (lowercase). GitHub's own committer ("GitHub", noreply@github.com) is allowed
# because web merges and squash merges are committed by it.
allowed_re='(maryam001-codes|maryam qozeem|qaasimmaryam15@gmail\.com|265560334\+maryam001-codes@users\.noreply\.github\.com|dahmeezy|zainab yusuf|161367023\+dahmeezy@users\.noreply\.github\.com|noreply@github\.com|^github$)'
agent_re='(claude|anthropic|copilot|codex|openai|chatgpt|gpt-[0-9]|gemini|cursor(agent| ai)|aider|devin|windsurf|codeium|tabnine|sourcegraph cody|\[bot\]|github-actions|dependabot)'

range="$head"
[ -n "$base" ] && [ "$base" != "0000000000000000000000000000000000000000" ] && range="$base..$head"

for c in $(git rev-list "$range"); do
  short=$(git rev-parse --short "$c")
  for who in "$(git log -1 --format='%an <%ae>' "$c")" "$(git log -1 --format='%cn <%ce>' "$c")"; do
    lw=$(echo "$who" | tr 'A-Z' 'a-z')
    if ! echo "$lw" | grep -Eq "$allowed_re"; then echo "::error::$short: author/committer not on the team list: $who"; fail=1; fi
    if echo "$lw" | grep -Eq "$agent_re"; then echo "::error::$short: agent identity as author/committer: $who"; fail=1; fi
  done
  body=$(git log -1 --format=%B "$c")
  # Trailers: Co-authored-by must name only team members.
  while IFS= read -r line; do
    ll=$(echo "$line" | tr 'A-Z' 'a-z')
    if ! echo "$ll" | grep -Eq "$allowed_re"; then echo "::error::$short: forbidden co-author trailer: $line"; fail=1; fi
  done < <(echo "$body" | grep -iE '^(co-authored-by|signed-off-by|reviewed-by|helped-by|assisted-by|generated-by):' || true)
  if echo "$body" | tr 'A-Z' 'a-z' | grep -Eq "$agent_re"; then
    echo "::error::$short: commit message mentions an AI agent/bot"; fail=1
  fi
done

# Files that exist only to configure AI agents must never be committed.
bad_paths=$(git ls-tree -r --name-only "$head" | grep -iE '(^|/)(claude\.md|\.claude(/|$)|agents\.md|gemini\.md|\.cursor(/|rules)|\.cursorrules|\.windsurf|\.codex|\.aider|\.copilot|copilot-instructions\.md|\.continue/|\.devin)' || true)
if [ -n "$bad_paths" ]; then echo "::error::Agent config files are not allowed:"; echo "$bad_paths"; fail=1; fi

# Generated-by signatures inside tracked files (this script and the guide are exempt).
sig=$(git grep -n -I -i -E 'generated with \[?claude|co-authored-by: *claude|noreply@anthropic\.com' "$head" -- . ':!.github/scripts/' ':!docs/REPO_PROTECTION.md' || true)
if [ -n "$sig" ]; then echo "::error::Agent signature found in files:"; echo "$sig"; fail=1; fi

[ "$fail" = 0 ] && echo "Attribution check passed." || echo "Attribution check FAILED."
exit "$fail"
