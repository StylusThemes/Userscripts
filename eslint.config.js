import globals from 'globals';
import unicorn from 'eslint-plugin-unicorn';

export default [
  {
    files: ["userscripts/**/*.user.js"],
    ignores: ["node_modules/", "dist/", "libs/", "package-lock.json", "bun.lock"],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: "module",
      globals: {
        ...globals.browser,
        Logger: "readonly",
        GMC: "readonly",
        GM: "readonly",
        Wikidata: "readonly",
        NodeCreationObserver: "readonly",
        $: "readonly",
        jQuery: "readonly",
        ClipboardJS: "readonly",
        debounce: "readonly",
        TAG_VIDEO_SELECTORS: "readonly",
      },
    },
    plugins: {
      unicorn,
    },
    rules: {
      "no-unused-vars": ["warn", { vars: "all", args: "after-used", ignoreRestSiblings: true }],
      "eqeqeq": ["warn", "smart"],
      "no-console": "warn",
      "unicorn/no-unused-properties": "warn",
      "unicorn/no-array-for-each": "warn",
      "unicorn/prefer-ternary": "warn",
      "unicorn/catch-error-name": "warn",
      "unicorn/prevent-abbreviations": ["warn", { "checkFilenames": false }],
      "unicorn/consistent-function-scoping": "warn",
      "unicorn/no-useless-promise-resolve-reject": "warn",
      "unicorn/prefer-spread": "warn",
      "unicorn/prefer-optional-catch-binding": "warn",
      "unicorn/no-static-only-class": "warn",
      "unicorn/switch-case-braces": "warn",
      "unicorn/prefer-date-now": "warn",
      "unicorn/prefer-modern-dom-apis": "warn",
    },
  },
];
