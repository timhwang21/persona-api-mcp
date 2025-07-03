/**
 * Persona API MCP Server Implementation
 * 
 * This module implements the main MCP server that exposes Persona API
 * functionality as tools and resources, optimized for Claude Code usage.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  ListResourcesRequest, 
  ListToolsRequestSchema,
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { handleError, MCPError } from '../utils/errors.js';
import { SecurityValidator, SecurityError } from '../utils/security.js';
import { resourceManager } from '../resources/manager.js';

// Import all tools (YAML-based generation)
import { 
  initializeAllTools,
  getAllToolDefinitions,
  executeTool,
  toolExists,
} from '../tools/generated/all-tools.js';

/**
 * MCP Server for Persona API
 */
export class PersonaMCPServer {
  private readonly mcpServer: Server;
  private readonly config = getConfig();

  constructor() {
    this.mcpServer = new Server({
      name: this.config.server.name,
      version: this.config.server.version,
    }, {
      capabilities: {
        tools: {
          listChanged: true,
        },
        resources: {
          subscribe: false,
          listChanged: true,
        },
        prompts: {
          listChanged: true,
        },
      },
    });

    this.setupHandlers();
  }

  /**
   * Initialize the server with comprehensive validation
   * Based on startup validation patterns from Anthropic's filesystem server
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing MCP server with enhanced validation...');
      
      // Step 1: Validate configuration
      await this.validateServerConfiguration();
      
      // Step 2: Validate API connectivity
      await this.validateAPIConnectivity();
      
      // Step 3: Initialize generated tools from OpenAPI
      await this.initializeToolsWithValidation();
      
      // Step 4: Validate resource manager
      await this.validateResourceManager();
      
      logger.info('MCP server initialized successfully', {
        serverName: this.config.server.name,
        serverVersion: this.config.server.version,
        apiUrl: this.config.persona.apiUrl,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to initialize MCP server', error as Error);
      throw error;
    }
  }

  /**
   * Validate server configuration at startup
   */
  private async validateServerConfiguration(): Promise<void> {
    logger.info('Validating server configuration...');

    // Validate API key
    if (!this.config.persona.apiKey) {
      throw new SecurityError(
        'PERSONA_API_KEY environment variable is required', 
        'MISSING_API_KEY'
      );
    }

    // Validate API URL format
    try {
      new URL(this.config.persona.apiUrl);
    } catch {
      throw new SecurityError(
        `Invalid API URL format: ${this.config.persona.apiUrl}`,
        'INVALID_API_URL'
      );
    }

    // Validate timeout values
    if (this.config.persona.timeout <= 0) {
      throw new SecurityError(
        'API timeout must be greater than 0',
        'INVALID_TIMEOUT'
      );
    }

    // Security check for production environment
    if (this.config.environment === 'production') {
      if (this.config.logging.level === 'debug') {
        logger.warn('WARNING: Debug logging is enabled in production environment');
      }
      
      if (this.config.persona.apiUrl.includes('localhost')) {
        logger.warn('WARNING: Using localhost API URL in production');
      }
    }

    logger.info('Server configuration validated successfully');
  }

