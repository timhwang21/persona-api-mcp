/**
 * OpenAPI Parser for Persona API
 * 
 * This module parses the Persona OpenAPI specification and generates
 * TypeScript types and tool definitions automatically.
 */

import SwaggerParser from '@apidevtools/swagger-parser';
// Note: OpenAPIV3 types come from the openapi-types package that swagger-parser depends on
type OpenAPIV3Document = any;
type OpenAPIV3OperationObject = any;
type OpenAPIV3ParameterObject = any;
type OpenAPIV3ReferenceObject = any;
type OpenAPIV3RequestBodyObject = any;
type OpenAPIV3ResponsesObject = any;
type OpenAPIV3SchemaObject = any;
import * as path from 'path';
import { logger } from '../../utils/logger.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ParsedSchema {
  type: string;
  properties?: Record<string, ParsedSchema>;
  items?: ParsedSchema;
  enum?: string[];
  description?: string;
  required?: string[];
  format?: string;
  example?: unknown;
  examples?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  oneOf?: ParsedSchema[];
  anyOf?: ParsedSchema[];
  allOf?: ParsedSchema[];
  $ref?: string;
}

export interface ParsedParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  schema: ParsedSchema;
  description?: string;
  example?: unknown;
}

export interface ParsedRequestBody {
  required?: boolean;
  content: Record<string, {
    schema: ParsedSchema;
    examples?: Record<string, unknown>;
  }>;
}

export interface ParsedResponse {
  description: string;
  content?: Record<string, {
    schema: ParsedSchema;
    examples?: Record<string, unknown>;
  }>;
}

export interface ParsedOperation {
  operationId: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responses: Record<string, ParsedResponse>;
  externalDocs?: {
    description?: string;
    url?: string;
  };
}

export interface ParsedPath {
  path: string;
  operations: Record<string, ParsedOperation>;
}

export interface ParsedAPI {
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: ParsedPath[];
  components?: {
    schemas?: Record<string, ParsedSchema>;
    parameters?: Record<string, ParsedParameter>;
    responses?: Record<string, ParsedResponse>;
  };
}

/**
 * OpenAPI Parser class
 */
export class OpenAPIParser {
  private api: OpenAPIV3Document | null = null;
  private readonly openApiPath: string;

  constructor() {
    // Path to the symlinked OpenAPI directory
    this.openApiPath = path.resolve(__dirname, '../../../openapi');
  }

  /**
   * Load and parse the OpenAPI specification
   */
  async loadAPI(): Promise<ParsedAPI> {
    try {
      logger.info('Loading OpenAPI specification', { path: this.openApiPath });

      const apiPath = path.join(this.openApiPath, 'openapi.yaml');
      this.api = await SwaggerParser.dereference(apiPath) as OpenAPIV3Document;

      logger.info('OpenAPI specification loaded successfully', {
        title: this.api.info.title,
        version: this.api.info.version,
        pathCount: Object.keys(this.api.paths || {}).length,
      });

      return this.parseAPI();
    } catch (error) {
      logger.error('Failed to load OpenAPI specification', error as Error);
      throw error;
    }
  }

  /**
   * Parse the loaded API into our simplified format
   */
  private parseAPI(): ParsedAPI {
    if (!this.api) {
      throw new Error('API not loaded. Call loadAPI() first.');
    }

    const parsedPaths: ParsedPath[] = [];

    // Parse paths and operations
    for (const [pathString, pathItem] of Object.entries(this.api.paths || {})) {
      if (!pathItem) continue;

      const operations: Record<string, ParsedOperation> = {};

      // Parse each HTTP method
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
      for (const method of methods) {
        const operation = (pathItem as any)[method];
        if (operation) {
          const parsedOp = this.parseOperation(operation, method);
          if (parsedOp) {
            operations[method] = parsedOp;
          }
        }
      }

      if (Object.keys(operations).length > 0) {
        parsedPaths.push({
          path: pathString,
          operations,
        });
      }
    }

    return {
      info: {
        title: this.api.info.title,
        version: this.api.info.version,
        description: this.api.info.description,
      },
      servers: this.api.servers?.map((server: any) => ({
        url: server.url,
        description: server.description,
      })),
      paths: parsedPaths,
      components: (() => {
        const components: {
          schemas?: Record<string, ParsedSchema>;
          parameters?: Record<string, ParsedParameter>;
          responses?: Record<string, ParsedResponse>;
        } = {};

        const schemas = this.parseComponents(this.api.components?.schemas);
        if (schemas) components.schemas = schemas;

        const parameters = this.parseComponentParameters(this.api.components?.parameters);
        if (parameters) components.parameters = parameters;

        const responses = this.parseComponentResponses(this.api.components?.responses);
        if (responses) components.responses = responses;

        return components;
      })(),
    };
  }

