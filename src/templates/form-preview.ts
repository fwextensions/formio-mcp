/**
 * HTML Template Generator for Form Preview
 */

import { FormioForm } from '../types/formio.js';

export interface FormPreviewTemplateData {
    formJson: FormioForm;
    formTitle: string;
    formPath: string;
    formId: string;
}

export interface ErrorTemplateData {
    title: string;
    message: string;
    details?: string;
}

/**
 * Escapes HTML special characters to prevent XSS attacks
 */
function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Reads the FormPreviewClient JavaScript code
 */
function getFormPreviewClientScript(): string {
    // Inline the FormPreviewClient class
    return `
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
   * Requirements: 2.1, 2.2
   */
  connectToUpdates() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.isManualDisconnect = false;
    this.updateConnectionState('connecting');

    const url = '/preview-updates/' + encodeURIComponent(this.formId);
    
    try {
      this.eventSource = new EventSource(url);
      
      // Handle successful connection
      this.eventSource.addEventListener('open', this.handleConnectionOpen.bind(this));
      
      // Handle form update events
      this.eventSource.addEventListener('form-update', this.handleUpdateEvent.bind(this));
      
      // Handle form deleted events
      this.eventSource.addEventListener('form-deleted', this.handleDeletedEvent.bind(this));
      
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
   */
  handleConnectionOpen() {
    console.log('Preview updates connection established for form:', this.formId);
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    this.updateConnectionState('connected');
  }

  /**
   * Handles form update events and triggers page refresh
   * Requirements: 3.1, 3.2, 3.5
   */
  async handleUpdateEvent(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('Form update received:', data);
      
      // Show update indicator before refresh
      this.showUpdateIndicator();
      
      // Wait a brief moment for the indicator to be visible
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Trigger page refresh to show updated form
      // Requirements: 3.1, 3.2 - Fetch latest form and re-render
      window.location.reload();
      
    } catch (error) {
      console.error('Error handling update event:', error);
    }
  }

  /**
   * Handles form deleted events
   * Requirements: 3.6
   */
  handleDeletedEvent(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('Form deleted:', data);
      
      // Close the connection
      this.disconnect();
      
      // Show form deleted message
      this.showFormDeletedMessage();
      
    } catch (error) {
      console.error('Error handling deleted event:', error);
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
   * Handles connection errors with exponential backoff
   * Requirements: 2.3, 2.4, 5.2
   */
  handleConnectionError(error) {
    console.error('SSE connection error:', error);
    
    // Check if this is a manual disconnect
    if (this.isManualDisconnect) {
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
        this.updateConnectionState('disconnected');
        this.showReconnectButton();
      }
    }
  }

  /**
   * Reconnects with exponential backoff
   * Requirements: 2.3, 5.2
   */
  reconnectWithBackoff() {
    this.reconnectAttempts++;
    
    console.log(
      'Attempting to reconnect (' + this.reconnectAttempts + '/' + this.maxReconnectAttempts + ') in ' + this.reconnectDelay + 'ms...'
    );
    
    setTimeout(() => {
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
    indicator.className = 'connection-indicator connection-' + this.connectionState;
    
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
    toast.innerHTML = 
      '<div class="update-toast-content">' +
      '<span class="update-toast-icon">🔄</span>' +
      '<span class="update-toast-message">Form updated - Refreshing...</span>' +
      '</div>';
    
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(function() {
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
      container.innerHTML = 
        '<div class="form-deleted-message">' +
        '<div class="form-deleted-icon">🗑️</div>' +
        '<h2>Form Deleted</h2>' +
        '<p>This form has been deleted and is no longer available.</p>' +
        '<p class="form-deleted-details">' +
        '<strong>Form ID:</strong> ' + this.escapeHtml(this.formId) + '<br>' +
        '<strong>Path:</strong> ' + this.escapeHtml(this.formPath) +
        '</p>' +
        '</div>';
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
    
    reconnectUI.innerHTML = 
      '<div class="reconnect-content">' +
      '<div class="reconnect-icon">⚠️</div>' +
      '<h3>Connection Lost</h3>' +
      '<p>Unable to connect to the server. Live updates are disabled.</p>' +
      '<button id="manual-reconnect-btn" class="reconnect-button">' +
      'Reconnect' +
      '</button>' +
      '</div>';
    
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
   * Requirements: 2.5
   */
  disconnect() {
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
`;
}

/**
 * Renders the form preview HTML page
 */
