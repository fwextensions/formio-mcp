# STDIO and HTTP Transport Integration

## Problem

When running the MCP server in HTTP mode (with `--http` flag), the server supports two types of clients simultaneously:

1. **HTTP clients** - Connect via HTTP/SSE for JSON-RPC communication
2. **STDIO clients** - Connect via standard input/output (e.g., Claude Desktop, Kiro)

The issue was that when a **stdio client** made changes to a form (create/update/delete), the **preview pages** (which connect via HTTP/SSE) were not receiving real-time update notifications.

## Root Cause

The stdio request handler was passing `undefined` for the `formUpdateNotifier` parameter:

```typescript
// Old code - stdio handler
return await executeToolCall(formioClient, name, args, undefined);
```

This meant that when stdio clients called tools like `update_form`, the notification system was never triggered, even though the HTTP server had a fully functional `FormUpdateNotifier` instance.

## Solution

We created a **shared** `FormUpdateNotifier` instance that both the HTTP and stdio handlers can access:

```typescript
// Shared FormUpdateNotifier instance (will be set in HTTP mode)
let sharedFormUpdateNotifier: FormUpdateNotifier | undefined = undefined;

// In stdio handler - use shared notifier if available
return await executeToolCall(formioClient, name, args, sharedFormUpdateNotifier);

// In HTTP mode initialization - set the shared notifier
const formUpdateNotifier = new FormUpdateNotifier(...);
sharedFormUpdateNotifier = formUpdateNotifier;
```

## How It Works

1. **Server starts in HTTP mode** (`--http` flag)
   - Creates SSE manager
   - Creates FormUpdateNotifier instance
   - **Sets `sharedFormUpdateNotifier` to this instance**
   - Starts HTTP server

2. **Preview page opens** (HTTP client)
   - Connects to `/preview-updates/:formId` endpoint
   - Registers with FormUpdateNotifier
   - Receives SSE connection

3. **Stdio client makes form change** (e.g., Kiro, Claude Desktop)
   - Sends JSON-RPC request via stdio
   - Stdio handler calls `executeToolCall` with **`sharedFormUpdateNotifier`**
   - Tool handler calls `formUpdateNotifier.notifyFormUpdated()`
   - Notification is sent via SSE to preview page
   - **Preview page refreshes automatically**

## Benefits

- **Unified notification system** - Both HTTP and stdio clients trigger the same notification mechanism
- **No code duplication** - Single FormUpdateNotifier instance handles all notifications
- **Backward compatible** - When running in stdio-only mode (no `--http` flag), `sharedFormUpdateNotifier` remains `undefined` and no notifications are sent (as expected)

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
┌─────────────────┐
│  STDIO Client   │
│ (Kiro, Claude)  │
└────────┬────────┘
         │ stdio
         ▼
┌─────────────────────────────────────┐
│     MCP Server (HTTP Mode)          │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Stdio Request Handler       │  │
│  │  (uses sharedFormUpdate...)  │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│             ▼                       │
│  ┌──────────────────────────────┐  │
│  │   FormUpdateNotifier         │◄─┼─── Shared Instance
│  │   (singleton)                │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│             ▼                       │
│  ┌──────────────────────────────┐  │
│  │      SSE Manager             │  │
│  └──────────┬───────────────────┘  │
└─────────────┼───────────────────────┘
              │ SSE
              ▼
     ┌────────────────┐
     │ Preview Page   │
     │   (Browser)    │
     └────────────────┘
```

## Related Files

- `src/index.ts` - Main server initialization, creates shared notifier
- `src/tools/tool-handlers.ts` - Tool execution, calls notifier methods
- `src/services/form-update-notifier.ts` - Notification service
- `src/routes/preview-updates.ts` - SSE endpoint for preview pages
