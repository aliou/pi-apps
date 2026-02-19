import type { WSContext } from "hono/ws";
import { createLogger } from "../lib/logger";
import type {
  EnvironmentSandboxConfig,
  SandboxManager,
  SandboxProviderType,
} from "../sandbox/manager";
import type { SandboxChannel } from "../sandbox/types";
import type { EnvironmentService } from "../services/environment.service";
import type { EventJournal } from "../services/event-journal";
import type { SecretsService } from "../services/secrets.service";
import type { SessionService } from "../services/session.service";
import type { EventHookRegistry } from "./hooks/registry";
import type {
  ClientCapabilities,
  ClientCommand,
  PiEvent,
  ServerEvent,
} from "./types";

const logger = createLogger("session-hub");

/** How long to wait before detaching the sandbox channel after last client disconnects. */
export const DETACH_GRACE_MS = 15_000;

/** Commands that can elect a new controller when sent by an extension-ui-capable client. */
const CONTROLLER_COMMANDS = new Set<string>(["prompt", "steer", "follow_up"]);

export interface HubClient {
  id: string;
  ws: WSContext;
  capabilities: ClientCapabilities;
  connectedAt: Date;
}

export interface SessionHubDeps {
  sandboxManager: SandboxManager;
  sessionService: SessionService;
  eventJournal: EventJournal;
  environmentService: EnvironmentService;
  secretsService: SecretsService;
  eventHooks: EventHookRegistry;
}

/**
 * Per-session hub that owns a single sandbox channel attachment and fans out
 * events to multiple connected WebSocket clients.
 */
export class SessionHub {
  private clients = new Map<string, HubClient>();
  private channel: SandboxChannel | null = null;
  private attachPromise: Promise<void> | null = null;
  private detachTimer: NodeJS.Timeout | null = null;
  private controllerClientId: string | null = null;
  private activatorClientId: string | null = null;
  private lastWriterClientId: string | null = null;
  private unsubMessage: (() => void) | null = null;
  private unsubClose: (() => void) | null = null;
  private closed = false;

  constructor(
    private sessionId: string,
    private deps: SessionHubDeps,
  ) {}

  /**
   * Add a client to this hub. Attaches to sandbox if needed and replays missed events.
   */
  async addClient(client: HubClient, lastSeq: number): Promise<void> {
    if (this.closed) {
      throw new Error("Hub is closed");
    }

    // Cancel detach timer if running (client reconnected within grace period)
    if (this.detachTimer) {
      clearTimeout(this.detachTimer);
      this.detachTimer = null;
      logger.debug({ sessionId: this.sessionId }, "cancelled detach timer");
    }

    // Store client
    this.clients.set(client.id, client);
    logger.info(
      {
        sessionId: this.sessionId,
        clientId: client.id,
        clientCount: this.clients.size,
      },
      "client added to hub",
    );

    // Ensure sandbox channel is attached
    await this.ensureAttached();

    // Send connected event
    const maxSeq = this.deps.eventJournal.getMaxSeq(this.sessionId);
    this.sendToClient(client.id, {
      type: "connected",
      sessionId: this.sessionId,
      lastSeq: maxSeq,
    });

    // Replay missed events if requested
    if (lastSeq > 0 && lastSeq < maxSeq) {
      await this.replayForClient(client.id, lastSeq, maxSeq);
    }
  }

  /**
   * Remove a client from this hub. Starts detach timer if this was the last client.
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.clients.delete(clientId);
    logger.info(
      { sessionId: this.sessionId, clientId, clientCount: this.clients.size },
      "client removed from hub",
    );

    // Clear controller if this client was the controller
    if (this.controllerClientId === clientId) {
      this.controllerClientId = null;
      this.electController();
    }

    // Start detach timer if no clients remain
    if (this.clients.size === 0) {
      this.startDetachTimer();
    }
  }

  /**
   * Get the number of connected clients.
   */
  getConnectionCount(): number {
    return this.clients.size;
  }

