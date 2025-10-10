/**
 * HTTP Server Setup
 * Creates and configures Express application with MCP endpoints
 */

import express, { Express, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { HttpConfig } from '../config/http-config.js';
import { SSEManager } from '../transport/sse-manager.js';
import { HttpTransport } from '../transport/http-transport.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import {
  createCorsMiddleware,
  createExplicitCorsMiddleware,
  createHelmetMiddleware,
  createRateLimitMiddleware,
  logCorsConfiguration
} from '../middleware/security.js';
import { errorHandler, notFoundHandler } from '../middleware/error-handler.js';
import { loggingMiddleware } from '../middleware/logging.js';

export interface HttpServerDependencies {
  sseManager: SSEManager;
  transport: HttpTransport;
}

/**
 * Create and configure Express HTTP server
 */
export function createHttpServer(
  config: HttpConfig,
  deps: HttpServerDependencies
): Express {
  const app = express();
  const { sseManager, transport } = deps;

  // ============================================
  // Global Middleware
  // ============================================

  // Log CORS configuration on startup
  logCorsConfiguration(config);

  // CORS - must be first to handle preflight
  app.use(createCorsMiddleware(config));

  // Explicit CORS headers middleware (defense-in-depth)
  app.use(createExplicitCorsMiddleware(config));

  // Explicit OPTIONS handler for all routes
  app.options('*', (_req, res) => {
    // CORS middleware already set headers, just return success
    res.sendStatus(204);
  });

  // Security headers
  app.use(createHelmetMiddleware());

  // Parse JSON bodies
  app.use(express.json());

  // Rate limiting
  app.use(createRateLimitMiddleware(config));

  // Comprehensive request/response logging
  app.use(loggingMiddleware);

  // ============================================
  // Public Endpoints (no auth)
  // ============================================

  /**
   * Health check endpoint
   */
  app.get(`${config.basePath}/health`, (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      server: 'formio-mcp-server',
      transport: 'http+sse',
      connections: sseManager.getConnectionCount()
    });
  });

  /**
   * Server info endpoint
   */
  app.get(`${config.basePath}/info`, (_req: Request, res: Response) => {
    res.json({
      name: 'formio-mcp-server',
      version: '1.0.0',
      transport: 'http+sse',
      endpoints: {
        health: `${config.basePath}/health`,
        sse: `${config.basePath}/sse`,
        messages: `${config.basePath}/messages`
      },
      authentication: config.requireAuth ? 'required' : 'disabled'
    });
  });

  // ============================================
  // Protected Endpoints (auth required)
  // ============================================

  /**
   * SSE endpoint - establishes long-lived connection for receiving responses
   */
  app.get(
    `${config.basePath}/sse`,
    createAuthMiddleware(config),
    (req: Request, res: Response) => {
      // Generate unique connection ID
      const connectionId = randomUUID();

      // Extract client info from headers
      const userAgent = req.headers['user-agent'] || 'unknown';
      const clientInfo = `${req.ip} - ${userAgent}`;

      // Get origin for CORS
      const origin = req.headers.origin as string | undefined;

      // Add SSE connection with origin for proper CORS handling
      sseManager.addConnection(connectionId, res, clientInfo, origin);

      console.log(`[HTTP] SSE connection established: ${connectionId}`);
    }
  );

  /**
   * Direct JSON-RPC endpoint - simple request/response (no SSE required)
   * This is for MCP clients that don't use SSE streaming
   */
  const directEndpoint = config.basePath;
  console.log(`[HTTP] Registering direct JSON-RPC endpoint: POST ${directEndpoint}`);

  app.post(
    directEndpoint,
    createAuthMiddleware(config),
    async (req: Request, res: Response) => {
      console.log(`[HTTP] Direct endpoint hit: ${req.method} ${req.path}`);
      console.log(`[HTTP] Request body:`, JSON.stringify(req.body).slice(0, 200));

      try {
        const message = req.body;

        // Validate JSON-RPC message
        if (!message || !message.jsonrpc || message.jsonrpc !== '2.0') {
          return res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Invalid JSON-RPC 2.0 request'
            }
          });
        }

        // Check if this is a notification (no id field)
        if (!('id' in message)) {
          console.log(`[HTTP] Received notification: ${message.method}`);
          // Notifications don't get responses, just acknowledge receipt
          return res.status(202).json({
            accepted: true,
            notification: message.method
          });
        }

        // Process request and return response directly
        const response = await transport.handleRequestSync(message);
        
        console.log(`[HTTP] Direct endpoint response:`, JSON.stringify(response).slice(0, 200));
        
        return res.json(response);

      } catch (err) {
        console.error('[HTTP] Error processing message:', err);
        
        return res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          }
        });
      }
    }
  );

  /**
   * Messages endpoint - receives JSON-RPC requests (with SSE)
   * This is for clients using SSE streaming
   */
  app.post(
    `${config.basePath}/messages`,
    createAuthMiddleware(config),
    async (req: Request, res: Response) => {
      try {
        const message = req.body;

        // Validate JSON-RPC message
        if (!message || !message.jsonrpc || message.jsonrpc !== '2.0') {
          return res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Invalid JSON-RPC 2.0 request'
            }
          });
        }

        // Get connection ID from header
        const connectionId = req.headers['x-connection-id'] as string;

        if (!connectionId) {
          return res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Missing X-Connection-ID header. Establish SSE connection first.'
            }
          });
        }

        // Verify connection exists
        if (!sseManager.hasConnection(connectionId)) {
          return res.status(404).json({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: `Connection ${connectionId} not found. SSE connection may have expired.`
            }
          });
        }

        // Handle the request asynchronously
        // Response will be sent via SSE
        transport.handleRequest(connectionId, message).catch(err => {
          console.error('[HTTP] Error handling request:', err);
        });

        // Acknowledge receipt
        // Actual response goes via SSE
        return res.status(202).json({
          accepted: true,
          connectionId,
          messageId: message.id
        });

      } catch (err) {
        console.error('[HTTP] Error processing message:', err);
        return res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          }
        });
      }
    }
  );

  // ============================================
  // Error Handlers (must be last)
  // ============================================

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}
