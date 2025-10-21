# AGENTS.md – Guide for Autonomous Coding Agents

> Guidance for autonomous coding agents (for example: OpenAI Codex CLI, Copilot Agent Mode, Cursor, etc.)
> Read this before writing, editing, or executing anything in this repository.
> Execute every instruction as thoroughly and as accurately as possible.
> **Always perform full-file updates in one pass. Do not edit line-by-line.**

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

Follow these rules exactly when writing or editing code in this repository.

- **Formatting**: Use 2-space indentation, include trailing newlines, and target ES2021+ modules.
- **Imports**: Use Global / UMD style; do not use ES6 imports/exports.
- **Naming**:
  - camelCase for variables and functions
  - PascalCase for constructors
  - kebab-case for CSS class names
  - Choose descriptive and meaningful names
- **Comments**:
  - For **libs/**:
    - All library code **must have JSDoc comments**.
    - Inline `//` comments may be added for complex or non-obvious logic.
  - For **userscripts/**:
    - **Inline `//` comments should only be added for code that can't explain itself**.
    - **Do not add comments that restate what the code already does**.
    - **Do not add comments for variable or function names that are self-explanatory**.
    - **JSDoc comments may be included if desired, but must never be required or enforced.**
    - **Examples of Self-Explanatory vs Non-Self-Explanatory Code:**
      ### Code That Can Explain Itself (No Comments Needed)
      ```javascript
      // ✅ GOOD: Clear variable names and structure
      const userCartItems = getUserCart(currentUserId);
      const cartTotal = calculateCartTotal(userCartItems);

      function validateUserInput(email, password) {
          const isValidEmail = email.includes('@') && email.includes('.');
          const isValidPassword = password.length >= 8;
          return isValidEmail && isValidPassword;
      }

      const activeUsers = users.filter(user => user.isActive && user.lastLogin > oneWeekAgo);

      button.addEventListener('click', handleFormSubmission);

      let retryCount = 0;
      const maxRetries = 3;
      ```
      ### Code That Can't Explain Itself (Comments Required)
      ```javascript
      // ❌ BAD: Cryptic variable names and magic numbers
      const x = getU();
      const y = getD();
      const r = p(x, y);

      // ✅ IMPROVED: With explanatory comments for non-obvious logic
      // Complex regex to match magnet links only - avoids false positives on plain text hashes
      const magnetRegex = /magnet:\?xt=urn:btih:[a-zA-Z0-9]{40}/;

      // Using innerHTML for performance on large content updates, despite XSS risk - content is fully controlled and sanitized
      container.innerHTML = generateSafeHtml(data);

      // Delay execution to allow page scripts to initialize - prevents conflicts with site JS
      setTimeout(() => modifyPage(), 1000);

      // Skip first table row - it's the header, not data
      const rows = table.querySelectorAll('tr');
      rows.slice(1).forEach(processRow);

      // Bitwise permission check: 0b1000 represents admin access rights
      const hasAdminAccess = userPermissions & 0b1000;

      // Temporary workaround for browser bug - remove when Chrome 95+ is minimum supported
      if (navigator.userAgent.includes('Chrome/94')) {
          applyChrome94Workaround();
      }
      ```
      ### More Examples of Required Comments
      ```javascript
      // Non-obvious business logic that requires domain knowledge
      // Company policy: users under 18 cannot purchase restricted items
      const canPurchaseRestricted = userAge >= 18 && hasValidId;

      // Complex mathematical operations
      // Convert degrees to radians for trigonometric functions
      const angleInRadians = degrees * (Math.PI / 180);

      // Workarounds for specific browser quirks
      // Firefox doesn't support the modern API, fall back to deprecated method
      const storage = browser.storage || chrome.storage;

      // Performance optimization that sacrifices readability
      // Precompute values to avoid redundant calculations in tight loop
      const precomputedValues = expensiveArray.map(expensiveCalculation);
      ```
      ### Examples of Unnecessary Comments
      ```javascript
      // ❌ BAD: Comments that state the obvious
      let count = 0; // Initialize count to zero

      const element = document.getElementById('myElement'); // Get element by ID

      items.push(newItem); // Add new item to items array

      // Increment counter
      count++;

      // Check if user is logged in
      if (isLoggedIn) {
          // Show user dashboard
          showDashboard();
      }
      ```
- **Error Handling**: Handle errors gracefully in userscripts to prevent breaking the page.
- **Userscripts** (Specific Requirements):
  - Use IIFE pattern: `(function() { 'use strict'; ... })();` (add `async` if needed)
  - Include proper headers: `@name`, `@description`, `@version`, `@match`, `@grant`, etc.
  - Test in target browsers using appropriate extensions
  - Use modern web standards; avoid deprecated APIs
  - Do not modify `@require` links without approval
- **Libraries**: Export utilities as named exports.
- **Styling**:
  - Do not change the site's original functionality or appearance
  - Always prefix selectors with a unique ID or class
  - Minify CSS to reduce file size
- **Performance**: Write efficient code with lightweight DOM queries and event listeners

---

## 5. Validation and Deployment

- **Testing**: Manually test userscripts in target environments to ensure functionality.
- **Build Process**: The `bun run build` command handles formatting, validation, and minification—run it post-changes.
- **Linting**: Address all ESLint warnings in userscripts before submission.
- Agents **must perform full-file edits in one motion**; do not make incremental line-by-line changes unless explicitly instructed.
