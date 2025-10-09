/**
 * HTTP Server Configuration
 * Handles loading and validation of HTTP transport settings
 */

export interface HttpConfig {
  // Server settings
  port: number;
  host: string;
  basePath: string;

  // Authentication
  apiKeys: string[];
  requireAuth: boolean;

  // CORS
  corsOrigins: string[];

  // Rate limiting
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;

  // SSE
  sseHeartbeatInterval: number;
  sseTimeout: number;
}

/**
 * Load HTTP configuration from environment variables
 */
export function loadHttpConfig(): HttpConfig {
  return {
    // Server settings
    port: parseInt(process.env.MCP_HTTP_PORT || '3000', 10),
    host: process.env.MCP_HTTP_HOST || 'localhost',
    basePath: process.env.MCP_BASE_PATH || '/mcp/v1',

    // Authentication
    apiKeys: (process.env.MCP_API_KEYS || '').split(',').filter(k => k.length > 0),
    requireAuth: process.env.MCP_REQUIRE_AUTH !== 'false',

    // CORS - support wildcard patterns
    corsOrigins: (process.env.MCP_CORS_ORIGINS || 'http://localhost:*').split(','),

    // Rate limiting
    rateLimitWindowMs: parseInt(process.env.MCP_RATE_LIMIT_WINDOW_MS || '60000', 10),
    rateLimitMaxRequests: parseInt(process.env.MCP_RATE_LIMIT_MAX || '100', 10),

    // SSE configuration
    sseHeartbeatInterval: parseInt(process.env.MCP_SSE_HEARTBEAT_MS || '30000', 10),
    sseTimeout: parseInt(process.env.MCP_SSE_TIMEOUT_MS || '300000', 10),
  };
}

/**
 * Validate HTTP configuration
 */
export function validateHttpConfig(config: HttpConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.port < 1 || config.port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }

  if (config.requireAuth && config.apiKeys.length === 0) {
    errors.push('MCP_REQUIRE_AUTH is true but no API keys configured. Set MCP_API_KEYS or disable auth with MCP_REQUIRE_AUTH=false');
  }

  if (config.rateLimitWindowMs < 1000) {
    errors.push('Rate limit window must be at least 1000ms');
  }

  if (config.rateLimitMaxRequests < 1) {
    errors.push('Rate limit max requests must be at least 1');
  }

  if (config.sseHeartbeatInterval < 5000) {
    errors.push('SSE heartbeat interval must be at least 5000ms');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
