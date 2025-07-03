/**
 * Configuration management for Persona API MCP Server
 * 
 * This module handles all configuration settings for the MCP server,
 * including API credentials, caching settings, and runtime options.
 */

import { z } from 'zod';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file in project root
// current directory would be in dist/server
config({ path: join(__dirname, '../../.env') });

/**
 * Configuration schema validation using Zod
 */
const ConfigSchema = z.object({
  // Persona API Configuration
  persona: z.object({
    apiKey: z.string().min(1, 'Persona API key is required'),
    apiUrl: z.string().url().default('http://localhost:3000/api/v1'),
    timeout: z.number().positive().default(30000), // 30 seconds
    retries: z.number().min(0).default(3),
    retryDelay: z.number().positive().default(1000), // 1 second
  }),

  // Server Configuration
  server: z.object({
    name: z.string().default('persona-api-mcp'),
    version: z.string().default('1.0.0'),
    description: z.string().default('MCP server for Persona API integration'),
  }),

  // Caching Configuration
  cache: z.object({
    ttl: z.number().positive().default(300), // 5 minutes
    maxSize: z.number().positive().default(1000), // Max cached items
    enabled: z.boolean().default(true),
  }),

  // Logging Configuration
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'text']).default('json'),
    enableRequestLogging: z.boolean().default(true),
  }),

  // Environment Configuration
  environment: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from environment variables and defaults
 */
export function loadConfig(): Config {
  const rawConfig = {
    persona: {
      apiKey: process.env.PERSONA_API_KEY || '',
      apiUrl: process.env.PERSONA_API_URL,
      timeout: process.env.PERSONA_API_TIMEOUT ? parseInt(process.env.PERSONA_API_TIMEOUT, 10) : undefined,
      retries: process.env.PERSONA_API_RETRIES ? parseInt(process.env.PERSONA_API_RETRIES, 10) : undefined,
      retryDelay: process.env.PERSONA_API_RETRY_DELAY ? parseInt(process.env.PERSONA_API_RETRY_DELAY, 10) : undefined,
    },
    server: {
      name: process.env.MCP_SERVER_NAME,
      version: process.env.MCP_SERVER_VERSION,
      description: process.env.MCP_SERVER_DESCRIPTION,
    },
    cache: {
      ttl: process.env.CACHE_TTL ? parseInt(process.env.CACHE_TTL, 10) : undefined,
      maxSize: process.env.CACHE_MAX_SIZE ? parseInt(process.env.CACHE_MAX_SIZE, 10) : undefined,
      enabled: process.env.CACHE_ENABLED ? process.env.CACHE_ENABLED === 'true' : undefined,
    },
    logging: {
      level: process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | undefined,
      format: process.env.LOG_FORMAT as 'json' | 'text' | undefined,
      enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING ? process.env.ENABLE_REQUEST_LOGGING === 'true' : undefined,
    },
    environment: process.env.NODE_ENV as 'development' | 'production' | 'test' | undefined,
  };

  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      throw new Error(`Configuration validation failed: ${errorMessages}`);
    }
    throw error;
  }
}

/**
 * Validate that all required configuration is present
 */
export function validateConfig(config: Config): void {
  if (!config.persona.apiKey) {
    throw new Error('PERSONA_API_KEY environment variable is required');
  }

  // Additional validation logic can be added here
  if (config.environment === 'production' && config.logging.level === 'debug') {
    console.warn('WARNING: Debug logging is enabled in production environment');
  }
}

/**
 * Get the current configuration instance
 */
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
    validateConfig(configInstance);
  }
  return configInstance;
}

/**
 * Reset configuration (useful for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}
