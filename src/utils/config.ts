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

const ConfigSchema = z.object({
  persona: z.object({
    apiKey: z.string().min(1, 'Persona API key is required'),
    apiUrl: z.string().url().default('http://localhost:3000/api/v1'),
    timeout: z.number().positive().default(30000),
    retries: z.number().min(0).default(3),
    retryDelay: z.number().positive().default(1000),
  }),
  server: z.object({
    name: z.string().default('persona-api-mcp'),
    version: z.string().default('1.0.0'),
    description: z.string().default('MCP server for Persona API integration'),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'text']).default('json'),
    enableRequestLogging: z.boolean().default(true),
  }),
  environment: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
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

export function validateConfig(config: Config): void {
  if (!config.persona.apiKey) {
    throw new Error('PERSONA_API_KEY environment variable is required');
  }
  if (config.environment === 'production' && config.logging.level === 'debug') {
    console.error('WARNING: Debug logging is enabled in production environment');
  }
}

let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
    validateConfig(configInstance);
  }
  return configInstance;
}

