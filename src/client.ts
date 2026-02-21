#!/usr/bin/env node
import { program } from "commander";
import WebSocket from "ws";

program
  .option("-h, --host <string>", "remote host", "localhost")
  .option("-p, --port <number>", "remote port", "8765")
  .option("-t, --token <string>", "auth token")
  .parse();

const opts = program.opts();
const token = opts.token || process.env.KT_TOKEN;
const wsOpts: WebSocket.ClientOptions = {};
if (token) wsOpts.headers = { "x-kt-token": token };

const ws = new WebSocket(`ws://${opts.host}:${opts.port}`, wsOpts);
let exiting = false;

function exit(code: number) {
  if (exiting) return;
  exiting = true;
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.exit(code);
}

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "resize", cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 }));
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (d) => { if (ws.readyState === WebSocket.OPEN) ws.send(d); });
  process.stdout.on("resize", () => {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "resize", cols: process.stdout.columns, rows: process.stdout.rows }));
  });
});

ws.on("message", (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === "exit") { exit(msg.code ?? 0); return; }
  } catch {}
  process.stdout.write(data as Buffer);
});

ws.on("close", (code) => {
  if (code === 4001) process.stderr.write("Rejected: invalid token\n");
  if (code === 4002) process.stderr.write("Rejected: another session active\n");
  exit(code === 1000 ? 0 : 1);
});

ws.on("error", (e) => { process.stderr.write(`Error: ${e.message}\n`); exit(1); });
process.on("SIGINT", () => {});
process.on("SIGTERM", () => { ws.close(); exit(0); });
