import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Comprehensive logging middleware for debugging HTTP requests and responses
 * Logs request headers, response headers, and request bodies with request IDs for traceability
 */
export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Generate unique request ID for traceability
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();
  
  // Store request ID on request object for use in other middleware
  (req as any).requestId = requestId;
  
  // Log request details
  console.log('\n' + '='.repeat(80));
  console.log(`[${timestamp}] [${requestId}] Incoming Request`);
  console.log('='.repeat(80));
  console.log(`Method: ${req.method}`);
  console.log(`Path: ${req.path}`);
  console.log(`URL: ${req.url}`);
  
  // Log all request headers
  console.log('\nRequest Headers:');
  Object.entries(req.headers).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  
  // Highlight CORS-specific headers
  console.log('\nCORS-Specific Headers:');
  console.log(`  Origin: ${req.headers.origin || '(not set)'}`);
  console.log(`  Access-Control-Request-Method: ${req.headers['access-control-request-method'] || '(not set)'}`);
  console.log(`  Access-Control-Request-Headers: ${req.headers['access-control-request-headers'] || '(not set)'}`);
  
  // Log request body for POST requests
  if (req.method === 'POST' && req.body) {
    console.log('\nRequest Body:');
    const bodyStr = JSON.stringify(req.body, null, 2);
    // Truncate large payloads (> 1000 characters)
    if (bodyStr.length > 1000) {
      console.log(bodyStr.substring(0, 1000) + '\n... (truncated)');
    } else {
      console.log(bodyStr);
    }
  }
  
  // Intercept response to log headers being set
  const originalSetHeader = res.setHeader.bind(res);
  const headersSet: Record<string, string | number | string[]> = {};
  
  res.setHeader = function(name: string, value: string | number | readonly string[]): Response {
    headersSet[name] = value as string | number | string[];
    return originalSetHeader(name, value);
  };
  
  // Log response when it's finished
  res.on('finish', () => {
    const responseTimestamp = new Date().toISOString();
    console.log('\n' + '-'.repeat(80));
    console.log(`[${responseTimestamp}] [${requestId}] Response Sent`);
    console.log('-'.repeat(80));
    console.log(`Status: ${res.statusCode}`);
    
    // Log all response headers
    console.log('\nResponse Headers:');
    const responseHeaders = res.getHeaders();
    Object.entries(responseHeaders).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
    
    // Highlight CORS-specific response headers
    console.log('\nCORS Response Headers:');
    console.log(`  Access-Control-Allow-Origin: ${responseHeaders['access-control-allow-origin'] || '(not set)'}`);
    console.log(`  Access-Control-Allow-Methods: ${responseHeaders['access-control-allow-methods'] || '(not set)'}`);
    console.log(`  Access-Control-Allow-Headers: ${responseHeaders['access-control-allow-headers'] || '(not set)'}`);
    console.log(`  Access-Control-Expose-Headers: ${responseHeaders['access-control-expose-headers'] || '(not set)'}`);
    console.log(`  Access-Control-Allow-Credentials: ${responseHeaders['access-control-allow-credentials'] || '(not set)'}`);
    console.log('='.repeat(80) + '\n');
  });
  
  next();
}
