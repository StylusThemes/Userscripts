# AGENTS.md – Guide for Autonomous Coding Agents

> Guidance for autonomous coding agents (for example: OpenAI Codex CLI, Copilot Agent Mode, Cursor, etc.)
> Read this before writing, editing, or executing anything in this repository.
> Execute every instruction as thoroughly and as accurately as possible.

---

## 1. Repository Structure and Permissions

Understand the repository layout and access rules to avoid unauthorized modifications.

### Directory and File Permissions

| Path/File          | Permission | Notes |
|--------------------|------------|-------|
| `libs/`           | ✅ Allowed | Create or edit library code. |
| `libs/**`         | ✅ Allowed | Modify subpackages and helper modules. |
| `scripts/`        | ✅ Allowed | Edit build and utility scripts. |
| `userscripts/`    | ✅ Allowed | Modify user script sources. |
| `package.json`    | ⚠️ Careful | Update dependencies/scripts only if necessary; prefer PR with maintainer approval. |
| `bun.lock`        | ❌ Forbidden | Do not edit lockfiles directly; use package manager. |
| `README.md`       | ✅ Allowed | Update documentation. |
| `LICENSE`         | ❌ Forbidden | Do not modify. |
| `AGENTS.md`       | ❌ Forbidden | Do not modify. |

**Key Guidelines:**
- For ⚠️ items, create a PR, describe changes, and seek maintainer sign-off.
- When uncertain, err on the side of caution—open a PR instead of direct commits.

---

## 2. Development Environment Setup

Set up your environment using Bun for dependency management and tooling.

### Installation and Commands
```bash
bun install         # Install all dependencies
bun add <package>   # Add new packages
bun run build       # Format, validate, and minify JS in libs/ and userscripts/
bun run lint        # Lint userscripts for issues (e.g., unused variables)
```

- Always run `bun run build` and `bun run lint` before committing to ensure code quality.
- Use `bun` exclusively for package management—avoid npm/yarn.

---

## 3. Contribution Workflow

Follow these practices for commits, pull requests, and collaboration.

- **Commits**: Use Conventional Commits (e.g., `feat:`, `fix:`, `chore:`). Keep messages descriptive.
- **Pre-Commit Checks**: Run `bun run lint` and `bun run build` to validate changes.
- **Pull Requests**:
  - Include a clear description of the purpose/issue.
  - List key files changed and any follow-up actions.
  - Await maintainer review for significant changes (e.g., dependencies).

---

## 4. Coding Standards and Best Practices

Adhere to these guidelines for consistent, maintainable code across the repository.

- **Formatting**: Use 2-space indentation, include trailing newlines, and target ES2021+ modules.
- **Imports**: Prefer Global / UMD style; avoid ES6 imports/exports.
- **Naming**:
  - camelCase for variables/functions.
  - PascalCase for constructors.
  - kebab-case for CSS class names.
  - Use descriptive, meaningful names.
- **Comments**: Write comments for non-obvious code and decisions. Avoid comments for obvious code or redundant information.
- **Types**: Use JSDoc for function parameters/returns; do not use TypeScript.
- **Error Handling**: Implement graceful error handling in userscripts to prevent page breakage.
- **Userscripts** (Specific Requirements):
  - Use IIFE pattern: `(function() { 'use strict'; ... })();` (add `async` if asynchronous operations are needed)
  - Include proper headers: `@name`, `@description`, `@version`, `@match`, `@grant`, etc.
  - Test in target browsers with appropriate extensions.
  - Prefer modern web standards; avoid deprecated APIs.
  - Do not update `@require` links without maintainer approval.
- **Libraries**: Export utilities as named exports with comprehensive JSDoc.
- **Styling**:
  - Changes must not affect the site's original functionality or appearance.
  - Always prefix selectors with a unique ID or class to avoid conflicts.
  - Minify CSS to reduce file size.
- **Performance**: Keep code lightweight with efficient DOM queries and event listeners.

---

## 5. Validation and Deployment

- **Testing**: Manually test userscripts in target environments to ensure functionality.
- **Build Process**: The `bun run build` command handles formatting, validation, and minification—run it post-changes.
- **Linting**: Address all ESLint warnings in userscripts before submission.
