// Project-local ESLint flat config.
//
// The Glaze CLI (`glaze lint`) uses this file when present and, in that case,
// does NOT pass the framework config via `--config` — so to KEEP the framework
// rules we import and re-export them here, adding only what the project needs:
// ignoring the build staging dirs. The framework config already ignores
// `build/**`, but `glaze build` stages compiled output into `.build/` (and the
// runtime lives in `.glaze/`); without ignoring those, `eslint .` after a build
// lints generated JS and reports hundreds of false errors. The framework config
// self-resolves its own plugins (from the app's node_modules), so importing it
// here is safe.

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Mirror glaze.ts's SDK resolution: check the sibling core, then the versioned SDK.
const candidates = [
  resolve(here, "../glaze-core/cli/lint/eslint.config.js"),
  resolve(here, "../../../sdk/current/@glaze/core/cli/lint/eslint.config.js"),
];

const frameworkConfigPath = candidates.find(existsSync);
if (!frameworkConfigPath) {
  throw new Error(`[folks] Glaze framework ESLint config not found. Searched:\n  - ${candidates.join("\n  - ")}`);
}

const frameworkConfig = (await import(pathToFileURL(frameworkConfigPath).href)).default;

export default [
  // Never lint build output (staged or runtime). This is the only project-level
  // addition; every framework rule below is preserved unchanged.
  { ignores: [".build/**", ".glaze/**"] },
  ...frameworkConfig,
];
