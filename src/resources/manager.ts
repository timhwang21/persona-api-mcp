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
import {
  APIResponse,
  QueryParams,
  Inquiry,
  isInquiry,
} from '../api/types.js';

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
 * Resource type enumeration
 */
export type ResourceType = 'inquiry' | 'inquiry-list' | 'account' | 'account-list' | 'verification' | 'verification-list' | 'report' | 'report-list' | 'transaction' | 'transaction-list' | 'case' | 'case-list' | 'device' | 'device-list' | 'document' | 'document-list' | 'webhook' | 'webhook-list';

/**
 * Resource URI patterns
 */
export const RESOURCE_URI_PATTERNS = {
  inquiry: 'persona://inquiry/{id}',
  inquiryList: 'persona://inquiries',
  account: 'persona://account/{id}',
  verification: 'persona://verification/{id}',
  report: 'persona://report/{id}',
} as const;

/**
 * Resource Manager class
 */
export class ResourceManager {
  /**
   * List all available resources
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
      ];

      for (const config of endpointConfigs) {
        resources.push({
          uri: `persona://${config.path}`,
          name: config.name,
          description: config.description,
          mimeType: 'application/json',
        });
      }

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

      return {
        contents: [
          {
            uri: params.uri,
            mimeType: 'application/json',
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
      
      if (protocol !== 'persona') {
        throw new Error(`Invalid protocol: ${protocol}`);
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
        const singularType = this.getSingularResourceType(resourceType);
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
    };
    
    const listType = mapping[pluralName];
    if (!listType) {
      throw new Error(`Unknown list resource type: ${pluralName}`);
    }
    return listType;
  }

  /**
   * Get singular resource type from plural endpoint name
   */
  private getSingularResourceType(pluralName: string): ResourceType {
    const mapping: Record<string, ResourceType> = {
      'inquiries': 'inquiry',
      'accounts': 'account',
      'verifications': 'verification',
      'reports': 'report',
      'transactions': 'transaction',
      'cases': 'case',
      'devices': 'device',
      'documents': 'document',
      'webhooks': 'webhook',
    };
    
    const singularType = mapping[pluralName];
    if (!singularType) {
      throw new Error(`Unknown singular resource type: ${pluralName}`);
    }
    return singularType;
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