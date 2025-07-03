/**
 * Resource Manager for MCP Resources
 * 
 * This module manages the exposure of API responses as MCP resources,
 * handling caching, resource URIs, and resource metadata.
 */

import { ReadResourceRequest, Resource } from '@modelcontextprotocol/sdk/types.js';
import { personaAPI } from '../api/client.js';
import { 
  inquiryCache, 
  generateInquiryCacheKey, 
  generateInquiryListCacheKey 
} from './cache.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, MCPError } from '../utils/errors.js';
import {
  Inquiry,
  APIResponse,
  QueryParams,
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
export type ResourceType = 'inquiry' | 'inquiry-list' | 'account' | 'verification' | 'report';

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

      // Add inquiry list resource
      resources.push({
        uri: 'persona://inquiries',
        name: 'All Inquiries',
        description: 'List of all inquiries from your organization',
        mimeType: 'application/json',
      });

      // Add cached inquiry resources
      const inquiryKeys = inquiryCache.keys();
      for (const key of inquiryKeys) {
        if (key.startsWith('inquiry:')) {
          const parts = key.split(':');
          if (parts.length >= 2) {
            const inquiryId = parts[1];
            resources.push({
              uri: `persona://inquiry/${inquiryId}`,
              name: `Inquiry ${inquiryId}`,
              description: `Details for inquiry ${inquiryId}`,
              mimeType: 'application/json',
            });
          }
        }
      }

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
  async readResource(request: ReadResourceRequest): Promise<{ contents: Array<{ type: 'text'; text: string }> }> {
    try {
      logger.logResourceAccess(request.uri, false);

      const content = await this.getResourceContent(request.uri);
      
      logger.logResourceAccess(request.uri, true, { 
        size: content.length,
      });

      return {
        contents: [
          {
            type: 'text',
            text: content,
          },
        ],
      };
    } catch (error) {
      logger.error('Failed to read resource', error as Error, { uri: request.uri });
      
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      throw new MCPError(`Failed to read resource: ${request.uri}`);
    }
  }

  /**
   * Get resource content based on URI
   */
  private async getResourceContent(uri: string): Promise<string> {
    const parsedUri = this.parseResourceUri(uri);

    switch (parsedUri.type) {
      case 'inquiry':
        return await this.getInquiryResource(parsedUri.id!, parsedUri.params);
      
      case 'inquiry-list':
        return await this.getInquiryListResource(parsedUri.params);
      
      default:
        throw new NotFoundError('Resource', uri);
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

      const pathParts = url.pathname.split('/').filter(Boolean);
      
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

      switch (resourceType) {
        case 'inquiry':
          if (!resourceId) {
            throw new Error('Inquiry ID required');
          }
          return { type: 'inquiry', id: resourceId, params };
        
        case 'inquiries':
          return { type: 'inquiry-list', params };
        
        case 'account':
          if (!resourceId) {
            throw new Error('Account ID required');
          }
          return { type: 'account', id: resourceId, params };
        
        case 'verification':
          if (!resourceId) {
            throw new Error('Verification ID required');
          }
          return { type: 'verification', id: resourceId, params };
        
        case 'report':
          if (!resourceId) {
            throw new Error('Report ID required');
          }
          return { type: 'report', id: resourceId, params };
        
        default:
          throw new Error(`Unknown resource type: ${resourceType}`);
      }
    } catch (error) {
      throw new NotFoundError('Resource', uri, { 
        parseError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get inquiry resource content
   */
  private async getInquiryResource(
    inquiryId: string, 
    params: Record<string, unknown>
  ): Promise<string> {
    const include = params.include as string[] | undefined;
    const cacheKey = generateInquiryCacheKey(inquiryId, include);
    
    // Try to get from cache first
    let inquiry = inquiryCache.get(cacheKey) as APIResponse<Inquiry> | null;
    
    if (!inquiry) {
      // Fetch from API
      logger.debug('Fetching inquiry from API', { inquiryId, include });
      
      inquiry = await personaAPI.getInquiry(inquiryId, {
        include,
        'fields[inquiry]': params['fields[inquiry]'] as string[] | undefined,
      });
      
      // Cache the response
      inquiryCache.set(cacheKey, inquiry);
    }

    return JSON.stringify(inquiry, null, 2);
  }

  /**
   * Get inquiry list resource content
   */
  private async getInquiryListResource(params: Record<string, unknown>): Promise<string> {
    const queryParams: QueryParams = {
      include: params.include as string[] | undefined,
      'fields[inquiry]': params['fields[inquiry]'] as string[] | undefined,
      'page[size]': params['page[size]'] as number | undefined,
      'page[after]': params['page[after]'] as string | undefined,
      'page[before]': params['page[before]'] as string | undefined,
      filter: params.filter as any,
    };

    const cacheKey = generateInquiryListCacheKey(queryParams);
    
    // Try to get from cache first
    let inquiries = inquiryCache.get(cacheKey) as APIResponse<Inquiry[]> | null;
    
    if (!inquiries) {
      // Fetch from API
      logger.debug('Fetching inquiry list from API', { params: queryParams });
      
      inquiries = await personaAPI.listInquiries(queryParams);
      
      // Cache the response
      inquiryCache.set(cacheKey, inquiries);
      
      // Also cache individual inquiries
      if (inquiries.data) {
        for (const inquiry of inquiries.data) {
          if (isInquiry(inquiry)) {
            const individualCacheKey = generateInquiryCacheKey(inquiry.id);
            inquiryCache.set(individualCacheKey, { data: inquiry });
          }
        }
      }
    }

    return JSON.stringify(inquiries, null, 2);
  }

  /**
   * Cache a resource response
   */
  cacheResource(
    resourceType: ResourceType,
    resourceId: string,
    data: unknown,
    customTtl?: number
  ): void {
    try {
      let cacheKey: string;
      
      switch (resourceType) {
        case 'inquiry':
          cacheKey = generateInquiryCacheKey(resourceId);
          break;
        default:
          cacheKey = `${resourceType}:${resourceId}`;
      }

      inquiryCache.set(cacheKey, data, customTtl);
      
      logger.debug('Cached resource', { 
        type: resourceType,
        id: resourceId,
        cacheKey,
      });
    } catch (error) {
      logger.error('Failed to cache resource', error as Error, {
        type: resourceType,
        id: resourceId,
      });
    }
  }

  /**
   * Invalidate cached resource
   */
  invalidateResource(resourceType: ResourceType, resourceId: string): void {
    try {
      let cacheKey: string;
      
      switch (resourceType) {
        case 'inquiry':
          cacheKey = generateInquiryCacheKey(resourceId);
          break;
        default:
          cacheKey = `${resourceType}:${resourceId}`;
      }

      const deleted = inquiryCache.delete(cacheKey);
      
      logger.debug('Invalidated resource cache', { 
        type: resourceType,
        id: resourceId,
        cacheKey,
        deleted,
      });
    } catch (error) {
      logger.error('Failed to invalidate resource cache', error as Error, {
        type: resourceType,
        id: resourceId,
      });
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      inquiry: inquiryCache.getStats(),
    };
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