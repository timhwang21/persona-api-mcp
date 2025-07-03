# Repository Structure and Setup

## 📁 Directory Layout

This repository is designed to work alongside the `persona-web` repository for local development. The expected directory structure is:

```
/path/to/your/projects/
├── persona-web/                    # Main Persona web application
│   ├── openapi/
│   │   └── external/              # OpenAPI specifications
│   │       ├── openapi.yaml       # Main OpenAPI spec
│   │       ├── paths/             # API endpoint definitions
│   │       └── components/        # Reusable components
│   └── ...
└── persona-api-mcp/               # This repository
    ├── openapi/                   # Symlink to ../persona-web/openapi/external
    ├── src/
    ├── README.md
    └── ...
```

## 🔗 OpenAPI Symlink

The MCP server relies on a symlink to access Persona's OpenAPI specifications:

```bash
# From the persona-api-mcp directory
ln -sf ../persona-web/openapi/external openapi
```

This symlink allows the server to:
- Parse OpenAPI specifications directly from the source
- Auto-generate MCP tools from API definitions
- Stay in sync with API changes automatically

## 🚀 Local Development Setup

1. **Clone persona-web** (if you haven't already)
2. **Clone persona-api-mcp** in the same parent directory
3. **Create the OpenAPI symlink** as shown above
4. **Start persona-web** development server on localhost:3000
5. **Start persona-api-mcp** server

## ⚠️ Important Notes

- **Always clone adjacent**: The repositories must be in the same parent directory
- **Symlink is required**: The OpenAPI symlink is essential for tool generation
- **Local API**: The default configuration points to localhost:3000, not production
- **Development focused**: This setup is optimized for local development workflows

## 🔧 Troubleshooting

**Symlink not working?**
```bash
# Check if the symlink exists and points to the right place
ls -la openapi
# Should show: openapi -> ../persona-web/openapi/external

# If broken, recreate it
rm openapi
ln -sf ../persona-web/openapi/external openapi
```

**OpenAPI files not found?**
```bash
# Verify persona-web structure
ls -la ../persona-web/openapi/external/
# Should show openapi.yaml and other specification files
```