  /**
   * Handle a command from a client. Routes extension_ui_response to controller validation.
   */
  handleClientCommand(clientId: string, cmd: ClientCommand): void {
    const client = this.clients.get(clientId);
    if (!client) {
      logger.warn(
        { sessionId: this.sessionId, clientId },
        "command from unknown client",
      );
      return;
    }

    // Handle controller election for eligible commands
    if (CONTROLLER_COMMANDS.has(cmd.type) && client.capabilities.extensionUI) {
      this.lastWriterClientId = clientId;
      this.electController();
    }

    // Validate extension_ui_response comes from controller
    if (cmd.type === "extension_ui_response") {
      if (this.controllerClientId !== clientId) {
        logger.warn(
          {
            sessionId: this.sessionId,
            clientId,
            controllerId: this.controllerClientId,
          },
          "rejecting extension_ui_response from non-controller",
        );
        this.sendToClient(clientId, {
          type: "error",
          code: "NOT_CONTROLLER",
          message: "Only the controller client can send extension_ui_response",
        });
        return;
      }
    }

    // Forward command to sandbox
    if (this.channel) {
      // Journal prompt commands for history
      if (cmd.type === "prompt") {
        this.deps.eventJournal.append(this.sessionId, cmd.type, cmd);
      }

      // Run hooks
      this.deps.eventHooks.handle(this.sessionId, cmd.type, cmd);

      // Forward to sandbox
      this.channel.send(JSON.stringify(cmd));
    } else {
      logger.warn(
        { sessionId: this.sessionId, clientId, cmdType: cmd.type },
        "cannot forward command: no channel attached",
      );
      this.sendToClient(clientId, {
        type: "error",
        code: "CHANNEL_DETACHED",
        message: "Sandbox channel not attached",
      });
    }
  }

