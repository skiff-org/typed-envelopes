module.exports = {
  env: {
    browser: true,
    es2021: true,
    'jest/globals': true,
  },
  extends: [
    'airbnb-base',
    'plugin:jest/style',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 12,
  },
  plugins: [
    '@typescript-eslint',
    'jest',
  ],
  rules: {
    'max-len': ['warn', { code: 120 }],
    'no-use-before-define': ['off', {}],
    'no-unused-vars': ['warn', {}],

    // some of the defined classes are basically interface-adherent pojos
    'no-useless-constructor': ['off', {}],
    'no-empty-function': ['off', {}],

    'import/extensions': ['off', {}],

    // 'private' class instances for encoding/decoding to/from string/Uint8Array
    'no-underscore-dangle': ['warn', { allow: ['_encoder', '_decoder'] }],

    // testing
    'jest/prefer-strict-equal': ['warn'],
  },
};
