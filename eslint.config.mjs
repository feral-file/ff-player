// @ts-check
import { fixupPluginRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import eslint from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

// NOTE: This is a workaround for ESLint plugins that have not been updated to use the new ESLint 9 flat config format.
// See https://github.com/vercel/next.js/issues/64409
function fixCompatibility(...configNames) {
  return new FlatCompat().extends(...configNames).map(entry => {
    const plugins = entry.plugins;
    for (const key in plugins) {
      // eslint-disable-next-line no-prototype-builtins
      if (plugins.hasOwnProperty(key)) {
        plugins[key] = fixupPluginRules(plugins[key]);
      }
    }
    return entry;
  });
}

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  /**
   * If you want to add other ESLint configs / plugins:
   * - either add its ESLint 9 flat config before this comment
   * - or if they don't support it yet, add the name you'd put in the .eslintrc.json to the `fixCompatibility` call
   */
  // @ts-expect-error - Probably due to weird typing bug, but it works: "Argument of type 'FlatConfig' is not assignable to parameter of type 'ConfigWithExtends'. Types of property 'languageOptions' are incompatible."
  ...fixCompatibility('next'),
  {
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: true,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      jsdoc,
    },
    rules: {
      'curly': ['error', 'all'],
      'eqeqeq': ['error', 'always'],
      'max-lines': [
        'error',
        { max: 500, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'error',
        { max: 80, skipBlankLines: true, skipComments: true },
      ],
      'max-params': ['error', 4],
      'no-unneeded-ternary': 'error',
      'no-useless-return': 'error',
      'object-shorthand': ['error', 'always'],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@next/next/no-img-element': 'off',
    },
  },
  {
    files: [
      'src/services/**/*.ts',
      'src/services/**/*.tsx',
      'src/utils/**/*.ts',
      'src/utils/**/*.tsx',
      'src/context/**/*.ts',
      'src/context/**/*.tsx',
    ],
    plugins: {
      jsdoc,
    },
    rules: {
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-indentation': 'error',
      'jsdoc/require-description': 'error',
      'jsdoc/require-description-complete-sentence': 'error',
      'jsdoc/require-jsdoc': [
        'error',
        {
          contexts: [
            'ClassDeclaration',
            'ExportDefaultDeclaration > FunctionDeclaration',
            'ExportNamedDeclaration > FunctionDeclaration',
          ],
          require: {
            ClassDeclaration: true,
            FunctionDeclaration: true,
          },
        },
      ],
    },
  },
  {
    // Plain-Node config and tooling files: not part of the tsconfig project,
    // so typed linting has nothing to type them against.
    files: ['eslint.config.mjs', 'next.config.mjs', 'scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    ignores: [
      '.next/**/*',
      'node_modules/**/*',
      'dist/**/*',
      'build/**/*',
      'coverage/**/*',
      'out/*',
      'postcss.config.mjs',
      'platforms/*',
      'public/**/*',
    ],
  }
);