  /**
   * Parse a single operation
   */
  private parseOperation(operation: OpenAPIV3OperationObject, method: string): ParsedOperation | null {
    if (!operation.operationId) {
      logger.warn('Operation missing operationId', { method });
      return null;
    }

    const parsed: ParsedOperation = {
      operationId: operation.operationId,
      summary: operation.summary,
      description: operation.description,
      tags: operation.tags,
      parameters: operation.parameters?.map((param: any) => this.parseParameter(param)).filter(Boolean) as ParsedParameter[],
      responses: this.parseResponses(operation.responses || {}),
      externalDocs: operation.externalDocs,
    };

    if (operation.requestBody) {
      parsed.requestBody = this.parseRequestBody(operation.requestBody);
    }

    return parsed;
  }

  /**
   * Parse a parameter
   */
  private parseParameter(param: OpenAPIV3ReferenceObject | OpenAPIV3ParameterObject): ParsedParameter | null {
    if ('$ref' in param) {
      // Handle references - for now, skip them
      logger.warn('Parameter references not yet supported', { ref: param.$ref });
      return null;
    }

    return {
      name: param.name,
      in: param.in as 'query' | 'path' | 'header' | 'cookie',
      required: param.required || false,
      schema: this.parseSchema(param.schema),
      description: param.description,
      example: param.example,
    };
  }

  /**
   * Parse request body
   */
  private parseRequestBody(requestBody: OpenAPIV3ReferenceObject | OpenAPIV3RequestBodyObject): ParsedRequestBody {
    if ('$ref' in requestBody) {
      // Handle references
      return {
        content: {},
      };
    }

    const content: Record<string, { schema: ParsedSchema; examples?: Record<string, unknown> }> = {};

    for (const [mediaType, mediaTypeObject] of Object.entries(requestBody.content)) {
      const typedMediaType = mediaTypeObject as any;
      content[mediaType] = {
        schema: this.parseSchema(typedMediaType.schema),
        examples: typedMediaType.examples as Record<string, unknown>,
      };
    }

    return {
      required: requestBody.required,
      content,
    };
  }

  /**
   * Parse responses
   */
  private parseResponses(responses: OpenAPIV3ResponsesObject): Record<string, ParsedResponse> {
    const parsed: Record<string, ParsedResponse> = {};

    for (const [statusCode, response] of Object.entries(responses)) {
      const typedResponse = response as any;
      if ('$ref' in typedResponse) {
        // Handle references
        continue;
      }

      const content: Record<string, { schema: ParsedSchema; examples?: Record<string, unknown> }> = {};

      if (typedResponse.content) {
        for (const [mediaType, mediaTypeObject] of Object.entries(typedResponse.content)) {
          const typedMediaType = mediaTypeObject as any;
          content[mediaType] = {
            schema: this.parseSchema(typedMediaType.schema),
            examples: typedMediaType.examples as Record<string, unknown>,
          };
        }
      }

      const parsedResponse: ParsedResponse = {
        description: typedResponse.description,
      };

      if (Object.keys(content).length > 0) {
        parsedResponse.content = content;
      }

      parsed[statusCode] = parsedResponse;
    }

    return parsed;
  }

