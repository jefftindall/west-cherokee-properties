#!/usr/bin/env node
// Builds the standalone rent jobs Function App package from api/.
// Only src/jobs registers functions; src/functions (SWA HTTP handlers) is excluded.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

const root = process.cwd();
const api = join(root, "api");
const out = join(root, process.argv[2] || ".build/rent-jobs");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const file of ["host.json", "package-lock.json"]) {
  cpSync(join(api, file), join(out, file));
}

const excluded = [`${sep}src${sep}functions`];
cpSync(join(api, "src"), join(out, "src"), {
  recursive: true,
  filter: (path) =>
    !path.endsWith(".test.js") && !excluded.some((dir) => path.slice(api.length).startsWith(dir)),
});

const pkg = JSON.parse(readFileSync(join(api, "package.json"), "utf8"));
pkg.name = "west-cherokee-properties-rent-jobs";
pkg.main = "src/jobs/*.js";
writeFileSync(join(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

const npm = spawnSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
  cwd: out,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (npm.status !== 0) process.exit(npm.status ?? 1);

console.log(`Rent jobs package ready: ${out}`);
