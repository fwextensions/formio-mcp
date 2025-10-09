# Detailed Plan: HTTP Streaming Transport Implementation

## Phase 1: Project Setup and Dependencies

### Step 1.1: Add Dependencies to package.json

**Add the following dependencies:**

```json
{
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.2.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17"
  }
}
```

**Rationale:**
- `express`: HTTP server framework
- `cors`: Handle cross-origin requests
- `helmet`: Security headers
- `express-rate-limit`: Prevent API abuse

### Step 1.2: Create New Directory Structure

```
src/
├── config/
│   └── http-config.ts         # HTTP server configuration
├── middleware/
│   ├── auth.ts                # API key authentication
│   ├── error-handler.ts       # Global error handling
│   └── security.ts            # CORS, Helmet, rate limiting
├── transport/
│   ├── sse-manager.ts         # SSE connection management
│   └── http-transport.ts      # HTTP transport implementation
├── server/
│   └── http-server.ts         # Express app setup
├── index.ts                   # Entry point (updated)
└── [existing files...]
```

---

## Phase 2: Configuration Layer

### Step 2.1: Create HTTP Configuration Module

**File: `src/config/http-config.ts`**

```typescript
export interface HttpConfig {
  // Server settings
  port: number;
  host: string;
  basePath: string;

  // Authentication
  apiKeys: string[];
  requireAuth: boolean;

  // CORS
  corsOrigins: string[];

  // Rate limiting
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;

  // SSE
  sseHeartbeatInterval: number;
  sseTimeout: number;
}

export function loadHttpConfig(): HttpConfig {
  return {
    port: parseInt(process.env.MCP_HTTP_PORT || '3000', 10),
    host: process.env.MCP_HTTP_HOST || 'localhost',
    basePath: process.env.MCP_BASE_PATH || '/mcp/v1',

    apiKeys: (process.env.MCP_API_KEYS || '').split(',').filter(k => k.length > 0),
    requireAuth: process.env.MCP_REQUIRE_AUTH !== 'false',

    corsOrigins: (process.env.MCP_CORS_ORIGINS || 'http://localhost:*').split(','),

    rateLimitWindowMs: parseInt(process.env.MCP_RATE_LIMIT_WINDOW_MS || '60000', 10),
    rateLimitMaxRequests: parseInt(process.env.MCP_RATE_LIMIT_MAX || '100', 10),

    sseHeartbeatInterval: parseInt(process.env.MCP_SSE_HEARTBEAT_MS || '30000', 10),
    sseTimeout: parseInt(process.env.MCP_SSE_TIMEOUT_MS || '300000', 10),
  };
}
```

**Purpose:** Centralize all HTTP-related configuration with environment variable parsing and defaults.

---

## Phase 3: Middleware Layer

### Step 3.1: Authentication Middleware

**File: `src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import { HttpConfig } from '../config/http-config.js';

export function createAuthMiddleware(config: HttpConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip auth if not required (localhost development)
    if (!config.requireAuth) {
      return next();
    }

    // Check for Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Missing Authorization header'
        }
      });
    }

    // Extract Bearer token
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Authorization header format. Expected: Bearer <token>'
        }
      });
    }

    const token = match[1];

    // Validate against configured API keys
    if (!config.apiKeys.includes(token)) {
      return res.status(403).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid API key'
        }
      });
    }

    // Auth successful
    next();
  };
}
```

**Purpose:** Validate API keys from Authorization header, reject unauthorized requests.

### Step 3.2: Security Middleware

**File: `src/middleware/security.ts`**

```typescript
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { HttpConfig } from '../config/http-config.js';

export function createCorsMiddleware(config: HttpConfig) {
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      // Check against configured origins (supports wildcards)
      const allowed = config.corsOrigins.some(pattern => {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(origin);
      });

      if (allowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });
}

export function createHelmetMiddleware() {
  return helmet({
    contentSecurityPolicy: false, // Allow SSE
    crossOriginEmbedderPolicy: false
  });
}

export function createRateLimitMiddleware(config: HttpConfig) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    message: {
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Too many requests, please try again later'
      }
    },
    standardHeaders: true,
    legacyHeaders: false
  });
}
```

**Purpose:** Configure CORS, security headers, and rate limiting.

### Step 3.3: Error Handler Middleware

**File: `src/middleware/error-handler.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Express error:', err);

  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    jsonrpc: '2.0',
    error: {
      code: -32603,
      message: 'Internal server error',
      data: process.env.NODE_ENV === 'development' ? err.message : undefined
    }
  });
}
```

