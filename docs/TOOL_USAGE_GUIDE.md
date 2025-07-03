# Tool Usage Guide: Parameter Documentation Fix

## Problem Identified

Claude was having trouble using the MCP tools because of insufficient parameter documentation. The specific issue was:

### What Claude was doing (wrong):
```json
{
  "data": "{\n  \"inquiry-template-id\": \"itmpl_xxx\",\n  \"name-first\": \"TEST\", ...}"
}
```

### Also wrong - data object wrapper:
```json
{
  "data": {
    "attributes": {
      "inquiryTemplateId": "itmpl_xxx", 
      "nameFirst": "TEST"
    }
  }
}
```

### What the tools expect (correct):
```json
{
  "inquiryTemplateId": "itmpl_xxx",
  "fields": {
    "nameFirst": "TEST",
    "nameLast": "TEST", 
    "email": "test@example.com"
  }
}
```

**Key Point:** The MCP automatically wraps parameters in the `{"data": {"attributes": {...}}}` structure that the Persona API expects. User information (name, address, etc.) must be nested in a `fields` object, not passed as top-level attributes.

## Root Causes

1. **Parameter structure confusion**: Claude thought it needed to pass the full Persona API structure
2. **Missing parameter documentation**: Tools didn't show required vs optional parameters clearly  
3. **No examples**: No sample requests to guide usage
4. **Unclear API wrapping**: Tools didn't explain that MCP handles the data.attributes structure automatically
5. **Poor OpenAPI reference**: No guidance to check OpenAPI docs for detailed schemas

## Solution Implemented

### 1. Enhanced Tool Descriptions

Added comprehensive usage guidance to each tool:

```typescript
// Enhanced description with OpenAPI reference and usage guidance
let description = operation.summary || operation.description || `${method.toUpperCase()} ${path}`;
description += `\n\n📚 **Usage Guide:**`;
description += `\n• For parameter details, check: openapi/openapi.yaml (operation: ${operation.operationId})`;
description += `\n• Pass parameters as individual fields, NOT as a single JSON string`;
description += `\n• Use camelCase for parameter names (e.g., inquiryTemplateId, not inquiry-template-id)`;

if (operation.operationId.includes('create')) {
  description += `\n• This creates a new resource - ensure all required fields are provided`;
} else if (operation.operationId.includes('update')) {
  description += `\n• This updates an existing resource - only changed fields needed`;
}

// Add parameter hints for common operations
if (operation.operationId.includes('inquiry')) {
  if (operation.operationId.includes('create')) {
    description += `\n• **Common required fields**: inquiryTemplateId (e.g., itmpl_xxx)`;
    description += `\n• **Example**: {"inquiryTemplateId": "itmpl_abc123", "nameFirst": "John", "nameLast": "Doe"}`;
  }
}
```

### 2. Enhanced Parameter Descriptions

Added clear REQUIRED/OPTIONAL labels and format hints:

```typescript
// Enhanced parameter descriptions for path parameters
let paramDescription = param.description || `${param.name} parameter`;
if (param.required) {
  paramDescription = `[REQUIRED] ${paramDescription}`;
} else {
  paramDescription = `[OPTIONAL] ${paramDescription}`;
}

// Add format hints for common parameter types
if (param.name.includes('id') && !param.name.includes('template')) {
  paramDescription += ` (format: ${this.getIdFormatHint(param.name)})`;
} else if (param.name.includes('template')) {
  paramDescription += ` (format: itmpl_xxx)`;
}
```

### 3. ID Format Hints

Added specific format guidance for different resource types:

```typescript
private getIdFormatHint(paramName: string): string {
  if (paramName.includes('inquiry')) {
    return 'inq_xxx';
  } else if (paramName.includes('account')) {
    return 'acc_xxx';
  } else if (paramName.includes('case')) {
    return 'cas_xxx';
  }
  // ... more resource types
}
```

### 4. Updated Server Usage Information

Enhanced the startup logs with clear parameter guidance:

```json
{
  "tools": {
    "parameterGuide": {
      "format": "Pass parameters as individual fields, NOT as JSON strings",
      "naming": "Use camelCase (e.g., inquiryTemplateId, not inquiry-template-id)",
      "ids": "ID formats: inq_xxx (inquiries), acc_xxx (accounts), itmpl_xxx (templates)",
      "reference": "Check openapi/openapi.yaml for detailed parameter schemas"
    }
  },
  "examples": {
    "create": "inquiry_create with {inquiryTemplateId: \"itmpl_xxx\", nameFirst: \"John\"} (NOT as JSON string)",
    "wrong_format": "DON'T pass {data: \"{\\\"inquiryTemplateId\\\": \\\"itmpl_xxx\\\"}\"} - this will fail"
  }
}
```

## How to Use Tools Correctly

### ✅ Correct Usage Examples

**Creating an inquiry:**
```json
{
  "inquiryTemplateId": "itmpl_uPUMVq1JYyE7MbzeZpQw2BUmawWb",
  "fields": {
    "nameFirst": "John",
    "nameLast": "Doe", 
    "email": "john@example.com",
    "phoneNumber": "+1234567890"
  }
}
```

**Updating an account:**
```json
{
  "accountId": "acc_123abc",
  "email": "new@email.com"
}
```

### ❌ Common Mistakes to Avoid

**Don't pass JSON strings:**
```json
{
  "data": "{\"inquiryTemplateId\": \"itmpl_xxx\", \"nameFirst\": \"John\"}"
}
```

**Don't use data object wrappers:**
```json
{
  "data": {
    "attributes": {
      "inquiryTemplateId": "itmpl_xxx",
      "nameFirst": "John"
    }
  }
}
```

**Don't use kebab-case:**
```json
{
  "inquiry-template-id": "itmpl_xxx",  // ❌ Wrong
  "name-first": "John"                 // ❌ Wrong
}
```

## Parameter Reference Guide

### Common ID Formats
- **Inquiries**: `inq_xxx` (e.g., `inq_123abc`)
- **Accounts**: `acc_xxx` (e.g., `acc_456def`)  
- **Templates**: `itmpl_xxx` (e.g., `itmpl_789ghi`)
- **Cases**: `cas_xxx`
- **Verifications**: `ver_xxx`
- **Reports**: `rpt_xxx`
- **Transactions**: `txn_xxx`

### Required vs Optional Fields
- Look for `[REQUIRED]` and `[OPTIONAL]` labels in parameter descriptions
- Required fields must be provided or the API call will fail
- Optional fields can be omitted

### Where to Find Detailed Schemas
For complete parameter schemas and validation rules, check:
- `openapi/openapi.yaml` - The authoritative source
- Look for the specific `operationId` mentioned in tool descriptions
- Each operation has detailed request/response schemas

## Implementation Notes

The fix ensures that:
1. All tool descriptions now include clear usage guidance
2. Parameters show required/optional status and format hints
3. Examples demonstrate correct parameter structure
4. OpenAPI references guide users to authoritative documentation
5. Common mistakes are explicitly called out to prevent confusion

This solves the core issue where Claude was incorrectly formatting parameters as JSON strings instead of using the proper MCP tool parameter structure.