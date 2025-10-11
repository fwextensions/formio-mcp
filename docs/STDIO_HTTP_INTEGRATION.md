# STDIO and HTTP Transport Integration

## Problem

When running the MCP server in HTTP mode (with `--http` flag), the server supports two types of clients simultaneously:

1. **HTTP clients** - Connect via HTTP/SSE for JSON-RPC communication
2. **STDIO clients** - Connect via standard input/output (e.g., Claude Desktop, Kiro)

The issue was that when a **stdio client** made changes to a form (create/update/delete), the **preview pages** (which connect via HTTP/SSE) were not receiving real-time update notifications.

## Root Cause

Each stdio tool call **spawns a new process**. This means:

1. The HTTP server runs as a persistent process with `FormUpdateNotifier` instance
2. Each stdio tool call runs as a separate, short-lived process
3. These processes cannot share in-memory state

The stdio process has no way to access the HTTP server's `FormUpdateNotifier` instance because they are completely separate processes.

## Solution

We implemented **inter-process communication (IPC)** using HTTP requests:

1. **HTTP Server** exposes an internal notification endpoint: `POST /mcp/internal/notify-update`
2. **Stdio Process** makes an HTTP POST request to this endpoint after form changes
3. **HTTP Server** receives the notification and triggers `FormUpdateNotifier`
4. **Preview Pages** receive SSE notifications and refresh

```typescript
// In stdio handler - notify HTTP server via HTTP POST
async function notifyHttpServer(formId: string, changeType: 'created' | 'updated' | 'deleted') {
  const url = `http://localhost:44844/mcp/internal/notify-update`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formId, changeType, timestamp: new Date().toISOString() })
  });
}

// After tool execution
if (!sharedFormUpdateNotifier) {
  // Running as separate stdio process - notify HTTP server
  await notifyHttpServer(formId, changeType);
}
```

The solution gracefully handles both scenarios:
- **HTTP mode only**: Uses in-process `FormUpdateNotifier` directly
- **Stdio + HTTP mode**: Uses HTTP POST for cross-process communication
- **Stdio only mode**: Silently fails (no HTTP server to notify)

## How It Works

1. **HTTP Server starts** (`--http` flag)
   - Creates SSE manager
   - Creates FormUpdateNotifier instance
   - Exposes internal notification endpoint at `/mcp/internal/notify-update`
   - Starts listening on port 44844

2. **Preview page opens** (Browser)
   - Connects to `/preview-updates/:formId` endpoint
   - Registers with FormUpdateNotifier
   - Establishes SSE connection

3. **Stdio client makes form change** (e.g., Kiro, Claude Desktop)
   - **New process spawns** for the tool call
   - Executes tool (create/update/delete form)
   - Detects it's running as stdio process (`sharedFormUpdateNotifier` is undefined)
   - **Makes HTTP POST to `/mcp/internal/notify-update`** with formId and changeType
   - **Process exits**

4. **HTTP Server receives notification**
   - Internal endpoint receives POST request
   - Calls `formUpdateNotifier.notifyFormUpdated(formId)`
   - Sends SSE event to all preview pages watching that form

5. **Preview page receives update**
   - Receives `form-update` SSE event
   - Shows update indicator
   - **Refreshes automatically**

## Benefits

- **True cross-process communication** - Stdio processes can notify HTTP server regardless of process boundaries
- **Graceful degradation** - If HTTP server isn't running, stdio processes silently continue without errors
- **No shared state required** - Each process is independent
- **Simple and reliable** - Uses standard HTTP protocol for IPC
- **Backward compatible** - Works in all modes (HTTP-only, stdio-only, or both)

## Testing

To test the integration:

1. Start server in HTTP mode:
   ```bash
   npm start -- --http
   ```

2. Open a form preview in browser:
   ```
   http://localhost:44844/form/mcp-contact/[formId]
   ```

3. Use a stdio client (Kiro, Claude Desktop) to update the form:
   ```
   "Update the contact form to add a phone number field"
   ```

4. **Expected result**: Preview page should show update indicator and refresh automatically

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Process 1: HTTP Server                       │
│                    (persistent, --http flag)                    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Internal Notification Endpoint                          │  │
│  │  POST /mcp/internal/notify-update                        │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                           │
│                     ▼                                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         FormUpdateNotifier (singleton)                   │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                           │
│                     ▼                                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              SSE Manager                                 │  │
│  └──────────────────┬───────────────────────────────────────┘  │
└─────────────────────┼───────────────────────────────────────────┘
                      │ SSE
                      ▼
            ┌─────────────────┐
            │  Preview Page   │
            │   (Browser)     │
            └─────────────────┘
                      
                      ▲
                      │ HTTP POST
                      │ (IPC)
                      │
┌─────────────────────┼───────────────────────────────────────────┐
│                     │   Process 2: Stdio Tool Call              │
│                     │   (spawned per tool call)                 │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  STDIO Client (Kiro, Claude Desktop)                     │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │ stdio                                     │
│                     ▼                                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Stdio Request Handler                                   │  │
│  │  1. Execute tool (update form)                           │  │
│  │  2. Detect stdio mode (no sharedFormUpdateNotifier)      │  │
│  │  3. POST to /mcp/internal/notify-update                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration

The stdio process uses environment variables to determine where to send notifications:

```bash
# HTTP server configuration (used by both HTTP server and stdio processes)
MCP_HTTP_HOST=localhost      # Default: localhost
MCP_HTTP_PORT=44844          # Default: 44844
MCP_HTTP_BASE_PATH=/mcp      # Default: /mcp
```

The internal notification endpoint is constructed as:
```
http://{MCP_HTTP_HOST}:{MCP_HTTP_PORT}{MCP_HTTP_BASE_PATH}/internal/notify-update
```

## Error Handling

The stdio process handles HTTP server unavailability gracefully:

- If the HTTP server is not running, the `fetch()` call will fail
- The error is caught and silently ignored
- The tool execution completes successfully
- This allows stdio-only mode to work without errors

## Related Files

- `src/index.ts` - Stdio handler with HTTP notification client
- `src/server/http-server.ts` - Internal notification endpoint
- `src/tools/tool-handlers.ts` - Tool execution logic
- `src/services/form-update-notifier.ts` - Notification service
- `src/routes/preview-updates.ts` - SSE endpoint for preview pages
