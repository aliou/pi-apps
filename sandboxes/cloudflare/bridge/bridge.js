// pi sandbox bridge server
//
// Runs inside the container on a single port. Bridges WebSocket connections to
// pi's stdin/stdout and exposes HTTP endpoints for health, backup, restore, and
// exec. Plain JS -- no build step.

const http = require("http");
const { WebSocketServer } = require("ws");
const { spawn, execSync } = require("child_process");
const readline = require("readline");

const PORT = parseInt(process.env.BRIDGE_PORT || "4000", 10);
const WAIT_FOR_RESTORE = process.env.WAIT_FOR_RESTORE === "true";
const PI_COMMAND = process.env.PI_COMMAND || "pi";
const PI_EXTENSIONS = process.env.PI_EXTENSIONS || ""; // Comma-separated extension paths
const RESTORE_TIMEOUT_MS = 60_000;

let piProcess = null;
let piState = "waiting"; // "waiting" | "running" | "exited"
const wsClients = new Set();

// ---------------------------------------------------------------------------
// Pi process management
// ---------------------------------------------------------------------------

function startPi() {
  if (piProcess) return;

  // Build args: always --mode rpc, plus -e flags for any extensions
  const extensionArgs = PI_EXTENSIONS
    ? PI_EXTENSIONS.split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .flatMap((p) => ["-e", p])
    : [];

  const args =
    PI_COMMAND === "pi" ? ["--mode", "rpc", ...extensionArgs] : extensionArgs;

  console.log(`[bridge] Starting pi: ${PI_COMMAND} ${args.join(" ")}`);
  piProcess = spawn(PI_COMMAND, args, {
    cwd: "/workspace",
    env: { ...process.env, PI_CODING_AGENT_DIR: "/data/agent" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  piState = "running";

  // Line-split stdout and broadcast to all WS clients
  const rl = readline.createInterface({ input: piProcess.stdout });
  rl.on("line", (line) => {
    for (const ws of wsClients) {
      if (ws.readyState === 1) {
        // OPEN
        ws.send(line);
      }
    }
  });

  // Log stderr to container logs (not forwarded to clients)
  const errRl = readline.createInterface({ input: piProcess.stderr });
  errRl.on("line", (line) => {
    console.error(`[pi stderr] ${line}`);
  });

  piProcess.on("exit", (code, signal) => {
    console.log(`[bridge] Pi exited: code=${code} signal=${signal}`);
    piState = "exited";
    piProcess = null;

    // Close all WS connections
    for (const ws of wsClients) {
      ws.close(1001, "pi process exited");
    }
  });

  piProcess.on("error", (err) => {
    console.error("[bridge] Failed to start pi:", err.message);
    piState = "exited";
    piProcess = null;
  });
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

function handleHealth(_req, res) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      pi: piState,
      wsClients: wsClients.size,
    }),
  );
}

function handleBackup(_req, res) {
  const tar = spawn("tar", ["-czf", "-", "/workspace", "/data/agent"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  res.writeHead(200, { "Content-Type": "application/gzip" });
  tar.stdout.pipe(res);

  tar.stderr.on("data", (chunk) => {
    console.error(`[backup tar stderr] ${chunk}`);
  });

  tar.on("error", (err) => {
    console.error("[bridge] Backup tar error:", err.message);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ error: err.message }));
  });

  tar.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[bridge] Backup tar exited with code ${code}`);
    }
  });
}

function handleRestore(req, res) {
  const tar = spawn("tar", ["-xzf", "-", "-C", "/"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  req.pipe(tar.stdin);

  let stderr = "";
  tar.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  tar.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[bridge] Restore tar failed (code ${code}): ${stderr}`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `tar exited with code ${code}`, stderr }));
      return;
    }

    console.log("[bridge] Restore complete");

    // If we were waiting for restore and pi hasn't started, start it now
    if (WAIT_FOR_RESTORE && piState === "waiting") {
      startPi();
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "restored" }));
  });

  tar.on("error", (err) => {
    console.error("[bridge] Restore tar error:", err.message);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ error: err.message }));
  });
}

function handleStartPi(_req, res) {
  if (piProcess) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "already_running" }));
    return;
  }

  startPi();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "started" }));
}

function handleExec(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    let command;
    try {
      const parsed = JSON.parse(body);
      command = parsed.command;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    if (!command || typeof command !== "string") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing 'command' field" }));
      return;
    }

    try {
      const stdout = execSync(command, {
        encoding: "utf-8",
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        cwd: "/workspace",
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ exitCode: 0, stdout, stderr: "" }));
    } catch (err) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          exitCode: err.status ?? 1,
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? err.message,
        }),
      );
    }
  });
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
//
// NOTE: This HTTP server has no authentication. This is intentional because the
// bridge is only accessible via the CF Container's internal network
// (containerFetch/container.fetch), not exposed to the public internet.
//

const server = http.createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    return handleHealth(req, res);
  }
  if (req.url === "/backup" && req.method === "POST") {
    return handleBackup(req, res);
  }
  if (req.url === "/restore" && req.method === "POST") {
    return handleRestore(req, res);
  }
  if (req.url === "/start-pi" && req.method === "POST") {
    return handleStartPi(req, res);
  }
  if (req.url === "/exec" && req.method === "POST") {
    return handleExec(req, res);
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// ---------------------------------------------------------------------------
// WebSocket server (no path restriction -- accepts upgrades on any path)
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("[bridge] WS client connected");
  wsClients.add(ws);

  ws.on("message", (data) => {
    if (piProcess && piProcess.stdin && piProcess.stdin.writable) {
      piProcess.stdin.write(data.toString() + "\n");
    }
  });

  ws.on("close", () => {
    console.log("[bridge] WS client disconnected");
    wsClients.delete(ws);
  });

  ws.on("error", (err) => {
    console.error("[bridge] WS client error:", err.message);
    wsClients.delete(ws);
  });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

if (WAIT_FOR_RESTORE) {
  console.log(
    `[bridge] WAIT_FOR_RESTORE=true, waiting for /restore (timeout: ${RESTORE_TIMEOUT_MS}ms)`,
  );
  setTimeout(() => {
    if (piState === "waiting") {
      console.warn(
        "[bridge] Restore timeout reached, starting pi with empty state",
      );
      startPi();
    }
  }, RESTORE_TIMEOUT_MS);
} else {
  startPi();
}

server.listen(PORT, () => {
  console.log(`[bridge] Listening on :${PORT}`);
});
