/**
 * SSE Connection Manager
 * Manages Server-Sent Events connections for streaming responses
 */

import { Response } from 'express';

interface SSEConnection {
  id: string;
  res: Response;
  connectedAt: Date;
  lastHeartbeat: Date;
  clientInfo?: string;
}

export class SSEManager {
  private connections: Map<string, SSEConnection> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatMs: number;

  constructor(heartbeatMs: number = 30000) {
    this.heartbeatMs = heartbeatMs;
  }

  /**
   * Register a new SSE connection
   */
  addConnection(connectionId: string, res: Response, clientInfo?: string, _origin?: string): void {
    console.log(`[SSE] New connection: ${connectionId}${clientInfo ? ` (${clientInfo})` : ''}`);

    // Build headers object with completely permissive CORS
    const headers: Record<string, string> = {
      // CORS headers - completely permissive
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': '*',
      // SSE headers
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'X-Connection-ID': connectionId
    };

    // Setup SSE headers
    res.writeHead(200, headers);

    // Flush headers immediately
    res.flushHeaders();

    // Store connection
    const connection: SSEConnection = {
      id: connectionId,
      res,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      clientInfo
    };

    this.connections.set(connectionId, connection);

    // Send initial connection event with ID immediately after headers
    // Using proper SSE format: event: connection\ndata: {"connectionId":"..."}\n\n
    this.sendEvent(connectionId, 'connection', {
      connectionId
    });

    // Start heartbeat if not already running
    if (!this.heartbeatInterval && this.connections.size > 0) {
      this.startHeartbeat();
    }

    // Handle client disconnect
    res.on('close', () => {
      console.log(`[SSE] Connection closed: ${connectionId}`);
      this.removeConnection(connectionId);
    });

    // Handle errors
    res.on('error', (err) => {
      console.error(`[SSE] Connection error for ${connectionId}:`, err.message);
      this.removeConnection(connectionId);
    });
  }

  /**
   * Remove a connection
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      try {
        // Try to close cleanly
        connection.res.end();
      } catch (err) {
        // Ignore errors during cleanup
      }

      this.connections.delete(connectionId);
      console.log(`[SSE] Connection removed: ${connectionId}. Active connections: ${this.connections.size}`);
    }

    // Stop heartbeat if no connections
    if (this.connections.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('[SSE] Stopped heartbeat - no active connections');
    }
  }

  /**
   * Check if a connection exists
   */
  hasConnection(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }

  /**
   * Send a JSON-RPC message to a specific connection
   */
  sendMessage(connectionId: string, message: object): boolean {
    return this.sendEvent(connectionId, 'message', message);
  }

  /**
   * Send an SSE event to a specific connection
   */
  private sendEvent(connectionId: string, event: string, data: object): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      console.warn(`[SSE] Cannot send event to ${connectionId}: connection not found`);
      return false;
    }

    try {
      const formattedData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      const written = conn.res.write(formattedData);

      if (!written) {
        console.warn(`[SSE] Write buffer full for ${connectionId}`);
      }

      return written;
    } catch (err) {
      console.error(`[SSE] Failed to send event to ${connectionId}:`, err);
      this.removeConnection(connectionId);
      return false;
    }
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    console.log(`[SSE] Starting heartbeat (interval: ${this.heartbeatMs}ms)`);

    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      let removed = 0;

      for (const [id, conn] of this.connections.entries()) {
        try {
          // Send heartbeat comment (SSE comments start with :)
          // Using standard SSE comment format: `: heartbeat\n\n`
          const written = conn.res.write(`: heartbeat\n\n`);

          if (written) {
            conn.lastHeartbeat = now;
          } else {
            console.warn(`[SSE] Heartbeat failed for ${id} (buffer full)`);
          }
        } catch (err) {
          console.error(`[SSE] Heartbeat error for ${id}, removing connection:`, err);
          this.removeConnection(id);
          removed++;
        }
      }

      if (removed > 0) {
        console.log(`[SSE] Heartbeat removed ${removed} failed connection(s)`);
      }
    }, this.heartbeatMs);
  }

  /**
   * Get active connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connection info
   */
  getConnectionInfo(connectionId: string): SSEConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all connection IDs
   */
  getAllConnectionIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Broadcast a message to all connections
   */
  broadcast(event: string, data: object): number {
    let sent = 0;

    for (const connectionId of this.connections.keys()) {
      if (this.sendEvent(connectionId, event, data)) {
        sent++;
      }
    }

    return sent;
  }

  /**
   * Cleanup all connections (call on server shutdown)
   */
  cleanup(): void {
    console.log(`[SSE] Cleaning up ${this.connections.size} connection(s)`);

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all connections
    for (const [_id, conn] of this.connections.entries()) {
      try {
        // Send closing event
        conn.res.write('event: closing\ndata: {"message":"Server shutting down"}\n\n');
        conn.res.end();
      } catch (err) {
        // Ignore errors during cleanup
      }
    }

    this.connections.clear();
    console.log('[SSE] Cleanup complete');
  }
}
