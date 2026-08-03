import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `.claude/**` holds Claude Code tooling (skills, commands, hooks, worktrees) —
  // Node scripts vendored from elsewhere, not app source. They aren't built or
  // shipped, so linting them only produces noise (no-undef on `require`/
  // `process` under the browser globals this config targets).
  // android/ and ios/ are the native project shells: hand-edited config
  // (Info.plist, AndroidManifest.xml, MainActivity) plus a copy of the built
  // web bundle that `cap sync` drops into android/**/assets/public and
  // ios/**/App/public. That copy is generated output, not source — linting
  // it is the same class of noise as linting dist/.
  globalIgnores(['dist', '.claude/**', 'android/**', 'ios/**']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Build/test config files run in Node, not the browser. Without this they
  // report `no-undef` on `process` — four errors in playwright.config.js alone,
  // which is enough to fail `npm run lint` (and therefore CI) on a clean tree.
  {
    files: ['*.config.js', 'tools/**/*.js', 'scripts/**/*.js', 'worker/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  // Playwright specs and fixtures: Node globals, plus one rule turned off.
  // `react-hooks/rules-of-hooks` fires on Playwright's fixture signature
  // (`page: async ({ page }, use) => { await use(page) }`) because it reads the
  // `use` parameter as React 19's `use` hook. There are no React components in
  // this directory, so the rule has nothing legitimate to catch here.
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  // Root *.mjs are the content-generation scripts. They were unlinted, which
  // let a refactor ship a runtime ReferenceError (SEASON_SEEDS moved to
  // storyLevels.mjs without an export) that node --check cannot see and the
  // generator's own try/catch swallowed into "planning FAILED" — a whole batch
  // run produced nothing before anyone knew. no-undef alone is the rule that
  // catches that class statically; the scripts aren't held to the app's full
  // rule set because they aren't app code.
  {
    files: ['*.mjs'],
    languageOptions: { globals: globals.node, ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-undef': 'error' },
  },
])
