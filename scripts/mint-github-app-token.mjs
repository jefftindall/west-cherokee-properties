#!/usr/bin/env node
/**
 * Mint a GitHub App installation token. Never prints the PEM or token.
 */
import { createSign } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

function fail(message) {
  console.error(message);
  process.exit(1);
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

function mask(value) {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  for (const line of String(value).split(/\r?\n/)) {
    if (line) process.stdout.write(`::add-mask::${line}\n`);
  }
}

function writeGithubOutput(name, value) {
  const dest = process.env.GITHUB_OUTPUT;
  if (!dest) fail("GITHUB_OUTPUT is not set.");
  appendFileSync(dest, `${name}=${value}\n`);
}

const { values } = parseArgs({
  options: {
    "app-id": { type: "string" },
    "installation-id": { type: "string" },
    "pem-file": { type: "string" },
    "github-output": { type: "boolean", default: false },
  },
});

if (!values["app-id"] || !values["installation-id"] || !values["pem-file"]) {
  fail("Usage: node scripts/mint-github-app-token.mjs --app-id <id> --installation-id <id> --pem-file <path> [--github-output]");
}

const pem = readFileSync(values["pem-file"], "utf8").trim();
if (!pem || pem === "REPLACE_ME") {
  fail("GitHub App private key is missing. Run node scripts/register-wcp-github-app.mjs");
}

const jwt = appJwt(values["app-id"], pem);
const res = await fetch(`https://api.github.com/app/installations/${values["installation-id"]}/access_tokens`, {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${jwt}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "wcp-terraform",
  },
});

if (!res.ok) {
  fail(`GitHub App token request failed (${res.status}). Check app id, installation id, and vault key.`);
}

const body = await res.json();
const token = body.token;
if (!token) fail("GitHub App token response had no token.");

mask(token);
if (values["github-output"]) writeGithubOutput("token", token);
