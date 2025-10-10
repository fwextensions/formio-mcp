/**
 * Form Preview Route Handler
 * Provides HTTP endpoints for rendering form previews in a browser
 */

import express, { Request, Response, Router } from 'express';
import { FormioClient } from '../utils/formio-client.js';
import {
  renderFormPreviewTemplate,
  renderErrorTemplate,
  FormPreviewTemplateData
} from '../templates/form-preview.js';
import { FormioError } from '../types/formio.js';

export interface FormPreviewRouteOptions {
  formioClient: FormioClient;
  serverConfig: {
    host: string;
    port: number;
    basePath: string;
  };
}

/**
 * Creates and configures the form preview routes
 */
export function createFormPreviewRoutes(options: FormPreviewRouteOptions): Router {
  const router = express.Router();
  const { formioClient } = options;

  /**
   * GET /form/:path/:formId
   * Renders a form preview page
   */
  router.get('/form/:path/:formId', async (req: Request, res: Response): Promise<void> => {
    const { path, formId } = req.params;
    const startTime = Date.now();

    // Log preview request
    console.log('[FormPreview] Preview request received:', {
      timestamp: new Date().toISOString(),
      path,
      formId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    try {
      // Validate parameters
      if (!formId || formId.trim() === '') {
        console.error('[FormPreview] Invalid form ID:', { formId });
        const errorHtml = renderErrorTemplate({
          title: 'Invalid Request',
          message: 'Form ID is required and cannot be empty.',
          details: `Provided form ID: "${formId}"`
        });
        res.status(400).type('html').send(errorHtml);
        return;
      }

      if (!path || path.trim() === '') {
        console.error('[FormPreview] Invalid path:', { path });
        const errorHtml = renderErrorTemplate({
          title: 'Invalid Request',
          message: 'Form path is required and cannot be empty.',
          details: `Provided path: "${path}"`
        });
        res.status(400).type('html').send(errorHtml);
        return;
      }

      // Fetch form from Form.io API
      const form = await formioClient.getForm(formId);

      // Prepare template data
      const templateData: FormPreviewTemplateData = {
        formJson: form,
        formTitle: form.title || 'Untitled Form',
        formPath: form.path || path,
        formId: form._id || formId
      };

      // Render and send HTML
      const html = renderFormPreviewTemplate(templateData);
      const responseTime = Date.now() - startTime;

      console.log('[FormPreview] Preview rendered successfully:', {
        timestamp: new Date().toISOString(),
        formId,
        formTitle: form.title,
        responseTime: `${responseTime}ms`
      });

      res.status(200).type('html').send(html);
    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Handle Form.io API errors
      if (isFormioError(error)) {
        console.error('[FormPreview] Form.io API error:', {
          timestamp: new Date().toISOString(),
          formId,
          path,
          error: error.message,
          details: error.details,
          responseTime: `${responseTime}ms`,
          ip: req.ip
        });

        // Check if it's a 404 (form not found)
        if (error.details?.status === 404 || error.message.includes('not found')) {
          const errorHtml = renderErrorTemplate({
            title: 'Form Not Found',
            message: 'The form you\'re looking for doesn\'t exist or has been deleted.',
            details: `Form ID: ${formId}\nPath: ${path}`
          });
          res.status(404).type('html').send(errorHtml);
          return;
        }

        // Other API errors (500, 502, 503, etc.)
        const errorHtml = renderErrorTemplate({
          title: 'Service Error',
          message: 'Unable to connect to Form.io server. Please try again later.',
          details: `Error: ${error.message}\nForm ID: ${formId}`
        });
        res.status(502).type('html').send(errorHtml);
        return;
      }

      // Handle unexpected errors
      console.error('[FormPreview] Unexpected error:', {
        timestamp: new Date().toISOString(),
        formId,
        path,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        responseTime: `${responseTime}ms`,
        ip: req.ip
      });

      const errorHtml = renderErrorTemplate({
        title: 'Internal Server Error',
        message: 'An unexpected error occurred while loading the form preview.',
        details: error instanceof Error ? error.message : String(error)
      });
      res.status(500).type('html').send(errorHtml);
    }
  });

  return router;
}

/**
 * Type guard to check if an error is a FormioError
 */
function isFormioError(error: unknown): error is FormioError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as FormioError).message === 'string'
  );
}