**Purpose:** Catch and format any unhandled errors.

---

## Phase 4: SSE Connection Management

### Step 4.1: SSE Manager

**File: `src/transport/sse-manager.ts`**

```typescript
import { Response } from 'express';

interface SSEConnection {
  id: string;
  res: Response;
  connectedAt: Date;
  lastHeartbeat: Date;
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
  addConnection(connectionId: string, res: Response): void {
    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });

    // Store connection
    this.connections.set(connectionId, {
      id: connectionId,
      res,
      connectedAt: new Date(),
      lastHeartbeat: new Date()
    });

    // Send initial connection event
    this.sendEvent(connectionId, 'connected', { connectionId });

    // Start heartbeat if not already running
    if (!this.heartbeatInterval && this.connections.size > 0) {
      this.startHeartbeat();
    }

    // Handle client disconnect
    res.on('close', () => {
      this.removeConnection(connectionId);
    });
  }

  /**
   * Remove a connection
   */
  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);

    // Stop heartbeat if no connections
    if (this.connections.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send a message to a specific connection
   */
  sendMessage(connectionId: string, message: object): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      return false;
    }

    return this.sendEvent(connectionId, 'message', message);
  }

  /**
   * Send an SSE event
   */
  private sendEvent(connectionId: string, event: string, data: object): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      return false;
    }

    try {
      const formattedData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      conn.res.write(formattedData);
      return true;
    } catch (err) {
      console.error(`Failed to send SSE event to ${connectionId}:`, err);
      this.removeConnection(connectionId);
      return false;
    }
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();

      for (const [id, conn] of this.connections.entries()) {
        try {
          conn.res.write(':heartbeat\n\n');
          conn.lastHeartbeat = now;
        } catch (err) {
          console.error(`Heartbeat failed for connection ${id}, removing`);
          this.removeConnection(id);
        }
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
   * Cleanup all connections
   */
  cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    for (const [id, conn] of this.connections.entries()) {
      try {
        conn.res.end();
      } catch (err) {
        // Ignore errors during cleanup
      }
    }

    this.connections.clear();
  }
}
```

**Purpose:** Manage SSE connections, send messages, handle heartbeats and disconnections.

---

## Phase 5: HTTP Transport Adapter

### Step 5.1: HTTP Transport Implementation

**File: `src/transport/http-transport.ts`**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { SSEManager } from './sse-manager.js';

export class HttpTransport {
  private sseManager: SSEManager;
  private server: Server;

  constructor(server: Server, sseManager: SSEManager) {
    this.server = server;
    this.sseManager = sseManager;
  }