  /**
   * Update client capabilities.
   */
  setClientCapabilities(clientId: string, caps: ClientCapabilities): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.capabilities = caps;
      logger.debug(
        { sessionId: this.sessionId, clientId, caps },
        "updated client capabilities",
      );
      this.electController();
    }
  }

  /**
   * Set the activator client (first client to call activate).
   */
  setActivatorClient(clientId: string): void {
    this.activatorClientId = clientId;
    logger.debug(
      { sessionId: this.sessionId, clientId: clientId },
      "set activator client",
    );
    this.electController();
  }

  /**
   * Clear all client state (capabilities, controller, activator).
   * Called when session is suspended.
   */
  clearClientState(): void {
    this.controllerClientId = null;
    this.activatorClientId = null;
    this.lastWriterClientId = null;
    logger.debug({ sessionId: this.sessionId }, "cleared client state");
  }

  /**
   * Send sandbox status to all connected clients.
   */
  sendSandboxStatus(
    event: Extract<ServerEvent, { type: "sandbox_status" }>,
  ): void {
    this.broadcast(event);
  }

  /**
   * Close the hub and detach from sandbox.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    if (this.detachTimer) {
      clearTimeout(this.detachTimer);
      this.detachTimer = null;
    }

    this.unsubMessage?.();
    this.unsubClose?.();
    this.unsubMessage = null;
    this.unsubClose = null;

    this.channel?.close();
    this.channel = null;

    this.clients.clear();

    logger.info({ sessionId: this.sessionId }, "hub closed");
  }

  /**
   * Ensure the sandbox channel is attached. Deduplicates concurrent attach attempts.
   */
  private async ensureAttached(): Promise<void> {
    if (this.channel) return;
    if (this.attachPromise) return this.attachPromise;

    this.attachPromise = this.doAttach();
    try {
      await this.attachPromise;
    } finally {
      this.attachPromise = null;
    }
  }

  private async doAttach(): Promise<void> {
    const session = this.deps.sessionService.get(this.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    if (!session.sandboxProvider || !session.sandboxProviderId) {
      throw new Error("Sandbox not provisioned");
    }

    const providerType = session.sandboxProvider as SandboxProviderType;
    const providerId = session.sandboxProviderId;

    // Resolve environment config
    let envConfig: EnvironmentSandboxConfig | undefined;
    if (session.environmentId) {
      const env = this.deps.environmentService.get(session.environmentId);
      if (env) {
        const { resolveEnvConfig } = await import("../sandbox/manager");
        envConfig = await resolveEnvConfig(env, this.deps.secretsService);
      }
    }

    try {
      const { channel } = await this.deps.sandboxManager.attachSession(
        providerType,
        providerId,
        envConfig,
      );

      this.channel = channel;
      this.setupChannelListener();

      logger.info({ sessionId: this.sessionId }, "hub attached to sandbox");
    } catch (err) {
      logger.error({ err, sessionId: this.sessionId }, "hub attach failed");
      throw err;
    }
  }

  /**
   * Start the detach timer. When it fires, the sandbox channel will be detached.
   */
  private startDetachTimer(): void {
    if (this.detachTimer) return;

    logger.debug(
      { sessionId: this.sessionId, graceMs: DETACH_GRACE_MS },
      "starting detach timer",
    );

    this.detachTimer = setTimeout(() => {
      this.detachTimer = null;
      this.detach();
    }, DETACH_GRACE_MS);
  }

  /**
   * Detach from the sandbox channel (but keep the hub alive for reconnects).
   */
  private detach(): void {
    if (this.clients.size > 0) {
      logger.debug(
        { sessionId: this.sessionId },
        "detach cancelled: clients reconnected",
      );
      return;
    }

    logger.info({ sessionId: this.sessionId }, "detaching hub from sandbox");

    this.unsubMessage?.();
    this.unsubClose?.();
    this.unsubMessage = null;
    this.unsubClose = null;

    this.channel?.close();
    this.channel = null;
  }

  /**
   * Set up listeners on the sandbox channel.
   */
  private setupChannelListener(): void {
    if (!this.channel) return;

    this.unsubMessage = this.channel.onMessage((message) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      // Ignore non-JSON lines (npm/git output, etc.)
      if (!trimmed.startsWith("{")) {
        logger.debug(
          { sessionId: this.sessionId, line: trimmed.slice(0, 200) },
          "ignoring non-json sandbox line",
        );
        return;
      }

      try {
        const event = JSON.parse(trimmed) as PiEvent;
        this.handleSandboxEvent(event);
      } catch (err) {
        logger.warn(
          { sessionId: this.sessionId, err, raw: trimmed.slice(0, 500) },
          "failed to parse sandbox JSON line",
        );
      }
    });

    this.unsubClose = this.channel.onClose((reason) => {
      logger.info(
        { sessionId: this.sessionId, reason },
        "sandbox channel closed",
      );
      this.channel = null;
      this.broadcast({
        type: "sandbox_status",
        status: "stopped",
        message: reason || "Sandbox channel closed",
      });
    });
  }

  /**
   * Handle an event from the sandbox.
   */
  private handleSandboxEvent(event: PiEvent): void {
    // Journal the event
    this.deps.eventJournal.append(this.sessionId, event.type, event);

    // Run hooks
    this.deps.eventHooks.handle(this.sessionId, event.type, event);

    // Route extension_ui_request to controller only
    if (event.type === "extension_ui_request") {
      if (this.controllerClientId) {
        this.sendToClient(this.controllerClientId, event);
      } else {
        logger.warn(
          { sessionId: this.sessionId },
          "no controller for extension_ui_request",
        );
        // Optionally could queue or broadcast to all capable clients
      }
      return;
    }

    // Broadcast all other events to all clients
    this.broadcast(event);
  }

  /**
   * Elect a controller client based on priority rules:
   * 1. Last writer (prompt/steer/follow_up) with extensionUI capability
   * 2. Activator client
   * 3. Most recent connected client with extensionUI capability
   * 4. None (null)
   */
  private electController(): void {
    const oldController = this.controllerClientId;

    // Priority 1: Last writer with extensionUI capability
    if (this.lastWriterClientId) {
      const client = this.clients.get(this.lastWriterClientId);
      if (client?.capabilities.extensionUI) {
        this.controllerClientId = this.lastWriterClientId;
        if (oldController !== this.controllerClientId) {
          logger.debug(
            {
              sessionId: this.sessionId,
              controllerId: this.controllerClientId,
              reason: "last-writer",
            },
            "controller elected",
          );
        }
        return;
      }
    }

    // Priority 2: Activator client
    if (this.activatorClientId) {
      const client = this.clients.get(this.activatorClientId);
      if (client?.capabilities.extensionUI) {
        this.controllerClientId = this.activatorClientId;
        if (oldController !== this.controllerClientId) {
          logger.debug(
            {
              sessionId: this.sessionId,
              controllerId: this.controllerClientId,
              reason: "activator",
            },
            "controller elected",
          );
        }
        return;
      }
    }

    // Priority 3: Most recent connected client with extensionUI capability
    let mostRecentCapable: HubClient | null = null;
    for (const client of this.clients.values()) {
      if (client.capabilities.extensionUI) {
        if (
          !mostRecentCapable ||
          client.connectedAt > mostRecentCapable.connectedAt
        ) {
          mostRecentCapable = client;
        }
      }
    }

    if (mostRecentCapable) {
      this.controllerClientId = mostRecentCapable.id;
      if (oldController !== this.controllerClientId) {
        logger.debug(
          {
            sessionId: this.sessionId,
            controllerId: this.controllerClientId,
            reason: "most-recent",
          },
          "controller elected",
        );
      }
      return;
    }

    // No eligible controller
    this.controllerClientId = null;
    if (oldController !== null) {
      logger.debug(
        { sessionId: this.sessionId },
        "controller cleared (no eligible client)",
      );
    }
  }

  /**
   * Send an event to a specific client.
   */
  private sendToClient(clientId: string, event: ServerEvent): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const raw = client.ws.raw as WebSocket | undefined;
      if (raw && raw.readyState === 1) {
        client.ws.send(JSON.stringify(event));
      }
    } catch (err) {
      logger.error({ err, sessionId: this.sessionId, clientId }, "send error");
    }
  }

  /**
   * Broadcast an event to all connected clients.
   */
  private broadcast(event: ServerEvent): void {
    for (const clientId of this.clients.keys()) {
      this.sendToClient(clientId, event);
    }
  }

  /**
   * Replay missed events from journal for a specific client.
   */
  private async replayForClient(
    clientId: string,
    fromSeq: number,
    toSeq: number,
  ): Promise<void> {
    const events = this.deps.eventJournal.getAfterSeq(this.sessionId, fromSeq);
    if (events.length === 0) return;

    this.sendToClient(clientId, { type: "replay_start", fromSeq, toSeq });

    for (const event of events) {
      try {
        const payload = JSON.parse(event.payload) as PiEvent;
        this.sendToClient(clientId, payload);
      } catch (err) {
        logger.error(
          { err, sessionId: this.sessionId, seq: event.seq },
          "skipping malformed replay event",
        );
      }
    }

    this.sendToClient(clientId, { type: "replay_end" });
  }
}

