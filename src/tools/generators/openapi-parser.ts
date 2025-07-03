/**
 * OpenAPI Parser for Persona API
 * 
 * This module parses the Persona OpenAPI specification and generates
 * TypeScript types and tool definitions automatically.
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPIV3 } from '@apidevtools/swagger-parser';
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
  private api: OpenAPIV3.Document | null = null;
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
      this.api = await SwaggerParser.dereference(apiPath) as OpenAPIV3.Document;

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
      for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const) {
        const operation = pathItem[method];
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
      servers: this.api.servers?.map(server => ({
        url: server.url,
        description: server.description,
      })),
      paths: parsedPaths,
      components: {
        schemas: this.parseComponents(this.api.components?.schemas),
        parameters: this.parseComponentParameters(this.api.components?.parameters),
        responses: this.parseComponentResponses(this.api.components?.responses),
      },
    };
  }

  /**
   * Parse a single operation
   */
  private parseOperation(operation: OpenAPIV3.OperationObject, method: string): ParsedOperation | null {
    if (!operation.operationId) {
      logger.warn('Operation missing operationId', { method });
      return null;
    }

    return {
      operationId: operation.operationId,
      summary: operation.summary,
      description: operation.description,
      tags: operation.tags,
      parameters: operation.parameters?.map(param => this.parseParameter(param)).filter(Boolean) as ParsedParameter[],
      requestBody: operation.requestBody ? this.parseRequestBody(operation.requestBody) : undefined,
      responses: this.parseResponses(operation.responses || {}),
      externalDocs: operation.externalDocs,
    };
  }

  /**
   * Parse a parameter
   */
  private parseParameter(param: OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject): ParsedParameter | null {
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
  private parseRequestBody(requestBody: OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject): ParsedRequestBody {
    if ('$ref' in requestBody) {
      // Handle references
      return {
        content: {},
      };
    }

    const content: Record<string, { schema: ParsedSchema; examples?: Record<string, unknown> }> = {};

    for (const [mediaType, mediaTypeObject] of Object.entries(requestBody.content)) {
      content[mediaType] = {
        schema: this.parseSchema(mediaTypeObject.schema),
        examples: mediaTypeObject.examples as Record<string, unknown>,
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
  private parseResponses(responses: OpenAPIV3.ResponsesObject): Record<string, ParsedResponse> {
    const parsed: Record<string, ParsedResponse> = {};

    for (const [statusCode, response] of Object.entries(responses)) {
      if ('$ref' in response) {
        // Handle references
        continue;
      }

      const content: Record<string, { schema: ParsedSchema; examples?: Record<string, unknown> }> = {};

      if (response.content) {
        for (const [mediaType, mediaTypeObject] of Object.entries(response.content)) {
          content[mediaType] = {
            schema: this.parseSchema(mediaTypeObject.schema),
            examples: mediaTypeObject.examples as Record<string, unknown>,
          };
        }
      }

      parsed[statusCode] = {
        description: response.description,
        content: Object.keys(content).length > 0 ? content : undefined,
      };
    }

    return parsed;
  }

  /**
   * Parse a schema object
   */
  private parseSchema(schema: any): ParsedSchema {
    if (!schema) {
      return { type: 'unknown' };
    }

    if ('$ref' in schema) {
      return { $ref: schema.$ref };
    }

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
        parsed.properties[propName] = this.parseSchema(propSchema);
      }
      parsed.required = schema.required;
    }

    // Handle arrays
    if (schema.items) {
      parsed.items = this.parseSchema(schema.items);
    }

    // Handle composition
    if (schema.oneOf) {
      parsed.oneOf = schema.oneOf.map((s: any) => this.parseSchema(s));
    }
    if (schema.anyOf) {
      parsed.anyOf = schema.anyOf.map((s: any) => this.parseSchema(s));
    }
    if (schema.allOf) {
      parsed.allOf = schema.allOf.map((s: any) => this.parseSchema(s));
    }

    return parsed;
  }

  /**
   * Parse component schemas
   */
  private parseComponents(schemas?: Record<string, OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject>): Record<string, ParsedSchema> | undefined {
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
  private parseComponentParameters(parameters?: Record<string, OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject>): Record<string, ParsedParameter> | undefined {
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
  private parseComponentResponses(responses?: Record<string, OpenAPIV3.ReferenceObject | OpenAPIV3.ResponseObject>): Record<string, ParsedResponse> | undefined {
    if (!responses) return undefined;

    const parsed: Record<string, ParsedResponse> = {};
    for (const [name, response] of Object.entries(responses)) {
      if ('$ref' in response) continue;
      
      const content: Record<string, { schema: ParsedSchema; examples?: Record<string, unknown> }> = {};
      
      if (response.content) {
        for (const [mediaType, mediaTypeObject] of Object.entries(response.content)) {
          content[mediaType] = {
            schema: this.parseSchema(mediaTypeObject.schema),
            examples: mediaTypeObject.examples as Record<string, unknown>,
          };
        }
      }

      parsed[name] = {
        description: response.description,
        content: Object.keys(content).length > 0 ? content : undefined,
      };
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