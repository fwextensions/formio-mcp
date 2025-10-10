# Real-Time Form Updates

## Overview

The Real-Time Form Updates feature enables automatic synchronization between form modifications made through the MCP server and open preview pages. When a form is created, updated, or deleted via MCP tools, all connected preview pages automatically refresh to display the latest changes without manual intervention.

## Architecture

### High-Level Flow

```
MCP Tool (create/update/delete)
    ↓
FormUpdateNotifier Service
    ↓
SSE Manager
    ↓
Preview Page (via SSE connection)
    ↓
Automatic Page Refresh
```

### Components

1. **FormUpdateNotifier** - Server-side service that tracks preview connections and routes notifications
2. **SSE Manager** - Manages Server-Sent Events connections and message delivery
3. **Preview Updates Endpoint** - SSE endpoint that preview pages connect to
4. **FormPreviewClient** - Client-side JavaScript that manages connection and handles updates

## How It Works

### Connection Establishment

1. User opens a form preview page in their browser
2. Page loads and initializes `FormPreviewClient` with the form ID
3. Client establishes SSE connection to `/preview-updates/{formId}`
4. Server registers the connection with `FormUpdateNotifier`
5. Connection status indicator shows "connected"

### Update Notification

1. User modifies form through MCP tool (e.g., `update_form`)
2. Tool handler calls `FormUpdateNotifier.notifyFormUpdated()`
3. Notifier identifies all connections watching that form
4. SSE Manager sends `form-update` event to each connection
5. Preview pages receive event and automatically refresh
6. Brief "Form updated" notification is shown before refresh

### Connection Management

- **Heartbeats**: Server sends heartbeat comments every 30 seconds to keep connection alive
- **Idle Timeout**: Connections idle for 5+ minutes are automatically closed
- **Reconnection**: Lost connections automatically reconnect with exponential backoff
- **Cleanup**: Connections are properly cleaned up when preview page closes

## Configuration

### Environment Variables

```bash
# Maximum number of concurrent preview connections
MCP_MAX_PREVIEW_CONNECTIONS=100

# Idle connection timeout in milliseconds (5 minutes)
MCP_PREVIEW_IDLE_TIMEOUT=300000

# Update notification debounce interval in milliseconds
MCP_UPDATE_DEBOUNCE_INTERVAL=500
```

### Debouncing

Multiple rapid updates to the same form are debounced to prevent excessive page refreshes. If multiple updates occur within the debounce interval (default 500ms), only one notification is sent.

## API Documentation

### Server-Side: FormUpdateNotifier

#### `registerPreviewConnection(connectionId: string, formId: string): void`

Registers a preview connection to receive updates for a specific form.

```typescript
notifier.registerPreviewConnection('conn-abc123', 'form-xyz789');
```

#### `unregisterPreviewConnection(connectionId: string): void`

Unregisters a preview connection and stops sending updates.

```typescript
notifier.unregisterPreviewConnection('conn-abc123');
```

#### `notifyFormCreated(formId: string, formData: FormioForm): void`

Notifies all preview connections that a form was created.

```typescript
notifier.notifyFormCreated('form-xyz789', formData);
```

#### `notifyFormUpdated(formId: string, formData: Partial<FormioForm>): void`

Notifies all preview connections that a form was updated. Implements debouncing.

```typescript
notifier.notifyFormUpdated('form-xyz789', { title: 'Updated Title' });
```

#### `notifyFormDeleted(formId: string): void`

Notifies all preview connections that a form was deleted.

```typescript
notifier.notifyFormDeleted('form-xyz789');
```

#### `getConnectionsByForm(formId: string): string[]`

Returns all connection IDs currently watching a specific form.

```typescript
const connections = notifier.getConnectionsByForm('form-xyz789');
console.log(`${connections.length} active preview(s)`);
```

#### `getFormByConnection(connectionId: string): string | undefined`

Returns the form ID being watched by a specific connection.

```typescript
const formId = notifier.getFormByConnection('conn-abc123');
```

#### `cleanup(): void`

Cleans up all connections and internal state. Called during server shutdown.

```typescript
notifier.cleanup();
```

### Client-Side: FormPreviewClient

#### Constructor

```javascript
new FormPreviewClient(formId, formPath, config)
```

