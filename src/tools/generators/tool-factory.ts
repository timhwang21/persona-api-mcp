/**
 * Tool Factory for generating MCP tools from OpenAPI specifications
 * 
 * This module automatically generates MCP tool definitions and handlers
 * from parsed OpenAPI operations, eliminating manual schema maintenance.
 */

import { z } from 'zod';
import { openAPIParser, ParsedAPI, ParsedOperation, ParsedSchema, ParsedParameter } from './openapi-parser.js';
import { personaAPI } from '../../api/client.js';
import { resourceManager } from '../../resources/manager.js';
import { logger, createTimer } from '../../utils/logger.js';
import { handleError, ValidationError } from '../../utils/errors.js';

export interface GeneratedTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (input: any) => Promise<any>;
}

export interface ToolGenerationOptions {
  includeOptionalParams?: boolean;
  validateResponses?: boolean;
  cacheResponses?: boolean;
  includeExamples?: boolean;
}

/**
 * Tool Factory class for generating MCP tools from OpenAPI specs
 */
export class ToolFactory {
  private api: ParsedAPI | null = null;

  /**
   * Initialize the factory by loading the OpenAPI specification
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Tool Factory...');
      this.api = await openAPIParser.loadAPI();
      logger.info('Tool Factory initialized successfully', {
        pathCount: this.api.paths.length,
      });
    } catch (error) {
      logger.error('Failed to initialize Tool Factory', error as Error);
      throw error;
    }
  }

  /**
   * Generate tools for a specific tag (e.g., 'Inquiries')
   */
  generateToolsForTag(tag: string, options: ToolGenerationOptions = {}): GeneratedTool[] {
    if (!this.api) {
      throw new Error('Tool Factory not initialized. Call initialize() first.');
    }

    const operations = openAPIParser.getOperationsByTag(this.api, tag);
    const tools: GeneratedTool[] = [];

    for (const { path, method, operation } of operations) {
      try {
        const tool = this.generateTool(path, method, operation, options);
        if (tool) {
          tools.push(tool);
        }
      } catch (error) {
        logger.warn('Failed to generate tool', {
          error: (error as Error).message,
          operationId: operation.operationId,
          path,
          method,
        });
      }
    }

    logger.info('Generated tools for tag', {
      tag,
      toolCount: tools.length,
      toolNames: tools.map(t => t.name),
    });

    return tools;
  }

  /**
   * Generate a single tool from an operation
   */
  private generateTool(
    path: string,
    method: string,
    operation: ParsedOperation,
    options: ToolGenerationOptions
  ): GeneratedTool | null {
    const toolName = this.generateToolName(operation.operationId, method);
    const description = operation.summary || operation.description || `${method.toUpperCase()} ${path}`;

    // Generate input schema from parameters and request body
    const inputSchema = this.generateInputSchema(operation, options);

    // Generate handler function
    const handler = this.generateHandler(path, method, operation, options);

    return {
      name: toolName,
      description,
      inputSchema,
      handler,
    };
  }

  /**
   * Generate tool name from operation ID and method
   */
  private generateToolName(operationId: string, method: string): string {
    // Convert operation ID to a more MCP-friendly format
    // e.g., "list-all-inquiries" -> "inquiry_list"
    // e.g., "create-an-inquiry" -> "inquiry_create"
    
    let name = operationId.toLowerCase();
    
    // Handle common patterns
    if (name.includes('list-all-')) {
      name = name.replace('list-all-', '').replace(/s$/, '') + '_list';
    } else if (name.includes('create-an-') || name.includes('create-a-')) {
      name = name.replace('create-an-', '').replace('create-a-', '') + '_create';
    } else if (name.includes('retrieve-an-') || name.includes('retrieve-a-')) {
      name = name.replace('retrieve-an-', '').replace('retrieve-a-', '') + '_retrieve';
    } else if (name.includes('update-an-') || name.includes('update-a-')) {
      name = name.replace('update-an-', '').replace('update-a-', '') + '_update';
    } else if (name.includes('redact-an-') || name.includes('redact-a-')) {
      name = name.replace('redact-an-', '').replace('redact-a-', '') + '_redact';
    } else {
      // General cleanup
      name = name.replace(/-/g, '_');
    }

    return name;
  }

