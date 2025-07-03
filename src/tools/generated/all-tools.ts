/**
 * All Generated Tools from OpenAPI Specification
 * 
 * This module contains auto-generated MCP tools for all Persona API
 * endpoints, derived directly from the OpenAPI specification.
 * 
 * PHILOSOPHY: This project relies entirely on the OpenAPI YAML specification
 * as the single source of truth. All tools, types, validations, and schemas
 * are derived from the YAML rather than being manually defined.
 */

import { toolFactory } from '../generators/tool-factory.js';
import { logger } from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Fix path resolution - in production, __dirname points to dist/, so go up to project root
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const TAGS_FILE = path.join(PROJECT_ROOT, 'src/generated/api-tags.yaml');

const allTools: any[] = [];
let toolsInitialized = false;

/**
 * Get all available tags from the OpenAPI specification
 * Reads from auto-generated YAML file created by extract-tags script
 */
async function getAllTags(): Promise<string[]> {
  await toolFactory.initialize();
  
  try {
    // Read tags from generated YAML file
    if (!fs.existsSync(TAGS_FILE)) {
      logger.warn(`Tags file not found at ${TAGS_FILE}. Run 'npm run extract-tags' to generate it.`);
      return [];
    }
    
    const tagsContent = fs.readFileSync(TAGS_FILE, 'utf8');
    const tagsData = yaml.load(tagsContent) as { apiTags: string[]; metadata?: any };
    
    if (!tagsData || !Array.isArray(tagsData.apiTags)) {
      logger.warn('Invalid tags file format. Expected { apiTags: string[] }');
      return [];
    }
    
    logger.info(`Loaded ${tagsData.apiTags.length} tags from OpenAPI specification`, {
      tagsFile: TAGS_FILE,
      generatedAt: tagsData.metadata?.generatedAt,
      totalTags: tagsData.metadata?.totalTags
    });
    
    return tagsData.apiTags;
  } catch (error) {
    logger.error('Failed to load tags from YAML file', error as Error, {
      tagsFile: TAGS_FILE
    });
    
    // Return empty array instead of fallback to ensure YAML-first philosophy
    return [];
  }
}

/**
 * Initialize all tools from OpenAPI specification
 */
export async function initializeAllTools(): Promise<void> {
  if (toolsInitialized) {
    return;
  }

  try {
    logger.info('Initializing all tools from OpenAPI specification...');
    
    await toolFactory.initialize();
    
    // Get all available tags
    const tags = await getAllTags();
    
    logger.info('Found API tags', { tags });
    
    // Generate tools for each tag
    const toolsByTag: Record<string, any[]> = {};
    
    for (const tag of tags) {
      try {
        const tagTools = toolFactory.generateToolsForTag(tag, {
          includeOptionalParams: true,
          validateResponses: true,
          includeExamples: true,
        });
        
        toolsByTag[tag] = tagTools;
        allTools.push(...tagTools);
        
        logger.info(`Generated tools for ${tag}`, {
          count: tagTools.length,
          toolNames: tagTools.map(t => t.name),
        });
      } catch (error) {
        logger.warn(`Failed to generate tools for tag: ${tag}`, {
          error: (error as Error).message,
        });
      }
    }

    toolsInitialized = true;

    logger.info('All tools initialized successfully', {
      totalToolCount: allTools.length,
      tagCount: tags.length,
      toolsByTag: Object.fromEntries(
        Object.entries(toolsByTag).map(([tag, tools]) => [tag, tools.length])
      ),
    });
  } catch (error) {
    logger.error('Failed to initialize all tools', error as Error);
    throw error;
  }
}

/**
 * Get all generated tools
 */
export function getAllTools(): any[] {
  if (!toolsInitialized) {
    throw new Error('Tools not initialized. Call initializeAllTools() first.');
  }
  
  return allTools;
}

/**
 * Get tools by tag
 */
export function getToolsByTag(tag: string): any[] {
  if (!toolsInitialized) {
    throw new Error('Tools not initialized. Call initializeAllTools() first.');
  }
  
  return allTools.filter(tool => 
    tool.name.toLowerCase().includes(tag.toLowerCase()) ||
    (tool.tags && tool.tags.includes(tag))
  );
}

/**
 * Get a specific tool by name
 */
export function getTool(name: string): any | null {
  if (!toolsInitialized) {
    throw new Error('Tools not initialized. Call initializeAllTools() first.');
  }
  
  return allTools.find(tool => tool.name === name) || null;
}

/**
 * Get tool definitions for MCP server registration
 */
export function getAllToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: any;
}> {
  if (!toolsInitialized) {
    throw new Error('Tools not initialized. Call initializeAllTools() first.');
  }

  return allTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/**
 * Execute a tool by name
 */
export async function executeTool(name: string, args: any): Promise<any> {
  if (!toolsInitialized) {
    throw new Error('Tools not initialized. Call initializeAllTools() first.');
  }

  const tool = getTool(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return await tool.handler(args);
}

/**
 * Check if a tool exists
 */
export function toolExists(name: string): boolean {
  if (!toolsInitialized) {
    return false;
  }
  
  return getTool(name) !== null;
}

