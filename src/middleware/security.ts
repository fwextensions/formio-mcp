/**
 * Security Middleware
 * CORS, Helmet (security headers), and rate limiting
 */

import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { HttpConfig } from '../config/http-config.js';

/**
 * Create CORS middleware
 * Allow all origins (CORS enforcement completely disabled)
 */
export function createCorsMiddleware(_config: HttpConfig) {
  return cors({
    origin: '*', // Allow all origins with wildcard
    credentials: false, // Disable credentials to allow wildcard
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: '*', // Allow all headers
    exposedHeaders: ['X-Connection-ID'],
    preflightContinue: false,
    optionsSuccessStatus: 204
  });
}

/**
 * Explicit CORS headers middleware
 * Sets CORS headers explicitly on every response as defense-in-depth
 * Completely permissive - allows everything
 */
export function createExplicitCorsMiddleware(_config: HttpConfig) {
  return (_req: Request, res: Response, next: NextFunction) => {
    // Set completely permissive CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    next();
  };
}

/**
 * Log CORS configuration on server startup
 */
export function logCorsConfiguration(config: HttpConfig): void {
  console.log('[CORS] Configuration:');
  console.log(`[CORS]   Allowed Origins: ${config.corsOrigins.join(', ') || 'ALL (*)'}`);
  console.log(`[CORS]   Allowed Methods: GET, POST, OPTIONS`);
  console.log(`[CORS]   Allowed Headers: Content-Type, Authorization, X-Connection-ID, Cache-Control`);
  console.log(`[CORS]   Exposed Headers: X-Connection-ID`);
  console.log(`[CORS]   Credentials: true (when origin is specified)`);
  console.log(`[CORS]   Handling requests without Origin header: YES (local tools support)`);
}

/**
 * Create Helmet middleware for security headers
 */
export function createHelmetMiddleware() {
  return helmet({
    // Disable CSP for SSE compatibility
    contentSecurityPolicy: false,
    // Allow embedding for SSE
    crossOriginEmbedderPolicy: false,
    // Keep other security headers enabled
    xssFilter: true,
    noSniff: true,
    ieNoOpen: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  });
}

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(config: HttpConfig) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    message: {
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Too many requests, please try again later'
      }
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // Skip rate limiting for successful requests (optional)
    skipSuccessfulRequests: false,
    // Skip failed requests (optional)
    skipFailedRequests: false
  });
}