export function renderFormPreviewTemplate(data: FormPreviewTemplateData): string {
    const { formJson, formTitle, formPath, formId } = data;

    // Escape user-provided strings to prevent XSS
    const safeTitle = escapeHtml(formTitle);
    const safePath = escapeHtml(formPath);
    const safeId = escapeHtml(formId);

    // Serialize form JSON for embedding (JSON.stringify handles escaping)
    const formJsonString = JSON.stringify(formJson);
    
    // Get the FormPreviewClient script
    const formPreviewClientScript = getFormPreviewClientScript();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Form Preview: ${safeTitle}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdn.form.io/formiojs/formio.full.min.css">
  <link rel="stylesheet" href="/public/css/form-preview.css">
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${safeTitle}</h1>
      <div class="meta">
        <span class="meta-item"><span class="meta-label">Path:</span> ${safePath}</span>
        <span class="meta-item"><span class="meta-label">ID:</span> ${safeId}</span>
      </div>
    </div>
    
    <div class="preview-notice">
      <strong>Preview Mode:</strong> This is a read-only preview. Form submissions are disabled.
    </div>
    
    <div id="formio-container"></div>
  </div>
  
  <script src="https://cdn.form.io/formiojs/formio.full.min.js"></script>
  <script>
    ${formPreviewClientScript}
  </script>
  <script>
    (function() {
      'use strict';
      
      const formDefinition = ${formJsonString};
      
      // Initialize FormPreviewClient with formId and formPath
      const previewClient = new FormPreviewClient('${safeId}', '${safePath}');
      
      // Connect to real-time updates on page load
      previewClient.connectToUpdates();
      
      // Cleanup on page unload
      window.addEventListener('beforeunload', function() {
        previewClient.disconnect();
      });
      
      // Also cleanup on unload event
      window.addEventListener('unload', function() {
        previewClient.disconnect();
      });
      
      Formio.createForm(document.getElementById('formio-container'), formDefinition)
        .then(function(form) {
          console.log('Form rendered successfully');
          
          // Handle form submission in preview mode
          form.on('submit', function(submission) {
            console.log('Form submitted (preview mode):', submission);
            alert('This is a preview. Form submission is disabled.');
            return false;
          });
        })
        .catch(function(error) {
          console.error('Error rendering form:', error);
          document.getElementById('formio-container').innerHTML = 
            '<div style="color: #d32f2f; padding: 20px; border: 2px solid #d32f2f; border-radius: 4px; background: #ffebee;">' +
            '<strong style="font-size: 16px;">Error rendering form:</strong><br><br>' +
            '<span style="font-family: monospace; font-size: 14px;">' + escapeErrorMessage(error.message || String(error)) + '</span>' +
            '</div>';
        });
      
      function escapeErrorMessage(msg) {
        const div = document.createElement('div');
        div.textContent = msg;
        return div.innerHTML;
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * Renders an error page for various error scenarios
 */
export function renderErrorTemplate(error: ErrorTemplateData): string {
    const { title, message, details } = error;

    // Escape all user-provided content
    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message);
    const safeDetails = details ? escapeHtml(details) : null;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Form Preview</title>
  <style>
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
      line-height: 1.6;
    }
    
    .error-container {
      max-width: 600px;
      margin: 50px auto;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      text-align: center;
    }
    
    .error-icon {
      font-size: 64px;
      margin-bottom: 20px;
      line-height: 1;
    }
    
    h1 {
      color: #d32f2f;
      margin: 0 0 15px 0;
      font-size: 28px;
      font-weight: 600;
    }
    
    .message {
      color: #666;
      margin: 20px 0;
      font-size: 16px;
      line-height: 1.6;
    }
    
    .details {
      background: #f5f5f5;
      padding: 20px;
      border-radius: 4px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      margin-top: 25px;
      text-align: left;
      color: #333;
      border: 1px solid #e0e0e0;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    
    .details-label {
      font-weight: 600;
      margin-bottom: 10px;
      color: #555;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    
    @media (max-width: 768px) {
      body {
        padding: 10px;
      }
      
      .error-container {
        margin: 20px auto;
        padding: 30px 20px;
      }
      
      .error-icon {
        font-size: 48px;
      }
      
      h1 {
        font-size: 24px;
      }
      
      .message {
        font-size: 15px;
      }
      
      .details {
        font-size: 12px;
        padding: 15px;
      }
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">⚠️</div>
    <h1>${safeTitle}</h1>
    <div class="message">${safeMessage}</div>
    ${safeDetails ? `
    <div class="details">
      <div class="details-label">Technical Details:</div>
      ${safeDetails}
    </div>
    ` : ''}
  </div>
</body>
</html>`;
}
