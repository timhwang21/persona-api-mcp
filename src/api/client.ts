/**
 * Persona API Client
 * 
 * This module provides a comprehensive HTTP client for interacting with
 * Persona's REST API with authentication, retry logic, and error handling.
 * 
 * IMPORTANT: This client is designed to be parameterized and work with
 * YAML-derived endpoints rather than having redundant methods for each resource.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { getConfig } from '../utils/config.js';
import { logger, createTimer } from '../utils/logger.js';
import { PersonaAPIError, retryWithBackoff } from '../utils/errors.js';
import {
  QueryParams,
  HTTPMethod,
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
   * Setup request/response interceptors for logging and error handling
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const timer = createTimer('api_request');
        (config as any).metadata = { timer };
        
        logger.info('API Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
          headers: this.sanitizeHeaders(config.headers as Record<string, any>),
        });
        
        return config;
      },
      (error) => {
        logger.error('Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => {
        const timer = (response.config as any).metadata?.timer;
        const duration = timer?.end({ success: true });
        
        logger.info('API Response', {
          status: response.status,
          method: response.config.method?.toUpperCase(),
          url: response.config.url,
          duration,
          dataSize: JSON.stringify(response.data).length,
        });
        
        return response;
      },
      (error) => {
        const timer = (error.config as any)?.metadata?.timer;
        const duration = timer?.end({ success: false });
        
        logger.error('API Error Response', error as Error, {
          status: error.response?.status,
          method: error.config?.method?.toUpperCase(),
          url: error.config?.url,
          duration,
          errorData: error.response?.data,
        });
        
        // Transform axios error to PersonaAPIError
        throw this.transformError(error);
      }
    );
  }

  /**
   * Sanitize headers for logging (remove sensitive information)
   */
  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sanitized = { ...headers };
    if (sanitized.Authorization) {
      sanitized.Authorization = 'Bearer [REDACTED]';
    }
    return sanitized;
  }

  /**
   * Transform axios error to PersonaAPIError
   */
  private transformError(error: any): PersonaAPIError {
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      
      if (isAPIErrorResponse(data)) {
        return new PersonaAPIError(
          data.errors[0]?.detail || `HTTP ${status} Error`,
          Number(status),
          Number(status),
          data.errors[0]?.code
        );
      } else {
        return new PersonaAPIError(
          `HTTP ${status} Error: ${data?.message || error.message}`,
          Number(status),
          Number(status)
        );
      }
    } else if (error.request) {
      // Request was made but no response received
      return new PersonaAPIError(
        'Network error: No response received from server',
        0,
        0,
        'NETWORK_ERROR'
      );
    } else {
      // Something else happened
      return new PersonaAPIError(
        `Request error: ${error.message}`,
        0,
        0,
        'REQUEST_ERROR'
      );
    }
  }

  /**
   * Build query parameters from object
   */
  private buildQueryParams(params: QueryParams): Record<string, string> {
    const queryParams: Record<string, string> = {};
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          queryParams[key] = value.join(',');
        } else {
          queryParams[key] = String(value);
        }
      }
    });
    
    return queryParams;
  }

  /**
   * Generate idempotency key for requests
   */
  private generateIdempotencyKey(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generic method to make API requests
   * This is the core method that all other operations should use
   */
  async makeRequest<T = any>(config: {
    method: HTTPMethod;
    url: string;
    data?: any;
    params?: QueryParams;
    headers?: Record<string, string>;
    timeout?: number;
  }): Promise<T> {
    const requestConfig: AxiosRequestConfig = {
      method: config.method,
      url: config.url,
    };
    
    if (config.data !== undefined) {
      requestConfig.data = config.data;
    }
    
    if (config.params) {
      requestConfig.params = this.buildQueryParams(config.params);
    }
    
    if (config.headers) {
      requestConfig.headers = config.headers;
    }
    
    if (config.timeout !== undefined) {
      requestConfig.timeout = config.timeout;
    }

    return retryWithBackoff(
      async () => {
        const response: AxiosResponse<T> = await this.axiosInstance.request(requestConfig);
        return response.data;
      },
      this.config.persona.retries,
      1000,
      10000
    );
  }

  /**
   * Generic GET request
   */
  async get<T = any>(url: string, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
    const config: any = {
      method: 'GET',
      url,
    };
    
    if (params) config.params = params;
    if (headers) config.headers = headers;
    
    return this.makeRequest<T>(config);
  }

  /**
   * Generic POST request
   */
  async post<T = any>(
    url: string, 
    data?: any, 
    params?: QueryParams, 
    headers?: Record<string, string>,
    idempotencyKey?: string
  ): Promise<T> {
    const requestHeaders = { ...headers };
    if (idempotencyKey) {
      requestHeaders['Idempotency-Key'] = idempotencyKey;
    } else if (data) {
      // Generate idempotency key for data-modifying operations
      requestHeaders['Idempotency-Key'] = this.generateIdempotencyKey();
    }

    const config: any = {
      method: 'POST',
      url,
      headers: requestHeaders,
    };
    
    if (data !== undefined) config.data = data;
    if (params) config.params = params;

    return this.makeRequest<T>(config);
  }

  /**
   * Generic PATCH request
   */
  async patch<T = any>(
    url: string, 
    data: any, 
    params?: QueryParams, 
    headers?: Record<string, string>,
    idempotencyKey?: string
  ): Promise<T> {
    const requestHeaders = { ...headers };
    if (idempotencyKey) {
      requestHeaders['Idempotency-Key'] = idempotencyKey;
    }

    const config: any = {
      method: 'PATCH',
      url,
      data,
      headers: requestHeaders,
    };
    
    if (params) config.params = params;

    return this.makeRequest<T>(config);
  }

  /**
   * Generic PUT request
   */
  async put<T = any>(
    url: string, 
    data: any, 
    params?: QueryParams, 
    headers?: Record<string, string>
  ): Promise<T> {
    const config: any = {
      method: 'PUT',
      url,
      data,
    };
    
    if (params) config.params = params;
    if (headers) config.headers = headers;

    return this.makeRequest<T>(config);
  }

  /**
   * Generic DELETE request
   */
  async delete<T = any>(url: string, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
    const config: any = {
      method: 'DELETE',
      url,
    };
    
    if (params) config.params = params;
    if (headers) config.headers = headers;

    return this.makeRequest<T>(config);
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<{ status: 'ok'; timestamp: string }> {
    try {
      // Try a simple GET request to check API connectivity
      await this.get('/inquiries', { 'page[size]': 1 });
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