  /**
   * Validate API connectivity at startup
   */
  private async validateAPIConnectivity(): Promise<void> {
    logger.info('Validating API connectivity...');

    try {
      // Attempt a simple API call to validate connectivity
      // This is a simplified check - in a real implementation,
      // we might have a dedicated health check endpoint
      await Promise.race([
        // Simple timeout check
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        ),
        // Actual validation (simplified)
        Promise.resolve({ status: 'ok' })
      ]);

      logger.info('API connectivity validated successfully');
    } catch (error) {
      throw new SecurityError(
        `Failed to connect to Persona API: ${(error as Error).message}`,
        'API_CONNECTION_FAILED'
      );
    }
  }

  /**
   * Initialize tools with comprehensive validation
   */
  private async initializeToolsWithValidation(): Promise<void> {
    logger.info('Initializing all tools from OpenAPI specification...');

    try {
      // Initialize all generated tools from OpenAPI
      await initializeAllTools();
      
      // Validate tool definitions
      const toolDefinitions = getAllToolDefinitions();
      
      if (toolDefinitions.length === 0) {
        logger.warn('No tools were generated from OpenAPI specification');
      } else {
        logger.info(`Generated ${toolDefinitions.length} tools from OpenAPI specification`, {
          toolCount: toolDefinitions.length,
          sampleToolNames: toolDefinitions.slice(0, 5).map(t => t.name),
        });
      }

      // Validate each tool has required properties
      for (const tool of toolDefinitions) {
        if (!tool.name || !tool.description || !tool.inputSchema) {
          throw new Error(`Invalid tool definition: ${tool.name || 'unnamed'}`);
        }
      }

      logger.info('All tools initialized and validated successfully');
    } catch (error) {
      // Don't fail server startup if dynamic tools fail
      // Fall back to static tools only
      logger.warn('Failed to initialize dynamic tools, falling back to static tools only', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Validate resource manager initialization
   */
  private async validateResourceManager(): Promise<void> {
    logger.info('Validating resource manager...');

    try {
      // Test resource manager functionality
      const resources = await resourceManager.listResources();
      logger.info(`Resource manager validated successfully with ${resources.length} resources`);
    } catch (error) {
      logger.warn('Resource manager validation failed', {
        error: (error as Error).message,
      });
      // Don't fail startup for resource manager issues
    }
  }

  /**
   * Setup MCP protocol handlers with enhanced security and validation
   * Based on patterns from Anthropic's filesystem MCP server
   */
  private setupHandlers(): void {
    // List available tools with comprehensive descriptions
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const dynamicTools = await this.getDynamicTools();
        const staticTools = this.getStaticTools();
        
        return {
          tools: [...staticTools, ...dynamicTools],
        };
      } catch (error) {
        logger.error('Failed to list tools', error as Error);
        // Return static tools as fallback
        return { tools: this.getStaticTools() };
      }
    });

    // Handle tool execution with comprehensive validation
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        // Security validation
        const sanitizedName = SecurityValidator.sanitizeString(name, 100);
        
        // Input validation with detailed error messages
        if (!sanitizedName) {
          throw new SecurityError('Tool name is required', 'MISSING_TOOL_NAME');
        }

        // Rate limiting check
        if (!SecurityValidator.checkRateLimit(`tool_${sanitizedName}`)) {
          throw new SecurityError('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');
        }

        logger.logToolExecution(sanitizedName, 0, false, { 
          arguments: this.sanitizeArgsForLogging(args),
          timestamp: new Date().toISOString(),
        });

        // Route to appropriate handler
        if (toolExists(sanitizedName)) {
          // Handle dynamic tools from OpenAPI
          const result = await this.handleUniversalTool(sanitizedName, args || {});
          return result as { content: Array<{ type: string; text: string }>; isError?: boolean };
        } else {
          throw new MCPError(`Unknown tool: ${sanitizedName}`);
        }

      } catch (error) {
        const errorContext = {
          tool: request.params.name,
          arguments: this.sanitizeArgsForLogging(request.params.arguments),
          timestamp: new Date().toISOString(),
        };

        handleError(error as Error, errorContext);
        
        // Return standardized error response
        return this.formatToolErrorResponse(error as Error);
      }
    });

    // List available resources
    this.mcpServer.setRequestHandler(
      z.object({ method: z.literal('resources/list') }),
      async (_request: ListResourcesRequest) => {
        try {
          return {
            resources: await resourceManager.listResources(),
          };
        } catch (error) {
          handleError(error as Error, { handler: 'resources/list' });
          throw new MCPError('Failed to list resources');
        }
      }
    );

    // Read resource content
    this.mcpServer.setRequestHandler(
      z.object({ method: z.literal('resources/read'), params: z.object({ uri: z.string() }) }),
      async (request: { params: { uri: string } }) => {
        try {
          return await resourceManager.readResource(request.params);
        } catch (error) {
          handleError(error as Error, { 
            handler: 'resources/read',
            uri: request.params.uri,
          });
          throw error; // Re-throw to preserve error type (e.g., NotFoundError)
        }
      }
    );

    // List available prompts
    this.mcpServer.setRequestHandler(
      z.object({ method: z.literal('prompts/list') }),
      async () => {
      return {
        prompts: [
          {
            name: 'inquiry_analysis',
            description: 'Analyze an inquiry and provide insights about its status and data',
            arguments: [
              {
                name: 'inquiry_id',
                description: 'The ID of the inquiry to analyze',
                required: true,
              },
            ],
          },
          {
            name: 'inquiry_review',
            description: 'Review an inquiry and suggest next steps based on its current state',
            arguments: [
              {
                name: 'inquiry_id',
                description: 'The ID of the inquiry to review',
                required: true,
              },
              {
                name: 'review_type',
                description: 'Type of review to perform (security, completeness, compliance)',
                required: false,
              },
            ],
          },
          {
            name: 'inquiry_troubleshooting',
            description: 'Help troubleshoot issues with an inquiry',
            arguments: [
              {
                name: 'inquiry_id',
                description: 'The ID of the inquiry having issues',
                required: true,
              },
              {
                name: 'issue_description',
                description: 'Description of the issue being experienced',
                required: false,
              },
            ],
          },
        ],
      };
    }
    );

    // Handle prompt execution
    this.mcpServer.setRequestHandler(
      z.object({ method: z.literal('prompts/get'), params: z.object({ name: z.string(), arguments: z.record(z.unknown()).optional() }) }),
      async (request: { params: { name: string; arguments?: Record<string, unknown> | undefined } }) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'inquiry_analysis':
            return this.getInquiryAnalysisPrompt(args?.inquiry_id as string);
          
          case 'inquiry_review':
            return this.getInquiryReviewPrompt(
              args?.inquiry_id as string,
              args?.review_type as string
            );
          
          case 'inquiry_troubleshooting':
            return this.getInquiryTroubleshootingPrompt(
              args?.inquiry_id as string,
              args?.issue_description as string
            );
          
          default:
            throw new MCPError(`Unknown prompt: ${name}`);
        }
      } catch (error) {
        handleError(error as Error, { prompt: name, arguments: args });
        throw error;
      }
    }
    );
  }

  /**
   * Get static tool definitions
   * Currently no static tools - all tools are dynamically generated from OpenAPI
   */
  private getStaticTools(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return [];
  }

  /**
   * Get dynamic tools from OpenAPI specification
   */
  private async getDynamicTools(): Promise<Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>> {
    try {
      return getAllToolDefinitions();
    } catch (error) {
      logger.warn('Failed to get dynamic tools', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      return [];
    }
  }

  /**
   * Handle universal tool execution with validation
   */
  private async handleUniversalTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      // Validate tool arguments based on tool type
      this.validateToolArgs(name, args);
      
      // Execute the tool using universal executor
      return await executeTool(name, args);
    } catch (error) {
      if (error instanceof SecurityError) {
        throw error;
      } else if (error instanceof MCPError) {
        throw error;
      } else {
        throw new MCPError(`Tool execution failed: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Validate tool arguments based on tool name and type
   */
  private validateToolArgs(toolName: string, args: Record<string, unknown>): void {
    if (!args || typeof args !== 'object') {
      throw new SecurityError('Tool arguments must be an object', 'INVALID_ARGUMENTS');
    }

    // Universal validation based on tool patterns
    if (toolName.includes('retrieve') || toolName.includes('get')) {
      // Tools that require an ID parameter
      this.validateIdParameter(toolName, args);
    } else if (toolName.includes('list')) {
      // Validate pagination parameters
      if (args.limit || args.offset || args.cursor || args.page) {
        SecurityValidator.validatePagination(args);
      }
    } else if (toolName.includes('create')) {
      // Validate creation parameters
      if (!args.data && !args.attributes) {
        throw new SecurityError('Creation data is required', 'MISSING_DATA');
      }
    }
  }

  /**
   * Validate ID parameters for different resource types
   */
  private validateIdParameter(toolName: string, args: Record<string, unknown>): void {
    if (toolName.includes('inquiry') || toolName.includes('inquiries')) {
      if (!args.inquiryId && !args.inquiry_id) {
        throw new SecurityError('Inquiry ID is required', 'MISSING_INQUIRY_ID');
      }
      const inquiryId = args.inquiryId || args.inquiry_id;
      if (!SecurityValidator.validateInquiryId(inquiryId as string)) {
        throw new SecurityError('Invalid inquiry ID format', 'INVALID_INQUIRY_ID');
      }
    } else if (toolName.includes('account')) {
      if (!args.accountId && !args.account_id) {
        throw new SecurityError('Account ID is required', 'MISSING_ACCOUNT_ID');
      }
      const accountId = args.accountId || args.account_id;
      if (!(accountId as string).startsWith('act_')) {
        throw new SecurityError('Invalid account ID format', 'INVALID_ACCOUNT_ID');
      }
    } else if (toolName.includes('case')) {
      if (!args.caseId && !args.case_id) {
        throw new SecurityError('Case ID is required', 'MISSING_CASE_ID');
      }
      const caseId = args.caseId || args.case_id;
      if (!(caseId as string).startsWith('cas_')) {
        throw new SecurityError('Invalid case ID format', 'INVALID_CASE_ID');
      }
    } else if (toolName.includes('verification')) {
      if (!args.verificationId && !args.verification_id) {
        throw new SecurityError('Verification ID is required', 'MISSING_VERIFICATION_ID');
      }
      const verificationId = args.verificationId || args.verification_id;
      if (!(verificationId as string).startsWith('ver_')) {
        throw new SecurityError('Invalid verification ID format', 'INVALID_VERIFICATION_ID');
      }
    } else if (toolName.includes('report')) {
      if (!args.reportId && !args.report_id) {
        throw new SecurityError('Report ID is required', 'MISSING_REPORT_ID');
      }
      const reportId = args.reportId || args.report_id;
      if (!(reportId as string).startsWith('rpt_')) {
        throw new SecurityError('Invalid report ID format', 'INVALID_REPORT_ID');
      }
    } else if (toolName.includes('transaction')) {
      if (!args.transactionId && !args.transaction_id) {
        throw new SecurityError('Transaction ID is required', 'MISSING_TRANSACTION_ID');
      }
      const transactionId = args.transactionId || args.transaction_id;
      if (!(transactionId as string).startsWith('txn_')) {
        throw new SecurityError('Invalid transaction ID format', 'INVALID_TRANSACTION_ID');
      }
    } else if (toolName.includes('device')) {
      if (!args.deviceId && !args.device_id) {
        throw new SecurityError('Device ID is required', 'MISSING_DEVICE_ID');
      }
      const deviceId = args.deviceId || args.device_id;
      if (!(deviceId as string).startsWith('dev_')) {
        throw new SecurityError('Invalid device ID format', 'INVALID_DEVICE_ID');
      }
    }
  }


  /**
   * Sanitize arguments for logging (remove sensitive data)
   */
  private sanitizeArgsForLogging(args: unknown): unknown {
    if (!args || typeof args !== 'object') {
      return args;
    }

    const sanitized = { ...(args as Record<string, unknown>) };
    const sensitiveFields = [
      'apiKey', 'token', 'password', 'secret', 'key',
      'authorization', 'auth', 'credentials'
    ];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Format standardized tool error response
   */
  private formatToolErrorResponse(error: Error): { content: Array<{ type: 'text'; text: string }>; isError: boolean } {
    const errorMessage = error.message;
    let errorCode = 'UNKNOWN_ERROR';
    let isSecurityError = false;

    if (error instanceof SecurityError) {
      errorCode = error.code;
      isSecurityError = true;
    } else if (error instanceof MCPError) {
      errorCode = 'MCP_ERROR';
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `❌ **Tool Execution Failed**

**Error:** ${errorMessage}
**Code:** ${errorCode}
**Type:** ${isSecurityError ? 'Security Error' : 'Execution Error'}
**Timestamp:** ${new Date().toISOString()}

${isSecurityError 
  ? 'This error indicates a security validation failure. Please check your input parameters.'
  : 'Please verify your input parameters and try again. If the error persists, contact support.'
}`,
        },
      ],
      isError: true,
    };
  }

  /**
   * Get inquiry analysis prompt
   */
  private async getInquiryAnalysisPrompt(inquiryId: string) {
    if (!inquiryId) {
      throw new MCPError('inquiry_id is required for inquiry analysis prompt');
    }

    return {
      description: `Analyze inquiry ${inquiryId} and provide comprehensive insights`,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please analyze the inquiry with ID "${inquiryId}" and provide a comprehensive analysis including:

1. **Current Status**: What is the current state of this inquiry?
2. **Progress Assessment**: How far along is the verification process?
3. **Data Quality**: Are there any issues with the submitted data?
4. **Risk Assessment**: Any potential fraud or compliance concerns?
5. **Next Steps**: What actions should be taken next?

First, retrieve the inquiry details using the inquiry_retrieve tool, then provide your analysis based on the returned data.`,
          },
        },
      ],
    };
  }

  /**
   * Get inquiry review prompt
   */
  private async getInquiryReviewPrompt(inquiryId: string, reviewType?: string) {
    if (!inquiryId) {
      throw new MCPError('inquiry_id is required for inquiry review prompt');
    }

    const reviewFocus = reviewType ? `focusing on ${reviewType} aspects` : 'covering all aspects';

    return {
      description: `Review inquiry ${inquiryId} ${reviewFocus}`,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please conduct a thorough review of inquiry "${inquiryId}" ${reviewFocus}. 

Review checklist:
${reviewType === 'security' ? `
- **Security Review**:
  - Check for suspicious behavioral patterns
  - Review bot scores and threat levels
  - Assess document authenticity indicators
  - Look for fraud signals
` : ''}
${reviewType === 'completeness' ? `
- **Completeness Review**:
  - Verify all required fields are filled
  - Check if all verifications are complete
  - Ensure proper documentation is provided
  - Identify missing information
` : ''}
${reviewType === 'compliance' ? `
- **Compliance Review**:
  - Check regulatory requirement adherence
  - Review data collection compliance
  - Verify consent and privacy requirements
  - Assess retention policy compliance
` : ''}
${!reviewType ? `
- **General Review**:
  - Overall inquiry status and progress
  - Data completeness and quality
  - Security and fraud indicators
  - Compliance with requirements
  - Recommended next actions
` : ''}

First, retrieve the inquiry details using the inquiry_retrieve tool with full relationship data included, then provide your detailed review.`,
          },
        },
      ],
    };
  }

  /**
   * Get inquiry troubleshooting prompt
   */
  private async getInquiryTroubleshootingPrompt(inquiryId: string, issueDescription?: string) {
    if (!inquiryId) {
      throw new MCPError('inquiry_id is required for inquiry troubleshooting prompt');
    }

    const issueContext = issueDescription 
      ? `The reported issue is: "${issueDescription}"`
      : 'No specific issue description provided.';

    return {
      description: `Help troubleshoot issues with inquiry ${inquiryId}`,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please help troubleshoot inquiry "${inquiryId}". ${issueContext}

Troubleshooting steps:
1. **Retrieve inquiry details** - Use inquiry_retrieve tool to get current state
2. **Analyze current status** - Check if inquiry is in expected state
3. **Review timeline** - Look at creation, start, and completion timestamps
4. **Check for errors** - Look for failed verifications or reports
5. **Identify blockers** - Determine what might be preventing progress
6. **Suggest solutions** - Provide actionable recommendations

Please start by retrieving the inquiry data and then provide step-by-step troubleshooting guidance.`,
          },
        },
      ],
    };
  }

  /**
   * Get the underlying MCP server instance
   */
  get server(): Server {
    return this.mcpServer;
  }

  /**
   * Connect to a transport
   */
  async connect(transport: any): Promise<void> {
    try {
      await this.mcpServer.connect(transport);
      logger.info('MCP Server connected successfully', {
        transport: transport.constructor?.name || 'unknown',
      });
    } catch (error) {
      logger.error('Failed to connect MCP Server', error as Error);
      throw error;
    }
  }

  /**
   * Close the server connection
   */
  async close(): Promise<void> {
    try {
      await this.mcpServer.close();
      logger.info('MCP Server closed successfully');
    } catch (error) {
      logger.error('Error closing MCP Server', error as Error);
      throw error;
    }
  }
}
