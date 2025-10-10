/**
 * Security Middleware
 * CORS, Helmet (security headers), and rate limiting
 */

import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { HttpConfig } from '../config/http-config.js';

/**
 * Create CORS middleware
 * Allow all origins (CORS enforcement disabled)
 */
export function createCorsMiddleware(_config: HttpConfig) {
  return cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Connection-ID'],
    exposedHeaders: ['X-Connection-ID']
  });
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
