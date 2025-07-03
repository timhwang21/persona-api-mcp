/**
 * Persona API MCP Server Implementation
 * 
 * This module implements the main MCP server that exposes Persona API
 * functionality as tools and resources, optimized for Claude Code usage.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequest, ListResourcesRequest, ReadResourceRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { handleError, MCPError } from '../utils/errors.js';
import { resourceManager } from '../resources/manager.js';

// Import inquiry tools
import { 
  initializeInquiryTools,
  getInquiryToolDefinitions,
  executeInquiryTool,
} from '../tools/inquiry/generated.js';

/**
 * MCP Server for Persona API
 */
export class PersonaMCPServer {
  private readonly mcpServer: McpServer;
  private readonly config = getConfig();

  constructor() {
    this.mcpServer = new McpServer({
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
   * Initialize the server (async setup)
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing MCP server...');
      
      // Initialize generated tools from OpenAPI
      await initializeInquiryTools();
      
      logger.info('MCP server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MCP server', error as Error);
      throw error;
    }
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.mcpServer.setRequestHandler('tools/list', async () => {
      try {
        const inquiryTools = getInquiryToolDefinitions();
        
        return {
          tools: inquiryTools,
        };
      } catch (error) {
        logger.error('Failed to list tools', error as Error);
        // Fallback to empty tools list
        return { tools: [] };
      }
    });

    // Handle tool execution
    this.mcpServer.setRequestHandler('tools/call', async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      logger.logToolExecution(name, 0, false, { arguments: args });

      try {
        // Use the generated tool factory to execute tools
        return await executeInquiryTool(name, args);
      } catch (error) {
        handleError(error as Error, { tool: name, arguments: args });
        throw error;
      }
    });

    // List available resources
    this.mcpServer.setRequestHandler('resources/list', async (request: ListResourcesRequest) => {
      try {
        return {
          resources: await resourceManager.listResources(),
        };
      } catch (error) {
        handleError(error as Error, { handler: 'resources/list' });
        throw new MCPError('Failed to list resources');
      }
    });

    // Read resource content
    this.mcpServer.setRequestHandler('resources/read', async (request: ReadResourceRequest) => {
      try {
        return await resourceManager.readResource(request);
      } catch (error) {
        handleError(error as Error, { 
          handler: 'resources/read',
          uri: request.uri,
        });
        throw error; // Re-throw to preserve error type (e.g., NotFoundError)
      }
    });

    // List available prompts
    this.mcpServer.setRequestHandler('prompts/list', async () => {
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
    });

    // Handle prompt execution
    this.mcpServer.setRequestHandler('prompts/get', async (request) => {
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
    });
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
  get server(): McpServer {
    return this.mcpServer;
  }

  /**
   * Connect to a transport
   */
  async connect(transport: any): Promise<void> {
    try {
      await this.mcpServer.connect(transport);
      logger.info('MCP Server connected successfully', {
        transport: transport.constructor.name,
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