/**
 * Global manager for session hubs. One hub per session.
 */
export class SessionHubManager {
  private hubs = new Map<string, SessionHub>();

  constructor(private deps: SessionHubDeps) {}

  /**
   * Get or create a hub for a session.
   */
  getOrCreate(sessionId: string): SessionHub {
    let hub = this.hubs.get(sessionId);
    if (!hub) {
      hub = new SessionHub(sessionId, this.deps);
      this.hubs.set(sessionId, hub);
      logger.debug({ sessionId }, "created session hub");
    }
    return hub;
  }

  /**
   * Get an existing hub for a session, or undefined if not exists.
   */
  get(sessionId: string): SessionHub | undefined {
    return this.hubs.get(sessionId);
  }

  /**
   * Remove a hub if it has no connected clients.
   */
  removeIfEmpty(sessionId: string): void {
    const hub = this.hubs.get(sessionId);
    if (hub && hub.getConnectionCount() === 0) {
      hub.close();
      this.hubs.delete(sessionId);
      logger.debug({ sessionId }, "removed empty session hub");
    }
  }

  /**
   * Set client capabilities for a session via REST (before WS connect).
   */
  setClientCapabilities(
    sessionId: string,
    clientId: string,
    caps: ClientCapabilities,
  ): void {
    const hub = this.hubs.get(sessionId);
    if (hub) {
      hub.setClientCapabilities(clientId, caps);
    }
  }

  /**
   * Set the activator client for a session via REST.
   */
  setActivatorClient(sessionId: string, clientId: string): void {
    const hub = this.hubs.get(sessionId);
    if (hub) {
      hub.setActivatorClient(clientId);
    }
  }

  /**
   * Clear all client state for a session (called on idle suspend).
   */
  clearSessionClientState(sessionId: string): void {
    const hub = this.hubs.get(sessionId);
    if (hub) {
      hub.clearClientState();
    }
  }

  /**
   * Broadcast an event to all clients of a session.
   */
  broadcast(sessionId: string, event: ServerEvent): void {
    const hub = this.hubs.get(sessionId);
    if (hub) {
      // Access broadcast via a public method or use the hub's internal broadcast
      // Since we need to broadcast from outside (e.g., idle reaper), we need
      // to expose this functionality
      (
        hub as unknown as { sendSandboxStatus: (event: ServerEvent) => void }
      ).sendSandboxStatus(
        event as Extract<ServerEvent, { type: "sandbox_status" }>,
      );
    }
  }

  /**
   * Get the number of connected clients for a session.
   */
  getConnectionCount(sessionId: string): number {
    const hub = this.hubs.get(sessionId);
    return hub?.getConnectionCount() ?? 0;
  }

  /**
   * Close all hubs. Used during shutdown.
   */
  closeAll(): void {
    for (const [sessionId, hub] of this.hubs) {
      hub.close();
      logger.debug({ sessionId }, "closed hub during shutdown");
    }
    this.hubs.clear();
  }
}
