/**
 * Security validation utilities for Persona API MCP Server
 * 
 * This module provides security-focused validation functions to ensure
 * safe handling of user inputs and API parameters. Based on patterns
 * from Anthropic's filesystem MCP server implementation.
 */

import { z } from 'zod';

/**
 * Security validation utilities
 */
export class SecurityValidator {
  /**
   * Validate inquiry ID format
   * Ensures IDs match expected Persona API format
   */
  static validateInquiryId(id: string): boolean {
    if (typeof id !== 'string' || !id) {
      return false;
    }

    // Reject null bytes (security vulnerability)
    if (id.includes('\x00')) {
      return false;
    }

    // Validate Persona inquiry ID format: inq_[alphanumeric_-]
    return /^inq_[a-zA-Z0-9_-]+$/.test(id);
  }

  /**
   * Validate inquiry template ID format
   */
  static validateInquiryTemplateId(id: string): boolean {
    if (typeof id !== 'string' || !id) {
      return false;
    }

    // Reject null bytes
    if (id.includes('\x00')) {
      return false;
    }

    // Validate template ID format: itmpl_[alphanumeric_-]
    return /^itmpl_[a-zA-Z0-9_-]+$/.test(id);
  }

  /**
   * Validate account ID format
   */
  static validateAccountId(id: string): boolean {
    if (typeof id !== 'string' || !id) {
      return false;
    }

    // Reject null bytes
    if (id.includes('\x00')) {
      return false;
    }

    // Validate account ID format: acct_[alphanumeric_-]
    return /^acct_[a-zA-Z0-9_-]+$/.test(id);
  }

  /**
   * Sanitize and validate generic string input
   * Removes potentially dangerous characters and validates basic constraints
   */
  static sanitizeString(input: unknown, maxLength: number = 1000): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    // Reject null bytes
    if (input.includes('\x00')) {
      throw new Error('Input contains invalid null bytes');
    }

    // Validate length
    if (input.length > maxLength) {
      throw new Error(`Input exceeds maximum length of ${maxLength} characters`);
    }

    // Remove control characters except standard whitespace
    const sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return sanitized.trim();
  }

  /**
   * Validate and sanitize pagination parameters
   */
  static validatePagination(params: {
    limit?: unknown;
    offset?: unknown;
    cursor?: unknown;
  }): {
    limit?: number;
    offset?: number;
    cursor?: string;
  } {
    const result: { limit?: number; offset?: number; cursor?: string } = {};

    // Validate limit
    if (params.limit !== undefined) {
      if (typeof params.limit !== 'number' || !Number.isInteger(params.limit)) {
        throw new Error('Limit must be an integer');
      }
      if (params.limit < 1 || params.limit > 1000) {
        throw new Error('Limit must be between 1 and 1000');
      }
      result.limit = params.limit;
    }

    // Validate offset
    if (params.offset !== undefined) {
      if (typeof params.offset !== 'number' || !Number.isInteger(params.offset)) {
        throw new Error('Offset must be an integer');
      }
      if (params.offset < 0) {
        throw new Error('Offset must be non-negative');
      }
      result.offset = params.offset;
    }

    // Validate cursor
    if (params.cursor !== undefined) {
      result.cursor = this.sanitizeString(params.cursor, 100);
    }

    return result;
  }

  /**
   * Validate enum values against allowed options
   */
  static validateEnum<T extends string>(
    value: unknown,
    allowedValues: readonly T[],
    fieldName: string
  ): T {
    if (typeof value !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }

    const sanitized = this.sanitizeString(value, 50);

    if (!allowedValues.includes(sanitized as T)) {
      throw new Error(
        `Invalid ${fieldName}. Must be one of: ${allowedValues.join(', ')}`
      );
    }

    return sanitized as T;
  }

  /**
   * Validate object input against schema
   * Provides detailed error messages for validation failures
   */
  static validateInput<T>(
    input: unknown,
    schema: z.ZodSchema<T>,
    context?: string
  ): T {
    try {
      return schema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const contextMsg = context ? ` for ${context}` : '';
        const errorMessages = error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        throw new Error(`Invalid input${contextMsg}: ${errorMessages}`);
      }
      throw error;
    }
  }

  /**
   * Rate limiting check (placeholder for future implementation)
   */
  static checkRateLimit(identifier: string): boolean {
    // TODO: Implement rate limiting logic
    // For now, always allow
    return true;
  }

  /**
   * Validate API response structure
   * Ensures responses match expected format before processing
   */
  static validateApiResponse(response: unknown): void {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid API response: must be an object');
    }

    const apiResponse = response as Record<string, unknown>;

    // Check for standard error indicators
    if (apiResponse.error) {
      const errorMsg = typeof apiResponse.error === 'string' 
        ? apiResponse.error 
        : 'Unknown API error';
      throw new Error(`API error: ${errorMsg}`);
    }

    // Validate response has expected structure
    if (!apiResponse.data && !apiResponse.errors && !apiResponse.results) {
      throw new Error('Invalid API response: missing data, errors, or results field');
    }
  }
}

/**
 * Security-focused error class
 */
export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'SECURITY_VIOLATION',
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Input validation schemas using Zod
 * These provide runtime type safety and detailed error messages
 */
export const SecuritySchemas = {
  /**
   * Inquiry ID validation schema
   */
  inquiryId: z.string()
    .min(1, 'Inquiry ID is required')
    .max(100, 'Inquiry ID too long')
    .refine(
      (id) => SecurityValidator.validateInquiryId(id),
      'Invalid inquiry ID format. Must match pattern: inq_[alphanumeric_-]'
    ),

  /**
   * Inquiry template ID validation schema
   */
  inquiryTemplateId: z.string()
    .min(1, 'Inquiry template ID is required')
    .max(100, 'Inquiry template ID too long')
    .refine(
      (id) => SecurityValidator.validateInquiryTemplateId(id),
      'Invalid inquiry template ID format. Must match pattern: itmpl_[alphanumeric_-]'
    ),

  /**
   * Account ID validation schema
   */
  accountId: z.string()
    .min(1, 'Account ID is required')
    .max(100, 'Account ID too long')
    .refine(
      (id) => SecurityValidator.validateAccountId(id),
      'Invalid account ID format. Must match pattern: acct_[alphanumeric_-]'
    ),

  /**
   * Pagination parameters schema
   */
  pagination: z.object({
    limit: z.number()
      .int('Limit must be an integer')
      .min(1, 'Limit must be at least 1')
      .max(1000, 'Limit cannot exceed 1000')
      .optional(),
    offset: z.number()
      .int('Offset must be an integer')
      .min(0, 'Offset must be non-negative')
      .optional(),
    cursor: z.string()
      .max(100, 'Cursor too long')
      .optional()
  }).optional(),

  /**
   * Safe string schema for general text input
   */
  safeString: z.string()
    .max(1000, 'String too long')
    .refine(
      (str) => !str.includes('\x00'),
      'String contains invalid null bytes'
    ),

  /**
   * Boolean flag schema
   */
  booleanFlag: z.boolean()
    .default(false)
    .describe('Boolean flag parameter'),

  /**
   * Generic object input schema
   */
  objectInput: z.record(z.unknown())
    .optional()
    .describe('Optional object parameters')
};