**Parameters:**
- `formId` (string): The form ID to watch for updates
- `formPath` (string): The form path (used for display)
- `config` (object, optional):
  - `maxReconnectAttempts` (number): Maximum reconnection attempts (default: 5)
  - `initialReconnectDelay` (number): Initial reconnection delay in ms (default: 1000)
  - `updateIndicatorDuration` (number): How long to show update notification in ms (default: 2000)

**Example:**
```javascript
const client = new FormPreviewClient('form-123', 'contact-form', {
  maxReconnectAttempts: 5,
  initialReconnectDelay: 1000
});
```

#### Methods

**`connectToUpdates(): void`**

Establishes SSE connection to receive form updates.

```javascript
client.connectToUpdates();
```

**`disconnect(): void`**

Closes the SSE connection and cleans up.

```javascript
client.disconnect();
```

**`handleUpdateEvent(event: MessageEvent): void`**

Handles form update notifications. Automatically called when update event is received.

**`handleDeletedEvent(event: MessageEvent): void`**

Handles form deletion notifications. Automatically called when delete event is received.

**`reconnectWithBackoff(): void`**

Attempts to reconnect with exponential backoff. Automatically called when connection is lost.

**`showUpdateIndicator(): void`**

Displays brief notification that form was updated.

**`showConnectionStatus(status: string): void`**

Updates the connection status indicator. Status can be: 'connected', 'reconnecting', or 'disconnected'.

## Event Types

### form-update Event

Sent when a form is created or updated.

```javascript
{
  type: 'form-update',
  data: {
    formId: 'form-123',
    timestamp: '2025-10-10T12:00:00.000Z',
    changeType: 'updated' // or 'created'
  }
}
```

### form-deleted Event

Sent when a form is deleted.

```javascript
{
  type: 'form-deleted',
  data: {
    formId: 'form-123',
    timestamp: '2025-10-10T12:00:00.000Z'
  }
}
```

## Connection States

### Connected

- Green indicator displayed
- Receiving updates normally
- Heartbeats being received

### Reconnecting

- Yellow indicator displayed
- Connection was lost, attempting to reconnect
- Using exponential backoff (1s, 2s, 4s, 8s, 16s)

### Disconnected

- Red indicator displayed
- Connection failed after max reconnection attempts
- Manual reconnect button available

## Error Handling

### Connection Errors

**Automatic Reconnection:**
- Connection lost unexpectedly → Automatic reconnection with exponential backoff
- Network temporarily unavailable → Retry up to 5 times
- Server temporarily down → Retry with increasing delays

**Manual Reconnection:**
- After 5 failed attempts → Display manual reconnect button
- User clicks reconnect → Reset attempt counter and try again

### Form Fetch Errors

If page refresh fails (rare):
- Browser handles reload errors naturally
- User can manually refresh the page
- Connection remains active for future updates

### Form Deleted

When form is deleted while preview is open:
- Display clear message: "This form has been deleted"
- Close SSE connection
- Provide link to return to form list

## Performance Considerations

### Connection Limits

- Default maximum: 100 concurrent preview connections
- Configurable via `MCP_MAX_PREVIEW_CONNECTIONS`
- Server logs warning when approaching limit
- New connections rejected if limit exceeded

### Memory Management

- Efficient data structures (Map, Set) for O(1) lookups
- Bidirectional indexing (formId → connections, connectionId → formId)
- Automatic cleanup of closed connections
- Idle timeout (5 minutes) to free resources

### Debouncing

- Multiple rapid updates batched into single notification
- Default debounce interval: 500ms
- Configurable via `MCP_UPDATE_DEBOUNCE_INTERVAL`
- Prevents excessive page refreshes

### Network Efficiency

- SSE uses single long-lived HTTP connection
- Minimal overhead compared to polling
- Heartbeats keep connection alive (30s interval)
- Only notifies connections watching specific form

## Security Considerations

### Authentication

- Preview connections inherit HTTP server authentication
- If `MCP_REQUIRE_AUTH=true`, SSE endpoint requires auth token
- Same CORS and security middleware as other endpoints

### Access Control

- Form ID validated before establishing connection
- Invalid form IDs rejected with error
- Rate limiting applies to preview connections

### Resource Protection

- Connection limits prevent DoS attacks
- Idle timeout prevents resource exhaustion
- Monitoring and logging of connection patterns

## Troubleshooting

### Connection Not Establishing

**Symptoms:**
- Status indicator shows "disconnected"
- No updates received
- Console shows connection errors

