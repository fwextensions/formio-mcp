/**
 * Form Update Notifier Service
 * Manages form-to-connection mappings and sends real-time update notifications
 * to preview pages when forms are created, updated, or deleted.
 */

import { SSEManager } from '../transport/sse-manager.js';
import { FormioForm } from '../types/formio.js';

interface FormUpdateEventData {
  formId: string;
  timestamp: string;
  changeType: 'created' | 'updated' | 'deleted';
}

interface FormDeletedEventData {
  formId: string;
  timestamp: string;
}

export class FormUpdateNotifier {
  // Map: formId -> Set<connectionId>
  private formWatchers: Map<string, Set<string>> = new Map();
  
  // Map: connectionId -> formId (reverse lookup)
  private connectionForms: Map<string, string> = new Map();
  
  // Map: connectionId -> last activity timestamp
  private connectionActivity: Map<string, Date> = new Map();
  
  // Reference to SSE manager for sending notifications
  private sseManager: SSEManager;
  
  // Debounce tracking
  private pendingNotifications: Map<string, NodeJS.Timeout> = new Map();
  private debounceInterval: number;
  
  // Idle timeout configuration
  private idleTimeout: number;
  private idleCheckInterval: NodeJS.Timeout | null = null;

  constructor(sseManager: SSEManager, debounceInterval: number = 500, idleTimeout: number = 300000) {
    this.sseManager = sseManager;
    this.debounceInterval = debounceInterval;
    this.idleTimeout = idleTimeout;
    
    // Start idle connection cleanup timer
    this.startIdleCleanup();
  }

  /**
   * Register a preview connection for a specific form
   * Requirements: 1.4 - Log preview connection lifecycle, 5.4 - Handle multiple connections for same form
   */
  registerPreviewConnection(connectionId: string, formId: string): void {
    const timestamp = new Date().toISOString();
    
    // Check if this connection is already registered
    const existingFormId = this.connectionForms.get(connectionId);
    if (existingFormId) {
      console.warn('[FormUpdateNotifier] Connection already registered:', {
        timestamp,
        connectionId,
        existingFormId,
        newFormId: formId,
        action: 'already_registered'
      });
      
      // If trying to register for a different form, unregister from old form first
      if (existingFormId !== formId) {
        console.log('[FormUpdateNotifier] Re-registering connection for different form:', {
          timestamp,
          connectionId,
          oldFormId: existingFormId,
          newFormId: formId,
          action: 'reregister'
        });
        this.unregisterPreviewConnection(connectionId);
      } else {
        // Already registered for the same form, just update activity
        this.connectionActivity.set(connectionId, new Date());
        return;
      }
    }
    
    console.log('[FormUpdateNotifier] Registering preview connection:', {
      timestamp,
      connectionId,
      formId,
      action: 'register'
    });

    // Add to formWatchers map
    // Requirements: 5.4 - Handle multiple connections for same form
    if (!this.formWatchers.has(formId)) {
      this.formWatchers.set(formId, new Set());
    }
    this.formWatchers.get(formId)!.add(connectionId);

    // Add to connectionForms map (reverse lookup)
    this.connectionForms.set(connectionId, formId);
    
    // Track activity
    this.connectionActivity.set(connectionId, new Date());

    const watcherCount = this.formWatchers.get(formId)!.size;
    const totalConnections = this.connectionForms.size;
    
    // Log if multiple connections are watching the same form
    // Requirements: 5.4 - Handle multiple connections for same form
    if (watcherCount > 1) {
      console.log('[FormUpdateNotifier] Multiple connections watching form:', {
        timestamp,
        formId,
        watcherCount,
        action: 'multiple_watchers'
      });
    }
    
    console.log('[FormUpdateNotifier] Connection registered:', {
      timestamp,
      formId,
      watchersForForm: watcherCount,
      totalConnections,
      action: 'registered'
    });
  }

