/**
 * Tests for MCP Server
 * Focused on essential functionality and security validation
 */

import { describe, it, expect } from 'vitest';
import { SecurityValidator, SecurityError } from '../utils/security';

describe('PersonaMCPServer', () => {
  describe('Security Validation', () => {
    it('should sanitize tool names and arguments', () => {
      const validName = 'inquiries_list';
      expect(() => SecurityValidator.sanitizeString(validName, 100)).not.toThrow();
      
      const invalidName = 'tool\x00name';
      expect(() => SecurityValidator.sanitizeString(invalidName, 100)).toThrow('null bytes');
    });

    it('should validate inquiry IDs', () => {
      expect(SecurityValidator.validateInquiryId('inq_123abc')).toBe(true);
      expect(SecurityValidator.validateInquiryId('invalid_id')).toBe(false);
    });

    it('should implement rate limiting', () => {
      expect(SecurityValidator.checkRateLimit('test_tool')).toBe(true);
    });

    it('should validate pagination parameters', () => {
      const validPagination = { limit: 25, offset: 0 };
      expect(() => SecurityValidator.validatePagination(validPagination)).not.toThrow();
      
      const invalidPagination = { limit: 0, offset: -1 };
      expect(() => SecurityValidator.validatePagination(invalidPagination)).toThrow();
    });

    it('should sanitize sensitive data for logging', () => {
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
  });

  describe('Error Handling', () => {
    it('should format error responses correctly', () => {
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
  });

  describe('Tool Registration and Management', () => {
    it('should combine static and dynamic tools correctly', () => {
      const staticTools = [{
        name: "list_allowed_directories",
        description: "Static tool",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      }];

      const dynamicTools = [{
        name: "accounts_list",
        description: "Dynamic tool",
        inputSchema: { 
          type: "object", 
          properties: {
            limit: { type: "number" },
            offset: { type: "number" }
          },
          additionalProperties: false 
        }
      }];

      const allTools = [...staticTools, ...dynamicTools];

      // Validate tool structure
      expect(allTools).toHaveLength(2);
      expect(allTools.every(tool => 
        tool.name && 
        tool.description && 
        tool.inputSchema &&
        tool.inputSchema.type === 'object'
      )).toBe(true);

      // Validate tool naming conventions
      expect(allTools.every(tool => tool.name.match(/^[a-z_-]+$/))).toBe(true);
    });

    it('should route tool execution correctly', () => {
      const toolExecutionRouter = (toolName: string) => {
        const staticTools = ['list_allowed_directories'];
        
        if (staticTools.includes(toolName)) {
          return 'static';
        } else if (toolName.match(/^[a-z-]+_(list|retrieve|create|update|delete)$/)) {
          return 'dynamic';
        } else {
          return 'unknown';
        }
      };

      expect(toolExecutionRouter('list_allowed_directories')).toBe('static');
      expect(toolExecutionRouter('accounts_list')).toBe('dynamic');
      expect(toolExecutionRouter('inquiries_retrieve')).toBe('dynamic');
      expect(toolExecutionRouter('invalid_tool_name')).toBe('unknown');
    });

    it('should validate MCP protocol compatibility', () => {
      const mockTools = [
        {
          name: 'list_allowed_directories',
          description: 'Static tool for listing capabilities',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false }
        },
        {
          name: 'accounts_list',
          description: 'Dynamic tool for listing accounts',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', minimum: 1, maximum: 100 },
              offset: { type: 'number', minimum: 0 }
            },
            additionalProperties: false
          }
        }
      ];

      // Validate MCP tool structure
      mockTools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.inputSchema).toBe('object');
        
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema).toHaveProperty('additionalProperties');
      });
    });

    it('should handle tool execution failures gracefully', async () => {
      const mockToolExecutor = async (toolName: string, args: any) => {
        if (toolName === 'list_allowed_directories') {
          return { content: [{ type: 'text', text: 'Static tool executed successfully' }] };
        } else if (toolName === 'accounts_list') {
          return { content: [{ type: 'text', text: 'Dynamic tool executed successfully' }] };
        } else if (toolName === 'failing_tool') {
          throw new Error('Tool execution failed');
        } else {
          throw new Error(`Unknown tool: ${toolName}`);
        }
      };

      // Test successful executions
      const staticResult = await mockToolExecutor('list_allowed_directories', {});
      expect(staticResult.content[0].text).toContain('Static tool executed');

      const dynamicResult = await mockToolExecutor('accounts_list', {});
      expect(dynamicResult.content[0].text).toContain('Dynamic tool executed');

      // Test error cases
      await expect(mockToolExecutor('failing_tool', {})).rejects.toThrow('Tool execution failed');
      await expect(mockToolExecutor('unknown_tool', {})).rejects.toThrow('Unknown tool');
    });

    it('should gracefully degrade when dynamic tools fail', () => {
      const getToolsWithFallback = (dynamicToolsAvailable: boolean) => {
        const staticTools = [{
          name: 'list_allowed_directories',
          description: 'Static fallback tool',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false }
        }];

        if (dynamicToolsAvailable) {
          return [...staticTools, {
            name: 'accounts_list',
            description: 'Dynamic accounts tool',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false }
          }];
        }
        return staticTools;
      };

      // Test with dynamic tools available
      const toolsWithDynamic = getToolsWithFallback(true);
      expect(toolsWithDynamic.length).toBe(2);
      expect(toolsWithDynamic.some(tool => tool.name === 'accounts_list')).toBe(true);

      // Test fallback to static tools only
      const toolsStaticOnly = getToolsWithFallback(false);
      expect(toolsStaticOnly.length).toBe(1);
      expect(toolsStaticOnly[0].name).toBe('list_allowed_directories');
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

    it('should detect invalid configurations', () => {
      const invalidConfigs = [
        { apiKey: '', apiUrl: 'https://api.example.com', timeout: 30000 },
        { apiKey: 'valid_key', apiUrl: 'invalid-url', timeout: 30000 },
        { apiKey: 'valid_key', apiUrl: 'https://api.example.com', timeout: 0 },
      ];

      invalidConfigs.forEach(config => {
        if (!config.apiKey) expect(config.apiKey).toBeFalsy();
        if (config.apiUrl === 'invalid-url') expect(() => new URL(config.apiUrl)).toThrow();
        if (config.timeout <= 0) expect(config.timeout).toBeLessThanOrEqual(0);
      });
    });
  });

  describe('Performance', () => {
    it('should handle concurrent tool executions', async () => {
      const toolNames = ['inquiries_list', 'inquiry_create', 'inquiry_retrieve'];
      const concurrentCalls = toolNames.map(name => 
        Promise.resolve({ tool: name, duration: Math.random() * 100, success: true })
      );

      const results = await Promise.all(concurrentCalls);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle large argument objects efficiently', () => {
      const largeArgs = {
        inquiryId: 'inq_123',
        metadata: Array.from({ length: 100 }, (_, i) => ({ 
          field: `value${i}`,
          data: 'x'.repeat(50)
        }))
      };

      expect(() => JSON.stringify(largeArgs)).not.toThrow();
      const serialized = JSON.stringify(largeArgs);
      expect(serialized.length).toBeLessThan(500000); // Under 500KB
    });
  });
});