/**
 * HTTP Transport Adapter
 * Bridges MCP Server with HTTP/SSE transport
 */

import {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse
} from '@modelcontextprotocol/sdk/types.js';
import { SSEManager } from './sse-manager.js';

export class HttpTransport {
  private sseManager: SSEManager;
  private messageHandlers: Map<string, (request: JSONRPCRequest) => Promise<JSONRPCResponse>>;

  constructor(_server: any, sseManager: SSEManager) {
    this.sseManager = sseManager;
    this.messageHandlers = new Map();
  }

  /**
   * Register a message handler for a specific method
   * This allows us to route requests without using Transport.connect()
   */
  registerHandler(
    method: string,
    handler: (request: JSONRPCRequest) => Promise<JSONRPCResponse>
  ): void {
    this.messageHandlers.set(method, handler);
  }

  /**
   * Handle incoming JSON-RPC request synchronously (no SSE required)
   * Returns the response directly for simple request/response pattern
   */
  async handleRequestSync(message: JSONRPCMessage): Promise<JSONRPCResponse> {
    console.log(`[HTTP Transport] Handling sync request:`, {
      method: (message as any).method,
      id: (message as any).id
    });

    try {
      // Validate it's a request (has method property)
      if (!('method' in message)) {
        throw new Error('Invalid JSON-RPC message: missing method');
      }

      const request = message as JSONRPCRequest;

      // Check if we have a handler for this method
      const handler = this.messageHandlers.get(request.method);

      if (!handler) {
        // Method not found
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`
          }
        } as any;
      }

      // Execute handler and return response
      const response = await handler(request);
      return response;

    } catch (err) {
      console.error('[HTTP Transport] Error handling sync request:', err);

      // Return error response
      return {
        jsonrpc: '2.0',
        id: (message as any).id || null,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : 'Internal error'
        }
      } as any;
    }
  }

  /**
   * Handle incoming JSON-RPC request (via SSE)
   */
  async handleRequest(connectionId: string, message: JSONRPCMessage): Promise<void> {
    console.log(`[HTTP Transport] Handling request from ${connectionId}:`, {
      method: (message as any).method,
      id: (message as any).id
    });

    // Verify connection exists
    if (!this.sseManager.hasConnection(connectionId)) {
      console.error(`[HTTP Transport] Connection ${connectionId} not found`);
      return;
    }

    // Use sync handler and send response via SSE
    const response = await this.handleRequestSync(message);
    this.sendResponse(connectionId, response);
  }

  /**
   * Send response via SSE
   */
  sendResponse(connectionId: string, response: JSONRPCResponse): void {
    const success = this.sseManager.sendMessage(connectionId, response);

    if (!success) {
      console.error(`[HTTP Transport] Failed to send response to ${connectionId}`);
    } else {
      console.log(`[HTTP Transport] Response sent to ${connectionId}:`, {
        id: response.id,
        hasError: 'error' in response
      });
    }
  }

  /**
   * Send notification via SSE (no response expected)
   */
  sendNotification(connectionId: string, method: string, params?: Record<string, unknown>): void {
    const notification: JSONRPCMessage = {
      jsonrpc: '2.0',
      method,
      params: params as any
    };

    this.sseManager.sendMessage(connectionId, notification);
  }

  /**
   * Broadcast notification to all connections
   */
  broadcastNotification(method: string, params?: Record<string, unknown>): number {
    const notification: JSONRPCMessage = {
      jsonrpc: '2.0',
      method,
      params: params as any
    };

    return this.sseManager.broadcast('message', notification);
  }
}
