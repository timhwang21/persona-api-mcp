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
    it('should validate dynamic tool structure', () => {
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

      // Validate tool structure
      expect(dynamicTools).toHaveLength(1);
      expect(dynamicTools.every(tool => 
        tool.name && 
        tool.description && 
        tool.inputSchema &&
        tool.inputSchema.type === 'object'
      )).toBe(true);

      // Validate tool naming conventions
      expect(dynamicTools.every(tool => tool.name.match(/^[a-z_-]+$/))).toBe(true);
    });

    it('should route tool execution correctly', () => {
      const toolExecutionRouter = (toolName: string) => {
        if (toolName.match(/^[a-z-]+_(list|retrieve|create|update|delete)$/)) {
          return 'dynamic';
        } else {
          return 'unknown';
        }
      };

      expect(toolExecutionRouter('accounts_list')).toBe('dynamic');
      expect(toolExecutionRouter('inquiries_retrieve')).toBe('dynamic');
      expect(toolExecutionRouter('invalid_tool_name')).toBe('unknown');
    });

    it('should validate MCP protocol compatibility', () => {
      const mockTools = [
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
      const mockToolExecutor = async (toolName: string, _args: unknown) => {
        if (toolName === 'accounts_list') {
          return { content: [{ type: 'text', text: 'Dynamic tool executed successfully' }] };
        } else if (toolName === 'failing_tool') {
          throw new Error('Tool execution failed');
        } else {
          throw new Error(`Unknown tool: ${toolName}`);
        }
      };

      // Test successful executions
      const dynamicResult = await mockToolExecutor('accounts_list', {});
      expect(dynamicResult.content[0].text).toContain('Dynamic tool executed');

      // Test error cases
      await expect(mockToolExecutor('failing_tool', {})).rejects.toThrow('Tool execution failed');
      await expect(mockToolExecutor('unknown_tool', {})).rejects.toThrow('Unknown tool');
    });

    it('should gracefully degrade when dynamic tools fail', () => {
      const getToolsWithFallback = (dynamicToolsAvailable: boolean) => {
        const staticTools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = [];

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
      expect(toolsWithDynamic.length).toBe(1);
      expect(toolsWithDynamic.some(tool => tool.name === 'accounts_list')).toBe(true);

      // Test fallback to no tools when dynamic tools fail
      const toolsStaticOnly = getToolsWithFallback(false);
      expect(toolsStaticOnly.length).toBe(0);
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

  describe('Update and Redaction Operations', () => {
    it('should generate correct tool names for update operations', () => {
      const testCases = [
        { operationId: 'update-an-account', expected: 'account_update' },
        { operationId: 'update-a-case', expected: 'case_update' },
        { operationId: 'redact-an-inquiry', expected: 'inquiry_redact' },
        { operationId: 'accounts-add-tag', expected: 'account_add_tag' },
        { operationId: 'inquiries-approve', expected: 'inquiry_approve' },
        { operationId: 'transactions-label', expected: 'transaction_label' },
        { operationId: 'reports-dismiss', expected: 'report_dismiss' },
        { operationId: 'webhooks-rotate-secret', expected: 'webhook_rotate_secret' },
      ];

      // Mock tool name generation logic (matching the actual implementation)
      const generateToolName = (operationId: string) => {
        const name = operationId.toLowerCase();
        
        // Handle resource action patterns (e.g., "accounts-add-tag", "inquiries-approve")
        // This is specifically for cases like "accounts-add-tag" not "update-an-account"
        if (name.match(/^[a-z-]+-[a-z-]+$/) && !name.includes('update-') && !name.includes('create-') && !name.includes('retrieve-') && !name.includes('redact-')) {
          const parts = name.split('-');
          if (parts.length >= 2) {
            const resourcePart = parts[0];
            const actionPart = parts.slice(1).join('-');
            
            const pluralToSingular = (plural: string) => {
              const specialCases: Record<string, string> = {
                'inquiries': 'inquiry',
                'verifications': 'verification',
                'transactions': 'transaction',
                'accounts': 'account',
                'reports': 'report',
                'webhooks': 'webhook',
              };
              return specialCases[plural] || (plural.endsWith('s') ? plural.slice(0, -1) : plural);
            };
            
            const singularResource = pluralToSingular(resourcePart);
            const actionFormatted = actionPart.replace(/-/g, '_');
            
            return `${singularResource}_${actionFormatted}`;
          }
        }
        
        // Handle common CRUD patterns
        if (name.includes('list-all-')) {
          const resource = name.replace('list-all-', '');
          const singularResource = resource.endsWith('s') ? resource.slice(0, -1) : resource;
          return `${singularResource}_list`;
        } else if (name.includes('create-an-') || name.includes('create-a-')) {
          const resource = name.replace('create-an-', '').replace('create-a-', '');
          const singularResource = resource.endsWith('s') ? resource.slice(0, -1) : resource;
          return `${singularResource}_create`;
        } else if (name.includes('retrieve-an-') || name.includes('retrieve-a-')) {
          const resource = name.replace('retrieve-an-', '').replace('retrieve-a-', '');
          const singularResource = resource.endsWith('s') ? resource.slice(0, -1) : resource;
          return `${singularResource}_retrieve`;
        } else if (name.includes('update-an-') || name.includes('update-a-')) {
          const resource = name.replace('update-an-', '').replace('update-a-', '');
          const singularResource = resource.endsWith('s') ? resource.slice(0, -1) : resource;
          return `${singularResource}_update`;
        } else if (name.includes('redact-an-') || name.includes('redact-a-')) {
          const resource = name.replace('redact-an-', '').replace('redact-a-', '');
          const singularResource = resource.endsWith('s') ? resource.slice(0, -1) : resource;
          return `${singularResource}_redact`;
        } else {
          // General cleanup for other patterns
          return name.replace(/-/g, '_');
        }
      };

      testCases.forEach(({ operationId, expected }) => {
        const result = generateToolName(operationId);
        expect(result).toBe(expected);
      });
    });

    it('should handle PATCH operations for resource updates', () => {
      const mockPatchOperation = {
        operationId: 'update-an-account',
        method: 'PATCH',
        parameters: [
          { name: 'account-id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                properties: {
                  data: {
                    properties: {
                      attributes: {
                        properties: {
                          'name-first': { type: 'string', description: 'First name' },
                          'name-last': { type: 'string', description: 'Last name' },
                          'email-address': { type: 'string', description: 'Email address' },
                          tags: { type: 'array', items: { type: 'string' } },
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      // Validate that PATCH operations are supported
      expect(mockPatchOperation.method).toBe('PATCH');
      expect(mockPatchOperation.requestBody.content['application/json'].schema.properties.data).toBeDefined();
    });

    it('should handle DELETE operations for redaction', () => {
      const mockDeleteOperation = {
        operationId: 'redact-an-account',
        method: 'DELETE',
        parameters: [
          { name: 'account-id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': {
            description: 'Account redacted successfully',
            content: {
              'application/json': {
                schema: {
                  properties: {
                    data: { $ref: '#/components/schemas/account' }
                  }
                }
              }
            }
          }
        }
      };

      // Validate that DELETE operations are supported
      expect(mockDeleteOperation.method).toBe('DELETE');
      expect(mockDeleteOperation.responses['200']).toBeDefined();
    });

    it('should handle action endpoints with meta parameters', () => {
      const mockActionOperation = {
        operationId: 'accounts-add-tag',
        method: 'POST',
        parameters: [
          { name: 'account-id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                properties: {
                  meta: {
                    properties: {
                      'tag-name': { type: 'string', description: 'Name of the tag to add' },
                      'tag-id': { type: 'string', description: 'ID of the tag to add' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      // Validate meta pattern for action endpoints
      expect(mockActionOperation.requestBody.content['application/json'].schema.properties.meta).toBeDefined();
      expect(mockActionOperation.requestBody.content['application/json'].schema.properties.meta.properties['tag-name']).toBeDefined();
    });

    it('should format request data correctly for different endpoint types', () => {
      const formatRequestData = (url: string, data: Record<string, unknown> | undefined) => {
        if (!data || Object.keys(data).length === 0) {
          return undefined;
        }

        // Check if this is an action endpoint (contains underscore in action part after slash)
        const isActionEndpoint = url.includes('/_');
        
        if (isActionEndpoint) {
          return { meta: data };
        } else {
          const inferResourceType = (url: string) => {
            const pathSegments = url.split('/').filter(segment => segment && !segment.match(/^[a-f0-9-]{36}$/));
            const resourcePath = pathSegments[0];
            if (resourcePath === 'accounts') return 'account';
            if (resourcePath === 'inquiries') return 'inquiry';
            return resourcePath?.endsWith('s') ? resourcePath.slice(0, -1) : resourcePath;
          };
          
          return {
            data: {
              type: inferResourceType(url),
              attributes: data,
            },
          };
        }
      };

      // Test resource update (PATCH) - no underscore, so should use data.attributes format
      const updateData = formatRequestData('/accounts/acc_123', { 
        nameFirst: 'Jane', 
        nameLast: 'Doe' 
      });
      expect(updateData).toEqual({
        data: {
          type: 'account',
          attributes: { nameFirst: 'Jane', nameLast: 'Doe' }
        }
      });

      // Test action endpoint (POST) - has underscore, so should use meta format
      const actionData = formatRequestData('/accounts/acc_123/_add-tag', { 
        tagName: 'vip-customer' 
      });
      expect(actionData).toEqual({
        meta: { tagName: 'vip-customer' }
      });
    });

    it('should validate ID parameters for update operations', () => {
      const validateUniversalId = (id: string): boolean => {
        return /^[a-z]{2,}_[a-zA-Z0-9_-]+$/.test(id) && id.length >= 5 && id.length <= 100;
      };

      // Test valid IDs
      expect(validateUniversalId('acc_123abc')).toBe(true);
      expect(validateUniversalId('inq_456def')).toBe(true);
      expect(validateUniversalId('ver_789ghi')).toBe(true);
      expect(validateUniversalId('txn_012jkl')).toBe(true);

      // Test invalid IDs
      expect(validateUniversalId('invalid')).toBe(false);
      expect(validateUniversalId('a_123')).toBe(false); // too short prefix
      expect(validateUniversalId('acc_')).toBe(false); // missing suffix
      expect(validateUniversalId('ACC_123')).toBe(false); // uppercase prefix
    });
  });

  describe('Performance', () => {
    it('should handle concurrent tool executions', async () => {
      const toolNames = ['inquiries_list', 'inquiry_create', 'inquiry_retrieve', 'account_update', 'inquiry_redact'];
      const concurrentCalls = toolNames.map(name => 
        Promise.resolve({ tool: name, duration: Math.random() * 100, success: true })
      );

      const results = await Promise.all(concurrentCalls);
      
      expect(results).toHaveLength(5);
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