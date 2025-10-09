/**
 * Authentication Middleware
 * Validates API keys from Authorization header
 */

import { Request, Response, NextFunction } from 'express';
import { HttpConfig } from '../config/http-config.js';

/**
 * Create authentication middleware
 * Validates Bearer token against configured API keys
 */
export function createAuthMiddleware(config: HttpConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip auth if not required (for development/localhost)
    if (!config.requireAuth) {
      return next();
    }

    // Check for Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Missing Authorization header'
        }
      });
    }

    // Extract Bearer token
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Authorization header format. Expected: Bearer <token>'
        }
      });
    }

    const token = match[1];

    // Validate against configured API keys
    if (!config.apiKeys.includes(token)) {
      // Log failed auth attempt (but not the actual token)
      console.warn(`Failed authentication attempt from ${req.ip}`);

      return res.status(403).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid API key'
        }
      });
    }

    // Auth successful - continue to next middleware
    next();
  };
}
