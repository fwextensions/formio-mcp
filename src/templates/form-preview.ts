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

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Form Preview: ${safeTitle}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdn.form.io/formiojs/formio.full.min.css">
  <link rel="stylesheet" href="/public/css/form-preview.css">
  <script src="https://cdn.form.io/formiojs/formio.full.min.js"></script>
  <script src="/public/js/form-preview-client.js"></script>
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
