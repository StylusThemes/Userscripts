# AGENTS.md - Guide for Autonomous Coding Agents

> Guidance for autonomous coding agents (for example: OpenAI Codex CLI, Copilot Agent Mode, Cursor, etc.)
> Read this before writing, editing, or executing anything in this repository.
> Execute every instruction as thoroughly and as accurately as possible.

---

## 1. Operating Rules

- Follow this document before making any change.
- Prefer the smallest change that fully solves the problem.
- Preserve existing behavior unless the task explicitly requires a behavior change.
- When uncertain about scope, approval, or side effects, stop and open a PR instead of making a direct change.

---

## 2. Quick Reference

### Command Reference

| Task                               | Command             |
| ---------------------------------- | ------------------- |
| Install dependencies               | `bun install`       |
| Add dependency                     | `bun add <package>` |
| Build / format / validate / minify | `bun run build`     |
| Lint userscripts                   | `bun run lint`      |

### Required Before Commit

| Check                  | Requirement                   |
| ---------------------- | ----------------------------- |
| Build                  | Must pass                     |
| Lint                   | Must pass                     |
| Manual userscript test | Required for affected targets |
| Commit style           | Conventional Commits          |

---

## 3. Repository Permissions

Use this table to decide what may be edited directly.

| Path/File                                               | Permission   | Notes                                                 |
| ------------------------------------------------------- | ------------ | ----------------------------------------------------- |
| `libs/`                                                 | ✅ Allowed   | Library source code.                                  |
| `libs/**`                                               | ✅ Allowed   | Helpers, subpackages, shared utilities.               |
| `scripts/`                                              | ✅ Allowed   | Build and utility scripts.                            |
| `scripts/**`                                            | ✅ Allowed   | Script internals and tooling code.                    |
| `userscripts/`                                          | ✅ Allowed   | Userscript source files.                              |
| `userscripts/**`                                        | ✅ Allowed   | Site-specific scripts and assets.                     |
| `README.md`                                             | ✅ Allowed   | Documentation updates are allowed.                    |
| `package.json`                                          | ⚠️ Careful   | Change only if necessary; prefer maintainer review.   |
| `.github/**`                                            | ⚠️ Careful   | CI/workflow changes should be justified and reviewed. |
| config files (`*.json`, `*.mjs`, `*.cjs`, `*.config.*`) | ⚠️ Careful   | Only edit when required by the task.                  |
| generated/minified outputs                              | ⚠️ Careful   | Update only through the normal build flow.            |
| `bun.lock`                                              | ❌ Forbidden | Do not edit lockfiles directly. Use Bun.              |
| `LICENSE`                                               | ❌ Forbidden | Do not modify.                                        |
| `AGENTS.md`                                             | ❌ Forbidden | Do not modify.                                        |
| secret files / credentials                              | ❌ Forbidden | Never commit secrets or tokens.                       |

**Rules for ⚠️ paths**
- Make the minimum necessary change.
- Explain why the change is needed.
- Prefer a PR and maintainer sign-off for dependency or workflow changes.

---

## 4. Workflow

1. Read the relevant files fully.
2. Confirm the target scope before changing anything.
3. Edit the relevant files.
4. Run:
   ```bash
   bun run lint
   bun run build
   ```
5. Manually test affected userscripts in their target environment.
6. Prepare a Conventional Commit message.
7. Open a PR for anything significant, risky, or approval-sensitive.

---

## 5. Coding Standards

- Use 2-space indentation.
- Include trailing newlines.
- Target ES2021+.
- Use Global / UMD style; **do not use ES6 imports/exports**.
- Use descriptive names:
  - camelCase for variables and functions
  - PascalCase for constructors
  - kebab-case for CSS class names
- Handle errors gracefully, especially in userscripts.
- Prefer simple, readable code over abstraction that does not clearly pay for itself.

### Comments

**For `libs/`:**
- JSDoc comments are required.
- Inline comments are allowed for non-obvious logic.

**For `userscripts/`:**
- Inline comments should appear **only** when code cannot explain itself.
- Do not add comments that restate obvious code.
- JSDoc is optional, never required.

---

## 6. Userscript Requirements

Every userscript should follow these rules:

- Use the IIFE pattern:
  ```javascript
  (function() {
    'use strict';
  })();
  ```
  Add `async` only if needed.

- Include proper metadata headers such as:
  - `@name`
  - `@description`
  - `@version`
  - `@match`
  - `@grant`

- Use modern web standards.
- Avoid deprecated APIs.
- Do not modify `@require` links without approval.
- Do not change the site's original functionality or appearance unless the task explicitly requires it.
- Prefix selectors with a unique ID or class when injecting styles.
- Keep DOM queries and event listeners lightweight.

---

## 7. Common Mistakes (Do Not Do This)

- Do **not** use npm or yarn; use **Bun only**.
- Do **not** switch to ES module syntax in userscripts or library code that expects Global / UMD style.
- Do **not** add obvious comments.
- Do **not** change `@require` sources without approval.
- Do **not** broaden `@match` patterns carelessly.
- Do **not** introduce heavy DOM polling when an event, observer, or narrower hook will do.
- Do **not** break the host page if your script fails; fail safely.
- Do **not** skip manual browser testing for affected userscripts.

---

## 8. Userscript Troubleshooting and Gotchas

Check these first when a userscript "doesn't work":

- **Wrong match pattern**: verify the page actually matches the metadata rules.
- **Execution timing issue**: site content may load after initial script execution.
- **Dynamic DOM**: target elements may be replaced after render; use resilient hooks.
- **Sandbox/API differences**: confirm required `@grant` values are present.
- **CSS collisions**: unprefixed selectors may affect unrelated page elements.
- **Page breakage from uncaught errors**: wrap risky logic so failures degrade safely.
- **Browser/extension differences**: test in the intended userscript manager and target browser.
- **Build output stale**: rerun build after modifying source files.

---

## 9. Validation and Submission

### Validation
- Run:
  ```bash
  bun run lint
  bun run build
  ```
- Address all lint warnings in userscripts.
- Manually verify behavior in the target environment.

### Commits
- Use Conventional Commits:
  - `feat:`
  - `fix:`
  - `refactor:`
  - `docs:`
  - `chore:`

### Pull Requests
Include:
- purpose of the change
- key files changed
- validation performed
- any follow-up work or approval needs

If a change touches dependencies, workflows, config, or behavior with broad impact, prefer a PR with maintainer review.
