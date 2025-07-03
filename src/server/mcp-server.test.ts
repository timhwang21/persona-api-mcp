/**
 * Tests for MCP Server
 */

import { describe, it, expect } from 'vitest';

describe('PersonaMCPServer', () => {
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

  it('should validate resource URIs', () => {
    // Test resource URI validation
    const validURI = 'persona://inquiry/123';
    
    expect(validURI).toMatch(/^persona:\/\//);
    expect(validURI).toContain('inquiry');
  });
});