  /**
   * Handle incoming JSON-RPC request
   */
  async handleRequest(connectionId: string, message: JSONRPCMessage): Promise<void> {
    try {
      // The MCP SDK server will process this and emit responses
      // We need to capture those responses and send via SSE

      // For now, we'll manually handle the request/response cycle
      // This is a simplified version - actual implementation needs proper message routing

      console.log(`Received message from ${connectionId}:`, message);

      // Process message through MCP server
      // (This will require modifying how we initialize the server to work with HTTP)

    } catch (err) {
      console.error('Error handling request:', err);

      // Send error response via SSE
      this.sseManager.sendMessage(connectionId, {
        jsonrpc: '2.0',
        id: (message as any).id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : 'Internal error'
        }
      });
    }
  }

  /**
   * Send response via SSE
   */
  sendResponse(connectionId: string, response: JSONRPCMessage): void {
    this.sseManager.sendMessage(connectionId, response);
  }
}
```

**Note:** The MCP SDK's `Server` class is designed for bidirectional transports like STDIO. We'll need to create a custom adapter or use the SDK's lower-level message handling capabilities. This is the most complex part of the implementation.

---

## Phase 6: Express Server Setup

### Step 6.1: Create Express Application

**File: `src/server/http-server.ts`**

```typescript
import express, { Express, Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { HttpConfig } from '../config/http-config.js';
import { SSEManager } from '../transport/sse-manager.js';
import { HttpTransport } from '../transport/http-transport.js';
import {
  createAuthMiddleware,
  createCorsMiddleware,
  createHelmetMiddleware,
  createRateLimitMiddleware
} from '../middleware/security.js';
import { errorHandler } from '../middleware/error-handler.js';
import { randomUUID } from 'crypto';

export function createHttpServer(
  mcpServer: Server,
  config: HttpConfig
): Express {
  const app = express();
  const sseManager = new SSEManager(config.sseHeartbeatInterval);
  const transport = new HttpTransport(mcpServer, sseManager);

  // Apply middleware
  app.use(createHelmetMiddleware());
  app.use(createCorsMiddleware(config));
  app.use(express.json());
  app.use(createRateLimitMiddleware(config));

  // Health check endpoint (no auth required)
  app.get(`${config.basePath}/health`, (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      connections: sseManager.getConnectionCount()
    });
  });

  // SSE endpoint for receiving responses
  app.get(
    `${config.basePath}/sse`,
    createAuthMiddleware(config),
    (req: Request, res: Response) => {
      const connectionId = randomUUID();
      console.log(`New SSE connection: ${connectionId}`);
      sseManager.addConnection(connectionId, res);

      // Store connectionId for this request
      (req as any).connectionId = connectionId;
    }
  );

  // JSON-RPC message endpoint
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
              message: 'Invalid JSON-RPC request'
            }
          });
        }

        // Get connection ID from header (client should send this)
        const connectionId = req.headers['x-connection-id'] as string;

        if (!connectionId) {
          return res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Missing X-Connection-ID header'
            }
          });
        }

        // Handle the request
        await transport.handleRequest(connectionId, message);

        // Acknowledge receipt (actual response goes via SSE)
        res.status(202).json({ accepted: true });

      } catch (err) {
        console.error('Error processing message:', err);
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          }
        });
      }
    }
  );

  // Error handler (must be last)
  app.use(errorHandler);

  // Cleanup on process exit
  process.on('SIGTERM', () => {
    sseManager.cleanup();
  });

  return app;
}
```

**Purpose:** Wire up all middleware, endpoints, and routing.

---

## Phase 7: Main Entry Point Updates

### Step 7.1: Update index.ts for Transport Selection

**File: `src/index.ts` (major refactor)**

```typescript
#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createHttpServer } from './server/http-server.js';
import { loadHttpConfig } from './config/http-config.js';
import { FormioClient } from './utils/formio-client.js';
// ... other imports

// Parse command line arguments
const args = process.argv.slice(2);
const transportType = args.includes('--http') ? 'http' : 'stdio';

// Environment configuration (unchanged)
const FORMIO_PROJECT_URL = process.env.FORMIO_PROJECT_URL;
// ... rest of Form.io config

// Initialize Form.io client (unchanged)
const formioClient = new FormioClient({
  baseUrl: FORMIO_PROJECT_URL,
  projectUrl: FORMIO_PROJECT_URL,
  apiKey: FORMIO_API_KEY,
  token: FORMIO_TOKEN
});

// Initialize MCP server (unchanged)
const server = new Server(
  {
    name: 'formio-mcp-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {
        listChanged: true
      }
    }
  }
);

// Register handlers (unchanged)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // ... existing tool handling code
});