  /**
   * Generate Zod input schema from operation parameters and request body
   */
  private generateInputSchema(operation: ParsedOperation, options: ToolGenerationOptions): Record<string, any> {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    // Add path parameters
    const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
    for (const param of pathParams) {
      const zodSchema = this.convertSchemaToZod(param.schema);
      properties[this.convertParamName(param.name)] = zodSchema.describe(param.description || `${param.name} parameter`);
      if (param.required) {
        required.push(this.convertParamName(param.name));
      }
    }

    // Add query parameters
    const queryParams = operation.parameters?.filter(p => p.in === 'query') || [];
    for (const param of queryParams) {
      if (!options.includeOptionalParams && !param.required) {
        continue; // Skip optional params if not requested
      }

      const zodSchema = this.convertSchemaToZod(param.schema);
      properties[this.convertParamName(param.name)] = zodSchema.describe(param.description || `${param.name} parameter`);
      
      if (param.required) {
        required.push(this.convertParamName(param.name));
      }
    }

    // Add request body properties
    if (operation.requestBody) {
      const jsonContent = operation.requestBody.content['application/json'];
      if (jsonContent?.schema) {
        const bodyProps = this.extractPropertiesFromSchema(jsonContent.schema, 'body');
        Object.assign(properties, bodyProps.properties);
        required.push(...bodyProps.required);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false,
    };
  }

  /**
   * Convert parameter name to camelCase
   */
  private convertParamName(name: string): string {
    // Convert kebab-case and snake_case to camelCase
    return name.replace(/[-_]([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Extract properties from a schema object
   */
  private extractPropertiesFromSchema(schema: ParsedSchema, prefix = ''): { properties: Record<string, any>; required: string[] } {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const zodSchema = this.convertSchemaToZod(propSchema);
        const key = prefix ? `${prefix}.${propName}` : propName;
        properties[this.convertParamName(propName)] = zodSchema.describe(propSchema.description || `${propName} property`);
        
        if (schema.required?.includes(propName)) {
          required.push(this.convertParamName(propName));
        }
      }
    }

    // Handle nested objects in data.attributes pattern
    if (schema.properties?.data?.properties?.attributes?.properties) {
      const attrProps = this.extractPropertiesFromSchema(schema.properties.data.properties.attributes);
      Object.assign(properties, attrProps.properties);
      required.push(...attrProps.required);
    }

    return { properties, required };
  }

  /**
   * Convert parsed schema to Zod schema
   */
  private convertSchemaToZod(schema: ParsedSchema): z.ZodTypeAny {
    if (schema.$ref) {
      // For now, treat references as unknown
      return z.unknown();
    }

    switch (schema.type) {
      case 'string':
        let stringSchema = z.string();
        if (schema.format === 'email') {
          stringSchema = stringSchema.email();
        } else if (schema.format === 'uri' || schema.format === 'url') {
          stringSchema = stringSchema.url();
        } else if (schema.format === 'date-time') {
          stringSchema = stringSchema.datetime();
        }
        if (schema.minLength) {
          stringSchema = stringSchema.min(schema.minLength);
        }
        if (schema.maxLength) {
          stringSchema = stringSchema.max(schema.maxLength);
        }
        if (schema.pattern) {
          stringSchema = stringSchema.regex(new RegExp(schema.pattern));
        }
        if (schema.enum) {
          return z.enum(schema.enum as [string, ...string[]]);
        }
        return stringSchema;

      case 'number':
      case 'integer':
        let numberSchema = schema.type === 'integer' ? z.number().int() : z.number();
        if (schema.minimum) {
          numberSchema = numberSchema.min(schema.minimum);
        }
        if (schema.maximum) {
          numberSchema = numberSchema.max(schema.maximum);
        }
        return numberSchema;

      case 'boolean':
        return z.boolean();

      case 'array':
        if (schema.items) {
          return z.array(this.convertSchemaToZod(schema.items));
        }
        return z.array(z.unknown());

      case 'object':
        if (schema.properties) {
          const shape: Record<string, z.ZodTypeAny> = {};
          for (const [propName, propSchema] of Object.entries(schema.properties)) {
            shape[propName] = this.convertSchemaToZod(propSchema);
          }
          return z.object(shape);
        }
        return z.record(z.unknown());

      default:
        return z.unknown();
    }
  }

  /**
   * Generate handler function for the operation
   */
  private generateHandler(
    path: string,
    method: string,
    operation: ParsedOperation,
    options: ToolGenerationOptions
  ): (input: any) => Promise<any> {
    return async (input: any) => {
      const timer = createTimer(`tool_${operation.operationId}`);

      try {
        logger.info(`Executing generated tool: ${operation.operationId}`, {
          path,
          method,
          input: this.sanitizeInputForLogging(input),
        });

        // Build API request from input
        const apiRequest = this.buildAPIRequest(path, method, operation, input);

        // Make the API call using the persona API client
        const response = await this.executeAPIRequest(apiRequest);

        // Cache response if configured
        if (options.cacheResponses && this.shouldCacheResponse(operation, response)) {
          this.cacheResponse(operation, input, response);
        }

        const duration = timer.end({ success: true });

        logger.info(`Tool executed successfully: ${operation.operationId}`, {
          duration,
          hasData: !!response.data,
        });

        // Format response for MCP
        return this.formatToolResponse(operation, response, duration);

      } catch (error) {
        const duration = timer.end({ success: false });
        
        handleError(error as Error, {
          tool: operation.operationId,
          path,
          method,
          input: this.sanitizeInputForLogging(input),
          duration,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ Tool execution failed: ${(error as Error).message}`,
            },
          ],
        };
      }
    };
  }

  /**
   * Build API request configuration from tool input
   */
  private buildAPIRequest(path: string, method: string, operation: ParsedOperation, input: any): any {
    // This is a simplified implementation
    // In a real implementation, we'd need to properly map parameters to the API client methods
    
    let apiPath = path;
    const params: any = {};
    const data: any = {};

    // Replace path parameters
    const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
    for (const param of pathParams) {
      const inputKey = this.convertParamName(param.name);
      if (input[inputKey]) {
        apiPath = apiPath.replace(`{${param.name}}`, input[inputKey]);
      }
    }

    // Add query parameters
    const queryParams = operation.parameters?.filter(p => p.in === 'query') || [];
    for (const param of queryParams) {
      const inputKey = this.convertParamName(param.name);
      if (input[inputKey] !== undefined) {
        params[param.name] = input[inputKey];
      }
    }

    // Add request body
    if (operation.requestBody) {
      // For now, pass through the input as data
      // In a real implementation, we'd properly structure this based on the schema
      Object.assign(data, input);
    }

    return {
      method: method.toUpperCase(),
      url: apiPath,
      params: Object.keys(params).length > 0 ? params : undefined,
      data: Object.keys(data).length > 0 ? data : undefined,
    };
  }

  /**
   * Execute API request using the persona API client
   */
  private async executeAPIRequest(request: any): Promise<any> {
    // For now, we'll use the existing personaAPI client methods
    // This is a simplified mapping - in a real implementation,
    // we'd need to properly route to the correct API client method
    
    if (request.url === '/inquiries' && request.method === 'GET') {
      return await personaAPI.listInquiries(request.params);
    } else if (request.url === '/inquiries' && request.method === 'POST') {
      return await personaAPI.createInquiry(request.data);
    } else if (request.url.startsWith('/inquiries/') && request.method === 'GET') {
      const inquiryId = request.url.split('/')[2];
      return await personaAPI.getInquiry(inquiryId, request.params);
    }
    
    // Fallback: throw error for unsupported operations
    throw new Error(`Unsupported API operation: ${request.method} ${request.url}`);
  }

  /**
   * Determine if response should be cached
   */
  private shouldCacheResponse(operation: ParsedOperation, response: any): boolean {
    // Cache GET requests and successful responses
    return operation.operationId.includes('list') || 
           operation.operationId.includes('retrieve') ||
           operation.operationId.includes('get');
  }

  /**
   * Cache API response
   */
  private cacheResponse(operation: ParsedOperation, input: any, response: any): void {
    try {
      if (operation.operationId.includes('inquiry')) {
        if (response.data?.id) {
          resourceManager.cacheResource('inquiry', response.data.id, response);
        }
      }
    } catch (error) {
      logger.warn('Failed to cache response', {
        error: (error as Error).message,
        operationId: operation.operationId,
      });
    }
  }

  /**
   * Format tool response for MCP
   */
  private formatToolResponse(operation: ParsedOperation, response: any, duration: number): any {
    const summary = this.generateResponseSummary(operation, response);
    
    return {
      content: [
        {
          type: 'text' as const,
          text: `✅ ${operation.summary || operation.operationId} completed successfully!

${summary}

**Execution Time:** ${duration}ms

**Raw Response:**
\`\`\`json
${JSON.stringify(response, null, 2)}
\`\`\``,
        },
      ],
    };
  }

  /**
   * Generate a summary of the API response
   */
  private generateResponseSummary(operation: ParsedOperation, response: any): string {
    if (operation.operationId.includes('list')) {
      const count = response.data?.length || 0;
      return `Found ${count} items`;
    } else if (operation.operationId.includes('create')) {
      const id = response.data?.id;
      return id ? `Created item with ID: ${id}` : 'Item created successfully';
    } else if (operation.operationId.includes('retrieve') || operation.operationId.includes('get')) {
      const id = response.data?.id;
      const status = response.data?.attributes?.status;
      return `Retrieved item ${id}${status ? ` (status: ${status})` : ''}`;
    }
    
    return 'Operation completed successfully';
  }

  /**
   * Sanitize input for logging (remove sensitive data)
   */
  private sanitizeInputForLogging(input: any): any {
    const sanitized = { ...input };
    
    // Remove potentially sensitive fields
    const sensitiveFields = ['apiKey', 'token', 'password', 'secret'];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  /**
   * Get the loaded API specification
   */
  getAPI(): ParsedAPI | null {
    return this.api;
  }
}

/**
 * Global tool factory instance
 */
export const toolFactory = new ToolFactory();