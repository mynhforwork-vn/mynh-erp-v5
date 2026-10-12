// Build a reviewable Telegram-disabled Worker from the exact deployed source.
// This utility only READS Cloudflare. It never uploads, deploys, deletes or alters bindings.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const WORKER = "erp-auto-tracking";
const BASE_VERSION = "6f26895d-5af0-43dc-978a-b761d7c39dd8";
const BASE_SHA256 = "323203d44a8259f04c8f9c719d55db21fcc4e9135b087bf4ad35e751e4fe5660";
const OUTPUT_DIR = "qa-worker-artifacts";

if (!ACCOUNT_ID || !API_TOKEN) {
  throw new Error("Thiếu quyền chỉ đọc Cloudflare; không thể tạo bản ứng viên đã đối chiếu.");
}

const hash = text => createHash("sha256").update(text, "utf8").digest("hex");
const path = "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT_ID +
  "/workers/scripts/" + WORKER;
const authHeader = { Authorization: "Bearer " + API_TOKEN };

async function readDeployedVersion() {
  const response = await fetch(path + "/deployments", { headers: authHeader });
  if (!response.ok) throw new Error("Cloudflare deployment verification failed: " + response.status);
  const json = await response.json();
  const deployments = Array.isArray(json.result?.deployments)
    ? json.result.deployments : (Array.isArray(json.result) ? json.result : []);
  return deployments[0]?.versions?.[0]?.version_id ?? null;
}

async function downloadSource() {
  const response = await fetch(path, { headers: authHeader });
  if (!response.ok) throw new Error("Cloudflare Worker source read failed: " + response.status);
  const body = await response.text();
  if (!body.startsWith("--")) return body;
  const boundary = body.slice(0, body.indexOf("\r\n"));
  const begin = body.indexOf("\r\n\r\n") + 4;
  const end = body.lastIndexOf("\r\n" + boundary);
  if (begin < 4 || end <= begin || !body.slice(0, begin).includes('name="worker.js"')) {
    throw new Error("Unexpected Worker download format, refuse patch");
  }
  return body.slice(begin, end);
}

function replaceRange(source, before, after, newText, name) {
  const start = source.indexOf(before);
  const end = source.indexOf(after, start + before.length);
  if (start < 0 || end <= start) throw new Error("Source pattern mismatch: " + name);
  return [source.slice(0, start) + newText + source.slice(end), source.slice(start, end)];
}

function functionBodyUntil(source, startMarker, nextMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(nextMarker, start + startMarker.length);
  if (start < 0 || end <= start) throw new Error("Tracking function boundary mismatch");
  return source.slice(start, end);
}

