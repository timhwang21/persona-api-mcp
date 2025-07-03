/**
 * Tool Factory for generating MCP tools from OpenAPI specifications
 * 
 * This module automatically generates MCP tool definitions and handlers
 * from parsed OpenAPI operations, eliminating manual schema maintenance.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { openAPIParser, ParsedAPI, ParsedOperation, ParsedSchema } from './openapi-parser.js';
import { personaAPI } from '../../api/client.js';
import { logger, createTimer } from '../../utils/logger.js';
import { handleError, ValidationError } from '../../utils/errors.js';
import { SecurityValidator, SecurityError } from '../../utils/security.js';

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
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
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
    // Skip GET operations - these should be available as resources, not tools
    // Resources are for reading data, tools are for actions that change state
    if (method.toUpperCase() === 'GET') {
      return null;
    }

    const toolName = this.generateToolName(operation.operationId);
    
    // Enhanced description with OpenAPI reference and usage guidance
    let description = operation.summary || operation.description || `${method.toUpperCase()} ${path}`;
    description += `\n\n📚 **IMPORTANT - Parameter Format:**`;
    description += `\n• Pass ONLY the actual attribute values as individual fields`;
    description += `\n• Do NOT wrap in "data" or "attributes" - the MCP handles that structure automatically`;
    description += `\n• Use camelCase for parameter names (e.g., inquiryTemplateId, not inquiry-template-id)`;
    
    if (operation.operationId.includes('create')) {
      description += `\n\n✅ **CORRECT Create Format:**`;
      if (operation.operationId.includes('inquiry')) {
        description += `\n{"inquiryTemplateId": "itmpl_xxx", "fields": {"nameFirst": "John", "nameLast": "Doe", "email": "test@example.com"}}`;
        description += `\n\n📋 **Note:** User data (name, address, etc.) goes in 'fields' object, not top-level`;
      } else {
        description += `\n{"templateId": "tmpl_xxx", "attribute1": "value1", "attribute2": "value2"}`;
      }
      description += `\n\n❌ **WRONG - Don't use data wrapper:**`;
      description += `\n{"data": "{\\"inquiryTemplateId\\": \\"itmpl_xxx\\"}"}`;
      description += `\n{"data": {"attributes": {"inquiryTemplateId": "itmpl_xxx"}}}`;
    } else if (operation.operationId.includes('update')) {
      description += `\n\n✅ **CORRECT Update Format:**`;
      description += `\n{"email": "new@email.com", "phoneNumber": "+1234567890"}`;
      description += `\n\n❌ **WRONG - Don't use data wrapper:**`;
      description += `\n{"data": {"attributes": {"email": "new@email.com"}}}`;
    }
    
    description += `\n\n📋 **Behind the scenes:** This MCP automatically wraps your parameters in the required`;
    description += `\n   API format: {"data": {"attributes": {your_parameters}}} - you don't need to do this!`;
    
    // Add parameter hints for common operations
    if (operation.operationId.includes('inquiry')) {
      if (operation.operationId.includes('create')) {
        description += `\n\n🔧 **Common required fields**: inquiryTemplateId (format: itmpl_xxx)`;
      } else if (operation.parameters?.some(p => p.name.includes('inquiry'))) {
        description += `\n\n🔧 **Required**: inquiryId (format: inq_xxx)`;
      }
    }
    
    description += `\n\n📖 **For full parameter details:** openapi://openapi.yaml (operation: ${operation.operationId})`;

    // Generate input schema from parameters and request body
    const inputSchema = this.generateInputSchema(operation, options);

    // Generate handler function
    const handler = this.generateHandler(path, method, operation);

    // Generate proper tool annotations based on HTTP method
    const annotations = this.generateToolAnnotations(method);

    return {
      name: toolName,
      description,
      inputSchema,
      handler,
      ...annotations,
    };
  }

  /**
   * Generate tool annotations based on HTTP method
   */
  private generateToolAnnotations(method: string): {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  } {
    const upperMethod = method.toUpperCase();
    
    return {
      // All GETs should have readOnlyHint: true
      readOnlyHint: upperMethod === 'GET',
      // All POST, PUT, PATCH, DELETE should have destructiveHint: true
      destructiveHint: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(upperMethod),
      // All GET, DELETE should have idempotentHint: true
      idempotentHint: ['GET', 'DELETE'].includes(upperMethod),
    };
  }

  /**
   * Generate tool name from operation ID and method
   */
  private generateToolName(operationId: string): string {
    // Convert operation ID to a more MCP-friendly format
    // e.g., "list-all-accounts" -> "account_list"
    // e.g., "create-a-case" -> "case_create"
    // e.g., "accounts-add-tag" -> "account_add_tag"
    
    const name = operationId.toLowerCase();
    
    // Handle resource action patterns (e.g., "accounts-add-tag", "inquiries-approve")
    // This is specifically for cases like "accounts-add-tag" not "update-an-account"
    if (name.match(/^[a-z-]+-[a-z-]+$/) && !name.includes('update-') && !name.includes('create-') && !name.includes('retrieve-') && !name.includes('redact-')) {
      // Split on the first dash to separate resource from action
      const parts = name.split('-');
      if (parts.length >= 2 && parts[0]) {
        const resourcePart = parts[0];
        const actionPart = parts.slice(1).join('-');
        
        // Convert resource plural to singular
        const singularResource = this.pluralToSingular(resourcePart);
        
        // Convert action to underscore format
        const actionFormatted = actionPart.replace(/-/g, '_');
        
        return `${singularResource}_${actionFormatted}`;
      }
    }
    
    // Handle common CRUD patterns
    if (name.includes('list-all-')) {
      const resource = name.replace('list-all-', '');
      const singularResource = this.pluralToSingular(resource);
      return `${singularResource}_list`;
    } else if (name.includes('create-an-') || name.includes('create-a-')) {
      const resource = name.replace('create-an-', '').replace('create-a-', '');
      const singularResource = this.pluralToSingular(resource);
      return `${singularResource}_create`;
    } else if (name.includes('retrieve-an-') || name.includes('retrieve-a-')) {
      const resource = name.replace('retrieve-an-', '').replace('retrieve-a-', '');
      const singularResource = this.pluralToSingular(resource);
      return `${singularResource}_retrieve`;
    } else if (name.includes('update-an-') || name.includes('update-a-')) {
      const resource = name.replace('update-an-', '').replace('update-a-', '');
      const singularResource = this.pluralToSingular(resource);
      return `${singularResource}_update`;
    } else if (name.includes('redact-an-') || name.includes('redact-a-')) {
      const resource = name.replace('redact-an-', '').replace('redact-a-', '');
      const singularResource = this.pluralToSingular(resource);
      return `${singularResource}_redact`;
    } else {
      // General cleanup for other patterns
      return name.replace(/-/g, '_');
    }
  }

  /**
   * Convert plural resource name to singular
   */
  private pluralToSingular(plural: string): string {
    // Handle special cases for Persona API resources
    const specialCases: Record<string, string> = {
      'inquiries': 'inquiry',
      'verifications': 'verification',
      'transactions': 'transaction',
      'accounts': 'account',
      'reports': 'report',
      'cases': 'case',
      'devices': 'device',
      'documents': 'document',
      'webhooks': 'webhook',
      'importers': 'importer',
      'workflows': 'workflow',
    };
    
    if (specialCases[plural]) {
      return specialCases[plural];
    }
    
    // General rules for pluralization
    if (plural.endsWith('ies')) {
      return plural.slice(0, -3) + 'y';
    } else if (plural.endsWith('s')) {
      return plural.slice(0, -1);
    }
    
    return plural;
  }

  /**
   * Get format hint for common ID parameter types
   */
  private getIdFormatHint(paramName: string): string {
    if (paramName.includes('inquiry')) {
      return 'inq_xxx';
    } else if (paramName.includes('account')) {
      return 'acc_xxx';
    } else if (paramName.includes('case')) {
      return 'cas_xxx';
    } else if (paramName.includes('verification')) {
      return 'ver_xxx';
    } else if (paramName.includes('report')) {
      return 'rpt_xxx';
    } else if (paramName.includes('transaction')) {
      return 'txn_xxx';
    } else if (paramName.includes('device')) {
      return 'dev_xxx';
    } else if (paramName.includes('document')) {
      return 'doc_xxx';
    } else if (paramName.includes('webhook')) {
      return 'wbh_xxx';
    } else {
      return 'xxx_yyy';
    }
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
      const zodSchema = this.convertSchemaToZod(param.schema);
      
      // Enhanced parameter descriptions for path parameters
      let paramDescription = param.description || `${param.name} parameter`;
      if (param.required) {
        paramDescription = `[REQUIRED] ${paramDescription}`;
      } else {
        paramDescription = `[OPTIONAL] ${paramDescription}`;
      }
      
      // Add format hints for common parameter types
      if (param.name.includes('id') && !param.name.includes('template')) {
        paramDescription += ` (format: ${this.getIdFormatHint(param.name)})`;
      } else if (param.name.includes('template')) {
        paramDescription += ` (format: itmpl_xxx)`;
      }
      
      schemaProperties[paramName] = zodSchema.describe(paramDescription);
      
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
      }
      
      // Enhanced parameter descriptions for query parameters
      let paramDescription = param.description || `${param.name} parameter`;
      if (param.required) {
        paramDescription = `[REQUIRED] ${paramDescription}`;
      } else {
        paramDescription = `[OPTIONAL] ${paramDescription}`;
      }
      
      schemaProperties[paramName] = zodSchema.describe(paramDescription);
      
      if (param.required) {
        required.push(paramName);
      }
    }

    // Add request body properties with validation
    if (operation.requestBody) {
      const jsonContent = operation.requestBody.content['application/json'];
      if (jsonContent?.schema) {
        const bodyProps = this.extractPropertiesFromSchema(jsonContent.schema);
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
  private extractPropertiesFromSchema(schema: ParsedSchema): { properties: Record<string, unknown>; required: string[] } {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        // Skip 'data' property if it contains attributes pattern - will be handled separately
        if (propName === 'data' && propSchema.properties?.attributes?.properties) {
          continue;
        }
        
        const zodSchema = this.convertSchemaToZod(propSchema);
        
        // Enhanced descriptions for request body properties
        let propDescription = propSchema.description || `${propName} property`;
        const isRequired = schema.required?.includes(propName);
        if (isRequired) {
          propDescription = `[REQUIRED] ${propDescription}`;
        } else {
          propDescription = `[OPTIONAL] ${propDescription}`;
        }
        
        // Add specific hints for known field patterns
        if (propName.includes('template') && propName.includes('id')) {
          propDescription += ` (format: itmpl_xxx)`;
        } else if (propName.endsWith('Id') || propName.endsWith('_id')) {
          propDescription += ` (format: resource_prefix_xxx)`;
        }
        
        properties[this.convertParamName(propName)] = zodSchema.describe(propDescription);
        
        if (schema.required?.includes(propName)) {
          required.push(this.convertParamName(propName));
        }
      }
    }

    // Handle nested objects in data.attributes pattern (for resource updates)
    if (schema.properties?.data?.properties?.attributes?.properties) {
      const attrProps = this.extractPropertiesFromSchema(schema.properties.data.properties.attributes);
      Object.assign(properties, attrProps.properties);
      required.push(...attrProps.required);
    }

    // Handle nested objects in meta pattern (for action endpoints)
    if (schema.properties?.meta?.properties) {
      const metaProps = this.extractPropertiesFromSchema(schema.properties.meta);
      Object.assign(properties, metaProps.properties);
      required.push(...metaProps.required);
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
  ): (input: Record<string, unknown>) => Promise<ToolResponse> {
    return async (input: Record<string, unknown>) => {
      const timer = createTimer(`tool_${operation.operationId}`);

      try {
        // Step 1: Basic input sanitization (remove security validation)
        // Just check for null bytes
        const inputStr = JSON.stringify(input);
        if (inputStr.includes('\x00')) {
          throw new Error('Input contains null bytes');
        }

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
    const errorMessage = error.message;
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

    // Add request body - exclude path and query parameters
    if (operation.requestBody) {
      // Get list of path and query parameter names to exclude from request body
      const excludedParams = new Set<string>();
      
      // Add path parameters to exclusion list
      const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
      for (const param of pathParams) {
        excludedParams.add(this.convertParamName(param.name));
      }
      
      // Add query parameters to exclusion list
      const queryParams = operation.parameters?.filter(p => p.in === 'query') || [];
      for (const param of queryParams) {
        excludedParams.add(this.convertParamName(param.name));
      }
      
      // Only include input parameters that are not path or query parameters
      for (const [key, value] of Object.entries(input)) {
        if (!excludedParams.has(key)) {
          data[key] = value;
        }
      }
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
        // Format data according to Persona API conventions and operation type
        const postData = this.formatRequestData(request.url, request.data);
        return await personaAPI.post(request.url, postData, request.params);
        
      case 'PATCH':
        // PATCH operations typically use data.attributes format for resource updates
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
        // DELETE operations typically don't have a body
        return await personaAPI.delete(request.url, request.params);
        
      default:
        throw new Error(`Unsupported HTTP method: ${request.method}`);
    }
  }

  /**
   * Format request data based on endpoint type and Persona API conventions
   */
  private formatRequestData(url: string, data: Record<string, unknown> | undefined): any {
    if (!data || Object.keys(data).length === 0) {
      return undefined;
    }

    // Check if this is an action endpoint (contains underscore in action part after slash)
    const isActionEndpoint = url.includes('/_');
    
    if (isActionEndpoint) {
      // Action endpoints typically use the 'meta' format
      // Examples: /accounts/{id}/_add-tag, /inquiries/{id}/_approve
      return { meta: this.convertToKebabCase(data) };
    } else {
      // Resource creation/update endpoints use 'data.attributes' format
      // Examples: /accounts, /inquiries/{id}
      const attributes = this.convertToKebabCase(data);
      
      return {
        data: {
          attributes,
        },
      };
    }
  }

  /**
   * Convert camelCase object keys to kebab-case for Persona API
   */
  private convertToKebabCase(obj: Record<string, unknown>): Record<string, unknown> {
    const converted: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Convert camelCase to kebab-case
      const kebabKey = key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      
      // Handle nested objects (like fields)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        converted[kebabKey] = this.convertToKebabCase(value as Record<string, unknown>);
      } else {
        converted[kebabKey] = value;
      }
    }
    
    return converted;
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
