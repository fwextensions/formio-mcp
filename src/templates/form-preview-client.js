/**
 * FormPreviewClient - Client-side class for managing real-time form preview updates
 * 
 * This class establishes and maintains an SSE connection to receive real-time
 * notifications when forms are updated, created, or deleted through the MCP server.
 */
class FormPreviewClient {
  constructor(formId, formPath) {
    this.formId = formId;
    this.formPath = formPath;
    this.eventSource = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start at 1 second
    this.connectionState = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'reconnecting'
    this.isManualDisconnect = false;
  }

  /**
   * Establishes SSE connection to receive form update notifications
   * Requirements: 2.1, 2.2, 4.4 - Handle SSE not supported by browser
   */
  connectToUpdates() {
    // Check if EventSource is supported by the browser
    // Requirements: 4.4 - Handle SSE not supported by browser
    if (typeof EventSource === 'undefined') {
      console.error('[FormPreviewClient] EventSource not supported:', {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        action: 'sse_not_supported'
      });
      this.showSSENotSupportedMessage();
      return;
    }

    if (this.eventSource) {
      this.eventSource.close();
    }

    this.isManualDisconnect = false;
    this.updateConnectionState('connecting');

    const url = `/preview-updates/${encodeURIComponent(this.formId)}`;
    
    try {
      this.eventSource = new EventSource(url);
      
      // Handle successful connection
      this.eventSource.addEventListener('open', this.handleConnectionOpen.bind(this));
      
      // Handle form update events
      this.eventSource.addEventListener('form-update', this.handleUpdateEvent.bind(this));
      
      // Handle form deleted events
      this.eventSource.addEventListener('form-deleted', this.handleDeletedEvent.bind(this));
      
      // Handle server shutdown events
      // Requirements: 5.5 - Handle server shutdown during active connections
      this.eventSource.addEventListener('closing', this.handleServerClosing.bind(this));
      
      // Handle connection errors
      this.eventSource.addEventListener('error', this.handleConnectionError.bind(this));
      
      // Handle heartbeat events (keep-alive)
      this.eventSource.addEventListener('heartbeat', this.handleHeartbeat.bind(this));
      
    } catch (error) {
      console.error('Failed to create EventSource:', error);
      this.handleConnectionError(error);
    }
  }

  /**
   * Handles successful connection establishment
   * Requirements: 5.1 - Log connection lifecycle
   */
  handleConnectionOpen() {
    console.log('[FormPreviewClient] Connection established:', {
      timestamp: new Date().toISOString(),
      formId: this.formId,
      formPath: this.formPath,
      wasReconnect: this.reconnectAttempts > 0,
      previousAttempts: this.reconnectAttempts,
      state: 'connected'
    });
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    this.updateConnectionState('connected');
  }

