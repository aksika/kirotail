# kirotail

Minimal PTY proxy for using Kiro remotely over Tailscale (or any network). The server spawns Kiro in a pseudo-terminal and relays it over WebSocket. The client connects and gives you a live terminal session.

```
Local machine                   Remote machine (corporate network)
┌────────────┐   SSH reverse    ┌──────────────────┐
│ kt-client  │◄═══tunnel═══════│ kt-server        │
│ localhost   │   port 8765     │  └─ kiro-cli     │
│ :8765       │                 │    (authenticated)│
└────────────┘                  └──────────────────┘
```


## Setup

### Remote (server)

```bash
npm install
npm run build
```

### Local (client)

Same steps — clone, install, build.

### SSH config (optional)

Add to `~/.ssh/config` on the remote machine to bake in the reverse tunnel:

```
Host local-machine
  HostName <local-tailscale-ip>
  User <your-user>
  RemoteForward 8765 localhost:8765
```

Then just `ssh local-machine -N` to open the tunnel.

## Usage

### 1. Start the server (remote)

```bash
KT_TOKEN=<your-secret> node dist/server.js
```

### 2. Open the SSH reverse tunnel (remote → local)

```bash
ssh -R 8765:localhost:8765 <your-user>@<local-tailscale-ip> -N
```

Or if you set up the SSH config: `ssh local-machine -N`

### 3. Connect from local

```bash
KT_TOKEN=<your-secret> node dist/client.js --host localhost
```

You're in Kiro now..

## Options

### kt-server

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `8765` | WebSocket listen port |
| `--cmd` | `kiro-cli` | Command to spawn in PTY |
| `--working-dir` | cwd | Working directory for the spawned command |

Environment variables:
- `KT_TOKEN` — shared secret for auth (recommended)
- `KT_RATE_LIMIT_MS` — minimum ms between prompt submissions (default: `15000`, set to `0` to disable)

### kt-client

| Flag | Default | Description |
|------|---------|-------------|
| `--host` | `localhost` | Server host |
| `--port` | `8765` | Server port |
| `--token` | — | Auth token (alternative to `KT_TOKEN` env) |

## Rate Limiting

The server throttles prompt submissions (input containing newlines) to prevent API rate limit exhaustion. Default: one prompt every 15 seconds. Clients see `[kt-server] Rate limited. Wait Xs.` when throttled. Configure with `KT_RATE_LIMIT_MS`.

## Security

- The WebSocket itself is unencrypted, but the SSH tunnel provides end-to-end encryption.
- `KT_TOKEN` prevents unauthorized connections.
- Only one client session at a time.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Connection refused | Is the SSH tunnel running? Is kt-server running? |
| Tunnel drops | Add `-o ServerAliveInterval=60` to your SSH command |
| Glitchy terminal | Resize your terminal window to trigger a resize sync |
| "Session active" error | Only one client at a time — close the other first |

## License

MIT
