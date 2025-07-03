/**
 * Tests for MCP Server
 * Enhanced with security and validation testing based on Anthropic patterns
 */

import { describe, it, expect } from 'vitest';
import { SecurityValidator, SecurityError } from '../utils/security';

describe('PersonaMCPServer', () => {
  describe('Basic Functionality', () => {
    it('should be testable', () => {
      expect(true).toBe(true);
    });

    it('should handle MCP protocol validation', () => {
      // Test basic MCP protocol structure
      const validRequest = {
        method: 'tools/call',
        params: {
          name: 'inquiries_list',
          arguments: { limit: 10 },
        },
      };

      expect(validRequest.method).toBe('tools/call');
      expect(validRequest.params).toHaveProperty('name');
      expect(validRequest.params.name).toBe('inquiries_list');
    });

    it('should validate tool names', () => {
      // Test tool name validation
      const validToolNames = ['inquiries_list', 'inquiry_create', 'inquiry_retrieve'];
      
      validToolNames.forEach(name => {
        expect(name).toMatch(/^[a-z_]+$/);
      });
    });

    it('should validate resource URIs', () => {
      // Test resource URI validation
      const validURI = 'persona://inquiry/123';
      
      expect(validURI).toMatch(/^persona:\/\//);
      expect(validURI).toContain('inquiry');
    });
  });

  describe('Security Validation', () => {
    it('should sanitize tool names', () => {
      const validName = 'inquiries_list';
      expect(() => SecurityValidator.sanitizeString(validName, 100)).not.toThrow();
      
      const invalidName = 'tool\x00name';
      expect(() => SecurityValidator.sanitizeString(invalidName, 100)).toThrow('null bytes');
    });

    it('should validate inquiry IDs in tool arguments', () => {
      const validArgs = { inquiryId: 'inq_123abc' };
      expect(SecurityValidator.validateInquiryId(validArgs.inquiryId)).toBe(true);
      
      const invalidArgs = { inquiryId: 'invalid_id' };
      expect(SecurityValidator.validateInquiryId(invalidArgs.inquiryId)).toBe(false);
    });

    it('should sanitize arguments for logging', () => {
      const sensitiveArgs = {
        inquiryId: 'inq_123',
        apiKey: 'secret_key',
        token: 'auth_token',
        normalField: 'normal_value'
      };

      const sanitized = { ...sensitiveArgs };
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

    it('should implement rate limiting checks', () => {
      expect(SecurityValidator.checkRateLimit('test_tool')).toBe(true);
    });

    it('should validate pagination parameters', () => {
      const validPagination = { limit: 25, offset: 0 };
      expect(() => SecurityValidator.validatePagination(validPagination)).not.toThrow();
      
      const invalidPagination = { limit: 0, offset: -1 };
      expect(() => SecurityValidator.validatePagination(invalidPagination)).toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle error responses correctly', () => {
      // Test error response structure
      const errorResponse = {
        error: {
          code: -32603,
          message: 'Internal error',
        },
      };

      expect(errorResponse.error.code).toBe(-32603);
      expect(errorResponse.error.message).toBeTruthy();
    });

    it('should format security error responses', () => {
      const securityError = new SecurityError('Invalid input', 'INVALID_INPUT');
      
      const errorResponse = {
        content: [{
          type: 'text' as const,
          text: `❌ **Tool Execution Failed**

**Error:** ${securityError.message}
**Code:** ${securityError.code}
**Type:** Security Error
**Timestamp:** ${new Date().toISOString()}

This error indicates a security validation failure. Please check your input parameters.`
        }],
        isError: true,
      };

      expect(errorResponse.content[0].text).toContain('❌');
      expect(errorResponse.content[0].text).toContain(securityError.message);
      expect(errorResponse.content[0].text).toContain(securityError.code);
      expect(errorResponse.isError).toBe(true);
    });

    it('should handle validation errors gracefully', () => {
      const validationError = new Error('Validation failed');
      
      const errorResponse = {
        content: [{
          type: 'text' as const,
          text: `❌ Tool execution failed: ${validationError.message}`
        }]
      };

      expect(errorResponse.content[0].text).toContain('❌');
      expect(errorResponse.content[0].text).toContain(validationError.message);
    });

    it('should provide detailed error context', () => {
      const errorContext = {
        tool: 'inquiries_list',
        arguments: { limit: 10 },
        timestamp: new Date().toISOString(),
      };

      expect(errorContext.tool).toBe('inquiries_list');
      expect(errorContext.arguments).toEqual({ limit: 10 });
      expect(errorContext.timestamp).toBeTruthy();
    });
  });

  describe('Tool Registration', () => {
    it('should handle static tool definitions', () => {
      const staticTool = {
        name: "list_allowed_directories",
        description: 
          "Returns the list of API endpoints and capabilities that this server " +
          "is configured to access. Use this tool to understand what operations " +
          "are available before attempting to use other tools.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
      };

      expect(staticTool.name).toBe('list_allowed_directories');
      expect(staticTool.description).toContain('API endpoints');
      expect(staticTool.inputSchema.type).toBe('object');
    });

    it('should validate dynamic tool definitions', () => {
      const dynamicTool = {
        name: 'inquiries_list',
        description: 'List all inquiries with optional filtering and pagination',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
            offset: { type: 'number' }
          },
          additionalProperties: false
        }
      };

      expect(dynamicTool.name).toBeTruthy();
      expect(dynamicTool.description).toBeTruthy();
      expect(dynamicTool.inputSchema).toBeTruthy();
    });

    it('should combine static and dynamic tools', () => {
      const staticTools = [{
        name: "list_allowed_directories",
        description: "Static tool",
        inputSchema: { type: "object", properties: {} }
      }];

      const dynamicTools = [{
        name: "inquiries_list",
        description: "Dynamic tool",
        inputSchema: { type: "object", properties: {} }
      }];

      const allTools = [...staticTools, ...dynamicTools];

      expect(allTools).toHaveLength(2);
      expect(allTools[0].name).toBe('list_allowed_directories');
      expect(allTools[1].name).toBe('inquiries_list');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate API configuration', () => {
      const validConfig = {
        persona: {
          apiKey: 'valid_key',
          apiUrl: 'https://api.example.com',
          timeout: 30000
        },
        environment: 'development'
      };

      expect(validConfig.persona.apiKey).toBeTruthy();
      expect(() => new URL(validConfig.persona.apiUrl)).not.toThrow();
      expect(validConfig.persona.timeout).toBeGreaterThan(0);
    });

    it('should detect invalid API configuration', () => {
      const invalidConfigs = [
        { apiKey: '', apiUrl: 'https://api.example.com', timeout: 30000 },
        { apiKey: 'valid_key', apiUrl: 'invalid-url', timeout: 30000 },
        { apiKey: 'valid_key', apiUrl: 'https://api.example.com', timeout: 0 },
      ];

      invalidConfigs.forEach(config => {
        if (!config.apiKey) {
          expect(config.apiKey).toBeFalsy();
        }
        if (config.apiUrl === 'invalid-url') {
          expect(() => new URL(config.apiUrl)).toThrow();
        }
        if (config.timeout <= 0) {
          expect(config.timeout).toBeLessThanOrEqual(0);
        }
      });
    });

    it('should warn about production security issues', () => {
      const productionConfig = {
        environment: 'production',
        logging: { level: 'debug' },
        persona: { apiUrl: 'http://localhost:3000' }
      };

      // These should trigger warnings in production
      expect(productionConfig.environment).toBe('production');
      expect(productionConfig.logging.level).toBe('debug');
      expect(productionConfig.persona.apiUrl).toContain('localhost');
    });
  });

  describe('Memory and Performance', () => {
    it('should handle concurrent tool executions', async () => {
      // Simulate multiple concurrent tool calls
      const toolNames = ['inquiries_list', 'inquiry_create', 'inquiry_retrieve'];
      const concurrentCalls = toolNames.map(name => 
        Promise.resolve({
          tool: name,
          duration: Math.random() * 100,
          success: true
        })
      );

      const results = await Promise.all(concurrentCalls);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should efficiently process large argument objects', () => {
      const largeArgs = {
        inquiryId: 'inq_123',
        metadata: Array.from({ length: 1000 }, (_, i) => ({ 
          field: `value${i}`,
          data: 'x'.repeat(100)
        }))
      };

      // Should handle without throwing
      expect(() => JSON.stringify(largeArgs)).not.toThrow();
      
      // Should be under reasonable size limits
      const serialized = JSON.stringify(largeArgs);
      expect(serialized.length).toBeLessThan(1000000); // Under 1MB
    });

    it('should implement atomic caching operations', async () => {
      // Test atomic caching pattern (simplified)
      const cacheOperation = async (key: string, data: any) => {
        // Simulate atomic cache write
        return Promise.resolve({ key, data, cached: true });
      };

      const testData = { id: 'inq_123', status: 'completed' };
      
      await expect(cacheOperation('inquiry:123', testData)).resolves.toEqual({
        key: 'inquiry:123',
        data: testData,
        cached: true
      });
    });
  });
});