  /**
   * Handles form update events and triggers page refresh
   * Requirements: 3.1, 3.2, 3.4, 3.5, 5.1 - Log update events, handle page refresh failures
   */
  async handleUpdateEvent(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('[FormPreviewClient] Form update received:', {
        timestamp: new Date().toISOString(),
        formId: data.formId,
        changeType: data.changeType,
        serverTimestamp: data.timestamp,
        action: 'refresh_pending'
      });
      
      // Show update indicator before refresh
      this.showUpdateIndicator();
      
      // Wait a brief moment for the indicator to be visible
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('[FormPreviewClient] Refreshing page:', {
        timestamp: new Date().toISOString(),
        formId: data.formId,
        action: 'refresh'
      });
      
      // Trigger page refresh to show updated form
      // Requirements: 3.1, 3.2, 3.4 - Fetch latest form and re-render, handle refresh failures
      // Note: Browser handles page refresh failures naturally by showing error pages
      // We wrap in try-catch for defensive programming, but reload() typically doesn't throw
      try {
        window.location.reload();
      } catch (refreshError) {
        // This is extremely rare - reload() typically doesn't throw
        // If it does, log it and show error to user
        console.error('[FormPreviewClient] Page refresh failed:', {
          timestamp: new Date().toISOString(),
          formId: data.formId,
          error: refreshError.message,
          stack: refreshError.stack,
          action: 'refresh_failed'
        });
        
        // Show error message to user
        this.showRefreshErrorMessage();
      }
      
    } catch (error) {
      console.error('[FormPreviewClient] Error handling update event:', {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
      });
      
      // Keep connection alive for future updates
      // Don't disconnect just because one update failed to process
    }
  }

  /**
   * Handles form deleted events
   * Requirements: 3.6, 5.1 - Log form deletion events
   */
  handleDeletedEvent(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('[FormPreviewClient] Form deleted:', {
        timestamp: new Date().toISOString(),
        formId: data.formId,
        serverTimestamp: data.timestamp,
        action: 'form_deleted'
      });
      
      // Close the connection
      this.disconnect();
      
      // Show form deleted message
      this.showFormDeletedMessage();
      
    } catch (error) {
      console.error('[FormPreviewClient] Error handling deleted event:', {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Handles heartbeat events to keep connection alive
   */
  handleHeartbeat(event) {
    // Heartbeat received, connection is alive
    // No action needed, just log for debugging
    console.debug('Heartbeat received');
  }

  /**
   * Handles server shutdown/closing events
   * Requirements: 5.5 - Handle server shutdown during active connections
   */
  handleServerClosing(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('[FormPreviewClient] Server shutting down:', {
        timestamp: new Date().toISOString(),
        message: data.message,
        action: 'server_closing'
      });
      
      // Close the connection
      this.disconnect();
      
      // Show server shutdown message
      this.showServerShutdownMessage();
      
    } catch (error) {
      console.error('[FormPreviewClient] Error handling server closing event:', {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Handles connection errors with exponential backoff
   * Requirements: 2.3, 2.4, 5.1, 5.2 - Log connection errors and reconnections
   */
  handleConnectionError(error) {
    console.error('[FormPreviewClient] Connection error:', {
      timestamp: new Date().toISOString(),
      formId: this.formId,
      readyState: this.eventSource ? this.eventSource.readyState : 'no_source',
      reconnectAttempts: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      error: error ? (error.message || String(error)) : 'unknown',
      action: 'error'
    });
    
    // Check if this is a manual disconnect
    if (this.isManualDisconnect) {
      console.log('[FormPreviewClient] Manual disconnect, skipping reconnect');
      return;
    }
    
    // Check if EventSource is in a closed state
    if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
      this.updateConnectionState('reconnecting');
      
      // Attempt reconnection with exponential backoff
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectWithBackoff();
      } else {
        // Max attempts exceeded
        console.error('[FormPreviewClient] Max reconnection attempts exceeded:', {
          timestamp: new Date().toISOString(),
          formId: this.formId,
          attempts: this.reconnectAttempts,
          maxAttempts: this.maxReconnectAttempts,
          action: 'reconnect_failed'
        });
        this.updateConnectionState('disconnected');
        this.showReconnectButton();
      }
    }
  }

  /**
   * Reconnects with exponential backoff
   * Requirements: 2.3, 5.1, 5.2 - Log reconnection attempts
   */
  reconnectWithBackoff() {
    this.reconnectAttempts++;
    
    console.log('[FormPreviewClient] Reconnection scheduled:', {
      timestamp: new Date().toISOString(),
      formId: this.formId,
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delayMs: this.reconnectDelay,
      delaySeconds: Math.floor(this.reconnectDelay / 1000),
      action: 'reconnect_scheduled'
    });
    
    setTimeout(() => {
      console.log('[FormPreviewClient] Attempting reconnection:', {
        timestamp: new Date().toISOString(),
        formId: this.formId,
        attempt: this.reconnectAttempts,
        action: 'reconnect_attempt'
      });
      
      this.connectToUpdates();
      // Exponential backoff: double the delay for next attempt
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 16000); // Cap at 16 seconds
    }, this.reconnectDelay);
  }

  /**
   * Updates the connection state and UI indicator
   */
  updateConnectionState(newState) {
    this.connectionState = newState;
    this.updateConnectionIndicator();
  }

  /**
   * Updates the connection status indicator in the UI
   * Requirements: 3.5
   */
  updateConnectionIndicator() {
    let indicator = document.getElementById('connection-indicator');
    
    if (!indicator) {
      // Create indicator if it doesn't exist
      indicator = document.createElement('div');
      indicator.id = 'connection-indicator';
      indicator.className = 'connection-indicator';
      document.body.appendChild(indicator);
    }
    
    // Update indicator based on state
    indicator.className = `connection-indicator connection-${this.connectionState}`;
    
    const stateLabels = {
      'disconnected': 'Disconnected',
      'connecting': 'Connecting...',
      'connected': 'Live',
      'reconnecting': 'Reconnecting...'
    };
    
    indicator.textContent = stateLabels[this.connectionState] || this.connectionState;
  }

  /**
   * Shows a visual indicator that the form was updated
   * Requirements: 3.5
   */
  showUpdateIndicator() {
    const toast = document.createElement('div');
    toast.className = 'update-toast';
    toast.innerHTML = `
      <div class="update-toast-content">
        <span class="update-toast-icon">🔄</span>
        <span class="update-toast-message">Form updated - Refreshing...</span>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);
  }

  /**
   * Shows a message that the form has been deleted
   * Requirements: 3.6
   */
  showFormDeletedMessage() {
    const container = document.getElementById('formio-container');
    
    if (container) {
      container.innerHTML = `
        <div class="form-deleted-message">
          <div class="form-deleted-icon">🗑️</div>
          <h2>Form Deleted</h2>
          <p>This form has been deleted and is no longer available.</p>
          <p class="form-deleted-details">
            <strong>Form ID:</strong> ${this.escapeHtml(this.formId)}<br>
            <strong>Path:</strong> ${this.escapeHtml(this.formPath)}
          </p>
        </div>
      `;
    }
  }

  /**
   * Shows a manual reconnect button when auto-reconnect fails
   * Requirements: 2.6, 5.3
   */
  showReconnectButton() {
    let reconnectUI = document.getElementById('reconnect-ui');
    
    if (!reconnectUI) {
      reconnectUI = document.createElement('div');
      reconnectUI.id = 'reconnect-ui';
      reconnectUI.className = 'reconnect-ui';
      document.body.appendChild(reconnectUI);
    }
    
    reconnectUI.innerHTML = `
      <div class="reconnect-content">
        <div class="reconnect-icon">⚠️</div>
        <h3>Connection Lost</h3>
        <p>Unable to connect to the server. Live updates are disabled.</p>
        <button id="manual-reconnect-btn" class="reconnect-button">
          Reconnect
        </button>
      </div>
    `;
    
    reconnectUI.classList.add('show');
    
    // Add click handler for manual reconnect
    const reconnectBtn = document.getElementById('manual-reconnect-btn');
    if (reconnectBtn) {
      reconnectBtn.addEventListener('click', () => {
        this.manualReconnect();
      });
    }
  }

  /**
   * Shows a message when SSE is not supported by the browser
   * Requirements: 4.4 - Handle SSE not supported by browser
   */
  showSSENotSupportedMessage() {
    let notSupportedUI = document.getElementById('sse-not-supported-ui');
    
    if (!notSupportedUI) {
      notSupportedUI = document.createElement('div');
      notSupportedUI.id = 'sse-not-supported-ui';
      notSupportedUI.className = 'reconnect-ui'; // Reuse same styling
      document.body.appendChild(notSupportedUI);
    }
    
    notSupportedUI.innerHTML = `
      <div class="reconnect-content">
        <div class="reconnect-icon">⚠️</div>
        <h3>Live Updates Not Supported</h3>
        <p>Your browser does not support Server-Sent Events (SSE). Live form updates are disabled.</p>
        <p class="browser-info">Please use a modern browser like Chrome, Firefox, Safari, or Edge.</p>
        <button id="refresh-page-btn" class="reconnect-button">
          Refresh Page
        </button>
      </div>
    `;
    
    notSupportedUI.classList.add('show');
    
    // Add click handler for manual page refresh
    const refreshBtn = document.getElementById('refresh-page-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        window.location.reload();
      });
    }
    
    // Update connection state
    this.updateConnectionState('disconnected');
  }

  /**
   * Shows a message when the server is shutting down
   * Requirements: 5.5 - Handle server shutdown during active connections
   */
  showServerShutdownMessage() {
    let shutdownUI = document.getElementById('server-shutdown-ui');
    
    if (!shutdownUI) {
      shutdownUI = document.createElement('div');
      shutdownUI.id = 'server-shutdown-ui';
      shutdownUI.className = 'reconnect-ui'; // Reuse same styling
      document.body.appendChild(shutdownUI);
    }
    
    shutdownUI.innerHTML = `
      <div class="reconnect-content">
        <div class="reconnect-icon">🔄</div>
        <h3>Server Shutting Down</h3>
        <p>The server is shutting down. Live form updates are temporarily unavailable.</p>
        <p class="browser-info">The server will reconnect automatically when it restarts.</p>
        <button id="retry-connection-btn" class="reconnect-button">
          Retry Connection
        </button>
      </div>
    `;
    
    shutdownUI.classList.add('show');
    
    // Add click handler for retry
    const retryBtn = document.getElementById('retry-connection-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        shutdownUI.classList.remove('show');
        this.manualReconnect();
      });
    }
    
    // Update connection state
    this.updateConnectionState('disconnected');
  }

  /**
   * Shows an error message when page refresh fails
   * Requirements: 3.4 - Handle page refresh failures
   */
  showRefreshErrorMessage() {
    let errorUI = document.getElementById('refresh-error-ui');
    
    if (!errorUI) {
      errorUI = document.createElement('div');
      errorUI.id = 'refresh-error-ui';
      errorUI.className = 'reconnect-ui'; // Reuse same styling
      document.body.appendChild(errorUI);
    }
    
    errorUI.innerHTML = `
      <div class="reconnect-content">
        <div class="reconnect-icon">⚠️</div>
        <h3>Refresh Failed</h3>
        <p>Unable to refresh the page to show the updated form.</p>
        <p class="browser-info">Please try refreshing manually using your browser's refresh button.</p>
        <button id="manual-refresh-btn" class="reconnect-button">
          Refresh Now
        </button>
      </div>
    `;
    
    errorUI.classList.add('show');
    
    // Add click handler for manual refresh
    const refreshBtn = document.getElementById('manual-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        window.location.reload();
      });
    }
  }

  /**
   * Handles manual reconnection attempt
   */
  manualReconnect() {
    // Reset reconnection state
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    
    // Hide reconnect UI
    const reconnectUI = document.getElementById('reconnect-ui');
    if (reconnectUI) {
      reconnectUI.classList.remove('show');
    }
    
    // Attempt to reconnect
    this.connectToUpdates();
  }

  /**
   * Cleanly disconnects from the SSE endpoint
   * Requirements: 2.5, 5.1 - Log connection lifecycle
   */
  disconnect() {
    console.log('[FormPreviewClient] Disconnecting:', {
      timestamp: new Date().toISOString(),
      formId: this.formId,
      wasConnected: this.connectionState === 'connected',
      action: 'disconnect'
    });
    
    this.isManualDisconnect = true;
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.updateConnectionState('disconnected');
  }

  /**
   * Escapes HTML to prevent XSS
   */
  escapeHtml(unsafe) {
    const div = document.createElement('div');
    div.textContent = unsafe;
    return div.innerHTML;
  }
}

// Export for use in template
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormPreviewClient;
}
