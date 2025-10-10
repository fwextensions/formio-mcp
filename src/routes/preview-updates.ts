/**
 * Preview Updates Route Handler
 * Provides SSE endpoint for real-time form update notifications to preview pages
 */

import express, { Request, Response, Router } from 'express';
import { randomUUID } from 'crypto';
import { SSEManager } from '../transport/sse-manager.js';
import { FormUpdateNotifier } from '../services/form-update-notifier.js';

export interface PreviewUpdatesRouteOptions {
  sseManager: SSEManager;
  formUpdateNotifier: FormUpdateNotifier;
  maxPreviewConnections: number;
}

/**
 * Creates and configures the preview updates routes
 */
export function createPreviewUpdatesRoutes(options: PreviewUpdatesRouteOptions): Router {
  const router = express.Router();
  const { sseManager, formUpdateNotifier, maxPreviewConnections } = options;

  /**
   * GET /preview-updates/:formId
   * Establishes SSE connection for receiving real-time form update notifications
   */
  router.get('/preview-updates/:formId', (req: Request, res: Response): void => {
    const { formId } = req.params;

    // Validate form ID parameter
    if (!formId || formId.trim() === '') {
      console.error('[PreviewUpdates] Invalid form ID:', { formId });
      res.status(400).json({
        error: 'Invalid form ID',
        message: 'Form ID is required and cannot be empty.'
      });
      return;
    }

    // Generate unique connection ID
    const connectionId = randomUUID();

    // Extract client info from headers
    const userAgent = req.headers['user-agent'] || 'unknown';
    const clientInfo = `Preview:${formId} - ${req.ip} - ${userAgent}`;

    // Get origin for CORS
    const origin = req.headers.origin as string | undefined;

    console.log('[PreviewUpdates] Establishing SSE connection:', {
      timestamp: new Date().toISOString(),
      connectionId,
      formId,
      ip: req.ip,
      userAgent
    });

    try {
      // Check connection limit
      // Requirements: 6.4 - Log warning when approaching connection limits
      const stats = formUpdateNotifier.getStats();
      if (stats.totalConnections >= maxPreviewConnections) {
        console.warn('[PreviewUpdates] Max preview connections reached:', {
          timestamp: new Date().toISOString(),
          current: stats.totalConnections,
          max: maxPreviewConnections,
          formId,
          action: 'reject',
          reason: 'connection_limit'
        });
        res.status(503).json({
          error: 'Service Unavailable',
          message: 'Maximum number of preview connections reached. Please try again later.'
        });
        return;
      }

      // Log warning when approaching limit (80% threshold)
      // Requirements: 6.4 - Log warning when approaching connection limits
      if (stats.totalConnections >= maxPreviewConnections * 0.8) {
        const percentage = Math.round((stats.totalConnections / maxPreviewConnections) * 100);
        console.warn('[PreviewUpdates] Approaching max preview connections:', {
          timestamp: new Date().toISOString(),
          current: stats.totalConnections,
          max: maxPreviewConnections,
          percentage: percentage + '%',
          remaining: maxPreviewConnections - stats.totalConnections,
          formId,
          action: 'warning',
          severity: percentage >= 90 ? 'high' : 'medium'
        });
      }

      // Add SSE connection with origin for proper CORS handling
      sseManager.addConnection(connectionId, res, clientInfo, origin);

      // Register this connection with FormUpdateNotifier to receive updates for this form
      formUpdateNotifier.registerPreviewConnection(connectionId, formId);

      console.log('[PreviewUpdates] Preview connection registered:', {
        timestamp: new Date().toISOString(),
        connectionId,
        formId
      });

      // Handle connection cleanup on disconnect
      res.on('close', () => {
        console.log('[PreviewUpdates] Preview connection closed:', {
          timestamp: new Date().toISOString(),
          connectionId,
          formId
        });

        // Unregister from FormUpdateNotifier
        formUpdateNotifier.unregisterPreviewConnection(connectionId);
      });

      // Handle errors
      res.on('error', (err) => {
        console.error('[PreviewUpdates] Preview connection error:', {
          timestamp: new Date().toISOString(),
          connectionId,
          formId,
          error: err.message
        });

        // Unregister from FormUpdateNotifier
        formUpdateNotifier.unregisterPreviewConnection(connectionId);
      });

    } catch (error) {
      console.error('[PreviewUpdates] Error establishing preview connection:', {
        timestamp: new Date().toISOString(),
        formId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      // If headers haven't been sent yet, send error response
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to establish preview update connection.'
        });
      }
    }
  });

  return router;
}