function buildCandidate(source) {
  assert.equal(hash(source), BASE_SHA256, "Worker production source changed: stop");
  assert.ok(source.includes("GHN_PROXY") && source.includes("runTrackingCycle("));

  const trackingCore = functionBodyUntil(
    source, "async function runTrackingCycle(", "async function callExistingTrackingProxy("
  );
  const trackingProxy = functionBodyUntil(
    source, "async function callExistingTrackingProxy(", "\nfunction "
  );
  const trackingCoreHash = hash(trackingCore);
  const trackingProxyHash = hash(trackingProxy);

  let candidate = source;
  const routes = replaceRange(candidate,
    '    if (url.pathname === "/telegram/webhook") {',
    '    if (url.pathname === "/run-once") {',
    '    // All legacy Telegram routes are retired; ERP and tracking remain active.\n' +
    '    if (url.pathname.startsWith("/telegram/")) {\n' +
    '      return json({success:false,error:"Kênh thông báo Telegram đã ngừng sử dụng"},410);\n' +
    '    }\n\n',
    "Telegram routes"
  );
  candidate = routes[0];
  for (const name of [
    "/telegram/webhook", "/telegram/setup-webhook", "/telegram/webhook-info",
    "/telegram/connect-owner", "/telegram/send-once"
  ]) assert.ok(routes[1].includes(name), "Unaccounted Telegram route: " + name);

  const automation = replaceRange(candidate,
    "async function runAutomationCycle(",
    "async function runTelegramNotificationCycle(",
    "async function runAutomationCycle(env, triggerType) {\n" +
    "  return runTrackingCycle(env, triggerType);\n" +
    "}\n\n",
    "Tracking scheduler separation"
  );
  candidate = automation[0];
  assert.ok(automation[1].includes("runTrackingCycle("));
  assert.ok(automation[1].includes("runTelegramNotificationCycle("));

  const network = replaceRange(candidate,
    "async function telegramApi(",
    "/* ============================================================\n * SUPABASE",
    '// Disabled fallback: no outbound Telegram network calls.\n' +
    'async function telegramApi() {\n' +
    '  throw new Error("Kênh thông báo Telegram đã ngừng sử dụng");\n' +
    '}\n\n',
    "Telegram network sink"
  );
  candidate = network[0];
  assert.ok(network[1].includes("https://api.telegram.org"));

  const previousHealth = '        telegram_bot_configured:\n' +
    '          Boolean(env.TELEGRAM_BOT_TOKEN),\n' +
    '        telegram_send_limit:\n          TELEGRAM_SEND_LIMIT,\n' +
    '        notification_mode:\n          "TELEGRAM_AUTO + ZALO_MANUAL",\n' +
    '        telegram_erp_menu: true,\n' +
    '        telegram_update_mode: "WEBHOOK",';
  assert.ok(candidate.includes(previousHealth), "Worker health contract changed");
  candidate = candidate.replace(previousHealth,
    '        telegram_bot_configured: false,\n' +
    '        telegram_send_limit: 0,\n' +
    '        notification_mode: "IN_APP_ONLY",\n' +
    '        telegram_erp_menu: false,\n' +
    '        telegram_update_mode: "DISABLED",');

  assert.ok(!candidate.includes("https://api.telegram.org"), "Live Telegram network call remains");
  assert.ok(candidate.includes('url.pathname === "/run-once"'), "Tracking manual entry removed");
  assert.ok(candidate.includes('async scheduled(event, env, ctx) {'), "Scheduled entry removed");
  assert.ok(candidate.includes("GHN_PROXY"), "GHN proxy service code removed");
  assert.equal(hash(functionBodyUntil(candidate,
    "async function runTrackingCycle(", "async function callExistingTrackingProxy(")), trackingCoreHash,
    "SPX/GHN tracking core changed");
  assert.equal(hash(functionBodyUntil(candidate,
    "async function callExistingTrackingProxy(", "\nfunction ")), trackingProxyHash,
    "GHN/SPX proxy logic changed");

  const embeddedSecrets = candidate.match(
    /(?:sk-|sb_secret_|ghp_|xoxb-|AIza|eyJ)[A-Za-z0-9_.=\-]{30,}/g
  ) || [];
  assert.equal(embeddedSecrets.length, 0, "Suspected credential in source: refuse artifact");

  return {
    candidate,
    manifest: {
      worker: WORKER,
      baseline_version: BASE_VERSION,
      baseline_source_sha256: BASE_SHA256,
      candidate_sha256: hash(candidate),
      original_bytes: Buffer.byteLength(source),
      candidate_bytes: Buffer.byteLength(candidate),
      removed_telegram_route_bytes: Buffer.byteLength(routes[1]),
      tracking_core_sha256_unchanged: trackingCoreHash,
      proxy_logic_sha256_unchanged: trackingProxyHash,
      no_telegram_network_sink: true,
      routes_retired: [
        "/telegram/webhook", "/telegram/setup-webhook", "/telegram/webhook-info",
        "/telegram/connect-owner", "/telegram/send-once"
      ],
      deploy_performed: false
    }
  };
}

const before = await readDeployedVersion();
assert.equal(before, BASE_VERSION, "Production Worker version changed; stop");
const source = await downloadSource();
const {candidate, manifest} = buildCandidate(source);
const after = await readDeployedVersion();
assert.equal(after, BASE_VERSION, "Worker was redeployed during candidate build; stop");

await fs.mkdir(OUTPUT_DIR, {recursive:true});
await fs.writeFile(OUTPUT_DIR + "/erp-auto-tracking-telegram-off.mjs", candidate);
await fs.writeFile(OUTPUT_DIR + "/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log("WORKER_TELEGRAM_OFF_CANDIDATE " + JSON.stringify(manifest));