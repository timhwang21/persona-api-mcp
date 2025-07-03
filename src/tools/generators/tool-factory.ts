/**
 * Tool Factory for generating MCP tools from OpenAPI specifications
 * 
 * This module automatically generates MCP tool definitions and handlers
 * from parsed OpenAPI operations, eliminating manual schema maintenance.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { openAPIParser, ParsedAPI, ParsedOperation, ParsedSchema, ParsedParameter } from './openapi-parser.js';
import { personaAPI } from '../../api/client.js';
import { CreateRequest } from '../../api/types.js';
import { resourceManager } from '../../resources/manager.js';
import { logger, createTimer } from '../../utils/logger.js';
import { handleError, ValidationError } from '../../utils/errors.js';
import { SecurityValidator, SecuritySchemas, SecurityError } from '../../utils/security.js';

export interface APIRequest {
  method: string;
  url: string;
  params?: Record<string, unknown> | undefined;
  data?: Record<string, unknown> | undefined;
}

export interface APIResponse {
  data: unknown;
  status?: number;
  statusText?: string;
}

export interface ToolInputSchema {
  type: string;
  properties: Record<string, unknown>;
  required?: string[] | undefined;
  additionalProperties: boolean;
}

export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

export interface GeneratedTool {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  handler: (input: Record<string, unknown>) => Promise<ToolResponse>;
}

export interface ToolGenerationOptions {
  includeOptionalParams?: boolean;
  validateResponses?: boolean;
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
    // e.g., "list-all-accounts" -> "account_list"
    // e.g., "create-a-case" -> "case_create"
    
    let name = operationId.toLowerCase();
    
    // Handle common patterns
    if (name.includes('list-all-')) {
      name = name.replace('list-all-', '') + '_list';
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
   * Enhanced with security validation and better error handling
   */
  private generateInputSchema(operation: ParsedOperation, options: ToolGenerationOptions): ToolInputSchema {
    const schemaProperties: Record<string, z.ZodTypeAny> = {};
    const required: string[] = [];

    // Add path parameters with security validation
    const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
    for (const param of pathParams) {
      const paramName = this.convertParamName(param.name);
      let zodSchema = this.convertSchemaToZod(param.schema);
      
      // Add security validation for known ID parameters
      // Use universal ID validation patterns instead of hardcoded resource types
      if (param.name.includes('id')) {
        if (param.name.includes('inquiry') && !param.name.includes('template')) {
          zodSchema = SecuritySchemas.inquiryId;
        } else if (param.name.includes('template')) {
          zodSchema = SecuritySchemas.inquiryTemplateId;
        } else if (param.name.includes('account')) {
          zodSchema = SecuritySchemas.accountId;
        } else {
          // Generic ID validation for other resource types
          zodSchema = z.string().min(1).max(100).regex(/^[a-z]{2,}_[a-zA-Z0-9_-]+$/, 'Invalid resource ID format');
        }
      }
      
      schemaProperties[paramName] = zodSchema.describe(
        param.description || `${param.name} parameter`
      );
      
      if (param.required) {
        required.push(paramName);
      }
    }

    // Add query parameters with pagination support
    const queryParams = operation.parameters?.filter(p => p.in === 'query') || [];
    for (const param of queryParams) {
      if (!options.includeOptionalParams && !param.required) {
        continue; // Skip optional params if not requested
      }

      const paramName = this.convertParamName(param.name);
      let zodSchema = this.convertSchemaToZod(param.schema);
      
      // Enhanced validation for common query parameters
      if (param.name === 'limit') {
        zodSchema = z.number()
          .int('Limit must be an integer')
          .min(1, 'Limit must be at least 1')
          .max(1000, 'Limit cannot exceed 1000')
          .default(25);
      } else if (param.name === 'offset') {
        zodSchema = z.number()
          .int('Offset must be an integer')
          .min(0, 'Offset must be non-negative')
          .default(0);
      } else if (param.name === 'include_relationships' || param.name === 'include') {
        zodSchema = SecuritySchemas.booleanFlag;
      }
      
      schemaProperties[paramName] = zodSchema.describe(
        param.description || `${param.name} parameter`
      );
      
      if (param.required) {
        required.push(paramName);
      }
    }

    // Add request body properties with validation
    if (operation.requestBody) {
      const jsonContent = operation.requestBody.content['application/json'];
      if (jsonContent?.schema) {
        const bodyProps = this.extractPropertiesFromSchema(jsonContent.schema, 'body');
        Object.assign(schemaProperties, bodyProps.properties);
        required.push(...bodyProps.required);
      }
    }

    // Create the main schema object
    const mainSchema = z.object(schemaProperties);
    
    // Convert to JSON Schema for MCP
    const jsonSchema = zodToJsonSchema(mainSchema, {
      name: `${operation.operationId}Input`,
      $refStrategy: 'none'
    });

    // Ensure we have a valid object schema
    const objectSchema = jsonSchema as any;
    
    return {
      type: 'object',
      properties: objectSchema.properties || {},
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
  private extractPropertiesFromSchema(schema: ParsedSchema, prefix = ''): { properties: Record<string, unknown>; required: string[] } {
    const properties: Record<string, unknown> = {};
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
   * Enhanced with security validation, better error handling, and atomic operations
   */
  private generateHandler(
    path: string,
    method: string,
    operation: ParsedOperation,
    options: ToolGenerationOptions
  ): (input: Record<string, unknown>) => Promise<ToolResponse> {
    return async (input: Record<string, unknown>) => {
      const timer = createTimer(`tool_${operation.operationId}`);

      try {
        // Step 1: Security validation and input sanitization
        await this.validateAndSanitizeInput(input, operation);

        logger.info(`Executing generated tool: ${operation.operationId}`, {
          path,
          method,
          input: this.sanitizeInputForLogging(input),
        });

        // Step 2: Rate limiting check
        if (!SecurityValidator.checkRateLimit(`tool_${operation.operationId}`)) {
          throw new SecurityError('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');
        }

        // Step 3: Build API request from validated input
        const apiRequest = this.buildAPIRequest(path, method, operation, input);

        // Step 4: Execute API request with retries and validation
        const response = await this.executeAPIRequestWithValidation(apiRequest);

        const duration = timer.end({ success: true });

        logger.info(`Tool executed successfully: ${operation.operationId}`, {
          duration,
          hasData: !!response.data,
          status: response.status,
        });

        // Step 6: Format and return response
        return this.formatToolResponse(operation, response, duration);

      } catch (error) {
        const duration = timer.end({ success: false });
        
        // Enhanced error handling with context
        const errorContext = {
          tool: operation.operationId,
          path,
          method,
          input: this.sanitizeInputForLogging(input),
          duration,
          timestamp: new Date().toISOString(),
        };

        handleError(error as Error, errorContext);

        // Return standardized error response
        return this.formatErrorResponse(error as Error, operation, duration);
      }
    };
  }

  /**
   * Validate and sanitize input with security checks
   */
  private async validateAndSanitizeInput(
    input: Record<string, unknown>,
    operation: ParsedOperation
  ): Promise<void> {
    // Check for null bytes and other security vulnerabilities
    const inputStr = JSON.stringify(input);
    if (inputStr.includes('\x00')) {
      throw new SecurityError('Input contains null bytes', 'INVALID_INPUT');
    }

    // Validate specific ID parameters using universal patterns
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string') {
        if (key.includes('inquiryId') || key.includes('inquiry_id')) {
          if (!SecurityValidator.validateInquiryId(value)) {
            throw new SecurityError(`Invalid inquiry ID format: ${key}`, 'INVALID_ID');
          }
        } else if (key.includes('templateId') || key.includes('template_id')) {
          if (!SecurityValidator.validateInquiryTemplateId(value)) {
            throw new SecurityError(`Invalid template ID format: ${key}`, 'INVALID_ID');
          }
        } else if (key.toLowerCase().includes('id') && key !== 'id') {
          // Universal ID validation for other resource types
          if (!this.validateUniversalId(value)) {
            throw new SecurityError(`Invalid ID format: ${key}`, 'INVALID_ID');
          }
        } else if (key.includes('accountId') || key.includes('account_id')) {
          if (!SecurityValidator.validateAccountId(value)) {
            throw new SecurityError(`Invalid account ID format: ${key}`, 'INVALID_ID');
          }
        }
      }
    }

    // Validate pagination parameters
    if (input.limit || input.offset || input.cursor) {
      SecurityValidator.validatePagination({
        limit: input.limit,
        offset: input.offset,
        cursor: input.cursor,
      });
    }
  }

  /**
   * Execute API request with enhanced validation and error handling
   */
  private async executeAPIRequestWithValidation(request: APIRequest): Promise<APIResponse> {
    try {
      const response = await this.executeAPIRequest(request);
      
      // Validate API response structure
      SecurityValidator.validateApiResponse(response);
      
      return response;
    } catch (error) {
      // Handle specific API errors
      if (error instanceof Error) {
        if (error.message.includes('404')) {
          throw new Error('Resource not found. Please check the ID and try again.');
        } else if (error.message.includes('403')) {
          throw new SecurityError('Access denied. Insufficient permissions.', 'ACCESS_DENIED');
        } else if (error.message.includes('429')) {
          throw new SecurityError('Rate limit exceeded. Please try again later.', 'RATE_LIMIT');
        } else if (error.message.includes('timeout')) {
          throw new Error('Request timeout. The operation took too long to complete.');
        }
      }
      
      throw error;
    }
  }


  /**
   * Format standardized error response
   */
  private formatErrorResponse(
    error: Error,
    operation: ParsedOperation,
    duration: number
  ): ToolResponse {
    let errorMessage = error.message;
    let errorCode = 'UNKNOWN_ERROR';

    if (error instanceof SecurityError) {
      errorCode = error.code;
    } else if (error instanceof ValidationError) {
      errorCode = 'VALIDATION_ERROR';
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `❌ **${operation.summary || operation.operationId} Failed**

**Error:** ${errorMessage}
**Code:** ${errorCode}
**Duration:** ${duration}ms
**Timestamp:** ${new Date().toISOString()}

Please check your input parameters and try again. If the error persists, contact support.`,
        },
      ],
    };
  }

  /**
   * Build API request configuration from tool input
   */
  private buildAPIRequest(path: string, method: string, operation: ParsedOperation, input: Record<string, unknown>): APIRequest {
    // This is a simplified implementation
    // In a real implementation, we'd need to properly map parameters to the API client methods
    
    let apiPath = path;
    const params: Record<string, unknown> = {};
    const data: Record<string, unknown> = {};

    // Replace path parameters
    const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
    for (const param of pathParams) {
      const inputKey = this.convertParamName(param.name);
      if (input[inputKey]) {
        apiPath = apiPath.replace(`{${param.name}}`, String(input[inputKey]));
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
   * Universal method that works with ANY endpoint from the OpenAPI specification
   */
  private async executeAPIRequest(request: APIRequest): Promise<APIResponse> {
    // Universal implementation that works with all OpenAPI endpoints
    // No hardcoded endpoints - follows YAML-first philosophy
    
    switch (request.method) {
      case 'GET':
        return await personaAPI.get(request.url, request.params);
        
      case 'POST':
        // Format data according to Persona API conventions if present
        const postData = request.data ? {
          data: {
            type: this.inferResourceType(request.url),
            attributes: request.data,
          },
        } : request.data;
        return await personaAPI.post(request.url, postData, request.params);
        
      case 'PATCH':
        const patchData = request.data ? {
          data: {
            type: this.inferResourceType(request.url),
            attributes: request.data,
          },
        } : request.data;
        return await personaAPI.patch(request.url, patchData, request.params);
        
      case 'PUT':
        return await personaAPI.put(request.url, request.data, request.params);
        
      case 'DELETE':
        return await personaAPI.delete(request.url, request.params);
        
      default:
        throw new Error(`Unsupported HTTP method: ${request.method}`);
    }
  }

  /**
   * Infer resource type from URL path for request data formatting
   * This follows OpenAPI path patterns without hardcoding specific endpoints
   */
  private inferResourceType(url: string): string | undefined {
    // Extract resource type from URL path (e.g., '/accounts' -> 'account')
    const pathSegments = url.split('/').filter(segment => segment && !segment.match(/^[a-f0-9-]{36}$/));
    if (pathSegments.length > 0) {
      const resourcePath = pathSegments[0];
      if (resourcePath) {
        // Convert plural to singular with proper rules
        if (resourcePath === 'inquiries') {
          return 'inquiry';
        } else if (resourcePath === 'verifications') {
          return 'verification';
        } else if (resourcePath === 'transactions') {
          return 'transaction';
        } else if (resourcePath.endsWith('ies')) {
          // Handle words ending in 'ies' (e.g., 'companies' -> 'company')
          return resourcePath.slice(0, -3) + 'y';
        } else if (resourcePath.endsWith('s')) {
          // Basic plural removal
          return resourcePath.slice(0, -1);
        } else {
          return resourcePath;
        }
      }
    }
    return undefined;
  }

  /**
   * Universal ID validation for any resource type
   * Follows Persona API ID patterns (e.g., 'res_123abc', 'acc_456def')
   */
  private validateUniversalId(id: string): boolean {
    // Basic Persona API ID pattern: 3+ lowercase letters, underscore, alphanumeric
    return /^[a-z]{2,}_[a-zA-Z0-9_-]+$/.test(id) && id.length >= 5 && id.length <= 100;
  }

  /**
   * Infer resource type from operation for caching purposes
   * Uses operation tags and operation ID to determine resource type
   */
  private inferResourceTypeFromOperation(operation: ParsedOperation): string | undefined {
    // First try to get from operation tags
    if (operation.tags && operation.tags.length > 0) {
      const tag = operation.tags[0]?.toLowerCase();
      
      // Map tags to resource types
      if (tag && tag.includes('inquir')) return 'inquiry';
      if (tag && tag.includes('account')) return 'account';
      if (tag && tag.includes('case')) return 'case';
      if (tag && tag.includes('verification')) return 'verification';
      if (tag && tag.includes('report')) return 'report';
      if (tag && tag.includes('transaction')) return 'transaction';
      if (tag && tag.includes('device')) return 'device';
      if (tag && tag.includes('document')) return 'document';
      if (tag && tag.includes('webhook')) return 'webhook';
    }

    // Fallback: try to infer from operation ID
    if (operation.operationId) {
      const operationId = operation.operationId.toLowerCase();
      
      // Common resource patterns in operation IDs
      const resourcePatterns = [
        'inquiry', 'account', 'case', 'verification', 'report', 'transaction', 
        'device', 'document', 'webhook', 'template'
      ];
      
      for (const pattern of resourcePatterns) {
        if (operationId.includes(pattern)) {
          return pattern;
        }
      }
    }

    return undefined;
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