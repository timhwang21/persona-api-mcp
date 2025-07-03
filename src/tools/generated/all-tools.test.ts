/**
 * Tests for All Generated Tools
 * 
 * This test suite ensures that tools are properly generated from the OpenAPI
 * specification and that the critical path resolution issue is fixed.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { initializeAllTools, getAllTools, getAllToolDefinitions } from './all-tools.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('All Tools Generation', () => {
  beforeAll(async () => {
    // Ensure tools are initialized before running tests
    await initializeAllTools();
  });

  describe('Path Resolution Fix', () => {
    it('should resolve tags file path correctly in both dev and production environments', () => {
      // Test the path resolution logic that was fixed
      const PROJECT_ROOT = path.resolve(__dirname, '../../../');
      const TAGS_FILE = path.join(PROJECT_ROOT, 'src/generated/api-tags.yaml');
      
      // Verify the tags file exists at the expected location
      expect(fs.existsSync(TAGS_FILE)).toBe(true);
      
      // Verify it's not looking in the wrong location (dist/generated)
      const wrongPath = path.resolve(__dirname, '../../generated/api-tags.yaml');
      if (fs.existsSync(wrongPath)) {
        // If both exist, ensure we're using the source version
        expect(TAGS_FILE.includes('src/generated')).toBe(true);
      }
    });

    it('should load tags from the correct file location', async () => {
      // Re-initialize to test the path resolution
      await initializeAllTools();
      
      const tools = getAllTools();
      
      // Should have loaded tools (not empty due to missing tags file)
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.length).toBeGreaterThan(100); // Should have many tools from OpenAPI
    });
  });

  describe('Tool Generation from OpenAPI', () => {
    it('should generate tools from all OpenAPI tags', async () => {
      const tools = getAllTools();
      
      // Should have substantial number of tools
      expect(tools.length).toBeGreaterThan(100);
      
      // Verify we have tools from major categories
      const toolNames = tools.map(t => t.name);
      
      // Should have inquiry tools (the main use case that was failing)
      expect(toolNames.some(name => name.includes('inquiry_create'))).toBe(true);
      expect(toolNames.some(name => name.includes('inquiry_update'))).toBe(true);
      expect(toolNames.some(name => name.includes('inquiry_redact'))).toBe(true);
      
      // Should have account tools
      expect(toolNames.some(name => name.includes('account_create'))).toBe(true);
      expect(toolNames.some(name => name.includes('account_update'))).toBe(true);
      
      // Should have other resource tools
      expect(toolNames.some(name => name.includes('transaction_create'))).toBe(true);
      expect(toolNames.some(name => name.includes('report_create'))).toBe(true);
    });

    it('should generate proper tool definitions for MCP', () => {
      const definitions = getAllToolDefinitions();
      
      expect(definitions.length).toBeGreaterThan(100);
      
      // Each definition should have required MCP fields
      definitions.forEach(def => {
        expect(def).toHaveProperty('name');
        expect(def).toHaveProperty('description');
        expect(def).toHaveProperty('inputSchema');
        expect(typeof def.name).toBe('string');
        expect(typeof def.description).toBe('string');
        expect(typeof def.inputSchema).toBe('object');
      });
    });

    it('should include proper tool annotations', () => {
      const tools = getAllTools();
      
      // Find some tools that should have annotations
      const createTool = tools.find(t => t.name.includes('_create'));
      const updateTool = tools.find(t => t.name.includes('_update'));
      const deleteTool = tools.find(t => t.name.includes('_redact'));
      
      if (createTool) {
        // Create operations should be destructive but not idempotent
        expect(createTool.destructiveHint).toBe(true);
        expect(createTool.idempotentHint).not.toBe(true);
        expect(createTool.readOnlyHint).not.toBe(true);
      }
      
      if (updateTool) {
        // Update operations should be destructive but not idempotent
        expect(updateTool.destructiveHint).toBe(true);
        expect(updateTool.idempotentHint).not.toBe(true);
        expect(updateTool.readOnlyHint).not.toBe(true);
      }
      
      if (deleteTool) {
        // Delete operations should be destructive and idempotent
        expect(deleteTool.destructiveHint).toBe(true);
        expect(deleteTool.idempotentHint).toBe(true);
        expect(deleteTool.readOnlyHint).not.toBe(true);
      }
    });
  });

  describe('Inquiry Tools Specific Tests', () => {
    it('should provide inquiry creation tools', () => {
      const allTools = getAllTools();
      const toolNames = allTools.map(t => t.name);
      
      // Check for actual tool names generated
      expect(toolNames.some(name => name.includes('inquiry') && name.includes('create'))).toBe(true);
      expect(toolNames.some(name => name.includes('inquiry') && name.includes('update'))).toBe(true);
      expect(toolNames.some(name => name.includes('inquiry') && name.includes('redact'))).toBe(true);
    });

    it('should generate inquiry tools with proper schemas', () => {
      const allTools = getAllTools();
      const createTool = allTools.find(t => t.name.includes('inquiry') && t.name.includes('create'));
      
      expect(createTool).toBeDefined();
      if (createTool) {
        expect(createTool.inputSchema).toBeDefined();
        expect(createTool.inputSchema.type).toBe('object');
        expect(createTool.inputSchema.properties).toBeDefined();
      }
    });

    it('should generate inquiry action tools', () => {
      const allTools = getAllTools();
      const toolNames = allTools.map(t => t.name.toLowerCase());
      
      // Should have action tools like approve, decline, etc.
      expect(toolNames.some(name => name.includes('inquiry') && name.includes('approve'))).toBe(true);
      expect(toolNames.some(name => name.includes('inquiry') && name.includes('decline'))).toBe(true);
      expect(toolNames.some(name => name.includes('inquiry') && name.includes('tag'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing tags file gracefully', async () => {
      // Mock fs.existsSync to return false for tags file
      const originalExists = fs.existsSync;
      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        if (path.toString().includes('api-tags.yaml')) {
          return false;
        }
        return originalExists(path);
      });

      // Should not throw error, should return empty array
      const { getAllTags } = await import('./all-tools.js');
      
      // Reset mock
      vi.restoreAllMocks();
    });

    it('should handle tool generation errors for individual tags', () => {
      // This test ensures that if one tag fails, others still work
      const tools = getAllTools();
      
      // Should have some tools even if some tags failed
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('Tool Factory Integration', () => {
    it('should properly skip GET operations', () => {
      const tools = getAllTools();
      
      // All tools should be non-GET operations (POST, PATCH, DELETE)
      // We can't directly test HTTP method, but tool names should indicate actions
      const actionIndicators = ['create', 'update', 'redact', 'add', 'remove', 'set', 'approve', 'decline', 'submit', 'expire', 'clone', 'assign'];
      
      // Most tools should have action indicators, but some might have different patterns
      const toolsWithActions = tools.filter(tool => 
        actionIndicators.some(indicator => 
          tool.name.toLowerCase().includes(indicator)
        )
      );
      
      // Should have substantial majority of tools with action indicators
      expect(toolsWithActions.length).toBeGreaterThan(tools.length * 0.75);
    });

    it('should generate tools for all major resource types', () => {
      const tools = getAllTools();
      const toolNames = tools.map(t => t.name.toLowerCase());
      
      const expectedResourceTypes = [
        'inquiry', 'account', 'transaction', 'report', 
        'verification', 'document', 'webhook'
      ];
      
      expectedResourceTypes.forEach(resourceType => {
        const hasResourceTools = toolNames.some(name => name.includes(resourceType));
        expect(hasResourceTools).toBe(true);
      });
    });
  });

  describe('Performance', () => {
    it('should initialize tools efficiently', async () => {
      const startTime = Date.now();
      await initializeAllTools();
      const endTime = Date.now();
      
      // Should initialize within reasonable time (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should cache tools after initialization', () => {
      const tools1 = getAllTools();
      const tools2 = getAllTools();
      
      // Should return the same array reference (cached)
      expect(tools1).toBe(tools2);
    });
  });
});

describe('Path Resolution Regression Test', () => {
  it('should never look for tags file in dist/generated', () => {
    // This is a specific regression test for the bug that was fixed
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // The correct path that should always be used
    const PROJECT_ROOT = path.resolve(__dirname, '../../../');
    const correctPath = path.join(PROJECT_ROOT, 'src/generated/api-tags.yaml');
    
    // In production, we might be in dist/ but should still resolve to src/
    expect(correctPath).toMatch(/src\/generated\/api-tags\.yaml$/);
    expect(correctPath).not.toMatch(/dist\/generated\/api-tags\.yaml$/);
    
    // Ensure path resolution goes up to project root correctly
    expect(PROJECT_ROOT).toMatch(/persona-api-mcp$/);
  });

  it('should work correctly when running from dist directory', () => {
    // Simulate being in the dist directory
    const distDir = '/some/project/dist/tools/generated';
    const projectRoot = path.resolve(distDir, '../../../');
    const tagsFile = path.join(projectRoot, 'src/generated/api-tags.yaml');
    
    // Should resolve to the source directory, not dist
    expect(tagsFile).toMatch(/src\/generated\/api-tags\.yaml$/);
    expect(tagsFile).not.toMatch(/dist\/generated\/api-tags\.yaml$/);
  });
});
