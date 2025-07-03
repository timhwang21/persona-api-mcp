# Persona API MCP Server

A Model Context Protocol (MCP) server that integrates with Persona's REST API, optimized for usage with Claude Code. This server exposes every Persona API endpoint as MCP tools and provides API responses as resources for seamless integration.

## Features

- **Complete API Coverage**: All Persona API endpoints exposed as MCP tools
- **Resource Management**: API responses cached and exposed as MCP resources
- **Type Safety**: Full TypeScript implementation with generated types
- **Claude Code Optimized**: Designed specifically for Claude Code integration
- **Comprehensive Error Handling**: Robust error handling and logging
- **Development Friendly**: Hot reloading and extensive debugging support

## Quick Start

### Prerequisites

- Node.js 18+ 
- Persona API key
- Claude Code (for usage)

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd persona-api-mcp
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   export PERSONA_API_KEY="your-persona-api-key-here"
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

### Development

For development with hot reloading:
```bash
npm run dev
```

## Configuration

The server can be configured via environment variables:

### Required Configuration

- `PERSONA_API_KEY`: Your Persona API key (required)

### Optional Configuration

- `PERSONA_API_URL`: Persona API base URL (default: `https://withpersona.com/api/v1`)
- `PERSONA_API_TIMEOUT`: Request timeout in milliseconds (default: `30000`)
- `PERSONA_API_RETRIES`: Number of retry attempts (default: `3`)
- `CACHE_TTL`: Cache time-to-live in seconds (default: `300`)
- `CACHE_ENABLED`: Enable/disable caching (default: `true`)
- `LOG_LEVEL`: Logging level (default: `info`)
- `NODE_ENV`: Environment (default: `development`)

### Example Configuration

```bash
# Required
export PERSONA_API_KEY="your-api-key"

# Optional
export PERSONA_API_URL="https://withpersona.com/api/v1"
export CACHE_TTL="600"
export LOG_LEVEL="debug"
export NODE_ENV="development"
```

## Usage with Claude Code

### Setup in Claude Code

1. **Add to your Claude Code configuration:**
   ```json
   {
     "mcpServers": {
       "persona-api": {
         "command": "node",
         "args": ["/path/to/persona-api-mcp/dist/server/index.js"],
         "env": {
           "PERSONA_API_KEY": "your-api-key-here"
         }
       }
     }
   }
   ```

2. **Restart Claude Code** to load the new MCP server.

### Available Tools

#### Inquiry Management

- **`inquiry_create`**: Create a new inquiry
- **`inquiry_retrieve`**: Get inquiry details by ID  
- **`inquiry_list`**: List inquiries with filtering and pagination

#### Tool Examples

**Create an Inquiry:**
```json
{
  "tool": "inquiry_create",
  "arguments": {
    "inquiryTemplateId": "itmpl_ABC123",
    "referenceId": "user-123",
    "autoCreateAccount": true,
    "fields": {
      "name_first": "John",
      "name_last": "Doe"
    }
  }
}
```

**Retrieve an Inquiry:**
```json
{
  "tool": "inquiry_retrieve",
  "arguments": {
    "inquiryId": "inq_ABC123",
    "include": ["account", "verifications", "reports"]
  }
}
```

**List Inquiries:**
```json
{
  "tool": "inquiry_list",
  "arguments": {
    "statuses": ["completed", "approved"],
    "pageSize": 20,
    "summaryOnly": true
  }
}
```

### Available Resources

Access cached API responses as resources:

- **`persona://inquiry/{id}`**: Individual inquiry data
- **`persona://inquiries`**: List of inquiries
- **`persona://account/{id}`**: Account data (future)
- **`persona://verification/{id}`**: Verification data (future)

### Available Prompts

Pre-built prompts for common workflows:

- **`inquiry_analysis`**: Analyze an inquiry and provide insights
- **`inquiry_review`**: Review an inquiry and suggest next steps
- **`inquiry_troubleshooting`**: Help troubleshoot inquiry issues

## API Reference

### Inquiry Tools

#### `inquiry_create`

Create a new inquiry with optional pre-filled attributes.

**Parameters:**
- `templateId` (string, optional): Legacy template ID starting with `tmpl_`
- `inquiryTemplateId` (string, optional): Inquiry template ID starting with `itmpl_`
- `inquiryTemplateVersionId` (string, optional): Template version ID starting with `itmplv_`
- `referenceId` (string, optional): Reference ID for your user model
- `accountId` (string, optional): Account ID to associate with inquiry
- `fields` (object, optional): JSON key-value pairs defined by template
- `tags` (string[], optional): Tags to associate with inquiry
- `autoCreateAccount` (boolean, optional): Auto-create account if needed (default: true)

**Returns:** Created inquiry object with resource URI.

#### `inquiry_retrieve`

Retrieve the details of an existing inquiry.

**Parameters:**
- `inquiryId` (string, required): The inquiry ID starting with `inq_`
- `include` (string[], optional): Related objects to include
- `fields` (string[], optional): Specific fields to include

**Returns:** Full inquiry object with optional related data.

#### `inquiry_list`

List inquiries with filtering and pagination.

**Parameters:**
- `pageSize` (number, optional): Number of results (1-100, default: 10)
- `statuses` (string[], optional): Filter by inquiry statuses
- `accountIds` (string[], optional): Filter by account IDs
- `createdAfter` (string, optional): Filter by creation date
- `summaryOnly` (boolean, optional): Return summary format (default: false)

**Returns:** List of inquiries with pagination information.

## Development

### Project Structure

```
src/
├── server/           # MCP server implementation
├── api/             # Persona API client and types
├── tools/           # MCP tool implementations
│   └── inquiry/     # Inquiry-specific tools
├── resources/       # Resource management and caching
├── utils/           # Utilities (config, logging, errors)
└── prompts/         # Prompt templates (future)
```

### Building

```bash
npm run build        # Build for production
npm run type-check   # Type checking only
```

### Testing

```bash
npm test            # Run all tests
npm run lint        # Run linting
npm run lint:fix    # Fix linting issues
```

### Debugging

Set `LOG_LEVEL=debug` for detailed logging:

```bash
LOG_LEVEL=debug npm run dev
```

## Troubleshooting

### Common Issues

**API Key Issues:**
```
Error: Configuration validation failed: persona.apiKey: String must contain at least 1 character(s)
```
- Solution: Set `PERSONA_API_KEY` environment variable

**Connection Errors:**
```
Error: Persona API error: Network error
```
- Check internet connectivity
- Verify API key is valid
- Check Persona API status

**Permission Errors:**
```
Error: Persona API error: Authentication error
```
- Verify API key has required permissions
- Check if API key is expired

### Health Checks

The server performs health checks on startup:

```bash
npm start
# Look for: ✅ Persona API connectivity check passed
```

### Cache Issues

Clear cache by restarting the server or setting `CACHE_ENABLED=false`.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Style

- TypeScript with strict mode
- ESLint for code quality
- Prettier for formatting
- Comprehensive error handling
- Extensive documentation

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review server logs with `LOG_LEVEL=debug`
3. Open an issue with detailed error information

## Roadmap

- [ ] Complete API coverage (accounts, verifications, reports)
- [ ] Advanced caching strategies
- [ ] Webhook support
- [ ] Custom prompt templates
- [ ] Performance optimizations
- [ ] Plugin architecture