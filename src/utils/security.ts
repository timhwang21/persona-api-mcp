/**
 * Security validation utilities for Persona API MCP Server
 * 
 * This module provides security-focused validation functions to ensure
 * safe handling of user inputs and API parameters. Based on patterns
 * from Anthropic's filesystem MCP server implementation.
 */

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
   * Rate limiting check (placeholder for future implementation)
   */
  static checkRateLimit(_identifier: string): boolean {
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
