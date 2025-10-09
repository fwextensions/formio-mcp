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

## Usage with Claude Desktop

Add this server to your Claude Desktop configuration file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "formio": {
      "command": "node",
      "args": ["C:\\Projects\\SFDS\\AI\\code\\formio-mcp\\dist\\index.js"],
      "env": {
        "FORMIO_PROJECT_URL": "https://your-project.form.io",
        "FORMIO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop after updating the configuration.

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

## API Reference

For detailed Form.io API documentation, visit:
https://apidocs.form.io/

## License

MIT
