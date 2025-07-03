# 🚨 Troubleshooting Guide

This guide covers common issues and solutions for the persona-api-mcp server.

## Common Issues

### ❌ API Key Problems

**Error:**
```
Configuration validation failed: persona.apiKey: String must contain at least 1 character(s)
```

**Solutions:**
- ✅ Set environment variable: `export PERSONA_API_KEY="your-key"`
- ✅ Check key format: Must start with `persona_live_` or `persona_test_`
- ✅ Create `.env` file with `PERSONA_API_KEY="your-key"`
- ✅ Restart terminal after setting variable

### ❌ Connection Issues

**Error:**
```
Persona API connectivity check failed
```

**Solutions:**
- ✅ Verify local Persona API server is running on localhost:3000
- ✅ Test API key manually: `curl -H "Authorization: Bearer $PERSONA_API_KEY" http://localhost:3000/api/v1/inquiries?page[size]=1`
- ✅ Check persona-web development server status
- ✅ Verify network connectivity and firewall settings

### ❌ Claude Code Integration

**Symptoms:**
- Server not appearing in Claude Code
- "Connection failed" status
- Tools not loading properly

**Solutions:**
- ✅ Use **absolute paths** in Claude Code configuration
- ✅ Verify file permissions: `chmod +x dist/server/index.js`
- ✅ Test server manually first: `npm start`
- ✅ Check Claude Code logs for errors
- ✅ Ensure MCP server is built: `npm run build`

### ❌ Tool Parameter Issues

**Error:**
```
Validation failed: Invalid parameter format
```

**Solutions:**
- ✅ Use correct inquiry ID format: `inq_ABC123def456`
- ✅ Check pagination parameters: `limit` (1-1000), `offset` (≥0)
- ✅ Avoid special characters in string parameters
- ✅ Use proper date formats: ISO 8601 (YYYY-MM-DD)

### ❌ Build and Development Errors

**TypeScript Errors:**
```
Cannot find module or type declarations
```

**Solutions:**
- ✅ Run `npm install` to ensure dependencies are installed
- ✅ Run `npm run build` to compile TypeScript
- ✅ Check `tsconfig.json` for proper configuration
- ✅ Verify OpenAPI symlink: `ls -la openapi/`

**OpenAPI Parsing Errors:**
```
Failed to parse OpenAPI specification
```

**Solutions:**
- ✅ Verify OpenAPI symlink exists: `ln -sf ../persona-web/openapi/external openapi`
- ✅ Check YAML syntax in OpenAPI files
- ✅ Ensure persona-web repository is properly set up
- ✅ Validate with: `npm run validate-openapi`

## 🔍 Health Checks

The server performs automatic health checks during startup:

```bash
npm start
# Look for:
# ✅ Configuration loaded successfully
# ✅ OpenAPI specification parsed
# ✅ Persona API connectivity check passed
# ✅ MCP server started successfully
```

## Environment Variables

Required environment variables:

```bash
# Required
PERSONA_API_KEY="your-api-key-here"

# Optional
PERSONA_API_URL="http://localhost:3000/api/v1"  # Default
LOG_LEVEL="info"                                # Default
NODE_ENV="development"                          # Default
```

## Debugging Tips

### Enable Debug Logging

```bash
export LOG_LEVEL="debug"
npm start
```

### Test API Connectivity Manually

```bash
# Test basic connectivity
curl -H "Authorization: Bearer $PERSONA_API_KEY" \
     http://localhost:3000/api/v1/inquiries?page[size]=1

# Check API health
curl http://localhost:3000/health
```

### Verify MCP Protocol

```bash
# Test MCP server directly
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}' | node dist/server/index.js
```

## Getting Help

If you encounter issues not covered here:

1. Check the [development guidelines](../AGENTS.md) for advanced troubleshooting
2. Review the [tool usage guide](TOOL_USAGE_GUIDE.md) for parameter formatting
3. Create an issue with detailed error messages and environment information