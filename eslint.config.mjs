import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "next-env.d.ts",
      "*.xlsx",
      "*.csv",
      ".agents/**",
      "AGENTS.md",
    ],
  },
  {
    rules: {
      // Leading-underscore parameters are the project's documented convention
      // for intentionally-unused mock/placeholder arguments (e.g. vi.fn(async
      // (_url, _init) => ...) in transport tests). Anything without the prefix
      // is still flagged.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
];

export default eslintConfig;
