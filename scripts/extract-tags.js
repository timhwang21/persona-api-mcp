#!/usr/bin/env node

/**
 * Extract tags from OpenAPI specifications
 * 
 * This script parses the OpenAPI YAML files and extracts all unique tags
 * to generate a YAML file that serves as the single source of truth for
 * tool generation.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OPENAPI_DIR = path.join(PROJECT_ROOT, 'openapi');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'src', 'generated', 'api-tags.yaml');

/**
 * Extract tags from OpenAPI specification
 */
function extractTagsFromOpenAPI(openApiContent) {
  const tags = new Set();
  
  // Extract top-level tags
  if (openApiContent.tags && Array.isArray(openApiContent.tags)) {
    openApiContent.tags.forEach(tag => {
      if (tag.name && typeof tag.name === 'string') {
        tags.add(tag.name);
      }
    });
  }
  
  // Extract tags from paths operations
  if (openApiContent.paths && typeof openApiContent.paths === 'object') {
    Object.values(openApiContent.paths).forEach(pathItem => {
      if (!pathItem || typeof pathItem !== 'object') return;
      
      // Check all HTTP methods
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
      methods.forEach(method => {
        const operation = pathItem[method];
        if (operation && operation.tags && Array.isArray(operation.tags)) {
          operation.tags.forEach(tag => {
            if (typeof tag === 'string') {
              tags.add(tag);
            }
          });
        }
      });
    });
  }
  
  return Array.from(tags).sort();
}

/**
 * Parse YAML file safely
 */
function parseYamlFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return yaml.load(content);
  } catch (error) {
    console.warn(`Warning: Failed to parse ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Find all OpenAPI YAML files
 */
function findOpenAPIFiles(dir) {
  const files = [];
  
  function walkDir(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
        files.push(fullPath);
      }
    }
  }
  
  walkDir(dir);
  return files;
}

/**
 * Main extraction function
 */
function main() {
  console.log('🔍 Extracting tags from OpenAPI specifications...');
  
  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const allTags = new Set();
  
  // Primary OpenAPI specification
  const mainOpenAPIFile = path.join(OPENAPI_DIR, 'openapi.yaml');
  if (fs.existsSync(mainOpenAPIFile)) {
    console.log(`📖 Processing main OpenAPI file: ${mainOpenAPIFile}`);
    const openApiContent = parseYamlFile(mainOpenAPIFile);
    if (openApiContent) {
      const tags = extractTagsFromOpenAPI(openApiContent);
      console.log(`   Found ${tags.length} tags: ${tags.join(', ')}`);
      tags.forEach(tag => allTags.add(tag));
    }
  }
  
  // Find and process other OpenAPI files
  console.log(`🔍 Scanning for additional OpenAPI files in ${OPENAPI_DIR}...`);
  const openApiFiles = findOpenAPIFiles(OPENAPI_DIR).filter(file => file !== mainOpenAPIFile);
  
  let processedFiles = 0;
  for (const file of openApiFiles) {
    const openApiContent = parseYamlFile(file);
    if (openApiContent) {
      const tags = extractTagsFromOpenAPI(openApiContent);
      if (tags.length > 0) {
        console.log(`📖 Processing ${path.relative(PROJECT_ROOT, file)}: ${tags.length} tags`);
        tags.forEach(tag => allTags.add(tag));
        processedFiles++;
      }
    }
  }
  
  // Convert to sorted array
  const sortedTags = Array.from(allTags).sort();
  
  // Generate output
  const output = {
    apiTags: sortedTags,
    metadata: {
      generatedBy: 'scripts/extract-tags.js',
      totalTags: sortedTags.length,
      sourceFiles: {
        main: path.relative(PROJECT_ROOT, mainOpenAPIFile),
        additional: processedFiles
      }
    }
  };
  
  // Write to YAML file
  const yamlContent = yaml.dump(output, {
    indent: 2,
    lineWidth: 120,
    noRefs: true
  });
  
  fs.writeFileSync(OUTPUT_FILE, yamlContent, 'utf8');
  
  console.log(`✅ Successfully extracted ${sortedTags.length} unique tags`);
  console.log(`📝 Tags written to: ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`);
  console.log(`📊 Tags found: ${sortedTags.join(', ')}`);
  
  return sortedTags;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to extract tags:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

export { main as extractTags };
