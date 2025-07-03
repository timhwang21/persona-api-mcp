/**
 * Resource Manager for MCP Resources
 * 
 * This module manages the exposure of API responses as MCP resources,
 * handling caching, resource URIs, and resource metadata.
 */

import { Resource } from '@modelcontextprotocol/sdk/types.js';
import { personaAPI } from '../api/client.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, MCPError } from '../utils/errors.js';

/**
 * Resource metadata
 */
export interface ResourceMetadata {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  lastModified?: string;
  size?: number;
  tags?: string[];
}

/**
 * Resource type enumeration -- must be updated to expose new resources
 */
export type ResourceType = 'inquiry' | 'inquiry-list' | 'account' | 'account-list' | 'verification' | 'verification-list' | 'report' | 'report-list' | 'transaction' | 'transaction-list' | 'case' | 'case-list' | 'device' | 'device-list' | 'document' | 'document-list' | 'webhook' | 'webhook-list' | 'api-key' | 'api-key-list' | 'api-log' | 'api-log-list' | 'client-token' | 'client-token-list' | 'event' | 'event-list' | 'importer' | 'importer-list' | 'inquiry-session' | 'inquiry-session-list' | 'inquiry-template' | 'inquiry-template-list' | 'list' | 'list-list' | 'user-audit-log' | 'user-audit-log-list' | 'workflow-run' | 'workflow-run-list' | 'openapi-spec' | 'usage-guide' | 'api-schemas' | 'tool-list';

/**
 * Resource Manager class
 */
export class ResourceManager {
  /**
   * List all available resources -- must be updated to expose new resources
   */
  async listResources(): Promise<Resource[]> {
    try {
      const resources: Resource[] = [];

      // Add universal list resources for all major API endpoints
      const endpointConfigs = [
        { path: 'inquiries', name: 'All Inquiries', description: 'List of all inquiries from your organization' },
        { path: 'accounts', name: 'All Accounts', description: 'List of all accounts from your organization' },
        { path: 'verifications', name: 'All Verifications', description: 'List of all verifications from your organization' },
        { path: 'reports', name: 'All Reports', description: 'List of all reports from your organization' },
        { path: 'transactions', name: 'All Transactions', description: 'List of all transactions from your organization' },
        { path: 'cases', name: 'All Cases', description: 'List of all cases from your organization' },
        { path: 'devices', name: 'All Devices', description: 'List of all devices from your organization' },
        { path: 'documents', name: 'All Documents', description: 'List of all documents from your organization' },
        { path: 'webhooks', name: 'All Webhooks', description: 'List of all webhooks from your organization' },
        { path: 'api-keys', name: 'All API Keys', description: 'List of all API keys from your organization' },
        { path: 'api-logs', name: 'All API Logs', description: 'List of all API logs from your organization' },
        { path: 'client-tokens', name: 'All Client Tokens', description: 'List of all client tokens from your organization' },
        { path: 'events', name: 'All Events', description: 'List of all events from your organization' },
        { path: 'importers', name: 'All Importers', description: 'List of all importers from your organization' },
        { path: 'inquiry-sessions', name: 'All Inquiry Sessions', description: 'List of all inquiry sessions from your organization' },
        { path: 'inquiry-templates', name: 'All Inquiry Templates', description: 'List of all inquiry templates from your organization' },
        { path: 'lists', name: 'All Lists', description: 'List of all lists from your organization' },
        { path: 'user-audit-logs', name: 'All User Audit Logs', description: 'List of all user audit logs from your organization' },
        { path: 'workflow-runs', name: 'All Workflow Runs', description: 'List of all workflow runs from your organization' },
      ];

      for (const config of endpointConfigs) {
        resources.push({
          uri: `persona://${config.path}`,
          name: config.name,
          description: config.description,
          mimeType: 'application/json',
        });
        
        // Also advertise individual resource pattern for this endpoint
        const singularName = this.getSingularName(config.path);
        const idFormat = this.getIdFormatForResource(config.path);
        resources.push({
          uri: `persona://${config.path}/{id}`,
          name: `Individual ${singularName.charAt(0).toUpperCase() + singularName.slice(1)}`,
          description: `Get a specific ${singularName} by ID. Replace {id} with actual ${singularName} ID (format: ${idFormat})`,
          mimeType: 'application/json',
        });
      }

      // Add documentation resources
      const docResources = [
        {
          uri: 'openapi://openapi.yaml',
          name: 'OpenAPI Specification',
          description: 'Complete OpenAPI 3.0 specification for the Persona API - use this to understand endpoints, schemas, and parameters',
          mimeType: 'application/x-yaml',
        },
        {
          uri: 'openapi://usage-guide',
          name: 'MCP Usage Guide', 
          description: 'Comprehensive guide on how to use this MCP server effectively with examples and best practices',
          mimeType: 'text/markdown',
        },
        {
          uri: 'openapi://schemas',
          name: 'API Schemas',
          description: 'Summary of important API schemas and data structures for common operations',
          mimeType: 'application/json',
        },
        {
          uri: 'openapi://tools',
          name: 'Available Tools',
          description: 'Complete list of all generated MCP tools with their parameters and usage',
          mimeType: 'application/json',
        },
      ];

      resources.push(...docResources);

      // Note: Individual resources are only exposed when accessed directly via URI

      logger.debug('Listed resources', { count: resources.length });
      return resources;
    } catch (error) {
      logger.error('Failed to list resources', error as Error);
      throw new MCPError('Failed to list resources');
    }
  }