**Solutions:**
1. Check that MCP server is running
2. Verify form ID is correct
3. Check browser console for specific errors
4. Ensure browser supports SSE (all modern browsers do)
5. Check firewall/proxy settings

### Updates Not Appearing

**Symptoms:**
- Status shows "connected"
- Form is modified but preview doesn't update
- No errors in console

**Solutions:**
1. Verify form is being modified through MCP server (not Form.io UI)
2. Check server logs for notification messages
3. Verify form ID matches between preview and modification
4. Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Frequent Disconnections

**Symptoms:**
- Status frequently shows "reconnecting"
- Connection drops and reconnects repeatedly
- Unstable connection

**Solutions:**
1. Check network stability
2. Review server logs for connection errors
3. Verify firewall isn't closing long-lived connections
4. Check if proxy is interfering with SSE
5. Increase heartbeat interval if needed

### Maximum Connections Reached

**Symptoms:**
- Error message: "Maximum connections reached"
- Cannot open new preview pages
- Server logs show connection limit warning

**Solutions:**
1. Close unused preview windows
2. Increase `MCP_MAX_PREVIEW_CONNECTIONS` if needed
3. Check for leaked connections (connections not properly closed)
4. Review server logs for connection lifecycle

### Manual Reconnect Button Appears

**Symptoms:**
- After several reconnection attempts, manual button shown
- Automatic reconnection stopped

**Solutions:**
1. Click the reconnect button to retry
2. Refresh the page to reset connection
3. Check if server is accessible
4. Review browser console for error details

## Debugging

### Browser DevTools

1. **Console Tab:**
   - Check for JavaScript errors
   - Look for connection status messages
   - Review event handling logs

2. **Network Tab:**
   - Find `/preview-updates/{formId}` connection
   - Should show type "EventStream"
   - Click to see SSE events received
   - Check for connection errors

3. **Application Tab:**
   - No specific storage used
   - Connection state is in-memory only

### Server Logs

Look for these log messages:

```
[Preview] Connection established: conn-abc123 watching form-xyz789
[Preview] Notifying 2 connection(s) of form update: form-xyz789
[Preview] Connection closed: conn-abc123
[Preview] Warning: Approaching connection limit (95/100)
```

### Testing Connection

Use curl to test SSE endpoint:

```bash
curl -N -H "Authorization: Bearer your-api-key" \
  http://localhost:44844/mcp/v1/preview-updates/form-xyz789
```

Should see:
```
: heartbeat

: heartbeat

event: form-update
data: {"formId":"form-xyz789","timestamp":"...","changeType":"updated"}
```

## Best Practices

### For Users

1. **Close unused preview windows** to free up connections
2. **Use hard refresh** if preview seems out of sync
3. **Check connection status** indicator before assuming updates are working
4. **Monitor browser console** if experiencing issues

### For Developers

1. **Always call cleanup()** during server shutdown
2. **Log connection lifecycle events** for debugging
3. **Monitor connection count** to detect leaks
4. **Test reconnection logic** with network interruptions
5. **Validate form IDs** before establishing connections
6. **Use debouncing** for rapid successive updates
7. **Implement proper error handling** in notification code

### For Administrators

1. **Set appropriate connection limits** based on expected usage
2. **Monitor server resources** (memory, connections)
3. **Review logs regularly** for connection issues
4. **Configure idle timeout** based on usage patterns
5. **Ensure firewall allows** long-lived HTTP connections
6. **Use reverse proxy** for HTTPS in production

## Future Enhancements

### Planned Features

- **Partial Updates**: Send only changed data instead of full refresh
- **Optimistic Updates**: Apply changes immediately, validate later
- **Collaborative Indicators**: Show who else is viewing the form
- **Update History**: Track and display recent changes
- **WebSocket Fallback**: Alternative transport for better compatibility
- **Selective Re-rendering**: Update only changed components

### Potential Improvements

- **Compression**: Compress SSE messages for large forms
- **Batching**: Batch multiple form updates into single notification
- **Priority Levels**: Prioritize critical updates over minor changes
- **Offline Support**: Queue updates when offline, apply when reconnected
- **Change Diffing**: Show what specifically changed in the form

## Related Documentation

- [README.md](../README.md) - Main project documentation
- [Form.io API Docs](https://apidocs.form.io/) - Form.io API reference
- [SSE Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html) - Server-Sent Events standard
- [MCP Protocol](https://modelcontextprotocol.io/) - Model Context Protocol specification