  /**
   * Unregister a preview connection
   * Requirements: 1.4 - Log preview connection lifecycle
   */
  unregisterPreviewConnection(connectionId: string): void {
    const timestamp = new Date().toISOString();
    const formId = this.connectionForms.get(connectionId);
    
    if (!formId) {
      console.log('[FormUpdateNotifier] Connection not registered:', {
        timestamp,
        connectionId,
        action: 'unregister_failed',
        reason: 'not_found'
      });
      return;
    }

    const connectionAge = this.connectionActivity.get(connectionId);
    const durationMs = connectionAge ? Date.now() - connectionAge.getTime() : 0;
    
    console.log('[FormUpdateNotifier] Unregistering preview connection:', {
      timestamp,
      connectionId,
      formId,
      durationMs,
      durationSeconds: Math.floor(durationMs / 1000),
      action: 'unregister'
    });

    // Remove from formWatchers
    const watchers = this.formWatchers.get(formId);
    if (watchers) {
      watchers.delete(connectionId);
      
      // Clean up empty sets
      if (watchers.size === 0) {
        this.formWatchers.delete(formId);
        console.log('[FormUpdateNotifier] Form watchers cleaned up:', {
          timestamp,
          formId,
          action: 'cleanup',
          reason: 'no_watchers'
        });
      } else {
        console.log('[FormUpdateNotifier] Form watchers updated:', {
          timestamp,
          formId,
          remainingWatchers: watchers.size,
          action: 'updated'
        });
      }
    }

    // Remove from connectionForms
    this.connectionForms.delete(connectionId);
    
    // Remove activity tracking
    this.connectionActivity.delete(connectionId);
    
    const totalConnections = this.connectionForms.size;
    console.log('[FormUpdateNotifier] Connection unregistered:', {
      timestamp,
      totalConnections,
      action: 'unregistered'
    });
  }

  /**
   * Notify all preview connections watching a specific form that it was updated
   * Requirements: 5.1 - Log form update events
   */
  notifyFormUpdated(formId: string, formData?: Partial<FormioForm>): void {
    const timestamp = new Date().toISOString();
    const watcherCount = this.getConnectionsByForm(formId).length;
    
    console.log('[FormUpdateNotifier] Form update event:', {
      timestamp,
      formId,
      eventType: 'updated',
      watcherCount,
      willDebounce: true
    });
    
    // Debounce notifications to avoid excessive updates
    this.debounceNotification(formId, 'updated', formData);
  }

  /**
   * Notify that a form was created
   * Requirements: 5.1 - Log form update events
   */
  notifyFormCreated(formId: string, formData?: FormioForm): void {
    const timestamp = new Date().toISOString();
    const watcherCount = this.getConnectionsByForm(formId).length;
    
    console.log('[FormUpdateNotifier] Form create event:', {
      timestamp,
      formId,
      eventType: 'created',
      watcherCount,
      willDebounce: false
    });
    
    // No debouncing for creation events
    this.sendNotification(formId, 'created', formData);
  }

