#!/usr/bin/env node
/**
 * Persona API MCP Server Entry Point
 * 
 * This is the main entry point for the Persona API MCP server.
 * It sets up the server configuration, transport, and starts the service.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PersonaMCPServer } from './mcp-server.js';
import { logger } from '../utils/logger.js';
import { getConfig, validateConfig } from '../utils/config.js';
import { personaAPI } from '../api/client.js';
import { handleError } from '../utils/errors.js';

/**
 * Server startup banner
 */
function printBanner(): void {
  const config = getConfig();
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                     Persona API MCP Server                   ║
║                                                               ║
║  Version: ${config.server.version.padEnd(8)} Environment: ${config.environment.padEnd(11)}  ║
║  Optimized for Claude Code                                    ║
╚═══════════════════════════════════════════════════════════════╝
`);
}

/**
 * Perform health checks
 */
async function performHealthChecks(): Promise<void> {
  logger.info('Performing health checks...');

  try {
    // Check API connectivity
    await personaAPI.healthCheck();
    logger.info('✅ Persona API connectivity check passed');
  } catch (error) {
    logger.error('❌ Persona API connectivity check failed', error as Error);
    throw error;
  }

  logger.info('All health checks passed');
}

/**
 * Setup graceful shutdown handlers
 */
function setupShutdownHandlers(server: PersonaMCPServer): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    
    try {
      await server.close();
      logger.info('Server closed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', error as Error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', new Error(String(reason)), {
      promise: String(promise),
    });
    process.exit(1);
  });
}

/**
 * Main server startup function
 */
async function main(): Promise<void> {
  try {
    // Print startup banner
    printBanner();

    // Load and validate configuration
    logger.info('Loading configuration...');
    const config = getConfig();
    validateConfig(config);
    logger.info('✅ Configuration loaded and validated');

    // Log configuration (excluding sensitive data)
    logger.info('Server configuration', {
      name: config.server.name,
      version: config.server.version,
      environment: config.environment,
      apiUrl: config.persona.apiUrl,
      cacheEnabled: config.cache.enabled,
      logLevel: config.logging.level,
    });

    // Perform health checks
    if (config.environment === 'production') {
      await performHealthChecks();
    } else {
      logger.info('Skipping health checks in development mode');
    }

    // Create MCP server instance
    logger.info('Creating MCP server...');
    const server = new PersonaMCPServer();
    
    // Initialize server (load OpenAPI specs, etc.)
    logger.info('Initializing MCP server...');
    await server.initialize();
    logger.info('✅ MCP server initialized');

    // Setup graceful shutdown
    setupShutdownHandlers(server);

    // Create transport (stdio for Claude Code compatibility)
    logger.info('Setting up stdio transport...');
    const transport = new StdioServerTransport();
    logger.info('✅ Transport configured');

    // Connect server to transport
    logger.info('Starting MCP server...');
    await server.connect(transport);
    
    logger.info('🚀 Persona API MCP Server is running and ready for connections');
    logger.info('The server is now available for Claude Code to connect to');

    // Log usage information
    logger.info('Usage Information', {
      tools: 'inquiry_create, inquiry_retrieve, inquiry_list',
      resources: 'persona://inquiry/{id}, persona://inquiries',
      prompts: 'inquiry_analysis, inquiry_review, inquiry_troubleshooting',
    });

  } catch (error) {
    handleError(error as Error, { phase: 'startup' });
    
    logger.error('Failed to start server', error as Error);
    
    // Print user-friendly error message
    console.error(`\n❌ Server startup failed: ${(error as Error).message}`);
    console.error('\nPlease check your configuration and try again.');
    console.error('Common issues:');
    console.error('- Missing or invalid PERSONA_API_KEY environment variable');
    console.error('- Network connectivity issues');
    console.error('- Invalid API credentials');
    
    process.exit(1);
  }
}

/**
 * Check if running as main module
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error during startup:', error);
    process.exit(1);
  });
}

export { main };