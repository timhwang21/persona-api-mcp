/**
 * Persona API Client
 * 
 * This module provides a comprehensive HTTP client for interacting with
 * Persona's REST API with authentication, retry logic, and error handling.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { getConfig } from '../utils/config.js';
import { logger, createTimer } from '../utils/logger.js';
import { PersonaAPIError, retryWithBackoff, handleError } from '../utils/errors.js';
import {
  APIResponse,
  APIErrorResponse,
  Inquiry,
  CreateInquiryRequest,
  UpdateInquiryRequest,
  QueryParams,
  PersonaHeaders,
  HTTPMethod,
  OneTimeLinkResponse,
  isAPIErrorResponse,
} from './types.js';

/**
 * Persona API Client class
 */
export class PersonaAPIClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly config = getConfig();

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: this.config.persona.apiUrl,
      timeout: this.config.persona.timeout,
      headers: this.getDefaultHeaders(),
    });

    this.setupInterceptors();
  }

  /**
   * Get default headers for API requests
   */
  private getDefaultHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.persona.apiKey}`,
      'Content-Type': 'application/json',
      'Persona-Version': '2023-01-05',
      'Key-Inflection': 'snake_case',
    };
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.logRequest(
          config.method?.toUpperCase() || 'GET',
          config.url || '',
          {
            params: config.params,
            hasData: !!config.data,
          }
        );
        return config;
      },
      (error) => {
        logger.error('Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        const duration = Date.now() - (response.config as any).startTime;
        logger.logResponse(
          response.config.method?.toUpperCase() || 'GET',
          response.config.url || '',
          response.status,
          duration,
          {
            size: JSON.stringify(response.data).length,
          }
        );
        return response;
      },
      (error) => {
        const duration = Date.now() - (error.config as any).startTime;
        logger.logResponse(
          error.config?.method?.toUpperCase() || 'GET',
          error.config?.url || '',
          error.response?.status || 0,
          duration,
          {
            errorType: error.constructor.name,
          }
        );

        // Convert axios errors to PersonaAPIError
        if (error.response) {
          throw PersonaAPIError.fromAxiosError(error);
        }
        
        // Network or timeout errors
        throw new PersonaAPIError(
          error.message || 'Network error',
          500,
          undefined,
          undefined,
          {
            code: error.code,
            timeout: error.code === 'ECONNABORTED',
          }
        );
      }
    );
  }

  /**
   * Make a raw API request with retry logic
   */
  private async makeRequest<T>(config: AxiosRequestConfig): Promise<T> {
    const timer = createTimer(`API ${config.method?.toUpperCase()} ${config.url}`);
    
    // Add start time for duration calculation
    (config as any).startTime = Date.now();

    try {
      const response = await retryWithBackoff(
        () => this.axiosInstance.request<T>(config),
        this.config.persona.retries,
        this.config.persona.retryDelay
      );

      timer.end({ success: true, status: response.status });
      return response.data;
    } catch (error) {
      timer.end({ success: false });
      handleError(error as Error, { method: config.method, url: config.url });
      throw error;
    }
  }

  /**
   * Build query string from parameters
   */
  private buildQueryParams(params: QueryParams = {}): Record<string, string> {
    const queryParams: Record<string, string> = {};

    // Handle pagination
    if (params['page[size]']) {
      queryParams['page[size]'] = params['page[size]'].toString();
    }
    if (params['page[after]']) {
      queryParams['page[after]'] = params['page[after]'];
    }
    if (params['page[before]']) {
      queryParams['page[before]'] = params['page[before]'];
    }

    // Handle includes
    if (params.include && params.include.length > 0) {
      queryParams.include = params.include.join(',');
    }

    // Handle field selection
    if (params['fields[inquiry]'] && params['fields[inquiry]'].length > 0) {
      queryParams['fields[inquiry]'] = params['fields[inquiry]'].join(',');
    }

    // Handle filters
    if (params.filter) {
      Object.entries(params.filter).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            queryParams[`filter[${key}]`] = value.join(',');
          } else {
            queryParams[`filter[${key}]`] = value.toString();
          }
        }
      });
    }

    return queryParams;
  }

  /**
   * Generate idempotency key for requests
   */
  private generateIdempotencyKey(): string {
    return `mcp-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }

  // Inquiry API Methods

  /**
   * List all inquiries
   */
  async listInquiries(params: QueryParams = {}): Promise<APIResponse<Inquiry[]>> {
    const queryParams = this.buildQueryParams(params);
    
    return this.makeRequest<APIResponse<Inquiry[]>>({
      method: 'GET',
      url: '/inquiries',
      params: queryParams,
    });
  }

  /**
   * Create a new inquiry
   */
  async createInquiry(
    request: CreateInquiryRequest,
    idempotencyKey?: string
  ): Promise<APIResponse<Inquiry>> {
    const headers: Record<string, string> = {};
    
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    } else {
      headers['Idempotency-Key'] = this.generateIdempotencyKey();
    }

    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'POST',
      url: '/inquiries',
      data: request,
      headers,
    });
  }

  /**
   * Retrieve an inquiry by ID
   */
  async getInquiry(
    inquiryId: string,
    params: Pick<QueryParams, 'include' | 'fields[inquiry]'> = {}
  ): Promise<APIResponse<Inquiry>> {
    const queryParams = this.buildQueryParams(params);
    
    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'GET',
      url: `/inquiries/${inquiryId}`,
      params: queryParams,
    });
  }

  /**
   * Update an inquiry
   */
  async updateInquiry(
    inquiryId: string,
    request: UpdateInquiryRequest,
    params: Pick<QueryParams, 'include' | 'fields[inquiry]'> = {}
  ): Promise<APIResponse<Inquiry>> {
    const queryParams = this.buildQueryParams(params);
    
    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'PATCH',
      url: `/inquiries/${inquiryId}`,
      data: request,
      params: queryParams,
    });
  }

  /**
   * Redact an inquiry (delete PII)
   */
  async redactInquiry(
    inquiryId: string,
    params: Pick<QueryParams, 'include' | 'fields[inquiry]'> = {}
  ): Promise<APIResponse<Inquiry>> {
    const queryParams = this.buildQueryParams(params);
    
    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'DELETE',
      url: `/inquiries/${inquiryId}`,
      params: queryParams,
    });
  }

  /**
   * Approve an inquiry
   */
  async approveInquiry(inquiryId: string): Promise<APIResponse<Inquiry>> {
    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'POST',
      url: `/inquiries/${inquiryId}/approve`,
    });
  }

  /**
   * Decline an inquiry
   */
  async declineInquiry(inquiryId: string): Promise<APIResponse<Inquiry>> {
    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'POST',
      url: `/inquiries/${inquiryId}/decline`,
    });
  }

  /**
   * Mark inquiry for review
   */
  async markInquiryForReview(inquiryId: string): Promise<APIResponse<Inquiry>> {
    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'POST',
      url: `/inquiries/${inquiryId}/mark-for-review`,
    });
  }

  /**
   * Expire an inquiry
   */
  async expireInquiry(inquiryId: string): Promise<APIResponse<Inquiry>> {
    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'POST',
      url: `/inquiries/${inquiryId}/expire`,
    });
  }

  /**
   * Resume an inquiry
   */
  async resumeInquiry(inquiryId: string): Promise<APIResponse<Inquiry>> {
    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'POST',
      url: `/inquiries/${inquiryId}/resume`,
    });
  }

  /**
   * Generate one-time link for inquiry
   */
  async generateInquiryOneTimeLink(inquiryId: string): Promise<OneTimeLinkResponse> {
    return this.makeRequest<OneTimeLinkResponse>({
      method: 'POST',
      url: `/inquiries/${inquiryId}/generate-one-time-link`,
    });
  }

  /**
   * Add tag to inquiry
   */
  async addInquiryTag(inquiryId: string, tag: string): Promise<APIResponse<Inquiry>> {
    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'POST',
      url: `/inquiries/${inquiryId}/add-tag`,
      data: {
        meta: {
          tag_name: tag,
        },
      },
    });
  }

  /**
   * Remove tag from inquiry
   */
  async removeInquiryTag(inquiryId: string, tag: string): Promise<APIResponse<Inquiry>> {
    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'POST',
      url: `/inquiries/${inquiryId}/remove-tag`,
      data: {
        meta: {
          tag_name: tag,
        },
      },
    });
  }

  /**
   * Set all tags for inquiry
   */
  async setInquiryTags(inquiryId: string, tags: string[]): Promise<APIResponse<Inquiry>> {
    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'POST',
      url: `/inquiries/${inquiryId}/set-tags`,
      data: {
        meta: {
          tag_names: tags,
        },
      },
    });
  }

  /**
   * Print inquiry
   */
  async printInquiry(inquiryId: string): Promise<APIResponse<Inquiry>> {
    return this.makeRequest<APIResponse<Inquiry>>({
      method: 'POST',
      url: `/inquiries/${inquiryId}/print`,
    });
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<{ status: 'ok'; timestamp: string }> {
    try {
      // Try to list inquiries with minimal data to check API connectivity
      await this.listInquiries({ 'page[size]': 1 });
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Health check failed', error as Error);
      throw error;
    }
  }
}

/**
 * Global API client instance
 */
export const personaAPI = new PersonaAPIClient();