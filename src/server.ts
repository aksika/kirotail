#!/usr/bin/env node
import { program } from "commander";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import { IncomingMessage } from "http";

program
  .option("-p, --port <number>", "listen port", "8765")
  .option("-c, --cmd <string>", "command to spawn", "kiro-cli")
  .option("-d, --working-dir <string>", "working directory")
  .parse();

const opts = program.opts();
const port = parseInt(opts.port);
const token = process.env.KT_TOKEN;
const RATE_LIMIT_MS = parseInt(process.env.KT_RATE_LIMIT_MS || "15000");
let lastInputTime = 0;

let activePty: pty.IPty | null = null;
let activeWs: WebSocket | null = null;

const wss = new WebSocketServer({
  port,
  verifyClient: (info: { req: IncomingMessage }) => {
    if (!token) return true;
    return info.req.headers["x-kt-token"] === token;
  },
});

function cleanup() {
  activePty?.kill();
  activePty = null;
  activeWs = null;
}

wss.on("connection", (ws) => {
  if (activeWs) {
    ws.close(4002, "Session active");
    return;
  }
  activeWs = ws;

  ws.once("message", (data) => {
    let cols = 80, rows = 24;
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "resize") { cols = msg.cols; rows = msg.rows; }
    } catch {}

    const shell = pty.spawn(opts.cmd, [], {
      name: "xterm-256color",
      cols, rows,
      cwd: opts.workingDir || process.cwd(),
      env: process.env as Record<string, string>,
    });
    activePty = shell;

    shell.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(d, { binary: true });
    });

    shell.onExit(({ exitCode }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "exit", code: exitCode }));
        ws.close();
      }
      cleanup();
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "resize") { shell.resize(msg.cols, msg.rows); return; }
      } catch {}
      const str = data.toString();
      // Rate-limit: throttle input containing newlines (i.e. prompt submissions)
      if (str.includes("\r") || str.includes("\n")) {
        const now = Date.now();
        if (now - lastInputTime < RATE_LIMIT_MS) {
          const wait = Math.ceil((RATE_LIMIT_MS - (now - lastInputTime)) / 1000);
          ws.send(`\r\n[kt-server] Rate limited. Wait ${wait}s.\r\n`, { binary: true });
          return;
        }
        lastInputTime = now;
      }
      shell.write(str);
    });
  });

  ws.on("close", () => cleanup());
  ws.on("error", () => cleanup());
});

console.log(`kt-server listening on :${port}${token ? " (token auth)" : ""}`);
