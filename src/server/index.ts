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
  
  // Use stderr for banner to avoid interfering with MCP stdio protocol
  console.error(`
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

    // Log comprehensive usage information
    logger.info('📋 Persona API MCP Server - Usage Guide', {
      description: 'Universal MCP server for full CRUD operations on ALL Persona API resources',
      architecture: {
        resources: 'Read operations (GET) - Access data via persona:// URIs',
        tools: 'Write operations (POST/PATCH/DELETE) - Perform actions that change state',
        prompts: 'AI assistance - Inquiry analysis and troubleshooting workflows'
      },
      
      // Resource patterns for reading data
      resources: {
        description: 'Read any resource data using persona:// URIs',
        patterns: [
          'persona://accounts - List all accounts',
          'persona://accounts/acc_123 - Get specific account',
          'persona://inquiries - List all inquiries', 
          'persona://inquiries/inq_456 - Get specific inquiry',
          'persona://verifications - List verifications',
          'persona://reports - List reports',
          'persona://transactions - List transactions',
          'persona://cases - List cases',
          'persona://devices - List devices',
          'persona://documents - List documents',
          'persona://webhooks - List webhooks'
        ]
      },
      
      // Tool patterns for state-changing operations
      tools: {
        description: 'Perform CRUD operations on any resource',
        create: 'account_create, inquiry_create, verification_create, case_create, etc.',
        update: 'account_update, inquiry_update, transaction_update, etc.',
        redact: 'account_redact, inquiry_redact (permanent PII deletion)',
        actions: 'account_add_tag, inquiry_approve, report_dismiss, webhook_rotate_secret, etc.',
        note: 'All tools auto-generated from OpenAPI - supports every Persona API operation',
        parameterGuide: {
          format: 'Pass ONLY the actual attribute values as individual fields',
          structure: 'Do NOT wrap in "data" or "attributes" - MCP handles API structure automatically',
          naming: 'Use camelCase (e.g., inquiryTemplateId, not inquiry-template-id)',
          ids: 'ID formats: inq_xxx (inquiries), acc_xxx (accounts), itmpl_xxx (templates)',
          reference: 'Check openapi://openapi.yaml for detailed parameter schemas'
        }
      },
      
      // Built-in prompts for AI assistance
      prompts: {
        inquiry_analysis: 'Comprehensive inquiry status and risk analysis',
        inquiry_review: 'Security, completeness, and compliance review',
        inquiry_troubleshooting: 'Help resolve inquiry issues and blockers'
      },
      
      examples: {
        read_data: 'Ask: "Show me the last 5 inquiries" (uses resources)',
        create_correct: 'inquiry_create with {inquiryTemplateId: "itmpl_xxx", fields: {nameFirst: "John", nameLast: "Doe"}} - user data in fields!',
        update_correct: 'account_update with {accountId: "acc_123", email: "new@email.com"} - just the attributes!',
        analyze: 'Ask: "Analyze inquiry inq_456 for compliance issues" (uses prompts)',
        wrong_data_string: 'WRONG: {data: "{\\"inquiryTemplateId\\": \\"itmpl_xxx\\"}"}',
        wrong_data_object: 'WRONG: {data: {attributes: {inquiryTemplateId: "itmpl_xxx"}}}',
        explanation: 'The MCP automatically wraps your parameters in {data: {attributes: {your_params}}} format'
      }
    });

  } catch (error) {
    handleError(error as Error, { phase: 'startup' });
    
    logger.error('Failed to start server', error as Error);
    
    // Print user-friendly error message to stderr
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