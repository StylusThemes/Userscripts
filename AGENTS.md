# AGENTS.md – Guide for Autonomous Coding Agents

> Guidance for autonomous coding agents (for example: OpenAI Codex CLI, Copilot Agent Mode, Cursor, etc.)
> Read this before writing, editing, or executing anything in this repository.
> Execute every instruction as thoroughly and as accurately as possible.

---

## 1 Repository map & access rules

| Path / file | Agent action |
|-------------|---------------|
| `libs/` | ✅ Allowed — library code may be created or edited. |
| `libs/**` | ✅ Allowed — subpackages and helper modules may be changed. |
| `scripts/` | ✅ Allowed — build and utility scripts may be changed. |
| `userscripts/` | ✅ Allowed — user script sources may be changed. |
| `package.json` | ⚠️ Edit with care — only update dependencies or scripts when necessary; prefer a PR and maintainer sign-off. |
| `bun.lock` | ❌ Do not edit directly. Lockfiles should only be updated by running the package manager. |
| `README.md` | ✅ Allowed — documentation updates are fine. |
| `LICENSE` | ❌ Do not modify. |
| `AGENTS.md` | ❌ Do not modify. |

Notes:
- If an action is marked ⚠️, open a PR and describe the change; prefer maintainer approval for dependency or lockfile changes.
- When in doubt, prefer to create a PR rather than committing risky changes directly.

---

## 2 Environment & setup commands

```bash
bun install         # install deps
bun add <package>   # add new packages
bun run build       # runs scripts/build.js -> formats files, validates, writes libs/*.min.js
```

---

## 3 Formatting & linting

Run the project's linter before proposing commits or PRs:

```bash
bun run lint
```

Agents should run linters and fix any reported issues before creating commits or pull requests.

---

## 4 Commit & PR etiquette

- Use Conventional Commits (`feat:`, `fix:`, `chore:`, ...).
- PR description must list:
  1. Purpose / linked issue
  2. Key files changed
  3. Any required follow-up actions (tests to run, deploy steps, etc.)

---

## 5 House rules & coding style
- Write comments for non-obvious code and decisions.
- Don't add comments for obvious code or that don't provide new information. (Remove any comments that are for obvious code or that don't provide new information)
- Use 2-space indentation and ensure a trailing newline at the end of files. (Follow repository convention).
- Do not remove `TAG_VIDEO_SELECTORS` from the YouTube age filter userscript.
- Update version numbers in userscripts following semantic versioning.

---

## 6. Userscript-Specific Guidelines
- Ensure all userscripts include proper headers such as @name, @description, @version, @match, @grant, etc.
- Test userscripts in the target browser with the appropriate extension (e.g., Tampermonkey, Greasemonkey).
- Avoid using deprecated APIs; prefer modern web standards.
- Handle errors gracefully to prevent breaking the page.
- Keep userscripts lightweight and efficient to avoid impacting page performance.
- Don't update the @require links. prefer a PR and maintainer sign-off.
