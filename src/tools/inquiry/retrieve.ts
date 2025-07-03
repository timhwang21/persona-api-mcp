/**
 * Inquiry Retrieval Tool
 * 
 * This module implements the MCP tool for retrieving existing inquiries
 * via the Persona API with caching and resource management.
 */

import { z } from 'zod';
import { personaAPI } from '../../api/client.js';
import { resourceManager } from '../../resources/manager.js';
import { logger, createTimer } from '../../utils/logger.js';
import { ValidationError, handleError } from '../../utils/errors.js';
import { isInquiry } from '../../api/types.js';

/**
 * Input schema for inquiry retrieval
 */
export const retrieveInquiryInputSchema = {
  inquiryId: z.string().describe('The ID of the inquiry to retrieve (starts with inq_)').refine(
    (id) => id.startsWith('inq_'),
    { message: 'Inquiry ID must start with inq_' }
  ),
  include: z.array(z.string()).optional().describe('Related objects to include in response (account, verifications, reports, etc.)'),
  fields: z.array(z.string()).optional().describe('Specific inquiry fields to include in response'),
};

export type RetrieveInquiryInput = z.infer<typeof z.object(retrieveInquiryInputSchema)>;

/**
 * Format inquiry data for display
 */
function formatInquiryData(inquiry: any): string {
  const attributes = inquiry.attributes || {};
  
  return `**Inquiry Details:**
- **ID:** ${inquiry.id}
- **Status:** ${attributes.status || 'N/A'}
- **Reference ID:** ${attributes['reference-id'] || 'N/A'}
- **Created:** ${attributes['created-at'] ? new Date(attributes['created-at']).toLocaleString() : 'N/A'}
- **Updated:** ${attributes['updated-at'] ? new Date(attributes['updated-at']).toLocaleString() : 'N/A'}
- **Started:** ${attributes['started-at'] ? new Date(attributes['started-at']).toLocaleString() : 'Not started'}
- **Completed:** ${attributes['completed-at'] ? new Date(attributes['completed-at']).toLocaleString() : 'Not completed'}
- **Note:** ${attributes.note || 'No note'}
- **Tags:** ${attributes.tags ? attributes.tags.join(', ') : 'No tags'}`;
}

/**
 * Format behavioral data if present
 */
function formatBehaviorData(behaviors: any): string {
  if (!behaviors) {
    return '';
  }

  const behaviorItems: string[] = [];
  
  if (behaviors['completion-time']) {
    behaviorItems.push(`- **Completion Time:** ${behaviors['completion-time']} seconds`);
  }
  if (behaviors['bot-score'] !== undefined) {
    behaviorItems.push(`- **Bot Score:** ${behaviors['bot-score']}/100`);
  }
  if (behaviors['behavior-threat-level']) {
    behaviorItems.push(`- **Threat Level:** ${behaviors['behavior-threat-level']}`);
  }
  if (behaviors['user-agent']) {
    behaviorItems.push(`- **User Agent:** ${behaviors['user-agent']}`);
  }
  if (behaviors['viewport-width'] && behaviors['viewport-height']) {
    behaviorItems.push(`- **Viewport:** ${behaviors['viewport-width']}x${behaviors['viewport-height']}`);
  }

  return behaviorItems.length > 0 ? `\n\n**Behavioral Data:**\n${behaviorItems.join('\n')}` : '';
}

/**
 * Format included objects
 */
function formatIncludedObjects(included: any[]): string {
  if (!included || included.length === 0) {
    return '';
  }

  const sections: string[] = [];
  const groupedByType = included.reduce((acc, obj) => {
    const type = obj.type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(obj);
    return acc;
  }, {} as Record<string, any[]>);

  Object.entries(groupedByType).forEach(([type, objects]) => {
    const typeTitle = type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, ' ');
    const objectList = objects.map(obj => `- ${obj.id} (${obj.attributes?.status || 'N/A'})`).join('\n');
    sections.push(`**${typeTitle}:**\n${objectList}`);
  });

  return sections.length > 0 ? `\n\n**Related Objects:**\n${sections.join('\n\n')}` : '';
}

/**
 * Retrieve inquiry tool handler
 */
export async function retrieveInquiry(input: RetrieveInquiryInput) {
  const timer = createTimer('retrieve_inquiry');

  try {
    logger.info('Retrieving inquiry', {
      inquiryId: input.inquiryId,
      include: input.include,
      fields: input.fields,
    });

    // Make API call
    const response = await personaAPI.getInquiry(input.inquiryId, {
      include: input.include,
      'fields[inquiry]': input.fields,
    });

    // Cache the retrieved inquiry
    if (response.data && isInquiry(response.data)) {
      resourceManager.cacheResource('inquiry', response.data.id, response);
    }

    const duration = timer.end({ success: true });

    logger.info('Inquiry retrieved successfully', {
      inquiryId: input.inquiryId,
      status: response.data?.attributes?.status,
      hasIncluded: !!response.included && response.included.length > 0,
      duration,
    });

    // Generate resource URI
    const resourceUri = resourceManager.generateResourceUri('inquiry', input.inquiryId, {
      include: input.include,
      fields: input.fields,
    });

    // Format the response
    const formattedData = formatInquiryData(response.data);
    const behaviorData = formatBehaviorData(response.data?.attributes?.behaviors);
    const includedData = formatIncludedObjects(response.included || []);

    return {
      content: [
        {
          type: 'text' as const,
          text: `✅ Inquiry retrieved successfully!

${formattedData}${behaviorData}${includedData}

**Resource URI:** ${resourceUri}

**Raw JSON Response:**
\`\`\`json
${JSON.stringify(response, null, 2)}
\`\`\``,
        },
      ],
    };
  } catch (error) {
    const duration = timer.end({ success: false });
    
    handleError(error as Error, {
      tool: 'retrieve_inquiry',
      input: {
        inquiryId: input.inquiryId,
        include: input.include,
        fields: input.fields,
      },
      duration,
    });

    logger.error('Failed to retrieve inquiry', error as Error, {
      inquiryId: input.inquiryId,
      duration,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: `❌ Failed to retrieve inquiry: ${(error as Error).message}

**Inquiry ID:** ${input.inquiryId}`,
        },
      ],
    };
  }
}