  /**
   * Notify that a form was deleted
   * Requirements: 5.1 - Log form update events, 6.5 - Handle connection cleanup on form deletion
   */
  notifyFormDeleted(formId: string): void {
    const timestamp = new Date().toISOString();
    const watcherCount = this.getConnectionsByForm(formId).length;
    
    console.log('[FormUpdateNotifier] Form delete event:', {
      timestamp,
      formId,
      eventType: 'deleted',
      watcherCount,
      willDebounce: false
    });
    
    // No debouncing for deletion events
    this.sendNotification(formId, 'deleted');
    
    // Clean up any pending notifications for this form
    const pending = this.pendingNotifications.get(formId);
    if (pending) {
      clearTimeout(pending);
      this.pendingNotifications.delete(formId);
      console.log('[FormUpdateNotifier] Cleared pending notification:', {
        timestamp,
        formId,
        action: 'cleanup'
      });
    }

    // Clean up all connections watching this deleted form
    // Requirements: 6.5 - Handle connection cleanup on form deletion
    const connectionIds = this.getConnectionsByForm(formId);
    if (connectionIds.length > 0) {
      console.log('[FormUpdateNotifier] Cleaning up connections for deleted form:', {
        timestamp,
        formId,
        connectionCount: connectionIds.length,
        action: 'cleanup_connections'
      });

      // Close all SSE connections for this form
      for (const connectionId of connectionIds) {
        try {
          const conn = this.sseManager.getConnectionInfo(connectionId);
          if (conn) {
            // Connection will be closed by the client after receiving form-deleted event
            // But we'll unregister it from our tracking immediately
            this.unregisterPreviewConnection(connectionId);
          }
        } catch (error) {
          console.error('[FormUpdateNotifier] Error cleaning up connection:', {
            timestamp,
            connectionId,
            formId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      console.log('[FormUpdateNotifier] Connection cleanup complete:', {
        timestamp,
        formId,
        cleanedCount: connectionIds.length,
        action: 'cleanup_complete'
      });
    }
  }

  /**
   * Get all connection IDs watching a specific form
   */
  getConnectionsByForm(formId: string): string[] {
    const watchers = this.formWatchers.get(formId);
    return watchers ? Array.from(watchers) : [];
  }

  /**
   * Get the form ID being watched by a connection
   */
  getFormByConnection(connectionId: string): string | undefined {
    return this.connectionForms.get(connectionId);
  }

  /**
   * Debounce notification to avoid excessive updates
   */
  private debounceNotification(
    formId: string, 
    changeType: 'created' | 'updated' | 'deleted',
    formData?: Partial<FormioForm>
  ): void {
    // Clear any pending notification for this form
    const pending = this.pendingNotifications.get(formId);
    if (pending) {
      clearTimeout(pending);
    }

    // Schedule new notification
    const timeout = setTimeout(() => {
      this.sendNotification(formId, changeType, formData);
      this.pendingNotifications.delete(formId);
    }, this.debounceInterval);

    this.pendingNotifications.set(formId, timeout);
  }

  /**
   * Send notification to all watchers of a form
   * Requirements: 1.4 - Handle notification send failures gracefully, 5.1 - Log update notifications sent
   */
  private sendNotification(
    formId: string,
    changeType: 'created' | 'updated' | 'deleted',
    _formData?: Partial<FormioForm>
  ): void {
    const timestamp = new Date().toISOString();
    const connectionIds = this.getConnectionsByForm(formId);
    
    if (connectionIds.length === 0) {
      console.log('[FormUpdateNotifier] No watchers, skipping notification:', {
        timestamp,
        formId,
        changeType,
        action: 'skip'
      });
      return;
    }

    console.log('[FormUpdateNotifier] Sending notifications:', {
      timestamp,
      formId,
      changeType,
      recipientCount: connectionIds.length,
      action: 'send_start'
    });

    const eventData: FormUpdateEventData = {
      formId,
      timestamp,
      changeType
    };

    let successCount = 0;
    let failureCount = 0;
    const failedConnections: string[] = [];
    const deadConnections: string[] = [];

    for (const connectionId of connectionIds) {
      try {
        let sent = false;
        
        if (changeType === 'deleted') {
          // Send form-deleted event
          const deletedData: FormDeletedEventData = {
            formId,
            timestamp: eventData.timestamp
          };
          sent = this.sendFormDeletedEvent(connectionId, deletedData);
        } else {
          // Send form-update event
          sent = this.sendFormUpdateEvent(connectionId, eventData);
        }

        if (sent) {
          successCount++;
        } else {
          failureCount++;
          failedConnections.push(connectionId);
          
          // Check if connection is dead (not in SSE manager)
          // Requirements: 1.4 - Handle notification send failures gracefully
          if (!this.sseManager.hasConnection(connectionId)) {
            deadConnections.push(connectionId);
            console.warn('[FormUpdateNotifier] Dead connection detected:', {
              timestamp,
              connectionId,
              formId,
              changeType,
              reason: 'connection_not_found',
              action: 'mark_for_cleanup'
            });
          } else {
            console.warn('[FormUpdateNotifier] Notification send failed:', {
              timestamp,
              connectionId,
              formId,
              changeType,
              reason: 'write_failed'
            });
          }
        }
      } catch (error) {
        failureCount++;
        failedConnections.push(connectionId);
        
        // Log error but continue with other connections
        // Requirements: 1.4 - Handle notification send failures gracefully
        console.error('[FormUpdateNotifier] Notification send error:', {
          timestamp,
          connectionId,
          formId,
          changeType,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        
        // Check if this is a dead connection
        if (!this.sseManager.hasConnection(connectionId)) {
          deadConnections.push(connectionId);
        }
      }
    }

    // Clean up dead connections
    // Requirements: 1.4 - Handle notification send failures gracefully
    if (deadConnections.length > 0) {
      console.log('[FormUpdateNotifier] Cleaning up dead connections:', {
        timestamp,
        formId,
        deadConnectionCount: deadConnections.length,
        action: 'cleanup_dead_connections'
      });

      for (const connectionId of deadConnections) {
        try {
          this.unregisterPreviewConnection(connectionId);
        } catch (error) {
          console.error('[FormUpdateNotifier] Error unregistering dead connection:', {
            timestamp,
            connectionId,
            formId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    console.log('[FormUpdateNotifier] Notifications sent:', {
      timestamp,
      formId,
      changeType,
      totalRecipients: connectionIds.length,
      successCount,
      failureCount,
      deadConnectionsCleanedUp: deadConnections.length,
      successRate: connectionIds.length > 0 
        ? Math.round((successCount / connectionIds.length) * 100) + '%'
        : 'N/A',
      failedConnections: failedConnections.length > 0 ? failedConnections : undefined,
      action: 'send_complete'
    });
  }

  /**
   * Send a form update event to a specific connection
   */
  private sendFormUpdateEvent(connectionId: string, data: FormUpdateEventData): boolean {
    const conn = this.sseManager.getConnectionInfo(connectionId);
    if (!conn) {
      console.warn(`[FormUpdateNotifier] Connection ${connectionId} not found in SSE manager`);
      return false;
    }

    try {
      const formattedData = `event: form-update\ndata: ${JSON.stringify(data)}\n\n`;
      const written = conn.res.write(formattedData);

      if (!written) {
        console.warn(`[FormUpdateNotifier] Write buffer full for connection ${connectionId}`);
      }

      return written;
    } catch (err) {
      console.error(`[FormUpdateNotifier] Failed to send form-update event to ${connectionId}:`, err);
      return false;
    }
  }

  /**
   * Send a form deleted event to a specific connection
   */
  private sendFormDeletedEvent(connectionId: string, data: FormDeletedEventData): boolean {
    const conn = this.sseManager.getConnectionInfo(connectionId);
    if (!conn) {
      console.warn(`[FormUpdateNotifier] Connection ${connectionId} not found in SSE manager`);
      return false;
    }

    try {
      const formattedData = `event: form-deleted\ndata: ${JSON.stringify(data)}\n\n`;
      const written = conn.res.write(formattedData);

      if (!written) {
        console.warn(`[FormUpdateNotifier] Write buffer full for connection ${connectionId}`);
      }

      return written;
    } catch (err) {
      console.error(`[FormUpdateNotifier] Failed to send form-deleted event to ${connectionId}:`, err);
      return false;
    }
  }

  /**
   * Start periodic idle connection cleanup
   */
  private startIdleCleanup(): void {
    // Check for idle connections every minute
    const checkInterval = 60000;
    
    this.idleCheckInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, checkInterval);
    
    console.log(`[FormUpdateNotifier] Started idle connection cleanup (interval: ${checkInterval}ms, timeout: ${this.idleTimeout}ms)`);
  }

  /**
   * Clean up connections that have been idle for too long
   * Requirements: 1.4 - Log connection cleanup
   */
  private cleanupIdleConnections(): void {
    const timestamp = new Date().toISOString();
    const now = new Date();
    const idleConnections: Array<{ connectionId: string; formId: string; idleTimeMs: number }> = [];

    for (const [connectionId, lastActivity] of this.connectionActivity.entries()) {
      const idleTime = now.getTime() - lastActivity.getTime();
      
      if (idleTime > this.idleTimeout) {
        const formId = this.connectionForms.get(connectionId) || 'unknown';
        idleConnections.push({ connectionId, formId, idleTimeMs: idleTime });
      }
    }

    if (idleConnections.length > 0) {
      console.log('[FormUpdateNotifier] Idle connection cleanup started:', {
        timestamp,
        idleConnectionCount: idleConnections.length,
        idleTimeoutMs: this.idleTimeout,
        action: 'cleanup_start'
      });
      
      for (const { connectionId, formId, idleTimeMs } of idleConnections) {
        console.log('[FormUpdateNotifier] Closing idle connection:', {
          timestamp,
          connectionId,
          formId,
          idleTimeMs,
          idleTimeSeconds: Math.floor(idleTimeMs / 1000),
          reason: 'idle_timeout'
        });
        
        // Close the SSE connection
        const conn = this.sseManager.getConnectionInfo(connectionId);
        if (conn) {
          try {
            conn.res.end();
          } catch (err) {
            console.error('[FormUpdateNotifier] Error closing idle connection:', {
              timestamp,
              connectionId,
              formId,
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }
        
        // Unregister the connection
        this.unregisterPreviewConnection(connectionId);
      }
      
      console.log('[FormUpdateNotifier] Idle connection cleanup complete:', {
        timestamp,
        cleanedCount: idleConnections.length,
        action: 'cleanup_complete'
      });
    }
  }

  /**
   * Update activity timestamp for a connection
   */
  updateActivity(connectionId: string): void {
    if (this.connectionActivity.has(connectionId)) {
      this.connectionActivity.set(connectionId, new Date());
    }
  }

  /**
   * Cleanup all pending notifications and registrations
   * Call this during server shutdown
   */
  cleanup(): void {
    console.log(`[FormUpdateNotifier] Cleaning up ${this.pendingNotifications.size} pending notification(s)`);
    
    // Stop idle cleanup timer
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
    
    // Clear all pending timeouts
    for (const timeout of this.pendingNotifications.values()) {
      clearTimeout(timeout);
    }
    
    this.pendingNotifications.clear();
    this.formWatchers.clear();
    this.connectionForms.clear();
    this.connectionActivity.clear();
    
    console.log('[FormUpdateNotifier] Cleanup complete');
  }

  /**
   * Get statistics about active watchers
   */
  getStats(): { totalForms: number; totalConnections: number; connectionsPerForm: Map<string, number> } {
    const connectionsPerForm = new Map<string, number>();
    
    for (const [formId, watchers] of this.formWatchers.entries()) {
      connectionsPerForm.set(formId, watchers.size);
    }

    return {
      totalForms: this.formWatchers.size,
      totalConnections: this.connectionForms.size,
      connectionsPerForm
    };
  }

  /**
   * Get detailed metrics for monitoring
   * Requirements: 6.4 - Add metrics tracking for active connections
   */
  getMetrics(): {
    activeConnections: number;
    activeForms: number;
    pendingNotifications: number;
    connectionsByForm: Record<string, number>;
    oldestConnection: Date | null;
    newestConnection: Date | null;
  } {
    const connectionsByForm: Record<string, number> = {};
    
    for (const [formId, watchers] of this.formWatchers.entries()) {
      connectionsByForm[formId] = watchers.size;
    }

    let oldestConnection: Date | null = null;
    let newestConnection: Date | null = null;

    for (const timestamp of this.connectionActivity.values()) {
      if (!oldestConnection || timestamp < oldestConnection) {
        oldestConnection = timestamp;
      }
      if (!newestConnection || timestamp > newestConnection) {
        newestConnection = timestamp;
      }
    }

    return {
      activeConnections: this.connectionForms.size,
      activeForms: this.formWatchers.size,
      pendingNotifications: this.pendingNotifications.size,
      connectionsByForm,
      oldestConnection,
      newestConnection
    };
  }

  /**
   * Log current metrics for monitoring
   * Requirements: 6.4 - Add metrics tracking for active connections
   */
  logMetrics(): void {
    const metrics = this.getMetrics();
    
    console.log('[FormUpdateNotifier] Metrics:', {
      timestamp: new Date().toISOString(),
      activeConnections: metrics.activeConnections,
      activeForms: metrics.activeForms,
      pendingNotifications: metrics.pendingNotifications,
      connectionsByForm: metrics.connectionsByForm,
      oldestConnectionAge: metrics.oldestConnection 
        ? Math.floor((Date.now() - metrics.oldestConnection.getTime()) / 1000) + 's'
        : 'N/A'
    });
  }
}
