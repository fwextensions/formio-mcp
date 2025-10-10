/**
 * Tool Handlers
 * Centralized tool execution logic for all MCP tools
 */

import { FormioClient } from '../utils/formio-client.js';
import type { FormioForm, FormioComponent } from '../types/formio.js';

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

/**
 * Execute a tool by name with given arguments
 */
export async function executeToolCall(
  formioClient: FormioClient,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
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

      // Normalize path to meet Form.io requirements
      path = path
        .toLowerCase()
        .replace(/[^a-z0-9\-\/]/g, '')
        .replace(/^[\-\/]+|[\-\/]+$/g, '');

      if (!path) {
        throw new Error('Invalid path: after normalization, path is empty. Path must contain letters or numbers.');
      }

      // Handle components - if it's an object with a components property, extract the array
      let components: FormioComponent[];
      if (Array.isArray(args.components)) {
        components = args.components as FormioComponent[];
      } else if (typeof args.components === 'object' && args.components !== null && 'components' in args.components) {
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

    case 'get_form_preview_url': {
      // Validate form exists
      const form = await formioClient.getForm(args.formId as string);

      // Get server configuration from environment variables
      const host = process.env.MCP_HTTP_HOST || 'localhost';
      const port = process.env.MCP_HTTP_PORT || '44844';

      // Construct preview URL (at root level, not under MCP basePath)
      const formPath = form.path || 'unknown';
      const formId = form._id;
      const previewUrl = `http://${host}:${port}/form/${formPath}/${formId}`;

      return {
        content: [
          {
            type: 'text',
            text: `Form preview URL: ${previewUrl}\n\nForm Details:\n- Title: ${form.title}\n- Path: ${form.path}\n- ID: ${form._id}\n\nOpen this URL in your browser to view the rendered form.`
          }
        ]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
