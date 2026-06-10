import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default defineConfig(
	globalIgnores(['node_modules/**', '.wrangler/**', 'coverage/**', 'dist/**', 'worker-configuration.d.ts', 'wrangler.deploy.jsonc']),

	eslint.configs.recommended,
	tseslint.configs.strictTypeChecked,
	tseslint.configs.stylisticTypeChecked,

	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.ts', 'vitest.config.mts'],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},

	// Production and tooling code
	{
		files: ['src/**/*.ts', 'scripts/**/*.ts'],
		rules: {
			'@typescript-eslint/explicit-function-return-type': [
				'error',
				{
					allowExpressions: true,
					allowTypedFunctionExpressions: true,
					allowHigherOrderFunctions: true,
					allowDirectConstAssertionInArrowFunctions: true,
				},
			],
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{
					prefer: 'type-imports',
					fixStyle: 'inline-type-imports',
				},
			],
			'@typescript-eslint/no-non-null-assertion': 'warn',
			'@typescript-eslint/prefer-nullish-coalescing': 'error',
			'@typescript-eslint/prefer-optional-chain': 'error',
			// Conflicts with strict-boolean-expressions; explicit null/undefined
			// checks are preferred for clarity.
			'@typescript-eslint/no-unnecessary-condition': 'off',
			'@typescript-eslint/strict-boolean-expressions': [
				'error',
				{
					allowNullableObject: true,
					allowNullableBoolean: true,
					allowNullableString: false,
					allowNullableNumber: false,
					allowAny: false,
				},
			],
			'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
			'prefer-const': 'error',
			'no-var': 'error',
			'object-shorthand': 'error',
			'prefer-template': 'error',
		},
	},

	// Relaxed rules for tests (mocking needs escape hatches)
	{
		files: ['tests/**/*.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/strict-boolean-expressions': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{
					prefer: 'type-imports',
					fixStyle: 'inline-type-imports',
				},
			],
		},
	},

	// Config files at the repo root sit outside the tsconfig projects; lint
	// them without type information.
	{
		files: ['eslint.config.ts', 'vitest.config.mts'],
		extends: [tseslint.configs.disableTypeChecked],
	},

	// Must stay last: disables rules that conflict with prettier formatting
	prettierConfig,
);
