# Prompt

Build an MCP server that:
- Integrates with Persona's REST API
- Works locally in development
- Optimized for usage with Claude Code
- Exposes every endpoint as a tool (e.g. inquiry create, inquiry show, account redact)
- Exposes API responses as resources
- Exposes prompts for every Persona model (e.g. inquiry, verification, account, report)

## TODO
- First, think deeply about the task. Then, come up with an implementation plan. Save this to a local file.
- Next, start implementing the Inquiry endpoint found at ../persona-web/openapi/external/paths/inquiries, and then pause and ask me to review the work. Document code extensively.
- Finally, provide setup instructions (e.g. what API keys or credentials need to be provided for proper functionality)
- Use the MCP inspector (https://modelcontextprotocol.io/docs/tools/inspector) to debug any issues

## Resources

- The OpenAPI spec and all documentation for the Persona REST API can be found at ../persona-web/openapi
- Implementation for all REST API endpoints can be found at ../persona-web/app/controllers/api/external
- An overview of how MCP works can be found at ./llms-full.txt
- The MCP TypeScript SDK codebase and doucmentation can be found at ./typescript-sdk