// Start server with selected transport
async function main() {
  if (transportType === 'http') {
    const config = loadHttpConfig();
    const app = createHttpServer(server, config);

    app.listen(config.port, config.host, () => {
      console.error(`Form.io MCP Server (HTTP) listening on http://${config.host}:${config.port}`);
      console.error(`SSE endpoint: http://${config.host}:${config.port}${config.basePath}/sse`);
      console.error(`Messages endpoint: http://${config.host}:${config.port}${config.basePath}/messages`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Form.io MCP Server (STDIO) running on stdio');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

**Purpose:** Support both transports with command-line flag selection.

---

## Phase 8: Configuration and Documentation

### Step 8.1: Update .env.example

```bash
# Form.io Configuration (unchanged)
FORMIO_PROJECT_URL=https://your-project.form.io
FORMIO_API_KEY=your-api-key-here

# MCP HTTP Server Configuration
MCP_HTTP_PORT=3000
MCP_HTTP_HOST=localhost
MCP_BASE_PATH=/mcp/v1

# Authentication
# Generate with: openssl rand -hex 32
MCP_API_KEYS=your-secret-key-here,another-key-here
MCP_REQUIRE_AUTH=true

# CORS Configuration
# Comma-separated origins, supports wildcards
MCP_CORS_ORIGINS=http://localhost:*,https://yourdomain.com

# Rate Limiting
MCP_RATE_LIMIT_WINDOW_MS=60000
MCP_RATE_LIMIT_MAX=100

# SSE Configuration
MCP_SSE_HEARTBEAT_MS=30000
MCP_SSE_TIMEOUT_MS=300000
```

### Step 8.2: Update package.json Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "start:http": "node dist/index.js --http",
    "start:stdio": "node dist/index.js"
  }
}
```

### Step 8.3: Create API Key Generator Script

**File: `scripts/generate-api-key.sh`**

```bash
#!/bin/bash
echo "Generated API Key:"
openssl rand -hex 32
```

---

## Phase 9: Testing Strategy

### Step 9.1: Manual Testing Checklist

1. **Start HTTP server:**
   ```bash
   npm run start:http
   ```

2. **Test health endpoint:**
   ```bash
   curl http://localhost:3000/mcp/v1/health
   ```

3. **Test authentication:**
   ```bash
   # Should fail (no auth)
   curl http://localhost:3000/mcp/v1/sse

   # Should succeed
   curl -H "Authorization: Bearer your-key" http://localhost:3000/mcp/v1/sse
   ```

4. **Test SSE connection:**
   ```bash
   curl -H "Authorization: Bearer your-key" \
        -N http://localhost:3000/mcp/v1/sse
   # Should see heartbeat messages
   ```

5. **Test with MCP Inspector (if it supports HTTP)**

### Step 9.2: Integration Testing

Create test client script to verify end-to-end flow:

**File: `test/http-client-test.ts`**

```typescript
// Test script that:
// 1. Opens SSE connection
// 2. Sends JSON-RPC request
// 3. Receives response via SSE
// 4. Validates response format
```

---

## Phase 10: README Updates

### Step 10.1: Add HTTP Transport Section

Add to README.md:

```markdown
## Using HTTP Transport

### Setup

1. Generate an API key:
   ```bash
   openssl rand -hex 32
   ```

2. Configure environment variables:
   ```bash
   export MCP_API_KEYS=your-generated-key
   export MCP_HTTP_PORT=3000
   export FORMIO_PROJECT_URL=https://your-project.form.io
   export FORMIO_API_KEY=your-formio-key
   ```

3. Start the server:
   ```bash
   npm run start:http
   ```

### Client Configuration

For MCP clients that support HTTP transport:

```json
{
  "mcpServers": {
    "formio": {
      "url": "http://localhost:3000/mcp/v1",
      "transport": "http+sse",
      "headers": {
        "Authorization": "Bearer your-generated-key"
      }
    }
  }
}
```

### API Endpoints

- `GET /mcp/v1/health` - Health check (no auth required)
- `GET /mcp/v1/sse` - SSE endpoint for receiving responses
- `POST /mcp/v1/messages` - Send JSON-RPC requests
```

---

## Implementation Order

1. ✅ **Step 1**: Add dependencies
2. ✅ **Step 2**: Create config module
3. ✅ **Step 3**: Implement middleware
4. ✅ **Step 4**: Build SSE manager
5. ⚠️ **Step 5**: HTTP transport adapter (COMPLEX - needs MCP SDK integration)
6. ✅ **Step 6**: Express server setup
7. ✅ **Step 7**: Update main entry point
8. ✅ **Step 8**: Documentation and config
9. ✅ **Step 9**: Testing
10. ✅ **Step 10**: README updates

---

## Complexity Warning: Step 5 (HTTP Transport Adapter)

The MCP SDK's `Server` class is designed for bidirectional streaming transports. Making it work with HTTP+SSE requires:

**Option A: Use SDK's message handling API directly**
- Don't use `server.connect()`
- Manually route messages through `server` methods
- More control but more complex

**Option B: Create custom transport implementation**
- Implement transport interface expected by SDK
- Bridge between HTTP/SSE and SDK's expectations
- Cleaner but requires deep SDK understanding

**Option C: Wait for official HTTP transport**
- MCP SDK may add official HTTP support
- Most reliable but dependent on external timeline

**Recommendation for initial implementation:** Start with a simplified version that works for basic request/response, then refine the bidirectional aspects.

---

## Estimated Timeline

- **Phase 1-4**: 4-6 hours (setup, config, middleware, SSE)
- **Phase 5**: 4-8 hours (transport adapter - most complex)
- **Phase 6-7**: 2-3 hours (express setup, entry point)
- **Phase 8-10**: 2-3 hours (docs, testing)

**Total: 12-20 hours** depending on MCP SDK integration complexity.

---

Ready to start implementation? I recommend beginning with Phase 1 (dependencies) and Phase 2 (config), which are straightforward and establish the foundation.
