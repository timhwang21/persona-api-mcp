/**
 * Generated Inquiry Tools from OpenAPI Specification
 * 
 * This module contains auto-generated MCP tools for Persona's Inquiry API
 * endpoints, derived directly from the OpenAPI specification.
 */

import { toolFactory } from '../generators/tool-factory.js';
import { logger } from '../../utils/logger.js';

let inquiryTools: any[] = [];
let toolsInitialized = false;

/**
 * Initialize inquiry tools from OpenAPI specification
 */
export async function initializeInquiryTools(): Promise<void> {
  if (toolsInitialized) {
    return;
  }

  try {
    logger.info('Initializing inquiry tools from OpenAPI specification...');
    
    await toolFactory.initialize();
    
    // Generate tools for the 'Inquiries' tag
    inquiryTools = toolFactory.generateToolsForTag('Inquiries', {
      includeOptionalParams: true,
      cacheResponses: true,
      validateResponses: true,
      includeExamples: true,
    });

    toolsInitialized = true;

    logger.info('Inquiry tools initialized successfully', {
      toolCount: inquiryTools.length,
      toolNames: inquiryTools.map(t => t.name),
    });
  } catch (error) {
    logger.error('Failed to initialize inquiry tools', error as Error);
    throw error;
  }
}

/**
 * Get all generated inquiry tools
 */
export function getInquiryTools(): any[] {
  if (!toolsInitialized) {
    throw new Error('Inquiry tools not initialized. Call initializeInquiryTools() first.');
  }
  
  return inquiryTools;
}

/**
 * Get a specific inquiry tool by name
 */
export function getInquiryTool(name: string): any | null {
  if (!toolsInitialized) {
    throw new Error('Inquiry tools not initialized. Call initializeInquiryTools() first.');
  }
  
  return inquiryTools.find(tool => tool.name === name) || null;
}

/**
 * Get tool definitions for MCP server registration
 */
export function getInquiryToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: any;
}> {
  if (!toolsInitialized) {
    throw new Error('Inquiry tools not initialized. Call initializeInquiryTools() first.');
  }

  return inquiryTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/**
 * Execute an inquiry tool by name
 */
export async function executeInquiryTool(name: string, args: any): Promise<any> {
  if (!toolsInitialized) {
    throw new Error('Inquiry tools not initialized. Call initializeInquiryTools() first.');
  }

  const tool = getInquiryTool(name);
  if (!tool) {
    throw new Error(`Unknown inquiry tool: ${name}`);
  }

  return await tool.handler(args);
}

/**
 * Legacy exports for backward compatibility
 * These will use the generated tools but maintain the same interface
 */

export async function createInquiry(input: any) {
  return await executeInquiryTool('inquiry_create', input);
}

export async function retrieveInquiry(input: any) {
  return await executeInquiryTool('inquiry_retrieve', input);
}

export async function listInquiries(input: any) {
  return await executeInquiryTool('inquiry_list', input);
}

// Export input schemas for backward compatibility
export const createInquiryInputSchema = {};
export const retrieveInquiryInputSchema = {};
export const listInquiriesInputSchema = {};

// These will be populated after initialization
export function getCreateInquiryInputSchema() {
  const tool = getInquiryTool('inquiry_create');
  return tool?.inputSchema || {};
}

export function getRetrieveInquiryInputSchema() {
  const tool = getInquiryTool('inquiry_retrieve');
  return tool?.inputSchema || {};
}

export function getListInquiriesInputSchema() {
  const tool = getInquiryTool('inquiry_list');
  return tool?.inputSchema || {};
}