  /**
   * Read a specific resource
   */
  async readResource(params: { uri: string }): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
    try {
      logger.logResourceAccess(params.uri, false);

      const content = await this.getResourceContent(params.uri);
      
      logger.logResourceAccess(params.uri, true, { 
        size: content.length,
      });

      // Determine MIME type based on URI
      let mimeType = 'application/json'; // Default
      if (params.uri.includes('openapi.yaml')) {
        mimeType = 'application/x-yaml';
      } else if (params.uri.includes('usage-guide')) {
        mimeType = 'text/markdown';
      }

      return {
        contents: [
          {
            uri: params.uri,
            mimeType,
            text: content,
          },
        ],
      };
    } catch (error) {
      logger.error('Failed to read resource', error as Error, { uri: params.uri });
      
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      throw new MCPError(`Failed to read resource: ${params.uri}`);
    }
  }

  /**
   * Get resource content based on URI
   */
  private async getResourceContent(uri: string): Promise<string> {
    try {
      logger.debug('Parsing resource URI', { uri });
      const parsedUri = this.parseResourceUri(uri);
      logger.debug('Parsed resource URI', { parsedUri });

      // Handle documentation resources
      if (parsedUri.type === 'openapi-spec' || parsedUri.type === 'usage-guide' || parsedUri.type === 'api-schemas' || parsedUri.type === 'tool-list') {
        logger.debug('Handling documentation resource', { type: parsedUri.type });
        return await this.getDocumentationResource(parsedUri.type, parsedUri.params);
      }

      // Universal resource handling
      if (parsedUri.type.endsWith('-list')) {
        // Handle list resources (e.g., account-list, verification-list)
        logger.debug('Handling list resource', { type: parsedUri.type });
        return await this.getUniversalListResource(parsedUri.type, parsedUri.params);
      } else {
        // Handle individual resources (e.g., account, verification)
        logger.debug('Handling individual resource', { type: parsedUri.type, id: parsedUri.id });
        return await this.getUniversalResource(parsedUri.type, parsedUri.id!, parsedUri.params);
      }
    } catch (error) {
      logger.error('Error in getResourceContent', error as Error, { 
        uri,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Parse resource URI into components
   */
  private parseResourceUri(uri: string): {
    type: ResourceType;
    id?: string;
    params: Record<string, unknown>;
  } {
    try {
      const url = new URL(uri);
      const protocol = url.protocol.slice(0, -1); // Remove trailing ':'
      
      if (protocol !== 'persona' && protocol !== 'openapi') {
        throw new Error(`Invalid protocol: ${protocol}`);
      }

      // Handle documentation resources (openapi://)
      if (protocol === 'openapi') {
        return this.parseOpenAPIResourceUri(url);
      }

      // Handle persona:// URIs correctly
      // For persona://accounts, url.hostname is 'accounts' and url.pathname is ''
      // For persona://accounts/acc_123, url.hostname is 'accounts' and url.pathname is '/acc_123'
      let pathParts: string[] = [];
      
      if (url.hostname) {
        // Start with the hostname as the resource type
        pathParts.push(url.hostname);
        
        // Add any path parts if present
        if (url.pathname && url.pathname !== '/') {
          const additionalParts = url.pathname.split('/').filter(Boolean);
          pathParts = pathParts.concat(additionalParts);
        }
      }
      
      if (pathParts.length === 0) {
        throw new Error('Empty path');
      }

      // Parse query parameters
      const params: Record<string, unknown> = {};
      for (const [key, value] of url.searchParams.entries()) {
        try {
          params[key] = JSON.parse(value);
        } catch {
          params[key] = value;
        }
      }

      // Route based on path
      const [resourceType, resourceId] = pathParts;

      if (!resourceType) {
        throw new Error('Resource type is required');
      }

      // Universal resource routing for all API endpoints
      if (resourceId) {
        // Individual resource (e.g., persona://account/acc_123)
        // Convert plural to singular for individual resources
        const singularType = this.getSingularName(resourceType);
        return { type: singularType, id: resourceId, params };
      } else {
        // List resource (e.g., persona://accounts)
        const listType = this.getListResourceType(resourceType);
        return { type: listType, params };
      }
    } catch (error) {
      throw new NotFoundError('Resource', uri, { 
        parseError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get singular name from plural endpoint name
   */
  private getSingularName(pluralName: string): ResourceType {
    const singularMap: Record<string, ResourceType> = {
      'inquiries': 'inquiry',
      'accounts': 'account',
      'verifications': 'verification',
      'reports': 'report', 
      'transactions': 'transaction',
      'cases': 'case',
      'devices': 'device',
      'documents': 'document',
      'webhooks': 'webhook',
      'api-keys': 'api-key',
      'api-logs': 'api-log',
      'client-tokens': 'client-token',
      'events': 'event',
      'importers': 'importer',
      'inquiry-sessions': 'inquiry-session',
      'inquiry-templates': 'inquiry-template',
      'lists': 'list',
      'user-audit-logs': 'user-audit-log',
      'workflow-runs': 'workflow-run',
    };
    
    return singularMap[pluralName] || pluralName.replace(/s$/, '') as ResourceType;
  }

  /**
   * Get ID format hint for a resource endpoint
   */
  private getIdFormatForResource(pluralName: string): string {
    const formatMap: Record<string, string> = {
      'inquiries': 'inq_xxx',
      'accounts': 'acc_xxx', 
      'verifications': 'ver_xxx',
      'reports': 'rpt_xxx',
      'transactions': 'txn_xxx',
      'cases': 'cas_xxx',
      'devices': 'dev_xxx',
      'documents': 'doc_xxx',
      'webhooks': 'wbh_xxx',
      'api-keys': 'akey_xxx',
      'api-logs': 'req_xxx',
      'client-tokens': 'ctkn_xxx',
      'events': 'evt_xxx',
      'importers': 'mprt_xxx',
      'inquiry-sessions': 'iqse_xxx',
      'inquiry-templates': 'itmpl_xxx',
      'lists': 'lst_xxx',
      'user-audit-logs': 'ual_xxx',
      'workflow-runs': 'wfr_xxx',
    };
    return formatMap[pluralName] || 'xxx_yyy';
  }

  /**
   * Get list resource type from plural endpoint name
   */
  private getListResourceType(pluralName: string): ResourceType {
    const mapping: Record<string, ResourceType> = {
      'inquiries': 'inquiry-list',
      'accounts': 'account-list',
      'verifications': 'verification-list',
      'reports': 'report-list',
      'transactions': 'transaction-list',
      'cases': 'case-list',
      'devices': 'device-list',
      'documents': 'document-list',
      'webhooks': 'webhook-list',
      'api-keys': 'api-key-list',
      'api-logs': 'api-log-list',
      'client-tokens': 'client-token-list',
      'events': 'event-list',
      'importers': 'importer-list',
      'inquiry-sessions': 'inquiry-session-list',
      'inquiry-templates': 'inquiry-template-list',
      'lists': 'list-list',
      'user-audit-logs': 'user-audit-log-list',
      'workflow-runs': 'workflow-run-list',
    };
    
    const listType = mapping[pluralName];
    if (!listType) {
      throw new Error(`Unknown list resource type: ${pluralName}`);
    }
    return listType;
  }

  /**
   * Parse OpenAPI documentation resource URI
   */
  private parseOpenAPIResourceUri(url: URL): {
    type: ResourceType;
    id?: string;
    params: Record<string, unknown>;
  } {
    // For openapi:// URLs, the resource name can be in hostname or pathname
    // openapi://openapi.yaml -> hostname: 'openapi.yaml', pathname: ''
    // openapi://host/path -> hostname: 'host', pathname: '/path'
    let path = url.pathname.replace(/^\//, ''); // Remove leading slash
    if (!path && url.hostname) {
      // If pathname is empty, use hostname as the resource name
      path = url.hostname;
    }
    
    const params: Record<string, unknown> = {};
    
    // Parse query parameters
    for (const [key, value] of url.searchParams.entries()) {
      try {
        params[key] = JSON.parse(value);
      } catch {
        params[key] = value;
      }
    }

    // Map OpenAPI paths to resource types
    switch (path) {
      case 'openapi.yaml':
        return { type: 'openapi-spec', params };
      case 'usage-guide':
        return { type: 'usage-guide', params };
      case 'schemas':
        return { type: 'api-schemas', params };
      case 'tools':
        return { type: 'tool-list', params };
      default:
        throw new Error(`Unknown OpenAPI resource: ${path}`);
    }
  }


  /**
   * Get documentation resource content
   */
  private async getDocumentationResource(
    docType: ResourceType,
    _params: Record<string, unknown>
  ): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const PROJECT_ROOT = path.resolve(__dirname, '../..');

    switch (docType) {
      case 'openapi-spec': {
        // Read the OpenAPI specification file
        const openApiPath = path.join(PROJECT_ROOT, 'openapi', 'openapi.yaml');
        try {
          const content = fs.readFileSync(openApiPath, 'utf-8');
          return content;
        } catch (error) {
          throw new Error(`Failed to read OpenAPI specification: ${(error as Error).message}`);
        }
      }

      case 'usage-guide': {
        // Generate comprehensive usage guide
        const guide = `# Persona API MCP Server - Usage Guide

## Overview
This MCP server provides universal access to ALL Persona API endpoints through three interfaces:

### 1. Resources (Read Operations)
Use \`persona://\` URIs to read data without making changes:

**List Resources:**
- \`persona://inquiries\` - List all inquiries
- \`persona://accounts\` - List all accounts
- \`persona://verifications\` - List all verifications
- \`persona://reports\` - List all reports
- \`persona://transactions\` - List all transactions
- \`persona://cases\` - List all cases
- \`persona://devices\` - List all devices
- \`persona://documents\` - List all documents
- \`persona://webhooks\` - List all webhooks

**Individual Resources:**
- \`persona://inquiries/inq_123\` - Get specific inquiry
- \`persona://accounts/acc_456\` - Get specific account
- \`persona://verifications/ver_789\` - Get specific verification
- \`persona://reports/rpt_abc\` - Get specific report
- Use the pattern: \`persona://{resource_type}/{resource_id}\`

### 2. Tools (Write Operations)
Use MCP tools for operations that change state:

**Parameter Format:**
✅ **Correct:** Pass template/config fields at top level, user data in 'fields' object
\`\`\`json
{
  "inquiryTemplateId": "itmpl_abc123",
  "fields": {
    "nameFirst": "John",
    "nameLast": "Doe",
    "email": "john@example.com" 
  }
}
\`\`\`

❌ **Wrong:** Don't put user data at top level
\`\`\`json
{
  "inquiryTemplateId": "itmpl_abc123", 
  "nameFirst": "John",  // Wrong - should be in fields
  "nameLast": "Doe"     // Wrong - should be in fields
}
\`\`\`

❌ **Wrong:** Don't use data wrappers - MCP handles API structure automatically
\`\`\`json
{
  "data": "{\\"inquiryTemplateId\\": \\"itmpl_abc123\\"}"
}
\`\`\`

**Important:** The MCP automatically wraps your parameters in the required API format and converts field names to kebab-case for the API.

**Common Tools:**
- \`inquiry_create\` - Create new inquiry
- \`account_update\` - Update account information
- \`inquiry_approve\` - Approve an inquiry
- \`account_add_tag\` - Add tag to account

### 3. Documentation Resources
Use \`openapi://\` URIs to access documentation:

- \`openapi://openapi.yaml\` - Full OpenAPI specification
- \`openapi://usage-guide\` - This usage guide
- \`openapi://schemas\` - API schema reference
- \`openapi://tools\` - Available tools list

## Common Workflows

### Create an Inquiry
1. First get available templates: \`persona://inquiry-templates\` (if exists)
2. Use \`inquiry_create\` tool with template ID and required fields
3. Check result with: \`persona://inquiries/inq_newid\`

### Fetch and Analyze Inquiry
1. Get specific inquiry: \`persona://inquiries/inq_123\`
2. Analyze the data or check status
3. Use additional tools if needed based on inquiry state

### Update Account Information  
1. Get current account: \`persona://accounts/acc_123\`
2. Use \`account_update\` tool with changed fields only
3. Verify changes: \`persona://accounts/acc_123\`

### Troubleshooting
- Check parameter formats in \`openapi://openapi.yaml\`
- Use camelCase parameter names (not kebab-case)
- Required fields marked with [REQUIRED] in tool descriptions
- ID formats: inq_xxx, acc_xxx, itmpl_xxx, etc.
`;
        return guide;
      }

      case 'api-schemas': {
        // Generate API schemas summary
        const schemas = {
          commonIdFormats: {
            description: "Common ID formats used throughout the Persona API",
            formats: {
              "inquiry": "inq_xxx (e.g., inq_abc123)",
              "account": "acc_xxx (e.g., acc_def456)", 
              "verification": "ver_xxx (e.g., ver_ghi789)",
              "case": "cas_xxx (e.g., cas_jkl012)",
              "report": "rpt_xxx (e.g., rpt_mno345)",
              "transaction": "txn_xxx (e.g., txn_pqr678)",
              "template": "itmpl_xxx (e.g., itmpl_stu901)",
              "device": "dev_xxx (e.g., dev_vwx234)",
              "document": "doc_xxx (e.g., doc_yza567)",
              "webhook": "wbh_xxx (e.g., wbh_bcd890)"
            }
          },
          commonParameters: {
            description: "Common parameters used across many endpoints",
            pagination: {
              "page[size]": "Number of items per page (1-100, default 25)",
              "page[after]": "Cursor for next page",
              "page[before]": "Cursor for previous page"
            },
            filtering: {
              "include": "Include related resources (comma-separated)",
              "filter": "Filter results by criteria"
            }
          },
          requestBodyPatterns: {
            description: "Common request body patterns",
            create: {
              format: "data.attributes + fields for user data",
              example: {
                data: {
                  attributes: {
                    "inquiry-template-id": "itmpl_xxx",
                    "fields": {
                      "name-first": "John",
                      "name-last": "Doe", 
                      "email": "john@example.com",
                      "phone-number": "+1234567890"
                    }
                  }
                }
              },
              note: "User information goes in 'fields' object, not top-level attributes"
            },
            update: {
              format: "data.attributes", 
              example: {
                data: {
                  type: "account",
                  attributes: {
                    email: "new@example.com"
                  }
                }
              }
            },
            actions: {
              format: "meta",
              example: {
                meta: {
                  tagName: "high-risk"
                }
              }
            }
          }
        };
        return JSON.stringify(schemas, null, 2);
      }

      case 'tool-list': {
        // Get the tool factory to list available tools
        try {
          const { toolFactory } = await import('../tools/generators/tool-factory.js');
          const { readFileSync } = await import('fs');
          const { join } = await import('path');
          const yaml = await import('js-yaml');
          
          const tagsFile = join(PROJECT_ROOT, 'src', 'generated', 'api-tags.yaml');
          const tagsContent = readFileSync(tagsFile, 'utf-8');
          const tagsData = yaml.load(tagsContent) as { apiTags: string[] };
          
          await toolFactory.initialize();
          
          const toolSummary = {
            totalTags: tagsData.apiTags.length,
            availableTags: tagsData.apiTags,
            toolsByTag: {} as Record<string, any[]>,
            estimatedTotalTools: 0
          };

          // Generate sample tools for each tag to show structure
          for (const tag of tagsData.apiTags.slice(0, 3)) { // Sample first 3 tags
            try {
              const tools = toolFactory.generateToolsForTag(tag);
              toolSummary.toolsByTag[tag] = tools.map(tool => ({
                name: tool.name,
                description: tool.description.split('\\n')[0], // First line only
                hasRequiredParams: tool.inputSchema.required && tool.inputSchema.required.length > 0,
                parameterCount: Object.keys(tool.inputSchema.properties || {}).length,
                destructive: tool.destructiveHint || false,
                readOnly: tool.readOnlyHint || false,
                idempotent: tool.idempotentHint || false
              }));
              toolSummary.estimatedTotalTools += tools.length;
            } catch (error) {
              logger.warn(`Failed to generate tools for tag ${tag}`, { 
                error: (error as Error).message,
                tag
              });
            }
          }

          // Estimate total based on sample
          const avgToolsPerTag = toolSummary.estimatedTotalTools / Math.min(3, tagsData.apiTags.length);
          toolSummary.estimatedTotalTools = Math.round(avgToolsPerTag * tagsData.apiTags.length);

          return JSON.stringify(toolSummary, null, 2);
        } catch (error) {
          logger.error('Failed to generate tool list', error as Error);
          return JSON.stringify({
            error: 'Failed to generate tool list',
            message: (error as Error).message,
            fallback: 'Check the main server logs for available tools on startup'
          }, null, 2);
        }
      }

      default:
        throw new Error(`Unknown documentation resource type: ${docType}`);
    }
  }

  /**
   * Get universal list resource content (e.g., accounts, verifications)
   */
  private async getUniversalListResource(
    listType: ResourceType,
    params: Record<string, unknown>
  ): Promise<string> {
    // Map list types to correct API endpoints
    const endpointMapping: Record<string, string> = {
      'inquiry-list': 'inquiries',
      'account-list': 'accounts',
      'verification-list': 'verifications',
      'report-list': 'reports',
      'transaction-list': 'transactions',
      'case-list': 'cases',
      'device-list': 'devices',
      'document-list': 'documents',
      'webhook-list': 'webhooks',
      'api-key-list': 'api-keys',
      'api-log-list': 'api-logs',
      'client-token-list': 'client-tokens',
      'event-list': 'events',
      'importer-list': 'importers',
      'inquiry-session-list': 'inquiry-sessions',
      'inquiry-template-list': 'inquiry-templates',
      'list-list': 'lists',
      'user-audit-log-list': 'user-audit-logs',
      'workflow-run-list': 'workflow-runs',
    };
    
    const endpoint = endpointMapping[listType];
    if (!endpoint) {
      throw new Error(`Unknown list type: ${listType}`);
    }
    
    // Build query parameters
    const queryParams: Record<string, unknown> = {};
    if (params.include) queryParams.include = params.include;
    if (params['page[size]']) queryParams['page[size]'] = params['page[size]'];
    if (params['page[after]']) queryParams['page[after]'] = params['page[after]'];
    if (params['page[before]']) queryParams['page[before]'] = params['page[before]'];
    if (params.filter) queryParams.filter = params.filter;

    // Fetch from API using universal endpoint
    logger.debug(`Fetching ${endpoint} list from API`, { params: queryParams });
    
    try {
      const data = await personaAPI.get(`/${endpoint}`, queryParams);
      logger.debug(`Successfully fetched ${endpoint} data`, { hasData: !!data });
      return JSON.stringify(data, null, 2);
    } catch (error) {
      logger.error(`Failed to fetch ${endpoint} from API`, error as Error, { 
        endpoint,
        queryParams 
      });
      throw error;
    }
  }

  /**
   * Get universal individual resource content (e.g., account/acc_123)
   */
  private async getUniversalResource(
    resourceType: ResourceType,
    resourceId: string,
    params: Record<string, unknown>
  ): Promise<string> {
    // Map singular resource types to correct API endpoints
    const endpointMapping: Record<string, string> = {
      'inquiry': 'inquiries',
      'account': 'accounts',
      'verification': 'verifications',
      'report': 'reports',
      'transaction': 'transactions',
      'case': 'cases',
      'device': 'devices',
      'document': 'documents',
      'webhook': 'webhooks',
      'api-key': 'api-keys',
      'api-log': 'api-logs',
      'client-token': 'client-tokens',
      'event': 'events',
      'importer': 'importers',
      'inquiry-session': 'inquiry-sessions',
      'inquiry-template': 'inquiry-templates',
      'list': 'lists',
      'user-audit-log': 'user-audit-logs',
      'workflow-run': 'workflow-runs',
    };
    
    const endpoint = endpointMapping[resourceType];
    if (!endpoint) {
      throw new Error(`Unknown resource type: ${resourceType}`);
    }
    
    // Build query parameters
    const queryParams: Record<string, unknown> = {};
    if (params.include) queryParams.include = params.include;
    if (params[`fields[${resourceType}]`]) {
      queryParams[`fields[${resourceType}]`] = params[`fields[${resourceType}]`];
    }
    
    // Fetch from API
    logger.debug(`Fetching ${resourceType} from API`, { resourceId, params: queryParams });
    
    const data = await personaAPI.get(`/${endpoint}/${resourceId}`, queryParams);
    
    return JSON.stringify(data, null, 2);
  }


  /**
   * Generate resource URI
   */
  generateResourceUri(type: ResourceType, id?: string, params?: Record<string, unknown>): string {
    let uri: string;

    switch (type) {
      case 'inquiry':
        if (!id) {
          throw new Error('Inquiry ID required for inquiry resource URI');
        }
        uri = `persona://inquiry/${id}`;
        break;
      
      case 'inquiry-list':
        uri = 'persona://inquiries';
        break;
      
      case 'account':
        if (!id) {
          throw new Error('Account ID required for account resource URI');
        }
        uri = `persona://account/${id}`;
        break;
      
      case 'verification':
        if (!id) {
          throw new Error('Verification ID required for verification resource URI');
        }
        uri = `persona://verification/${id}`;
        break;
      
      case 'report':
        if (!id) {
          throw new Error('Report ID required for report resource URI');
        }
        uri = `persona://report/${id}`;
        break;
      
      default:
        throw new Error(`Unknown resource type: ${type}`);
    }

    // Add query parameters if provided
    if (params && Object.keys(params).length > 0) {
      const url = new URL(uri);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, JSON.stringify(value));
      }
      uri = url.toString();
    }

    return uri;
  }
}

/**
 * Global resource manager instance
 */
export const resourceManager = new ResourceManager();
