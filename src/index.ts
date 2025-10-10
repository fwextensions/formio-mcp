#!/usr/bin/env node

/**
 * Form.io MCP Server
 *
 * An MCP server that provides tools for interacting with Form.io API
 * to create, list, get, and edit forms using natural language.
 *
 * Supports two transport modes:
 * - STDIO (default): For use with Claude Desktop and similar clients
 * - HTTP (--http flag): For use with HTTP-based MCP clients
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { FormioClient } from './utils/formio-client.js';
import type { FormioForm, FormioComponent } from './types/formio.js';
import { loadHttpConfig, validateHttpConfig } from './config/http-config.js';
import { SSEManager } from './transport/sse-manager.js';
import { HttpTransport } from './transport/http-transport.js';
import { createHttpServer } from './server/http-server.js';

// Parse command line arguments
const args = process.argv.slice(2);
const transportType = args.includes('--http') ? 'http' : 'stdio';

// Environment configuration
const FORMIO_PROJECT_URL = process.env.FORMIO_PROJECT_URL;
const FORMIO_API_KEY = process.env.FORMIO_API_KEY;
const FORMIO_TOKEN = process.env.FORMIO_TOKEN;

if (!FORMIO_PROJECT_URL) {
  throw new Error('FORMIO_PROJECT_URL environment variable is required');
}

// MCP form identification prefixes
const MCP_PATH_PREFIX = 'mcp-';
const MCP_TITLE_PREFIX = '[MCP] ';

// Helper functions for MCP form validation
function isMCPForm(form: FormioForm): boolean {
  return form.path?.startsWith(MCP_PATH_PREFIX) || form.title?.startsWith(MCP_TITLE_PREFIX);
}

function validateMCPOwnership(form: FormioForm, operation: string): void {
  if (!isMCPForm(form)) {
    throw new Error(
      `Cannot ${operation} form "${form.title || form.name}": This form was not created by MCP. ` +
      `MCP can only ${operation} forms it created (prefixed with "${MCP_TITLE_PREFIX}" or path starting with "${MCP_PATH_PREFIX}").`
    );
  }
}

// Initialize Form.io client
const formioClient = new FormioClient({
  baseUrl: FORMIO_PROJECT_URL,
  projectUrl: FORMIO_PROJECT_URL,
  apiKey: FORMIO_API_KEY,
  token: FORMIO_TOKEN
});

// Define MCP tools
const TOOLS: Tool[] = [
  {
    name: 'list_forms',
    description: 'List all forms available in the Form.io project. Returns form names, paths, titles, and IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Maximum number of forms to return',
          default: 100
        },
        skip: {
          type: 'integer',
          description: 'Number of forms to skip for pagination',
          default: 0
        }
      }
    }
  },
  {
    name: 'get_form',
    description: 'Get detailed information about a specific form including its complete schema, components, and settings. Use form ID or path.',
    inputSchema: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The form ID or path (e.g., "contact" or form MongoDB ID)'
        }
      },
      required: ['formId']
    }
  },
  {
    name: 'create_form',
    description: 'Create a new form from a JSON schema. The form will include title, name, path, and components array. NOTE: The title will be automatically prefixed with "[MCP] " and the path will be prefixed with "mcp-" to identify MCP-created forms.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Human-readable title for the form (will be automatically prefixed with "[MCP] ")'
        },
        name: {
          type: 'string',
          description: 'Machine name for the form (lowercase, no spaces)'
        },
        path: {
          type: 'string',
          description: 'URL path for the form (will be normalized to lowercase, letters/numbers/hyphens only, and automatically prefixed with "mcp-")'
        },
        components: {
          type: 'array',
          description: 'Array of form components (fields) in Form.io component schema format',
          items: {
            type: 'object'
          }
        },
        display: {
          type: 'string',
          description: 'Display type: form, wizard, or pdf',
          enum: ['form', 'wizard', 'pdf'],
          default: 'form'
        },
        type: {
          type: 'string',
          description: 'Form type: form or resource',
          enum: ['form', 'resource'],
          default: 'form'
        }
      },
      required: ['title', 'name', 'path', 'components']
    }
  },
  {
    name: 'update_form',
    description: 'Update an existing form. Can update title, components, display settings, or any other form properties.',
    inputSchema: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The form ID to update'
        },
        updates: {
          type: 'object',
          description: 'Object containing the fields to update (title, components, display, etc.)',
          properties: {
            title: { type: 'string' },
            components: { type: 'array' },
            display: { type: 'string', enum: ['form', 'wizard', 'pdf'] },
            tags: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      required: ['formId', 'updates']
    }
  },
  {
    name: 'delete_form',
    description: 'Delete a form from the Form.io project. This action cannot be undone.',
    inputSchema: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The form ID to delete'
        }
      },
      required: ['formId']
    }
  },
  {
    name: 'create_form_component',
    description: 'Helper tool to create a Form.io component object with proper schema. Use this to generate components for forms.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Component type (textfield, textarea, number, email, password, checkbox, select, radio, button, etc.)',
          enum: ['textfield', 'textarea', 'number', 'email', 'password', 'phoneNumber', 'checkbox', 'selectboxes', 'select', 'radio', 'button', 'datetime', 'day', 'time', 'currency', 'survey', 'signature', 'htmlelement', 'content', 'columns', 'fieldset', 'panel', 'table', 'well', 'file', 'url', 'tags', 'address']
        },
        key: {
          type: 'string',
          description: 'Unique key for the component (used in data storage)'
        },
        label: {
          type: 'string',
          description: 'Display label for the component'
        },
        required: {
          type: 'boolean',
          description: 'Whether the field is required',
          default: false
        },
        placeholder: {
          type: 'string',
          description: 'Placeholder text for input fields'
        },
        description: {
          type: 'string',
          description: 'Help text/description for the field'
        },
        defaultValue: {
          type: 'string',
          description: 'Default value for the component'
        },
        properties: {
          type: 'object',
          description: 'Additional component-specific properties (e.g., values for select, data source, validation rules)'
        }
      },
      required: ['type', 'key', 'label']
    }
  }
];

// Initialize MCP server
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

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (!args) {
      throw new Error('Missing arguments');
    }

    switch (name) {
      case 'list_forms': {
        const forms = await formioClient.listForms({
          limit: args.limit as number || 100,
          skip: args.skip as number || 0
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                forms.map(f => ({
                  id: f._id,
                  title: f.title,
                  name: f.name,
                  path: f.path,
                  type: f.type,
                  modified: f.modified
                })),
                null,
                2
              )
            }
          ]
        };
      }

      case 'get_form': {
        const form = await formioClient.getForm(args.formId as string);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(form, null, 2)
            }
          ]
        };
      }

      case 'create_form': {
        const title = args.title as string;
        let path = args.path as string;

        // Normalize path to meet Form.io requirements:
        // - Only letters, numbers, hyphens, and forward slashes
        // - Cannot start or end with hyphen or forward slash
        // - Must be lowercase
        path = path
          .toLowerCase()
          .replace(/[^a-z0-9\-\/]/g, '') // Remove invalid characters
          .replace(/^[\-\/]+|[\-\/]+$/g, ''); // Remove leading/trailing hyphens or slashes

        if (!path) {
          throw new Error('Invalid path: after normalization, path is empty. Path must contain letters or numbers.');
        }

        // Handle components - if it's an object with a components property, extract the array
        let components: FormioComponent[];
        if (Array.isArray(args.components)) {
          components = args.components as FormioComponent[];
        } else if (typeof args.components === 'object' && args.components !== null && 'components' in args.components) {
          // Model passed entire form structure as components param
          components = (args.components as any).components as FormioComponent[];
        } else {
          throw new Error('Invalid components parameter: must be an array of component objects');
        }

        // Prepend MCP prefixes to identify forms created by MCP
        const mcpTitle = title.startsWith(MCP_TITLE_PREFIX) ? title : `${MCP_TITLE_PREFIX}${title}`;
        const mcpPath = path.startsWith(MCP_PATH_PREFIX) ? path : `${MCP_PATH_PREFIX}${path}`;

        const formData: Omit<FormioForm, '_id' | 'created' | 'modified'> = {
          title: mcpTitle,
          name: args.name as string,
          path: mcpPath,
          components,
          display: (args.display as 'form' | 'wizard' | 'pdf') || 'form',
          type: (args.type as 'form' | 'resource') || 'form'
        };

        const createdForm = await formioClient.createForm(formData);

        return {
          content: [
            {
              type: 'text',
              text: `Form created successfully!\n\n${JSON.stringify(createdForm, null, 2)}`
            }
          ]
        };
      }

      case 'update_form': {
        // First, fetch the form to verify MCP ownership
        const existingForm = await formioClient.getForm(args.formId as string);
        validateMCPOwnership(existingForm, 'update');

        const updatedForm = await formioClient.updateForm(
          args.formId as string,
          args.updates as Partial<FormioForm>
        );

        return {
          content: [
            {
              type: 'text',
              text: `Form updated successfully!\n\n${JSON.stringify(updatedForm, null, 2)}`
            }
          ]
        };
      }

      case 'delete_form': {
        // First, fetch the form to verify MCP ownership
        const existingForm = await formioClient.getForm(args.formId as string);
        validateMCPOwnership(existingForm, 'delete');

        await formioClient.deleteForm(args.formId as string);

        return {
          content: [
            {
              type: 'text',
              text: `Form ${args.formId} deleted successfully.`
            }
          ]
        };
      }

      case 'create_form_component': {
        const component: FormioComponent = {
          type: args.type as string,
          key: args.key as string,
          label: args.label as string,
          input: true,
          tableView: true
        };

        if (args.required !== undefined) {
          component.validate = { required: args.required as boolean };
        }
        if (args.placeholder) {
          component.placeholder = args.placeholder as string;
        }
        if (args.description) {
          component.description = args.description as string;
        }
        if (args.defaultValue !== undefined) {
          component.defaultValue = args.defaultValue;
        }
        if (args.properties) {
          Object.assign(component, args.properties as object);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(component, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // Log error for debugging
    if (error instanceof Error) {
      console.error('Tool execution error:', error.message);
    } else if (typeof error === 'object' && error !== null) {
      console.error('Tool execution error:', JSON.stringify(error, null, 2));
    } else {
      console.error('Tool execution error:', String(error));
    }

    // Re-throw to let MCP SDK handle the JSON-RPC error response
    throw error;
  }
});

// Start server
async function main() {
  if (transportType === 'http') {
    // ============================================
    // HTTP Transport Mode
    // ============================================

    console.error('[MCP] Starting in HTTP mode...');

    // Load and validate HTTP configuration
    const config = loadHttpConfig();
    const validation = validateHttpConfig(config);

    if (!validation.valid) {
      console.error('[MCP] Invalid HTTP configuration:');
      validation.errors.forEach(err => console.error(`  - ${err}`));
      process.exit(1);
    }

    console.error('[MCP] HTTP configuration loaded:', {
      port: config.port,
      host: config.host,
      basePath: config.basePath,
      authRequired: config.requireAuth
    });

    // Create SSE manager
    const sseManager = new SSEManager(config.sseHeartbeatInterval);

    // Create HTTP transport
    const httpTransport = new HttpTransport(server, sseManager);

    // Register MCP protocol handlers with HTTP transport

    // Initialize handler - required for MCP handshake
    httpTransport.registerHandler('initialize', async (request) => {
      console.log('[HTTP] Handling initialize request');
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {
            tools: {
              listChanged: true
            }
          },
          serverInfo: {
            name: 'formio-mcp-server',
            version: '1.0.0'
          }
        }
      };
    });

    // Notifications/initialized handler
    httpTransport.registerHandler('notifications/initialized', async (request) => {
      console.log('[HTTP] Client initialization complete');
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {}
      };
    });

    // Tools list handler
    httpTransport.registerHandler('tools/list', async (request) => {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { tools: TOOLS }
      };
    });

    // Tools call handler
    httpTransport.registerHandler('tools/call', async (request) => {
      // Reuse the existing tool call handler logic
      const { name, arguments: toolArgs } = request.params as any;

      if (!toolArgs) {
        throw new Error('Missing arguments');
      }

      // Execute the tool (this uses the existing switch statement logic)
      // We'll call the CallToolRequestSchema handler
      const result = await server.request(
        { method: 'tools/call', params: { name, arguments: toolArgs } },
        CallToolRequestSchema
      );

      return {
        jsonrpc: '2.0',
        id: request.id,
        result
      };
    });

    // Create Express app
    const app = createHttpServer(config, {
      sseManager,
      transport: httpTransport
    });

    // Start HTTP server
    app.listen(config.port, config.host, () => {
      console.error(`[MCP] Form.io MCP Server (HTTP) listening on http://${config.host}:${config.port}`);
      console.error(`[MCP] Endpoints:`);
      console.error(`  - Health:   http://${config.host}:${config.port}${config.basePath}/health`);
      console.error(`  - Info:     http://${config.host}:${config.port}${config.basePath}/info`);
      console.error(`  - SSE:      http://${config.host}:${config.port}${config.basePath}/sse`);
      console.error(`  - Messages: http://${config.host}:${config.port}${config.basePath}/messages`);
      console.error(`[MCP] Server ready to accept connections`);
    });

  } else {
    // ============================================
    // STDIO Transport Mode (default)
    // ============================================

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[MCP] Form.io MCP Server running on stdio');
  }
}

main().catch((error) => {
  console.error('[MCP] Fatal error:', error);
  process.exit(1);
});
