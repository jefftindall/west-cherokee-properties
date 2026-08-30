#!/usr/bin/env node
/**
 * Register wcp-terraform via the GitHub App manifest handshake (or import an
 * existing app) and store credentials in kv-wcp-shared. Never prints the PEM
 * or other secret values.
 */
import { createSign } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "infra/bootstrap/github-app-manifest.json");
const VAULT = "kv-wcp-shared";
const SUBSCRIPTION = "5f82b068-cbaa-40bf-9d56-e9932a64a41c";
const OWNER = "jefftindall";
const REPO = "west-cherokee-properties";
const DEFAULT_SLUG = "wcp-terraform";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function runAz(args) {
  const result = spawn("az", [...args, "--output", "none", "--only-show-errors"], {
    stdio: ["ignore", "ignore", "inherit"],
    shell: process.platform === "win32",
  });
  return new Promise((resolve, reject) => {
    result.on("error", reject);
    result.on("close", (code) => {
      if (code !== 0) reject(new Error(`az ${args[0]} failed (${code}).`));
      else resolve();
    });
  });
}

async function downloadVaultSecret(name) {
  const dir = mkdtempSync(join(tmpdir(), "wcp-gh-app-"));
  const file = join(dir, "value");
  try {
    await runAz([
      "keyvault",
      "secret",
      "download",
      "--vault-name",
      VAULT,
      "--name",
      name,
      "--file",
      file,
      "--encoding",
      "utf-8",
    ]);
    return readFileSync(file, "utf8").trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function setVaultSecret(name, value) {
  const dir = mkdtempSync(join(tmpdir(), "wcp-gh-app-"));
  const file = join(dir, "value");
  try {
    writeFileSync(file, value, { mode: 0o600 });
    await runAz(["keyvault", "secret", "set", "--vault-name", VAULT, "--name", name, "--file", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function base64url(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buf.toString("base64url");
}

function appJwt(appId, pem) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  return `${signingInput}.${base64url(signer.sign(pem))}`;
}

function openBrowser(url) {
  const platform = process.platform;
  if (platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
  else if (platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" });
  else spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
}

async function convertManifest(code) {
  const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": DEFAULT_SLUG,
    },
  });
  if (!res.ok) fail(`GitHub App manifest conversion failed (${res.status}).`);
  return res.json();
}

async function waitForInstallation(appId, pem) {
  const jwt = appJwt(appId, pem);
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/installation`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": DEFAULT_SLUG,
      },
    });
    if (res.status === 401) {
      fail("GitHub App JWT was rejected. Check the app id and private key.");
    }
    if (res.ok) {
      const body = await res.json();
      if (body.id) return String(body.id);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  fail("Timed out waiting for the app to be installed on the repo.");
}

async function setRepoVariable(name, value) {
  const result = spawn("gh", ["variable", "set", name, "--body", value], {
    stdio: ["ignore", "ignore", "inherit"],
    shell: process.platform === "win32",
  });
  await new Promise((resolve, reject) => {
    result.on("error", reject);
    result.on("close", (code) => {
      if (code !== 0) reject(new Error(`gh variable set ${name} failed.`));
      else resolve();
    });
  });
}

function assertPem(pem) {
  if (!pem || pem.trim() === "REPLACE_ME" || !pem.includes("BEGIN")) {
    fail("Private key file is missing or still REPLACE_ME.");
  }
}

async function storeAndPublish({ appId, installationId, pem, slug }) {
  assertPem(pem);
  console.log(`Writing GitHub App credentials to ${VAULT} (names only).`);
  await setVaultSecret("GITHUB-APP-ID", appId);
  await setVaultSecret("GITHUB-APP-PRIVATE-KEY", pem);

  let id = installationId;
  if (!id) {
    const installUrl = `https://github.com/apps/${slug}/installations/new`;
    console.log(`Install the app on ${OWNER}/${REPO}: ${installUrl}`);
    openBrowser(installUrl);
    id = await waitForInstallation(appId, pem);
  }

  await setVaultSecret("GITHUB-APP-INSTALLATION-ID", id);
  await setRepoVariable("GH_APP_ID", appId);
  await setRepoVariable("GH_APP_INSTALLATION_ID", id);
  console.log("Stored GITHUB-APP-ID, GITHUB-APP-INSTALLATION-ID, and GITHUB-APP-PRIVATE-KEY in kv-wcp-shared.");
  console.log("Set Actions variables GH_APP_ID and GH_APP_INSTALLATION_ID.");
}

const { values } = parseArgs({
  options: {
    "app-id": { type: "string" },
    "installation-id": { type: "string" },
    "pem-file": { type: "string" },
    "from-keyvault": { type: "boolean", default: false },
  },
});

if (values["pem-file"] && !values["app-id"]) {
  fail("Usage: node scripts/register-wcp-github-app.mjs --app-id <id> --pem-file <path> [--installation-id <id>]");
}
if (values["app-id"] && !values["pem-file"]) {
  fail("Usage: node scripts/register-wcp-github-app.mjs --app-id <id> --pem-file <path> [--installation-id <id>]");
}

await runAz(["account", "set", "--subscription", SUBSCRIPTION]);

if (values["from-keyvault"]) {
  console.log(`Importing ${DEFAULT_SLUG} from ${VAULT} (names only).`);
  const appId = await downloadVaultSecret("GITHUB-APP-ID");
  const pem = await downloadVaultSecret("GITHUB-APP-PRIVATE-KEY");
  const storedInstall = await downloadVaultSecret("GITHUB-APP-INSTALLATION-ID");
  if (!/^[0-9]+$/.test(appId)) {
    fail("GITHUB-APP-ID in the vault is not numeric. Create the app once, or pass --app-id and --pem-file.");
  }
  const installationId = /^[0-9]+$/.test(storedInstall) ? storedInstall : undefined;
  await storeAndPublish({ appId, pem, installationId, slug: DEFAULT_SLUG });
  process.exit(0);
}

if (values["pem-file"]) {
  const pem = readFileSync(values["pem-file"], "utf8");
  await storeAndPublish({
    appId: values["app-id"],
    installationId: values["installation-id"],
    pem,
    slug: DEFAULT_SLUG,
  });
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const redirectUrl = `http://127.0.0.1:${port}/callback`;
manifest.redirect_url = redirectUrl;

const formPage = `<!doctype html>
<meta charset="utf-8">
<title>Create wcp-terraform</title>
<p>Creating the GitHub App from the committed manifest. Install it on ${OWNER}/${REPO} if GitHub asks.</p>
<form id="create-app" action="https://github.com/settings/apps/new" method="post">
  <input type="hidden" name="manifest" value='${JSON.stringify(manifest).replaceAll("'", "&#39;")}'>
  <button type="submit">Create wcp-terraform GitHub App</button>
</form>
<script>document.getElementById("create-app").submit()</script>`;

const conversion = await new Promise((resolve, reject) => {
  server.on("request", async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(formPage);
      return;
    }
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<p>App created. Install it on west-cherokee-properties if GitHub asks, then return to the terminal.</p>");
      if (!code) {
        reject(new Error("GitHub callback had no code."));
        return;
      }
      try {
        resolve(await convertManifest(code));
      } catch (err) {
        reject(err);
      }
    }
  });

  const localUrl = `http://127.0.0.1:${port}/`;
  console.log(`Open ${localUrl} if the browser does not appear.`);
  openBrowser(localUrl);
});

const appId = String(conversion.id || "");
const pem = conversion.pem;
const slug = conversion.slug || DEFAULT_SLUG;
if (!appId || !pem) fail("GitHub App conversion did not return an id and private key.");
console.log(`Created GitHub App ${slug} (${appId}).`);

await storeAndPublish({ appId, pem, slug });
server.close();
process.exit(0);
