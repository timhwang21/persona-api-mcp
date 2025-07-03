import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    ...js.configs.recommended,
    ...tseslint.configs.recommended[0],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-empty-function": "off",
      "prefer-const": "error",
      "no-var": "error",
      "no-undef": "off", // TypeScript handles this
    },
  },
  {
    ignores: ["dist/**/*", "node_modules/**/*", "scripts/**/*"],
  },
];
