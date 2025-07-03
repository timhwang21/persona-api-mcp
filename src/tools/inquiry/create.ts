/**
 * Inquiry Creation Tool
 * 
 * This module implements the MCP tool for creating new inquiries
 * via the Persona API with comprehensive validation and error handling.
 */

import { z } from 'zod';
import { personaAPI } from '../../api/client.js';
import { resourceManager } from '../../resources/manager.js';
import { logger, createTimer } from '../../utils/logger.js';
import { ValidationError, handleError } from '../../utils/errors.js';
import { CreateInquiryRequest, isInquiry } from '../../api/types.js';

/**
 * Input schema for inquiry creation
 */
export const createInquiryInputSchema = {
  // Required template identifier (one of these must be provided)
  templateId: z.string().optional().describe('Legacy template ID starting with tmpl_'),
  inquiryTemplateId: z.string().optional().describe('Inquiry template ID starting with itmpl_'),
  inquiryTemplateVersionId: z.string().optional().describe('Inquiry template version ID starting with itmplv_'),
  
  // Optional inquiry attributes
  referenceId: z.string().optional().describe('Reference ID to refer to an entity in your user model'),
  accountId: z.string().optional().describe('Account ID to associate with this inquiry'),
  creatorEmailAddress: z.string().email().optional().describe('Email of the user creating this inquiry'),
  themeId: z.string().optional().describe('Theme ID for styling (Legacy 2.0 only)'),
  themeSetId: z.string().optional().describe('Theme Set ID for styling (Dynamic Flow only)'),
  redirectUri: z.string().url().optional().describe('Redirect URL after completion (Hosted flow only)'),
  note: z.string().optional().describe('Unstructured field for custom use'),
  initialStepName: z.string().optional().describe('Alternate initial step (Dynamic Flow only)'),
  
  // Fields and tags
  fields: z.record(z.unknown()).optional().describe('JSON key-value pairs defined by your template'),
  tags: z.array(z.string()).optional().describe('List of tag names to associate with the inquiry'),
  
  // Meta options
  autoCreateAccount: z.boolean().optional().default(true).describe('Automatically create an Account if one does not exist'),
  autoCreateAccountTypeId: z.string().optional().describe('Type ID for auto-created Account'),
  autoCreateAccountReferenceId: z.string().optional().describe('Reference ID for auto-created Account'),
  
  // Expiration settings
  expirationAfterCreateSeconds: z.number().int().positive().optional().describe('Expiration interval after creation'),
  expirationAfterStartSeconds: z.number().int().positive().optional().describe('Expiration interval after start'),
  expirationAfterResumeSeconds: z.number().int().positive().optional().describe('Expiration interval after resume'),
  oneTimeLinkExpirationSeconds: z.number().int().positive().optional().describe('One-time link expiration interval'),
  
  // Request options
  idempotencyKey: z.string().optional().describe('Idempotency key to ensure request uniqueness'),
  include: z.array(z.string()).optional().describe('Related objects to include in response'),
  fields_inquiry: z.array(z.string()).optional().describe('Specific inquiry fields to include in response'),
};

export type CreateInquiryInput = z.infer<typeof z.object(createInquiryInputSchema)>;

/**
 * Validate inquiry creation input
 */
function validateInput(input: CreateInquiryInput): void {
  // Ensure at least one template identifier is provided
  const hasTemplateId = input.templateId || input.inquiryTemplateId || input.inquiryTemplateVersionId;
  if (!hasTemplateId) {
    throw new ValidationError(
      'Template identifier required',
      [
        {
          field: 'template',
          message: 'One of templateId, inquiryTemplateId, or inquiryTemplateVersionId must be provided',
        },
      ]
    );
  }

  // Validate template ID formats
  if (input.templateId && !input.templateId.startsWith('tmpl_')) {
    throw new ValidationError(
      'Invalid template ID format',
      [
        {
          field: 'templateId',
          message: 'Template ID must start with tmpl_',
        },
      ]
    );
  }

  if (input.inquiryTemplateId && !input.inquiryTemplateId.startsWith('itmpl_')) {
    throw new ValidationError(
      'Invalid inquiry template ID format',
      [
        {
          field: 'inquiryTemplateId',
          message: 'Inquiry template ID must start with itmpl_',
        },
      ]
    );
  }

  if (input.inquiryTemplateVersionId && !input.inquiryTemplateVersionId.startsWith('itmplv_')) {
    throw new ValidationError(
      'Invalid inquiry template version ID format',
      [
        {
          field: 'inquiryTemplateVersionId',
          message: 'Inquiry template version ID must start with itmplv_',
        },
      ]
    );
  }

  // Validate account ID format if provided
  if (input.accountId && !input.accountId.startsWith('act_')) {
    throw new ValidationError(
      'Invalid account ID format',
      [
        {
          field: 'accountId',
          message: 'Account ID must start with act_',
        },
      ]
    );
  }
}

/**
 * Build request object from input
 */
