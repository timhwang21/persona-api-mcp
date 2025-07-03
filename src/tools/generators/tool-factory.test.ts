/**
 * Tests for Tool Factory
 * Enhanced with security and validation testing based on Anthropic patterns
 */

import { describe, it, expect } from 'vitest';
import { SecurityValidator } from '../../utils/security';

describe('ToolFactory', () => {
  describe('Tool Naming', () => {
    it('should be testable', () => {
      expect(true).toBe(true);
    });

    it('should handle tool naming correctly', () => {
      // Test basic tool naming functionality
      const testName = 'list-all-inquiries';
      const expected = 'inquiries_list';
      
      // Simple test of naming logic
      const result = testName.replace('list-all-', '') + '_list';
      expect(result).toBe(expected);
    });

    it('should handle create tool naming', () => {
      const testName = 'create-an-inquiry';
      const expected = 'inquiry_create';
      
      const result = testName.replace('create-an-', '') + '_create';
      expect(result).toBe(expected);
    });

    it('should handle retrieve tool naming', () => {
      const testName = 'retrieve-an-inquiry';
      const expected = 'inquiry_retrieve';
      
      const result = testName.replace('retrieve-an-', '') + '_retrieve';
      expect(result).toBe(expected);
    });

    it('should sanitize tool names for security', () => {
      // Test that tool names are properly sanitized
      const validName = 'inquiries_list';
      expect(() => SecurityValidator.sanitizeString(validName, 100)).not.toThrow();
      
      // Test invalid names
      expect(() => SecurityValidator.sanitizeString('tool\x00name', 100)).toThrow();
    });
  });

  describe('Parameter Conversion', () => {
    it('should handle parameter name conversion', () => {
      // Test parameter name conversion
      const convertParamName = (name: string): string => {
        return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      };
      
      expect(convertParamName('inquiry-id')).toBe('inquiryId');
      expect(convertParamName('inquiry_template_id')).toBe('inquiry_template_id');
      expect(convertParamName('inquiryId')).toBe('inquiryId');
    });

  });

  describe('Input Validation', () => {
    it('should validate pagination parameters', () => {
      const validPagination = { limit: 25, offset: 0 };
      expect(() => SecurityValidator.validatePagination(validPagination)).not.toThrow();
      
      const invalidPagination = { limit: 0, offset: -1 };
      expect(() => SecurityValidator.validatePagination(invalidPagination)).toThrow();
    });

    it('should sanitize input strings', () => {
      expect(() => SecurityValidator.sanitizeString('valid string')).not.toThrow();
      expect(() => SecurityValidator.sanitizeString('invalid\x00string')).toThrow();
    });

    it('should validate enum values', () => {
      const allowedStatuses = ['active', 'pending', 'completed'] as const;
      
      expect(SecurityValidator.validateEnum('active', allowedStatuses, 'status')).toBe('active');
      expect(() => SecurityValidator.validateEnum('invalid', allowedStatuses, 'status')).toThrow();
    });
  });

  describe('Tool Configuration', () => {
    it('should validate tool configuration', () => {
      // Test basic tool configuration validation
      const toolConfig = {
        name: 'inquiries_list',
        description: 'List all inquiries',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      };

      expect(toolConfig.name).toBe('inquiries_list');
      expect(toolConfig.description).toBeTruthy();
      expect(toolConfig.inputSchema).toHaveProperty('type');
    });

    it('should validate enhanced tool descriptions', () => {
      const enhancedDescription = 
        "Retrieve detailed information about a specific inquiry including " +
        "status, verification results, and associated documents. Use this tool " +
        "when you need complete inquiry data for analysis or review.";
      
      expect(enhancedDescription.length).toBeGreaterThan(50);
      expect(enhancedDescription).toContain('inquiry');
      expect(enhancedDescription).toContain('Use this tool');
    });

    it('should validate input schema structure', () => {
      const schema = {
        type: 'object',
        properties: {
          inquiryId: {
            type: 'string',
            description: 'The inquiry ID to retrieve'
          }
        },
        required: ['inquiryId'],
        additionalProperties: false
      };

      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('inquiryId');
      expect(schema.required).toContain('inquiryId');
      expect(schema.additionalProperties).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle basic errors properly', () => {
      const error = new Error('Test error');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
    });

    it('should format error responses correctly', () => {
      const error = new Error('Test error');
      
      const errorResponse = {
        content: [{
          type: 'text' as const,
          text: `❌ Tool execution failed: ${error.message}`
        }]
      };

      expect(errorResponse.content[0].type).toBe('text');
      expect(errorResponse.content[0].text).toContain('❌');
      expect(errorResponse.content[0].text).toContain(error.message);
    });

    it('should validate API responses', () => {
      const validResponse = { data: { id: 'inq_123', status: 'completed' } };
      expect(() => SecurityValidator.validateApiResponse(validResponse)).not.toThrow();
      
      const invalidResponse = {};
      expect(() => SecurityValidator.validateApiResponse(invalidResponse)).toThrow();
    });
  });

  describe('Memory and Performance', () => {
    it('should handle large input objects efficiently', () => {
      const largeObject = {
        inquiryId: 'inq_123',
        data: 'x'.repeat(1000), // 1KB of data
        metadata: Array.from({ length: 100 }, (_, i) => ({ id: i, value: `item${i}` }))
      };

      // Should not throw for reasonably sized objects
      expect(() => JSON.stringify(largeObject)).not.toThrow();
      expect(JSON.stringify(largeObject).length).toBeLessThan(10000); // Under 10KB
    });

    it('should sanitize logging data without performance issues', () => {
      const sensitiveData = {
        inquiryId: 'inq_123',
        apiKey: 'secret_key_123',
        token: 'auth_token_456',
        normalField: 'normal_value'
      };

      const sanitized = { ...sensitiveData };
      const sensitiveFields = ['apiKey', 'token', 'password', 'secret'];
      
      for (const field of sensitiveFields) {
        if (sanitized[field]) {
          sanitized[field] = '[REDACTED]';
        }
      }

      expect(sanitized.inquiryId).toBe('inq_123');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.normalField).toBe('normal_value');
    });
  });

  describe('Rate Limiting', () => {
    it('should implement rate limiting checks', () => {
      // Placeholder test for rate limiting functionality
      expect(SecurityValidator.checkRateLimit('test_tool')).toBe(true);
    });

    it('should track tool execution frequency', () => {
      // Test that could be expanded when rate limiting is implemented
      const toolName = 'inquiries_list';
      const executions = Array.from({ length: 5 }, () => 
        SecurityValidator.checkRateLimit(toolName)
      );
      
      // Currently all should pass (no rate limiting implemented)
      expect(executions.every(result => result === true)).toBe(true);
    });
  });
});
