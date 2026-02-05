import globals from 'globals';
//import regexp from 'eslint-plugin-regexp';
import unicorn from 'eslint-plugin-unicorn';

export default [
  {
    ignores: [
      'node_modules/**',
      '**/*.min.js',
      '**/package-lock.json',
      '**/bun.lock',
      '**/eslint.config.js',
      '**/update-jsdelivr-hashes.js',
      '**/build.js',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
        ...globals.node,
        Logger: 'readonly',
        GMC: 'readonly',
        GM: 'readonly',
        Wikidata: 'readonly',
        NodeCreationObserver: 'readonly',
        $: 'readonly',
        jQuery: 'readonly',
        ClipboardJS: 'readonly',
        debounce: 'readonly',
        TAG_VIDEO_SELECTORS: 'readonly',
      },
    },
    plugins: {
      //regexp,
      unicorn,
    },
    rules: {
      //...regexp.configs['flat/recommended'].rules,
      'no-unused-vars': [
        'warn',
        { vars: 'all', args: 'after-used', ignoreRestSiblings: true },
      ],
      eqeqeq: ['warn', 'smart'],
      'no-console': 'warn',
      'no-trailing-spaces': 'warn',
      quotes: ['error', 'single', { allowTemplateLiterals: true }],
      'unicorn/no-unused-properties': 'warn',
      'unicorn/no-array-for-each': 'warn',
      'unicorn/prefer-ternary': 'warn',
      'unicorn/catch-error-name': 'warn',
      'unicorn/prevent-abbreviations': ['warn', { checkFilenames: false }],
      'unicorn/consistent-function-scoping': 'warn',
      'unicorn/no-useless-promise-resolve-reject': 'warn',
      'unicorn/prefer-spread': 'warn',
      'unicorn/prefer-optional-catch-binding': 'warn',
      'unicorn/no-static-only-class': 'warn',
      'unicorn/switch-case-braces': 'warn',
      'unicorn/prefer-date-now': 'warn',
      'unicorn/prefer-modern-dom-apis': 'warn',
    },
  },
];