function buildRequest(input: CreateInquiryInput): CreateInquiryRequest {
  const request: CreateInquiryRequest = {
    data: {
      attributes: {},
    },
  };

  // Set template identifier
  if (input.templateId) {
    request.data.attributes['template-id'] = input.templateId;
  }
  if (input.inquiryTemplateId) {
    request.data.attributes['inquiry-template-id'] = input.inquiryTemplateId;
  }
  if (input.inquiryTemplateVersionId) {
    request.data.attributes['inquiry-template-version-id'] = input.inquiryTemplateVersionId;
  }

  // Set optional attributes
  if (input.referenceId) {
    request.data.attributes['reference-id'] = input.referenceId;
  }
  if (input.accountId) {
    request.data.attributes['account-id'] = input.accountId;
  }
  if (input.creatorEmailAddress) {
    request.data.attributes['creator-email-address'] = input.creatorEmailAddress;
  }
  if (input.themeId) {
    request.data.attributes['theme-id'] = input.themeId;
  }
  if (input.themeSetId) {
    request.data.attributes['theme-set-id'] = input.themeSetId;
  }
  if (input.redirectUri) {
    request.data.attributes['redirect-uri'] = input.redirectUri;
  }
  if (input.note) {
    request.data.attributes.note = input.note;
  }
  if (input.fields) {
    request.data.attributes.fields = input.fields;
  }
  if (input.tags) {
    request.data.attributes.tags = input.tags;
  }
  if (input.initialStepName) {
    request.data.attributes['initial-step-name'] = input.initialStepName;
  }

  // Set meta options
  if (input.autoCreateAccount !== undefined ||
      input.autoCreateAccountTypeId ||
      input.autoCreateAccountReferenceId ||
      input.expirationAfterCreateSeconds ||
      input.expirationAfterStartSeconds ||
      input.expirationAfterResumeSeconds ||
      input.oneTimeLinkExpirationSeconds) {
    
    request.meta = {};

    if (input.autoCreateAccount !== undefined) {
      request.meta['auto-create-account'] = input.autoCreateAccount;
    }
    if (input.autoCreateAccountTypeId) {
      request.meta['auto-create-account-type-id'] = input.autoCreateAccountTypeId;
    }
    if (input.autoCreateAccountReferenceId) {
      request.meta['auto-create-account-reference-id'] = input.autoCreateAccountReferenceId;
    }
    if (input.expirationAfterCreateSeconds) {
      request.meta['expiration-after-create-interval-seconds'] = input.expirationAfterCreateSeconds;
    }
    if (input.expirationAfterStartSeconds) {
      request.meta['expiration-after-start-interval-seconds'] = input.expirationAfterStartSeconds;
    }
    if (input.expirationAfterResumeSeconds) {
      request.meta['expiration-after-resume-interval-seconds'] = input.expirationAfterResumeSeconds;
    }
    if (input.oneTimeLinkExpirationSeconds) {
      request.meta['one-time-link-expiration-seconds'] = input.oneTimeLinkExpirationSeconds;
    }
  }

  return request;
}

/**
 * Create inquiry tool handler
 */
export async function createInquiry(input: CreateInquiryInput) {
  const timer = createTimer('create_inquiry');

  try {
    logger.info('Creating inquiry', {
      templateId: input.templateId,
      inquiryTemplateId: input.inquiryTemplateId,
      inquiryTemplateVersionId: input.inquiryTemplateVersionId,
      referenceId: input.referenceId,
      accountId: input.accountId,
    });

    // Validate input
    validateInput(input);

    // Build request
    const request = buildRequest(input);

    // Make API call
    const response = await personaAPI.createInquiry(request, input.idempotencyKey);

    // Cache the created inquiry
    if (response.data && isInquiry(response.data)) {
      resourceManager.cacheResource('inquiry', response.data.id, response);
    }

    const duration = timer.end({ success: true });

    logger.info('Inquiry created successfully', {
      inquiryId: response.data?.id,
      status: response.data?.attributes?.status,
      duration,
    });

    // Format response for MCP
    const result = {
      inquiry: response.data,
      included: response.included,
      resourceUri: response.data ? resourceManager.generateResourceUri('inquiry', response.data.id) : undefined,
      createdAt: new Date().toISOString(),
      duration,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: `✅ Inquiry created successfully!

**Inquiry ID:** ${response.data?.id}
**Status:** ${response.data?.attributes?.status}
**Resource URI:** ${result.resourceUri}

**Full Response:**
\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\``,
        },
      ],
    };
  } catch (error) {
    const duration = timer.end({ success: false });
    
    handleError(error as Error, {
      tool: 'create_inquiry',
      input: {
        templateId: input.templateId,
        inquiryTemplateId: input.inquiryTemplateId,
        referenceId: input.referenceId,
      },
      duration,
    });

    logger.error('Failed to create inquiry', error as Error, {
      templateId: input.templateId,
      inquiryTemplateId: input.inquiryTemplateId,
      duration,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: `❌ Failed to create inquiry: ${(error as Error).message}`,
        },
      ],
    };
  }
}