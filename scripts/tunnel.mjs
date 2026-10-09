import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const binary = resolve(".local/cloudflared");
if (!existsSync(binary)) throw new Error("Install cloudflared into .local/cloudflared; see README.md.");
let envText = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const config = { ...dotenv.parse(envText), ...process.env };
const port = Number(config.PORT || 3001);
// Refuse to expose a different process already listening on this port.
await new Promise((accept, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close(accept));
});
function saveSetting(key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  envText = pattern.test(envText)
    ? envText.replace(pattern, line)
    : `${envText.trimEnd()}\n${line}\n`;
  writeFileSync(".env", envText, { mode: 0o600 });
  config[key] = value;
}
if (!config.ADMIN_PASSWORD || config.ADMIN_PASSWORD === "rassvet-demo") {
  saveSetting("ADMIN_PASSWORD", randomBytes(18).toString("base64url"));
  console.log("New admin password saved as ADMIN_PASSWORD in .env.");
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(deadline);
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
  setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 5000).unref();
}
function launch(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  children.push(child);
  child.once("error", (error) => { console.error(error.message); stop(1); });
  child.once("exit", (code) => {
    if (!stopping) { console.error(`${command} stopped (${code}).`); stop(code || 1); }
  });
  return child;
}
const deadline = setTimeout(() => {
  console.error("Cloudflare did not establish a tunnel within 90 seconds.");
  stop(1);
}, 90000);
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
if (process.platform === "darwin") launch("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)]);
const tunnel = launch(binary, [
  "tunnel", "--no-autoupdate", "--protocol", "http2", "--url", `http://127.0.0.1:${port}`,
], { stdio: ["ignore", "pipe", "pipe"] });
let output = "";
let started = false;
function onOutput(chunk) {
  process.stderr.write(chunk);
  output = (output + chunk.toString()).slice(-16000);
  const url = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
  if (started || stopping || !url || !output.includes("Registered tunnel connection")) return;
  started = true;
  clearTimeout(deadline);
  saveSetting("MINI_APP_URL", url);
  launch(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: { ...config, HOST: "127.0.0.1", PORT: String(port), NODE_ENV: "production", DEMO_MODE: "true" },
  });
  console.log(`\nDemo URL: ${url}\nAdmin: ${url}/admin\nUpdate Main Mini App and Menu Button in BotFather to this URL.\nKeep this terminal open. Ctrl+C stops the demo and releases the sleep lock.\n`);
}
tunnel.stdout.on("data", onOutput);
tunnel.stderr.on("data", onOutput);
