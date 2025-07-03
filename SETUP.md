# Persona API MCP Server Setup Instructions

This guide provides detailed setup instructions for the Persona API MCP Server, including API key configuration and Claude Code integration.

## Prerequisites

### System Requirements

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher (comes with Node.js)
- **Operating System**: macOS, Linux, or Windows
- **Memory**: Minimum 512MB available RAM

### Persona API Requirements

- **Persona Account**: Active Persona account with API access
- **API Key**: Valid Persona API key with appropriate permissions
- **API Access**: Access to Persona's REST API endpoints

## Step 1: API Key Setup

### Obtaining Your Persona API Key

1. **Log into your Persona Dashboard:**
   - Visit [https://withpersona.com](https://withpersona.com)
   - Sign in to your account

2. **Navigate to API Settings:**
   - Go to **Settings** → **API Keys**
   - Or visit directly: [https://withpersona.com/dashboard/api-keys](https://withpersona.com/dashboard/api-keys)

3. **Create a New API Key:**
   - Click **"Create API Key"**
   - Choose appropriate permissions:
     - ✅ **Inquiries**: Read and Write
     - ✅ **Accounts**: Read and Write (optional)
     - ✅ **Verifications**: Read (recommended)
     - ✅ **Reports**: Read (recommended)
   - Set expiration date (or leave as never expires)
   - Add description: "MCP Server for Claude Code"

4. **Copy Your API Key:**
   - Copy the generated API key immediately
   - Store it securely (you won't be able to view it again)

### API Key Format

Your API key should look like this:
```
persona_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567
```

### Environment Variable Setup

**macOS/Linux:**
```bash
# Add to your ~/.bashrc, ~/.zshrc, or ~/.profile
export PERSONA_API_KEY="your-api-key-here"

# Or set for current session only
export PERSONA_API_KEY="persona_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567"
```

**Windows (PowerShell):**
```powershell
$env:PERSONA_API_KEY="your-api-key-here"
```

**Windows (Command Prompt):**
```cmd
set PERSONA_API_KEY=your-api-key-here
```

### Verifying API Key

Test your API key with curl:
```bash
curl -H "Authorization: Bearer $PERSONA_API_KEY" \
     -H "Persona-Version: 2023-01-05" \
     https://withpersona.com/api/v1/inquiries?page[size]=1
```

Expected response:
```json
{
  "data": [],
  "links": { ... }
}
```

## Step 2: Project Installation

### Download and Install

1. **Navigate to project directory:**
   ```bash
   cd persona-api-mcp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

### Verify Installation

```bash
# Check if build was successful
ls -la dist/

# Should see:
# dist/
# ├── server/
# ├── api/
# ├── tools/
# └── ...
```

## Step 3: Configuration

### Basic Configuration

Create a `.env` file in the project root:
```bash
# Required
PERSONA_API_KEY=your-api-key-here

# Optional - API Configuration
PERSONA_API_URL=https://withpersona.com/api/v1
PERSONA_API_TIMEOUT=30000
PERSONA_API_RETRIES=3

# Optional - Server Configuration
MCP_SERVER_NAME=persona-api-mcp
MCP_SERVER_VERSION=1.0.0

# Optional - Caching
CACHE_TTL=300
CACHE_ENABLED=true
CACHE_MAX_SIZE=1000

# Optional - Logging
LOG_LEVEL=info
LOG_FORMAT=json
ENABLE_REQUEST_LOGGING=true

# Environment
NODE_ENV=development
```

### Advanced Configuration Options

| Variable | Description | Default | Options |
|----------|-------------|---------|---------|
| `PERSONA_API_KEY` | Your Persona API key | *required* | String starting with `persona_` |
| `PERSONA_API_URL` | Persona API base URL | `https://withpersona.com/api/v1` | Valid URL |
| `PERSONA_API_TIMEOUT` | Request timeout (ms) | `30000` | Number > 0 |
| `PERSONA_API_RETRIES` | Retry attempts | `3` | Number ≥ 0 |
| `CACHE_TTL` | Cache time-to-live (seconds) | `300` | Number > 0 |
| `CACHE_ENABLED` | Enable caching | `true` | `true`, `false` |
| `LOG_LEVEL` | Logging verbosity | `info` | `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | Environment | `development` | `development`, `production`, `test` |

## Step 4: Testing the Server

### Manual Testing

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Expected output:**
   ```
   ╔═══════════════════════════════════════════════════════════════╗
   ║                     Persona API MCP Server                   ║
   ║                                                               ║
   ║  Version: 1.0.0    Environment: development   ║
   ║  Optimized for Claude Code                                    ║
   ╚═══════════════════════════════════════════════════════════════╝

   [timestamp] INFO: Loading configuration...
   [timestamp] INFO: ✅ Configuration loaded and validated
   [timestamp] INFO: ✅ Persona API connectivity check passed
   [timestamp] INFO: 🚀 Persona API MCP Server is running and ready for connections
   ```

3. **Test health endpoint (in another terminal):**
   ```bash
   # This tests the underlying API connectivity
   echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | node dist/server/index.js
   ```

### Development Mode

For development with hot reloading:
```bash
npm run dev
```

This will:
- Watch for file changes
- Automatically restart the server
- Use TypeScript directly (no build step)

## Step 5: Claude Code Integration

### Method 1: Global Configuration

1. **Locate Claude Code config file:**
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Add MCP server configuration:**
   ```json
   {
     "mcpServers": {
       "persona-api": {
         "command": "node",
         "args": ["/absolute/path/to/persona-api-mcp/dist/server/index.js"],
         "env": {
           "PERSONA_API_KEY": "your-api-key-here",
           "LOG_LEVEL": "info"
         }
       }
     }
   }
   ```

3. **Restart Claude Code** to load the new server.

### Method 2: Project-Specific Configuration

1. **Create `.claude_config.json` in your project:**
   ```json
   {
     "mcpServers": {
       "persona-api": {
         "command": "node",
         "args": ["./persona-api-mcp/dist/server/index.js"],
         "env": {
           "PERSONA_API_KEY": "your-api-key-here"
         }
       }
     }
   }
   ```

2. **Use relative paths** for easier project sharing.

### Verification in Claude Code

1. **Open Claude Code**
2. **Check MCP server status:**
   - Look for "persona-api" in the MCP servers list
   - Status should show "Connected"

3. **Test a tool:**
   ```
   Please use the inquiry_list tool to show me recent inquiries
   ```

4. **Test a resource:**
   ```
   Please read the resource persona://inquiries and show me a summary
   ```

## Step 6: Common Setup Issues

### Issue: "Configuration validation failed"

**Error:**
```
Configuration validation failed: persona.apiKey: String must contain at least 1 character(s)
```

**Solutions:**
1. Check environment variable is set: `echo $PERSONA_API_KEY`
2. Restart terminal after setting environment variable
3. Use absolute path in `.env` file
4. Check for typos in variable name

### Issue: "Persona API connectivity check failed"

**Error:**
```
❌ Persona API connectivity check failed
```

**Solutions:**
1. Verify API key is correct and active
2. Check internet connectivity
3. Verify API key permissions include "Inquiries: Read"
4. Test API key with curl (see verification step above)

### Issue: "Module not found" errors

**Error:**
```
Error: Cannot find module '@modelcontextprotocol/sdk'
```

**Solutions:**
1. Run `npm install` again
2. Delete `node_modules` and `package-lock.json`, then `npm install`
3. Check Node.js version: `node --version` (should be 18+)

### Issue: Claude Code connection problems

**Symptoms:**
- Server not appearing in Claude Code
- "Connection failed" status

**Solutions:**
1. Check absolute paths in configuration
2. Verify file permissions: `chmod +x dist/server/index.js`
3. Test server manually first: `npm start`
4. Check Claude Code logs for detailed error messages

### Issue: Permission denied errors

**Error:**
```
Error: EACCES: permission denied
```

**Solutions:**
1. Check file permissions: `ls -la dist/server/index.js`
2. Make executable: `chmod +x dist/server/index.js`
3. Run with correct user permissions

## Step 7: Validation Checklist

- [ ] Node.js 18+ installed
- [ ] Persona API key obtained and tested
- [ ] Environment variables set correctly
- [ ] Project dependencies installed (`npm install`)
- [ ] Project built successfully (`npm run build`)
- [ ] Server starts without errors (`npm start`)
- [ ] Claude Code configuration updated
- [ ] Claude Code restarted
- [ ] MCP server shows as "Connected" in Claude Code
- [ ] Tools respond correctly in Claude Code

## Step 8: Next Steps

### Basic Usage

1. **List inquiries:**
   ```
   Show me recent inquiries using the inquiry_list tool
   ```

2. **Get inquiry details:**
   ```
   Retrieve details for inquiry inq_ABC123 including all related data
   ```

3. **Create an inquiry:**
   ```
   Create a new inquiry using template itmpl_XYZ789 for user with reference ID "user-123"
   ```

### Advanced Usage

1. **Use prompts for analysis:**
   ```
   Use the inquiry_analysis prompt to analyze inquiry inq_ABC123
   ```

2. **Access resources directly:**
   ```
   Read the resource persona://inquiry/inq_ABC123 and format it nicely
   ```

3. **Troubleshoot issues:**
   ```
   Use the inquiry_troubleshooting prompt for inquiry inq_ABC123 that seems stuck
   ```

## Support

If you encounter issues not covered in this guide:

1. **Check server logs** with `LOG_LEVEL=debug`
2. **Review error messages** carefully
3. **Test API connectivity** independently
4. **Verify configuration** step by step

For additional help, refer to the main README.md file or create an issue with:
- Full error messages
- Configuration (sanitized)
- Steps to reproduce
- Expected vs actual behavior