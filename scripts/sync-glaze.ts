import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const destination = resolve(repositoryRoot, "app");
const defaultSource = resolve(
  homedir(),
  "Library/Application Support/app.glaze.macos.main/apps/start-here-local-xx65rjh7/.glaze-sources",
);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const noPush = args.includes("--no-push");

function optionValue(name: string) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function fail(message: string): never {
  console.error(`Sync stopped: ${message}`);
  process.exit(1);
}

function run(
  command: string,
  commandArgs: string[],
  options: { quiet?: boolean; allowFailure?: boolean } = {},
) {
  const result = spawnSync(command, commandArgs, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: options.quiet ? "pipe" : "inherit",
  });

  if (result.error) {
    fail(`${command} could not run: ${result.error.message}`);
  }

  if (result.status !== 0 && !options.allowFailure) {
    fail(`${command} ${commandArgs.join(" ")} failed`);
  }

  return result;
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: bun sync [options]

Options:
  --dry-run          Preview the copy without changing GitHub
  --no-push          Sync and commit, but do not push
  --message <text>   Override the commit message
  --source <path>    Override the Glaze source directory`);
  process.exit(0);
}

const valueOptions = new Set(["--message", "--source"]);
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (
    argument === "--dry-run" ||
    argument === "--no-push" ||
    argument === "--help" ||
    argument === "-h"
  ) {
    continue;
  }

  if (valueOptions.has(argument)) {
    if (!args[index + 1] || args[index + 1].startsWith("--")) {
      fail(`${argument} requires a value`);
    }
    index += 1;
    continue;
  }

  fail(`unknown option: ${argument}`);
}

const source = resolve(
  optionValue("--source") ||
    process.env.FOLKS_GLAZE_SOURCE_DIR ||
    defaultSource,
);
const message = optionValue("--message") || "Sync Folks source from Glaze";

if (!existsSync(resolve(source, ".git"))) {
  fail(`Glaze source was not found at ${source}`);
}

const sourcePackage = JSON.parse(
  readFileSync(resolve(source, "package.json"), "utf8"),
);
if (sourcePackage.id !== "xx65rjh7" || sourcePackage.productName !== "Folks") {
  fail(`the source directory is not the Folks Glaze project: ${source}`);
}

const status = run(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=normal"],
  { quiet: true },
).stdout.trim();

if (status && !dryRun) {
  fail("the GitHub worktree is dirty; commit or stash it before syncing");
}

if (status && dryRun) {
  console.warn(
    "Dry run note: the GitHub worktree is dirty. A real sync would stop.",
  );
}

const excludes = [
  ".git",
  ".glaze_memory",
  ".claude",
  ".mcp.json",
  "node_modules",
  "tmp",
  ".DS_Store",
  "app-icon.icns",
  "app-icon.png",
  "*.log",
  ".env",
  ".env.*",
  "*.key",
  "*.pem",
  "*.p12",
];

const rsyncArgs = [
  "-a",
  "--checksum",
  "--delete",
  ...(dryRun ? ["--dry-run"] : []),
  ...excludes.flatMap((pattern) => ["--exclude", pattern]),
  `${source}/`,
  `${destination}/`,
];

console.log(`Glaze:  ${source}`);
console.log(`GitHub: ${destination}\n`);
run("rsync", rsyncArgs);

if (dryRun) {
  console.log("\nDry run complete. Nothing was changed.");
  process.exit(0);
}

run("git", ["add", "-A", "--", "app"]);
run("git", ["diff", "--cached", "--check", "--", "app"]);

const diff = run("git", ["diff", "--cached", "--quiet", "--", "app"], {
  quiet: true,
  allowFailure: true,
});

if (diff.status === 0) {
  console.log("GitHub mirror is already current. No commit was created.");
  process.exit(0);
}

if (diff.status !== 1) {
  fail("could not inspect the staged sync");
}

run("git", ["commit", "-m", message, "--", "app"]);

if (noPush) {
  console.log("Sync committed locally. Push skipped by --no-push.");
  process.exit(0);
}

run("git", ["push"]);
console.log("Glaze source synced, committed, and pushed.");
