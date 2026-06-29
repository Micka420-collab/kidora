import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // French UI is full of apostrophes; escaping every one hurts readability.
      "react/no-unescaped-entities": "off",
      // Data-loading effects intentionally call setState; this rule (React
      // Compiler era) is too strict for async fetch-on-mount.
      "react-hooks/set-state-in-effect": "off",
      // Keep dependency hints visible but non-blocking (Next.js default).
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "public/sw.js",
  ]),
]);

export default eslintConfig;
