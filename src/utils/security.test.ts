/**
 * Tests for Security validation utilities
 * Based on security test patterns from Anthropic's filesystem MCP server
 */

import { describe, it, expect } from 'vitest';
import { SecurityValidator, SecuritySchemas, SecurityError } from './security';

describe('SecurityValidator', () => {
  describe('validateInquiryId', () => {
    it('should validate correct inquiry ID format', () => {
      expect(SecurityValidator.validateInquiryId('inq_123abc')).toBe(true);
      expect(SecurityValidator.validateInquiryId('inq_test-inquiry_123')).toBe(true);
      expect(SecurityValidator.validateInquiryId('inq_ABC123def456')).toBe(true);
    });

    it('should reject invalid inquiry ID formats', () => {
      expect(SecurityValidator.validateInquiryId('invalid')).toBe(false);
      expect(SecurityValidator.validateInquiryId('123abc')).toBe(false);
      expect(SecurityValidator.validateInquiryId('inq_')).toBe(false);
      expect(SecurityValidator.validateInquiryId('inq_123@abc')).toBe(false);
      expect(SecurityValidator.validateInquiryId('inq_123 abc')).toBe(false);
    });

    it('should reject null bytes (security vulnerability)', () => {
      expect(SecurityValidator.validateInquiryId('inq_123\x00abc')).toBe(false);
      expect(SecurityValidator.validateInquiryId('\x00inq_123')).toBe(false);
      expect(SecurityValidator.validateInquiryId('inq_123\x00')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(SecurityValidator.validateInquiryId('')).toBe(false);
      expect(SecurityValidator.validateInquiryId(null as unknown as string)).toBe(false);
      expect(SecurityValidator.validateInquiryId(undefined as unknown as string)).toBe(false);
      expect(SecurityValidator.validateInquiryId(123 as unknown as string)).toBe(false);
    });
  });

  describe('validateInquiryTemplateId', () => {
    it('should validate correct template ID format', () => {
      expect(SecurityValidator.validateInquiryTemplateId('itmpl_123abc')).toBe(true);
      expect(SecurityValidator.validateInquiryTemplateId('itmpl_test-template_123')).toBe(true);
    });

    it('should reject invalid template ID formats', () => {
      expect(SecurityValidator.validateInquiryTemplateId('invalid')).toBe(false);
      expect(SecurityValidator.validateInquiryTemplateId('inq_123abc')).toBe(false);
      expect(SecurityValidator.validateInquiryTemplateId('itmpl_')).toBe(false);
    });
  });

  describe('validateAccountId', () => {
    it('should validate correct account ID format', () => {
      expect(SecurityValidator.validateAccountId('acct_123abc')).toBe(true);
      expect(SecurityValidator.validateAccountId('acct_test-account_123')).toBe(true);
    });

    it('should reject invalid account ID formats', () => {
      expect(SecurityValidator.validateAccountId('invalid')).toBe(false);
      expect(SecurityValidator.validateAccountId('inq_123abc')).toBe(false);
      expect(SecurityValidator.validateAccountId('acct_')).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('should sanitize valid strings', () => {
      expect(SecurityValidator.sanitizeString('hello world')).toBe('hello world');
      expect(SecurityValidator.sanitizeString('  test  ')).toBe('test');
      expect(SecurityValidator.sanitizeString('valid-string_123')).toBe('valid-string_123');
    });

    it('should remove control characters', () => {
      expect(SecurityValidator.sanitizeString('hello\x01world')).toBe('helloworld');
      expect(SecurityValidator.sanitizeString('test\x7fstring')).toBe('teststring');
      expect(SecurityValidator.sanitizeString('line1\nline2')).toBe('line1\nline2'); // Preserve newlines
    });

    it('should reject null bytes', () => {
      expect(() => SecurityValidator.sanitizeString('hello\x00world')).toThrow('null bytes');
    });

    it('should enforce length limits', () => {
      expect(() => SecurityValidator.sanitizeString('a'.repeat(1001))).toThrow('maximum length');
      expect(() => SecurityValidator.sanitizeString('a'.repeat(10), 5)).toThrow('maximum length');
    });

    it('should reject non-string inputs', () => {
      expect(() => SecurityValidator.sanitizeString(123 as unknown as string)).toThrow('must be a string');
      expect(() => SecurityValidator.sanitizeString(null as unknown as string)).toThrow('must be a string');
      expect(() => SecurityValidator.sanitizeString(undefined as unknown as string)).toThrow('must be a string');
    });
  });

  describe('validatePagination', () => {
    it('should validate correct pagination parameters', () => {
      const result = SecurityValidator.validatePagination({
        limit: 25,
        offset: 0,
        cursor: 'abc123'
      });

      expect(result).toEqual({
        limit: 25,
        offset: 0,
        cursor: 'abc123'
      });
    });

    it('should handle optional parameters', () => {
      const result = SecurityValidator.validatePagination({
        limit: 10
      });

      expect(result).toEqual({
        limit: 10
      });
    });

    it('should reject invalid limit values', () => {
      expect(() => SecurityValidator.validatePagination({ limit: 0 })).toThrow('between 1 and 1000');
      expect(() => SecurityValidator.validatePagination({ limit: 1001 })).toThrow('between 1 and 1000');
      expect(() => SecurityValidator.validatePagination({ limit: -1 })).toThrow('between 1 and 1000');
      expect(() => SecurityValidator.validatePagination({ limit: 1.5 })).toThrow('must be an integer');
    });

    it('should reject invalid offset values', () => {
      expect(() => SecurityValidator.validatePagination({ offset: -1 })).toThrow('non-negative');
      expect(() => SecurityValidator.validatePagination({ offset: 1.5 })).toThrow('must be an integer');
    });

    it('should handle edge cases', () => {
      const result = SecurityValidator.validatePagination({});
      expect(result).toEqual({});
    });
  });

  describe('validateEnum', () => {
    const allowedValues = ['active', 'pending', 'completed'] as const;

    it('should validate correct enum values', () => {
      expect(SecurityValidator.validateEnum('active', allowedValues, 'status')).toBe('active');
      expect(SecurityValidator.validateEnum('pending', allowedValues, 'status')).toBe('pending');
      expect(SecurityValidator.validateEnum('completed', allowedValues, 'status')).toBe('completed');
    });

    it('should reject invalid enum values', () => {
      expect(() => SecurityValidator.validateEnum('invalid', allowedValues, 'status'))
        .toThrow('Invalid status. Must be one of: active, pending, completed');
    });

    it('should reject non-string values', () => {
      expect(() => SecurityValidator.validateEnum(123, allowedValues, 'status'))
        .toThrow('status must be a string');
    });
  });

  describe('validateInput', () => {
    const testSchema = SecuritySchemas.inquiryId;

    it('should validate correct input', () => {
      const result = SecurityValidator.validateInput('inq_123abc', testSchema, 'inquiry ID');
      expect(result).toBe('inq_123abc');
    });

    it('should provide detailed error messages', () => {
      expect(() => SecurityValidator.validateInput('invalid', testSchema, 'inquiry ID'))
        .toThrow('Invalid input for inquiry ID');
    });

    it('should handle validation without context', () => {
      expect(() => SecurityValidator.validateInput('invalid', testSchema))
        .toThrow('Invalid input:');
    });
  });

  describe('validateApiResponse', () => {
    it('should validate correct API responses', () => {
      expect(() => SecurityValidator.validateApiResponse({ data: [] })).not.toThrow();
      expect(() => SecurityValidator.validateApiResponse({ results: [] })).not.toThrow();
      expect(() => SecurityValidator.validateApiResponse({ errors: [] })).not.toThrow();
    });

    it('should reject invalid responses', () => {
      expect(() => SecurityValidator.validateApiResponse(null)).toThrow('must be an object');
      expect(() => SecurityValidator.validateApiResponse('string')).toThrow('must be an object');
      expect(() => SecurityValidator.validateApiResponse({})).toThrow('missing data, errors, or results');
    });

    it('should handle API errors', () => {
      expect(() => SecurityValidator.validateApiResponse({ error: 'API failed' }))
        .toThrow('API error: API failed');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests (placeholder implementation)', () => {
      expect(SecurityValidator.checkRateLimit('test_tool')).toBe(true);
      expect(SecurityValidator.checkRateLimit('another_tool')).toBe(true);
    });
  });
});

describe('SecuritySchemas', () => {
  describe('inquiryId schema', () => {
    it('should validate correct inquiry IDs', () => {
      expect(() => SecuritySchemas.inquiryId.parse('inq_123abc')).not.toThrow();
      expect(() => SecuritySchemas.inquiryId.parse('inq_test-inquiry_123')).not.toThrow();
    });

    it('should reject invalid inquiry IDs', () => {
      expect(() => SecuritySchemas.inquiryId.parse('invalid')).toThrow();
      expect(() => SecuritySchemas.inquiryId.parse('inq_')).toThrow();
      expect(() => SecuritySchemas.inquiryId.parse('')).toThrow();
    });

    it('should provide helpful error messages', () => {
      try {
        SecuritySchemas.inquiryId.parse('invalid');
      } catch (error: unknown) {
        expect(error.message).toContain('Invalid inquiry ID format');
      }
    });
  });

  describe('pagination schema', () => {
    it('should validate correct pagination', () => {
      const result = SecuritySchemas.pagination.parse({
        limit: 25,
        offset: 0
      });

      expect(result).toEqual({
        limit: 25,
        offset: 0
      });
    });

    it('should handle optional parameters with defaults', () => {
      const result = SecuritySchemas.pagination.parse({});
      expect(result).toEqual({});
    });

    it('should reject invalid pagination', () => {
      expect(() => SecuritySchemas.pagination.parse({ limit: 0 })).toThrow();
      expect(() => SecuritySchemas.pagination.parse({ offset: -1 })).toThrow();
    });
  });

  describe('safeString schema', () => {
    it('should validate safe strings', () => {
      expect(() => SecuritySchemas.safeString.parse('hello world')).not.toThrow();
      expect(() => SecuritySchemas.safeString.parse('valid-string_123')).not.toThrow();
    });

    it('should reject strings with null bytes', () => {
      expect(() => SecuritySchemas.safeString.parse('hello\x00world')).toThrow('null bytes');
    });

    it('should reject overly long strings', () => {
      expect(() => SecuritySchemas.safeString.parse('a'.repeat(1001))).toThrow('too long');
    });
  });

  describe('booleanFlag schema', () => {
    it('should validate boolean flags', () => {
      expect(SecuritySchemas.booleanFlag.parse(true)).toBe(true);
      expect(SecuritySchemas.booleanFlag.parse(false)).toBe(false);
    });

    it('should default to false', () => {
      expect(SecuritySchemas.booleanFlag.parse(undefined)).toBe(false);
    });
  });
});

describe('SecurityError', () => {
  it('should create security error with message and code', () => {
    const error = new SecurityError('Test error', 'TEST_CODE');
    
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('SecurityError');
  });

  it('should default to SECURITY_VIOLATION code', () => {
    const error = new SecurityError('Test error');
    expect(error.code).toBe('SECURITY_VIOLATION');
  });

  it('should accept context information', () => {
    const context = { userId: '123', action: 'test' };
    const error = new SecurityError('Test error', 'TEST_CODE', context);
    
    expect(error.context).toEqual(context);
  });

  it('should be instanceof Error and SecurityError', () => {
    const error = new SecurityError('Test error');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SecurityError);
  });
});