  /**
   * Parse a schema object
   */
  private parseSchema(schema: any, visited?: Set<any>): ParsedSchema {
    if (!schema) {
      return { type: 'unknown' };
    }

    if ('$ref' in schema) {
      return { type: 'unknown', $ref: schema.$ref };
    }

    // Initialize visited set if not provided
    if (!visited) {
      visited = new Set();
    }

    // Prevent circular references
    if (visited.has(schema)) {
      return { type: 'circular_reference' };
    }
    visited.add(schema);

    const parsed: ParsedSchema = {
      type: schema.type || 'unknown',
      description: schema.description,
      example: schema.example,
      examples: schema.examples,
      default: schema.default,
      format: schema.format,
      minimum: schema.minimum,
      maximum: schema.maximum,
      minLength: schema.minLength,
      maxLength: schema.maxLength,
      pattern: schema.pattern,
      enum: schema.enum,
    };

    // Handle object properties
    if (schema.properties) {
      parsed.properties = {};
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        parsed.properties[propName] = this.parseSchema(propSchema, visited);
      }
      parsed.required = schema.required;
    }

    // Handle arrays
    if (schema.items) {
      parsed.items = this.parseSchema(schema.items, visited);
    }

    // Handle composition
    if (schema.oneOf) {
      parsed.oneOf = schema.oneOf.map((s: any) => this.parseSchema(s, visited));
    }
    if (schema.anyOf) {
      parsed.anyOf = schema.anyOf.map((s: any) => this.parseSchema(s, visited));
    }
    if (schema.allOf) {
      parsed.allOf = schema.allOf.map((s: any) => this.parseSchema(s, visited));
    }

    return parsed;
  }

  /**
   * Parse component schemas
   */
  private parseComponents(schemas?: Record<string, OpenAPIV3ReferenceObject | OpenAPIV3SchemaObject>): Record<string, ParsedSchema> | undefined {
    if (!schemas) return undefined;

    const parsed: Record<string, ParsedSchema> = {};
    for (const [name, schema] of Object.entries(schemas)) {
      parsed[name] = this.parseSchema(schema);
    }
    return parsed;
  }

  /**
   * Parse component parameters
   */
  private parseComponentParameters(parameters?: Record<string, OpenAPIV3ReferenceObject | OpenAPIV3ParameterObject>): Record<string, ParsedParameter> | undefined {
    if (!parameters) return undefined;

    const parsed: Record<string, ParsedParameter> = {};
    for (const [name, param] of Object.entries(parameters)) {
      const parsedParam = this.parseParameter(param);
      if (parsedParam) {
        parsed[name] = parsedParam;
      }
    }
    return parsed;
  }

  /**
   * Parse component responses
   */
  private parseComponentResponses(responses?: Record<string, any>): Record<string, ParsedResponse> | undefined {
    if (!responses) return undefined;

    const parsed: Record<string, ParsedResponse> = {};
    for (const [name, response] of Object.entries(responses)) {
      if ('$ref' in response) continue;
      
      const content: Record<string, { schema: ParsedSchema; examples?: Record<string, unknown> }> = {};
      
      if (response.content) {
        for (const [mediaType, mediaTypeObject] of Object.entries(response.content)) {
          const typedMediaType = mediaTypeObject as any;
          content[mediaType] = {
            schema: this.parseSchema(typedMediaType.schema),
            examples: typedMediaType.examples as Record<string, unknown>,
          };
        }
      }

      const parsedResponse: ParsedResponse = {
        description: response.description,
      };

      if (Object.keys(content).length > 0) {
        parsedResponse.content = content;
      }

      parsed[name] = parsedResponse;
    }
    return parsed;
  }

  /**
   * Get operations by tag
   */
  getOperationsByTag(api: ParsedAPI, tag: string): Array<{ path: string; method: string; operation: ParsedOperation }> {
    const operations: Array<{ path: string; method: string; operation: ParsedOperation }> = [];

    for (const pathObj of api.paths) {
      for (const [method, operation] of Object.entries(pathObj.operations)) {
        if (operation.tags?.includes(tag)) {
          operations.push({
            path: pathObj.path,
            method,
            operation,
          });
        }
      }
    }

    return operations;
  }

  /**
   * Get operation by operation ID
   */
  getOperationById(api: ParsedAPI, operationId: string): { path: string; method: string; operation: ParsedOperation } | null {
    for (const pathObj of api.paths) {
      for (const [method, operation] of Object.entries(pathObj.operations)) {
        if (operation.operationId === operationId) {
          return {
            path: pathObj.path,
            method,
            operation,
          };
        }
      }
    }
    return null;
  }
}

/**
 * Global parser instance
 */
export const openAPIParser = new OpenAPIParser();