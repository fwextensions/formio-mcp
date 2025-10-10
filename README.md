# Form.io MCP Server

A Model Context Protocol (MCP) server that enables AI assistants to interact with Form.io's API to create, read, update, and manage forms using natural language.

## Features

- **List Forms**: Browse all forms in your Form.io project
- **Get Form Details**: Retrieve complete form schemas and configurations
- **Create Forms**: Generate new forms from natural language descriptions
- **Update Forms**: Modify existing forms and their components
- **Delete Forms**: Remove forms from your project
- **Component Builder**: Helper tool to create properly structured Form.io components
- **Safety Guardrails**: MCP can only modify forms it created, protecting existing forms from accidental changes

## Prerequisites

- Node.js >= 18.0.0
- A Form.io account and project
- Form.io API credentials (API Key or JWT Token)

## Installation

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

3. Build the TypeScript code:

```bash
npm run build
```

## Configuration

Set up the following environment variables:

```bash
export FORMIO_PROJECT_URL="https://your-project.form.io"
export FORMIO_API_KEY="your-api-key"
# OR use JWT token instead:
# export FORMIO_TOKEN="your-jwt-token"
```

### Getting Form.io Credentials

1. Log in to your Form.io account at https://portal.form.io
2. Navigate to your project
3. Go to Settings → API Keys to generate an API key
4. Alternatively, use JWT authentication with your user token

## Transport Modes

This server supports two transport modes:

1. **STDIO Transport (Default)** - For Claude Desktop and similar process-based clients
2. **HTTP Transport** - For HTTP-based MCP clients and remote access

---

## STDIO Transport (Default)

### Usage with Claude Desktop

