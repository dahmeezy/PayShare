# Repository protection guide

Team: **Maryam (lead, `maryam001-codes`)** and **Zainab Yusuf (`dahmeezy`)**. Only the two of us appear as authors or contributors. No AI agents, bots, or outside collaborators.

## 0. Ownership comes first (rulesets need Admin)

The repo lives under Zainab's personal account, so only Zainab is Admin. Maryam has Write access and cannot create rulesets. Pick one:

- **Option A (quickest):** Zainab does Steps 2 to 5 below while Maryam follows along.
- **Option B (recommended, so the lead controls the repo):** Maryam creates a free GitHub Organization (e.g. `payshare-team`). Zainab goes to Settings, then General, then Danger Zone, then **Transfer ownership**, and transfers `PayShare` to that org. Maryam is the org Owner. Add Zainab as a member with **Write** access. Then Maryam does everything below.

Free GitHub plans support rulesets on public repos. Private repos need GitHub Pro, Team or higher.

## 1. Turn on the checks first

Merge the PR that adds `.github/` (CI plus the attribution check). A required check can only be selected after it has run once.

## 2. Create the ruleset

Repo, then **Settings, Rules, Rulesets, New ruleset, New branch ruleset**.

- **Name:** `Protect main`
- **Enforcement status:** Active
- **Bypass list:** leave **empty**. Nobody, including admins, skips it.
- **Target branches:** Add target, **Include default branch**.

Enable these rules:

1. **Restrict deletions**
2. **Block force pushes**
3. **Require linear history** (this prevents merge commits and divergence; use squash or rebase)
4. **Require a pull request before merging**
   - Required approvals: **1**
   - Dismiss stale pull request approvals when new commits are pushed
   - Require review from Code Owners
   - Require approval of the most recent reviewable push
   - Require conversation resolution before merging
   - Allowed merge methods: **Squash** (and Rebase if you like). Untick Merge commit.
5. **Require status checks to pass**
   - Tick **Require branches to be up to date before merging**
   - Add checks: `backend-tests` and `attribution-check`
6. **Block force pushes** (confirm it is ticked)
7. If shown, **Require signed commits** (optional; both of you must set up GPG or SSH signing first).

Click **Create**.

Note: with 2 people and 1 required approval, whoever opens a PR needs the other to approve. That is the point: every change has two sets of eyes.

## 3. Lock down who can touch the repo

**Settings, Collaborators** (or org **Teams**): only Maryam and Zainab. Remove anyone else. Do not invite bots.

## 4. Switch off agent and bot access

1. **Settings, Code security**: leave **Dependabot** off if you do not want a bot in the contributors list (or accept it as a bot, not an agent; the attribution check flags `[bot]` authors).
2. **Settings, GitHub Apps / Integrations** (and org **Settings, GitHub Apps** and **Installed GitHub Apps**): review each installed app. **Uninstall or Suspend** any AI app (Copilot coding agent, Claude, Codex, Cursor, etc.).
3. **Settings, Copilot** (if present): disable the **Copilot coding agent** for the repo/org.
4. **Settings, Actions, General, Workflow permissions**: set **Read repository contents** and untick **Allow GitHub Actions to create and approve pull requests**.
5. **Settings, Actions, General, Fork pull request workflows**: require approval for all outside collaborators.
6. **Settings, Webhooks / Deploy keys / Secrets**: delete anything you do not recognise.
7. Your account: **Settings, Applications**, then revoke any OAuth or authorised app you did not intend (including the Claude Code or Copilot ones if you do not want them acting on the repo).

## 5. Add a tag ruleset (optional)

New **tag** ruleset: target `*`, restrict deletions and updates, so releases cannot be rewritten.

## 6. Why the "no co-author" rule is enforced in CI

GitHub's native "restrict commit message" rule (commit metadata restrictions) is only available on GitHub Enterprise. On free plans the equivalent is the **required `attribution-check`** status in Step 2. It fails a PR if any commit:

- has an author or committer who is not Maryam or Zainab (GitHub itself is allowed, for web merges),
- has a `Co-authored-by` / `Signed-off-by` / `Generated-by` trailer naming anyone else,
- mentions an AI agent or bot in the message,
- adds agent config files (`CLAUDE.md`, `.claude/`, `AGENTS.md`, `.cursor/`, `copilot-instructions.md`, and similar).

Because it is a required check and nobody can bypass the ruleset, a bad commit cannot reach `main`.

**One gap to know about:** when you click **Squash and merge**, GitHub builds the final commit message from the PR. If it adds a co-author trailer for someone else, review the message box before confirming, or set the default squash message to **Pull request title** in Settings, General, Pull Requests.

## 7. Local setup (each of us, once per clone)

```bash
git config core.hooksPath .githooks      # blocks co-author/agent trailers locally
git config user.name  "<your GitHub name>"
git config user.email "<your GitHub noreply or verified email>"
```

If you use any AI coding tool locally, turn off its commit/PR attribution so it adds no trailer, and keep its config files out of the repo (they are in `.gitignore`).

## 8. Daily workflow (no conflicts, no divergence)

```bash
git switch main && git pull --ff-only           # always start from latest main
git switch -c feature/<short-name>
# ...work, commit...
git fetch origin && git rebase origin/main      # before opening/updating the PR
npm test --prefix backend
git push -u origin feature/<short-name>         # then open a PR, other person approves, Squash and merge
```

Rules of thumb: small PRs, one feature per branch, never push to `main` directly, delete the branch after merge, never commit `node_modules`, `.env`, or `payshare-state.json`.

## 9. Verify the protection works

On a throwaway branch: try `git push origin HEAD:main` (must be rejected), try a commit with a `Co-authored-by: Test <t@t.t>` trailer in a PR (the `attribution-check` must go red), and open a PR with failing tests (merge must be blocked).
