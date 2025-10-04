module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    'dist/**',
    'node_modules/**',
    'data/**',
    'presets/custom/**',
    'public/pathTree.js'
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off'
  },
  overrides: [
    {
      files: ['public/**/*.js'],
      env: {
        browser: true,
        es2022: true
      },
      parser: 'espree',
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      extends: ['eslint:recommended']
    }
  ]
}
