/**
 * Error handling utilities for Persona API MCP Server
 * 
 * This module defines custom error types and error handling utilities
 * for better error management throughout the application.
 */

import { logger } from './logger.js';

/**
 * Base error class for all application errors
 */
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly timestamp: string;
  readonly context: Record<string, unknown> | undefined;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.context = context;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON representation
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends AppError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 500;

  constructor(message: string, context?: Record<string, unknown>) {
    super(`Configuration error: ${message}`, context);
  }
}

/**
 * Persona API-related errors
 */
export class PersonaAPIError extends AppError {
  readonly code = 'PERSONA_API_ERROR';
  readonly statusCode: number;
  readonly apiStatusCode: number | undefined;
  readonly apiErrorCode: string | undefined;

  constructor(
    message: string,
    statusCode: number = 500,
    apiStatusCode?: number,
    apiErrorCode?: string,
    context?: Record<string, unknown>
  ) {
    super(`Persona API error: ${message}`, context);
    this.statusCode = statusCode;
    this.apiStatusCode = apiStatusCode;
    this.apiErrorCode = apiErrorCode;
  }

  static fromAxiosError(error: { 
    response?: { 
      status?: number; 
      data?: { errors?: Array<{ code?: string; detail?: string }> };
      headers?: unknown;
    }; 
    message?: string;
    config?: unknown;
  }): PersonaAPIError {
    const response = error.response;
    const statusCode = response?.status || 500;
    const apiErrorCode = response?.data?.errors?.[0]?.code;
    const message = response?.data?.errors?.[0]?.detail || error.message || 'Unknown API error';

    return new PersonaAPIError(
      message,
      statusCode,
      statusCode,
      apiErrorCode,
      {
        url: (error.config as any)?.url,
        method: (error.config as any)?.method,
        requestId: (response?.headers as any)?.['x-request-id'],
      }
    );
  }
}

/**
 * Authentication-related errors
 */
export class AuthenticationError extends AppError {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;

  constructor(message: string, context?: Record<string, unknown>) {
    super(`Authentication error: ${message}`, context);
  }
}

/**
 * Authorization-related errors
 */
export class AuthorizationError extends AppError {
  readonly code = 'AUTHORIZATION_ERROR';
  readonly statusCode = 403;

  constructor(message: string, context?: Record<string, unknown>) {
    super(`Authorization error: ${message}`, context);
  }
}

/**
 * Validation-related errors
 */
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  readonly validationErrors: Array<{ field: string; message: string; }> | undefined;

  constructor(
    message: string,
    validationErrors?: Array<{ field: string; message: string }>,
    context?: Record<string, unknown>
  ) {
    super(`Validation error: ${message}`, context);
    this.validationErrors = validationErrors;
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND_ERROR';
  readonly statusCode = 404;

  constructor(resource: string, identifier?: string, context?: Record<string, unknown>) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, context);
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends AppError {
  readonly code = 'RATE_LIMIT_ERROR';
  readonly statusCode = 429;
  readonly retryAfter: number | undefined;

  constructor(message: string, retryAfter?: number, context?: Record<string, unknown>) {
    super(`Rate limit exceeded: ${message}`, context);
    this.retryAfter = retryAfter;
  }
}


/**
 * MCP protocol errors
 */
export class MCPError extends AppError {
  readonly code = 'MCP_ERROR';
  readonly statusCode = 500;

  constructor(message: string, context?: Record<string, unknown>) {
    super(`MCP error: ${message}`, context);
  }
}

/**
 * Error handler function type
 */
export type ErrorHandler = (error: Error) => void | Promise<void>;

/**
 * Global error handler
 */
export function handleError(error: Error, context?: Record<string, unknown>): void {
  if (error instanceof AppError) {
    // Log application errors with appropriate level
    const logLevel = error.statusCode >= 500 ? 'error' : 'warn';
    if (logLevel === 'error') {
      logger.error(error.message, error, { ...error.context, ...context });
    } else {
      logger.warn(error.message, { ...error.context, ...context });
    }
  } else {
    // Log unexpected errors as errors
    logger.error('Unexpected error occurred', error, context);
  }
}

/**
 * Async error handler wrapper
 */
export function asyncErrorHandler<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  errorHandler?: ErrorHandler
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (errorHandler) {
        await errorHandler(error as Error);
      } else {
        handleError(error as Error);
      }
      throw error;
    }
  }) as T;
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 10000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        break;
      }

      // Don't retry on certain error types
      if (error instanceof AuthenticationError || 
          error instanceof AuthorizationError || 
          error instanceof ValidationError) {
        break;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      );

      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Safe async function execution with error handling
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  defaultValue: T,
  errorHandler?: ErrorHandler
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (errorHandler) {
      await errorHandler(error as Error);
    } else {
      handleError(error as Error);
    }
    return defaultValue;
  }
}