Add this server to your Claude Desktop configuration file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**MacOS/Linux Example:**
```json
{
  "mcpServers": {
    "formio": {
      "command": "node",
      "args": ["/absolute/path/to/formio-mcp/dist/index.js"],
      "env": {
        "FORMIO_PROJECT_URL": "https://your-project.form.io",
        "FORMIO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Windows Example:**
```json
{
  "mcpServers": {
    "formio": {
      "command": "node",
      "args": ["C:\\path\\to\\formio-mcp\\dist\\index.js"],
      "env": {
        "FORMIO_PROJECT_URL": "https://your-project.form.io",
        "FORMIO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Note:** Replace the path with the absolute path to where you cloned this repository.

Restart Claude Desktop after updating the configuration.

---

## HTTP Transport

### Why Use HTTP Transport?

- **Remote Access**: Host the server on a machine accessible over the network
- **Multi-Client**: Multiple clients can connect to the same server instance
- **Web Integration**: Easier integration with web-based MCP clients
- **Debugging**: Standard HTTP tools (curl, Postman) can be used for testing

### Setup

#### 1. Generate an API Key

```bash
openssl rand -hex 32
```

#### 2. Configure Environment Variables

Create a `.env` file or set environment variables:

```bash
# Form.io Configuration
FORMIO_PROJECT_URL=https://your-project.form.io
FORMIO_API_KEY=your-formio-api-key

# MCP HTTP Server Configuration
MCP_HTTP_PORT=44844
MCP_HTTP_HOST=localhost
MCP_BASE_PATH=/mcp/v1

# Authentication
MCP_API_KEYS=your-generated-api-key-here
MCP_REQUIRE_AUTH=true

# CORS (optional - supports wildcards)
MCP_CORS_ORIGINS=http://localhost:*,https://yourdomain.com
```

#### 3. Start the Server

```bash
npm run start:http
```

You should see output like:
```
[MCP] Starting in HTTP mode...
[MCP] HTTP configuration loaded: { port: 44844, host: 'localhost', ... }
[MCP] Form.io MCP Server (HTTP) listening on http://localhost:44844
[MCP] Endpoints:
  - Health:   http://localhost:44844/mcp/v1/health
  - Info:     http://localhost:44844/mcp/v1/info
  - SSE:      http://localhost:44844/mcp/v1/sse
  - Messages: http://localhost:44844/mcp/v1/messages
[MCP] Server ready to accept connections
```

### HTTP Client Configuration

**Note:** As of now, Claude Desktop only supports STDIO transport. HTTP transport is intended for:
- HTTP-capable MCP clients (like Windsurf, Cline, or custom implementations)
- Remote server deployments
- Multi-user/multi-client scenarios
- Web-based MCP client integrations

#### Generic HTTP Client Configuration

For MCP clients that support HTTP transport with SSE:

```json
{
  "mcpServers": {
    "formio": {
      "url": "http://localhost:44844/mcp/v1",
      "transport": "http+sse",
      "headers": {
        "Authorization": "Bearer your-generated-api-key-here"
      }
    }
  }
}
```

#### Windsurf Configuration Example

If using Windsurf or similar IDE with MCP support:

```json
{
  "mcpServers": {
    "formio": {
      "type": "http",
      "url": "http://localhost:44844/mcp/v1",
      "headers": {
        "Authorization": "Bearer your-generated-api-key-here"
      }
    }
  }
}
```

**For Claude Desktop users:** Continue using STDIO transport (see above). HTTP transport support may be added in future versions.

### HTTP API Endpoints

#### Public Endpoints (No Authentication Required)

**GET `/mcp/v1/health`** - Health check
```bash
curl http://localhost:44844/mcp/v1/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-09T12:00:00.000Z",
  "server": "formio-mcp-server",
  "transport": "http+sse",
  "connections": 0
}
```

**GET `/mcp/v1/info`** - Server information
```bash
curl http://localhost:44844/mcp/v1/info
```

#### Protected Endpoints (Authentication Required)

**GET `/mcp/v1/sse`** - Establish SSE connection
```bash
curl -H "Authorization: Bearer your-api-key" \
     -N http://localhost:44844/mcp/v1/sse
```

This opens a long-lived connection for receiving responses. The server will send:
- Initial `connected` event with a `connectionId`
- Heartbeat comments every 30 seconds
- Response events for your requests

**POST `/mcp/v1/messages`** - Send JSON-RPC requests
```bash
curl -X POST http://localhost:44844/mcp/v1/messages \
     -H "Authorization: Bearer your-api-key" \
     -H "Content-Type: application/json" \
     -H "X-Connection-ID: your-connection-id" \
     -d '{
       "jsonrpc": "2.0",
       "id": 1,
       "method": "tools/list",
       "params": {}
     }'
```

### HTTP Workflow

1. **Establish SSE Connection**: Client connects to `/mcp/v1/sse` and receives a `connectionId`
2. **Send Requests**: Client sends JSON-RPC requests to `/mcp/v1/messages` with the `X-Connection-ID` header
3. **Receive Responses**: Server sends responses via the SSE connection
4. **Keep-Alive**: Server sends heartbeat comments to maintain the connection

### Security

- **Authentication**: All protected endpoints require `Authorization: Bearer <token>` header
- **CORS**: Configurable origins with wildcard support
- **Rate Limiting**: Configurable request limits (default: 100 requests per minute)
- **Security Headers**: Helmet middleware adds standard security headers
- **HTTPS**: Use a reverse proxy (nginx, Apache) for HTTPS in production

### Configuration Options

All HTTP settings can be configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_HTTP_PORT` | `44844` | Port to listen on |
| `MCP_HTTP_HOST` | `localhost` | Host to bind to |
| `MCP_BASE_PATH` | `/mcp/v1` | Base path for API endpoints |
| `MCP_API_KEYS` | (none) | Comma-separated API keys |
| `MCP_REQUIRE_AUTH` | `true` | Enable/disable authentication |
| `MCP_CORS_ORIGINS` | `http://localhost:*` | Allowed CORS origins |
| `MCP_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `MCP_RATE_LIMIT_MAX` | `100` | Max requests per window |
| `MCP_SSE_HEARTBEAT_MS` | `30000` | SSE heartbeat interval (ms) |
| `MCP_SSE_TIMEOUT_MS` | `300000` | SSE connection timeout (ms) |
| `MCP_MAX_PREVIEW_CONNECTIONS` | `100` | Max concurrent preview connections |
| `MCP_PREVIEW_IDLE_TIMEOUT` | `300000` | Preview connection idle timeout (ms) |
| `MCP_UPDATE_DEBOUNCE_INTERVAL` | `500` | Update notification debounce (ms) |

### Deployment

#### Local Development
```bash
MCP_API_KEYS=test-key-123 npm run start:http
```

#### Production with systemd
Create `/etc/systemd/system/formio-mcp.service`:
```ini
[Unit]
Description=Form.io MCP Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/formio-mcp
ExecStart=/usr/bin/node /opt/formio-mcp/dist/index.js --http
Environment="FORMIO_PROJECT_URL=https://your-project.form.io"
Environment="FORMIO_API_KEY=your-formio-key"
Environment="MCP_API_KEYS=your-secure-key"
Environment="MCP_HTTP_HOST=0.0.0.0"
Environment="MCP_HTTP_PORT=44844"
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable formio-mcp
sudo systemctl start formio-mcp
sudo systemctl status formio-mcp
```

#### With Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 44844
CMD ["node", "dist/index.js", "--http"]
```

Build and run:
```bash
docker build -t formio-mcp .
docker run -p 44844:44844 \
  -e FORMIO_PROJECT_URL=https://your-project.form.io \
  -e FORMIO_API_KEY=your-key \
  -e MCP_API_KEYS=your-mcp-key \
  formio-mcp
```

---

## Safety & Guardrails

To protect your existing Form.io forms from accidental modifications, this MCP server implements strict ownership controls:

### MCP-Created Forms
When MCP creates a form, it automatically:
- Prepends `[MCP] ` to the form title (e.g., "Contact Form" becomes "[MCP] Contact Form")
- Prepends `mcp-` to the form path (e.g., "contact" becomes "mcp-contact")

### What MCP Can Do
✅ **List and read ALL forms** - MCP can view any form in your project, including those created outside MCP
✅ **Create new forms** - All created forms will be automatically prefixed
✅ **Update MCP-created forms** - Only forms with the MCP prefix can be modified
✅ **Delete MCP-created forms** - Only forms with the MCP prefix can be deleted

### What MCP Cannot Do
❌ **Modify non-MCP forms** - Update attempts on forms without MCP prefixes will be rejected
❌ **Delete non-MCP forms** - Delete attempts on forms without MCP prefixes will be rejected

### Identification
A form is considered "MCP-created" if either:
- The title starts with `[MCP] `, OR
- The path starts with `mcp-`

If you attempt to update or delete a non-MCP form, you'll receive a clear error message explaining that the operation is not permitted.

## Available Tools

### `list_forms`
List all forms in your Form.io project.

**Parameters:**
- `limit` (optional): Maximum number of forms to return (default: 100)
- `skip` (optional): Number of forms to skip for pagination (default: 0)

### `get_form`
Get detailed information about a specific form.

**Parameters:**
- `formId` (required): The form ID or path

### `create_form`
Create a new form from a schema.

**Parameters:**
- `title` (required): Human-readable form title
- `name` (required): Machine name (lowercase, no spaces)
- `path` (required): URL path (lowercase, no spaces)
- `components` (required): Array of form components
- `display` (optional): Display type ('form', 'wizard', or 'pdf')
- `type` (optional): Form type ('form' or 'resource')

### `update_form`
Update an existing form.

**Parameters:**
- `formId` (required): The form ID to update
- `updates` (required): Object containing fields to update

### `delete_form`
Delete a form from the project.

**Parameters:**
- `formId` (required): The form ID to delete

### `create_form_component`
Helper tool to create properly structured form components.

**Parameters:**
- `type` (required): Component type (textfield, email, number, etc.)
- `key` (required): Unique component key
- `label` (required): Display label
- `required` (optional): Whether the field is required
- `placeholder` (optional): Placeholder text
- `description` (optional): Help text
- `defaultValue` (optional): Default value
- `properties` (optional): Additional component-specific properties

### `get_form_preview_url`
Generate a browser-accessible preview URL for a form. This tool returns a complete URL that can be opened in a web browser to view the rendered form with default styling.

**Parameters:**
- `formId` (required): The form ID or path to generate a preview URL for

**Returns:**
A preview URL in the format: `http://{host}:{port}{basePath}/form/{formPath}/{formId}`

**Example Response:**
```
Form preview URL: http://localhost:44844/mcp/v1/form/contact/507f1f77bcf86cd799439011

Form: Contact Form
Path: contact
ID: 507f1f77bcf86cd799439011
```

## Form Preview Feature

The Form.io MCP Server includes a web-based form preview feature that allows you to visualize forms in a browser. This is particularly useful for quickly validating form structure, layout, and appearance during development.

### How It Works

1. **Create or identify a form** using the MCP tools
2. **Generate a preview URL** using the `get_form_preview_url` tool
3. **Open the URL in a browser** to see the rendered form

The preview page fetches the form JSON from your Form.io server and renders it using the official Form.io JavaScript library with default styling.

### URL Format

Preview URLs follow this format:
```
http://{host}:{port}{basePath}/form/{formPath}/{formId}
```

Example:
```
http://localhost:44844/mcp/v1/form/mcp-contact/507f1f77bcf86cd799439011
```

### Features

- **Interactive Preview**: Forms are fully interactive - you can fill fields, trigger validation, and see how components behave
- **Default Styling**: Forms are rendered with Form.io's default CSS, providing a clean, professional appearance
- **No Authentication Required**: Preview endpoints are publicly accessible for easy sharing (when running in HTTP mode)
- **Error Handling**: Clear error pages for missing forms or API failures

### Example Usage

**Using with Claude Desktop (STDIO mode):**
```
You: "Create a contact form with name, email, and message fields"
Claude: [Creates the form]
You: "Generate a preview URL for this form"
Claude: [Returns preview URL]
You: [Open the URL in your browser to see the form]
```

**Using with HTTP mode:**
```bash
# 1. Start the server in HTTP mode
npm run start:http

# 2. Create a form via MCP tools
# 3. Call get_form_preview_url tool with the form ID
# 4. Open the returned URL in your browser
```

### Preview Behavior

- **Form Interaction**: All form components are interactive and functional
- **Validation**: Client-side validation rules are active and will display errors
- **Submission**: Form submission is disabled in preview mode - clicking submit will show an alert message
- **Responsive**: Preview pages adapt to different screen sizes

### Security Considerations

**Public Access**: When running in HTTP mode, preview endpoints are intentionally public (no authentication required) to allow easy sharing of form previews. This means:

- ✅ Anyone with the preview URL can view the form structure
- ✅ Forms don't contain sensitive data - only the structure and configuration
- ❌ Form submissions are disabled in preview mode
- ❌ No user data or API credentials are exposed

**Important**: Preview URLs expose the structure of your forms (field names, validation rules, layout). Only share preview URLs with trusted parties. The preview feature does not expose any submitted data or allow modifications to forms.

### Real-Time Updates

Preview pages automatically refresh when forms are modified through the MCP server, eliminating the need to manually reload the page. This enables a seamless live-editing experience where changes made via AI tools are instantly visible in the browser.

**How It Works:**
1. When you open a form preview, the page establishes a Server-Sent Events (SSE) connection to the MCP server
2. When you modify the form through MCP tools (create, update, or delete), the server notifies all connected preview pages
3. Preview pages automatically refresh to show the latest changes

**Features:**
- **Automatic Updates**: No manual refresh needed - changes appear instantly
- **Visual Feedback**: Brief notification shown when form is updated
- **Reconnection**: Automatic reconnection with exponential backoff if connection is lost
- **Connection Status**: Visual indicator shows connection state (connected/reconnecting/disconnected)
- **Form Deletion Handling**: Clear message displayed if form is deleted while preview is open
- **Debouncing**: Multiple rapid updates are batched to prevent excessive refreshes

**Connection Management:**
- Connections automatically reconnect if network is interrupted
- After 5 failed reconnection attempts, a manual reconnect button is displayed
- Idle connections are automatically closed after 5 minutes to conserve resources
- Maximum of 100 concurrent preview connections (configurable)

**Browser Compatibility:**
Real-time updates work in all modern browsers that support Server-Sent Events (SSE):
- Chrome/Edge 6+
- Firefox 6+
- Safari 5+
- Opera 11+

If SSE is not supported, the preview will still work but updates won't be automatic - you'll need to manually refresh the page.

## Example Interactions

Once configured in Claude Desktop, you can interact with your forms using natural language:

**Create a contact form:**
> "Create a contact form with fields for name, email, phone number, and message"

**List existing forms:**
> "Show me all the forms in my Form.io project"

**Update a form:**
> "Add a 'Company Name' field to the contact form"

**Get form details:**
> "Show me the complete schema for the registration form"

## Supported Component Types

The server supports all standard Form.io component types:

- **Basic**: textfield, textarea, number, password, checkbox, select, radio, button
- **Advanced**: email, url, phoneNumber, tags, address, datetime, day, time, currency
- **Data**: select, radio, selectboxes
- **Layout**: htmlelement, content, columns, fieldset, panel, table, well
- **Special**: file, signature, survey

## Development

Run in development mode with auto-rebuild:

```bash
npm run dev
```

The server uses stdio transport and follows MCP protocol specifications from mid-2025.

## Project Structure

```
formio-mcp/
├── src/
│   ├── index.ts              # Main MCP server implementation
│   ├── types/
│   │   └── formio.ts         # TypeScript type definitions
│   └── utils/
│       └── formio-client.ts  # Form.io API client
├── dist/                      # Compiled JavaScript output
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

**Server not connecting:**
- Ensure the path in `claude_desktop_config.json` is correct and absolute
- Check that the build succeeded: run `npm run build`
- Verify environment variables are set correctly

**Authentication errors:**
- Confirm your API key or token is valid
- Check that the project URL is correct (should include https://)
- Ensure your API key has appropriate permissions

**Form creation fails:**
- Verify component schemas are properly formatted
- Check that form names and paths are unique
- Ensure required fields are provided

**Real-time updates not working:**
- **Connection indicator shows "disconnected"**: Check that the MCP server is running and accessible
- **Updates not appearing**: Verify the form is being modified through the MCP server (not directly in Form.io UI)
- **"Reconnecting" status persists**: Check browser console for errors; may indicate network issues or server problems
- **"Failed to connect" message**: Ensure your browser supports Server-Sent Events (all modern browsers do)
- **Preview shows old version after update**: Try a hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- **Multiple preview windows not all updating**: Each window maintains its own connection; check each window's connection status
- **Connection drops frequently**: May indicate network instability; check server logs for connection errors

**Preview connection issues:**
- **"Maximum connections reached" error**: Close unused preview windows or increase `MCP_MAX_PREVIEW_CONNECTIONS`
- **Connection closes after 5 minutes**: This is expected for idle connections; refresh the page to reconnect
- **Manual reconnect button appears**: Click it to retry connection, or refresh the page
- **Server logs show connection errors**: Check firewall settings and ensure SSE endpoints are accessible

**Debugging real-time updates:**
1. Open browser DevTools (F12) and check the Console tab for errors
2. Check the Network tab for the `/preview-updates/{formId}` connection (should show "EventStream" type)
3. Look for SSE events in the Network tab by clicking on the connection
4. Check server logs for notification messages and connection lifecycle events
5. Verify the form ID in the preview URL matches the form being modified

## API Reference

### FormUpdateNotifier API

The `FormUpdateNotifier` service manages real-time notifications for form preview connections.

**Location:** `src/services/form-update-notifier.ts`

#### Methods

**`registerPreviewConnection(connectionId: string, formId: string): void`**
- Registers a preview connection to receive updates for a specific form
- Called automatically when a preview page establishes an SSE connection
- Parameters:
  - `connectionId`: Unique identifier for the SSE connection
  - `formId`: The form ID to watch for updates

**`unregisterPreviewConnection(connectionId: string): void`**
- Unregisters a preview connection and stops sending updates
- Called automatically when a preview page closes or connection is lost
- Parameters:
  - `connectionId`: The connection ID to unregister

**`notifyFormCreated(formId: string, formData: FormioForm): void`**
- Notifies all preview connections watching a form that it was created
- Called automatically by the `create_form` tool handler
- Parameters:
  - `formId`: The ID of the created form
  - `formData`: The complete form object

**`notifyFormUpdated(formId: string, formData: Partial<FormioForm>): void`**
- Notifies all preview connections watching a form that it was updated
- Called automatically by the `update_form` tool handler
- Implements debouncing to prevent excessive notifications
- Parameters:
  - `formId`: The ID of the updated form
  - `formData`: The updated form data (partial or complete)

**`notifyFormDeleted(formId: string): void`**
- Notifies all preview connections watching a form that it was deleted
- Called automatically by the `delete_form` tool handler
- Parameters:
  - `formId`: The ID of the deleted form

**`getConnectionsByForm(formId: string): string[]`**
- Returns all connection IDs currently watching a specific form
- Useful for debugging and monitoring
- Parameters:
  - `formId`: The form ID to query
- Returns: Array of connection IDs

**`getFormByConnection(connectionId: string): string | undefined`**
- Returns the form ID being watched by a specific connection
- Useful for debugging and monitoring
- Parameters:
  - `connectionId`: The connection ID to query
- Returns: Form ID or undefined if connection not found

**`cleanup(): void`**
- Cleans up all connections and internal state
- Called automatically during server shutdown
- Should be called before server stops to ensure graceful cleanup

#### Usage Example

```typescript
import { FormUpdateNotifier } from './services/form-update-notifier';
import { SSEManager } from './transport/sse-manager';

// Initialize
const sseManager = new SSEManager();
const notifier = new FormUpdateNotifier(sseManager);

// Register a preview connection (done automatically by preview endpoint)
notifier.registerPreviewConnection('conn-123', 'form-456');

// Notify of form update (done automatically by tool handlers)
notifier.notifyFormUpdated('form-456', { title: 'Updated Form' });

// Check active connections
const connections = notifier.getConnectionsByForm('form-456');
console.log(`${connections.length} preview(s) watching this form`);

// Cleanup on shutdown
notifier.cleanup();
```

### FormPreviewClient API

The `FormPreviewClient` is a JavaScript class embedded in preview pages that manages the client-side connection and update handling.

**Location:** `src/templates/form-preview-client.js` (embedded in `form-preview.ts`)

#### Constructor

**`new FormPreviewClient(formId: string, formPath: string, config?: PreviewClientConfig)`**
- Creates a new preview client instance
- Parameters:
  - `formId`: The form ID to watch for updates
  - `formPath`: The form path (used for display)
  - `config` (optional): Configuration object
    - `maxReconnectAttempts`: Maximum reconnection attempts (default: 5)
    - `initialReconnectDelay`: Initial reconnection delay in ms (default: 1000)
    - `updateIndicatorDuration`: How long to show update notification in ms (default: 2000)

#### Methods

**`connectToUpdates(): void`**
- Establishes SSE connection to receive form updates
- Automatically called on page load
- Sets up event listeners for update and delete events
- Handles connection errors and reconnection

**`disconnect(): void`**
- Closes the SSE connection and cleans up
- Automatically called on page unload
- Should be called manually if you need to stop receiving updates

**`handleUpdateEvent(event: MessageEvent): void`**
- Handles form update notifications
- Automatically refreshes the page to show latest changes
- Shows brief update indicator before refresh
- Called automatically when update event is received

**`handleDeletedEvent(event: MessageEvent): void`**
- Handles form deletion notifications
- Displays message that form is no longer available
- Closes the SSE connection
- Called automatically when delete event is received

**`reconnectWithBackoff(): void`**
- Attempts to reconnect with exponential backoff
- Called automatically when connection is lost
- Increases delay between attempts (1s, 2s, 4s, 8s, 16s)
- Shows manual reconnect button after max attempts

**`showUpdateIndicator(): void`**
- Displays brief notification that form was updated
- Called automatically before page refresh
- Notification disappears after 2 seconds or when page refreshes

**`showConnectionStatus(status: 'connected' | 'reconnecting' | 'disconnected'): void`**
- Updates the connection status indicator
- Called automatically as connection state changes
- Visual indicator helps users understand connection health

#### Usage Example

```javascript
// Automatically initialized in preview pages
const client = new FormPreviewClient('form-123', 'contact-form', {
  maxReconnectAttempts: 5,
  initialReconnectDelay: 1000
});

// Connect to receive updates
client.connectToUpdates();

// Manually disconnect if needed
// client.disconnect();

// Connection state is managed automatically
// Status indicator updates as connection changes
```

#### Events Received

**`form-update` event:**
```javascript
{
  type: 'form-update',
  data: {
    formId: 'form-123',
    timestamp: '2025-10-10T12:00:00.000Z',
    changeType: 'updated'
  }
}
```

**`form-deleted` event:**
```javascript
{
  type: 'form-deleted',
  data: {
    formId: 'form-123',
    timestamp: '2025-10-10T12:00:00.000Z'
  }
}
```

### Form.io API Reference

For detailed Form.io API documentation, visit:
https://apidocs.form.io/

## License

MIT
