/**
 * Error Handler Middleware
 * Global error handler for Express - must be registered last
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Global error handler
 * Catches any errors that weren't handled by route handlers
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log the error for debugging
  console.error('Express error handler caught:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  // Determine status code
  let statusCode = 500;
  let errorCode = -32603; // JSON-RPC internal error

  // Handle specific error types
  if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = -32600;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = -32602;
  } else if (err.message.includes('CORS')) {
    statusCode = 403;
    errorCode = -32600;
  }

  // Send JSON-RPC formatted error response
  res.status(statusCode).json({
    jsonrpc: '2.0',
    error: {
      code: errorCode,
      message: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
      data: process.env.NODE_ENV === 'development' ? {
        stack: err.stack,
        path: req.path
      } : undefined
    }
  });
}

/**
 * 404 Not Found handler
 * Should be registered before the error handler
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    jsonrpc: '2.0',
    error: {
      code: -32601,
      message: `Method not found: ${req.method} ${req.path}`
    }
  });
}
