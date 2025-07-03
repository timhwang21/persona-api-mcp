/**
 * Inquiry List Tool
 * 
 * This module implements the MCP tool for listing inquiries
 * with comprehensive filtering, pagination, and formatting options.
 */

import { z } from 'zod';
import { personaAPI } from '../../api/client.js';
import { resourceManager } from '../../resources/manager.js';
import { logger, createTimer } from '../../utils/logger.js';
import { handleError } from '../../utils/errors.js';
import { InquiryStatus, isInquiry } from '../../api/types.js';

/**
 * Input schema for inquiry listing
 */
export const listInquiriesInputSchema = z.object({
  // Pagination
  pageSize: z.number().int().min(1).max(100).optional().default(10).describe('Number of inquiries to return (1-100)'),
  pageAfter: z.string().optional().describe('Cursor for pagination - ID of inquiry to start after'),
  pageBefore: z.string().optional().describe('Cursor for pagination - ID of inquiry to start before'),
  
  // Filters
  inquiryIds: z.array(z.string()).optional().describe('Filter by specific inquiry IDs'),
  accountIds: z.array(z.string()).optional().describe('Filter by account IDs'),
  note: z.string().optional().describe('Filter by note content (must be the only filter)'),
  referenceId: z.string().optional().describe('Filter by reference ID'),
  inquiryTemplateIds: z.array(z.string()).optional().describe('Filter by inquiry template IDs'),
  templateIds: z.array(z.string()).optional().describe('Filter by legacy template IDs'),
  statuses: z.array(z.enum(['created', 'pending', 'completed', 'expired', 'failed', 'needs_review', 'approved', 'declined'])).optional().describe('Filter by inquiry statuses'),
  createdAfter: z.string().optional().describe('Filter by creation date (ISO 8601 format) - equal to or later than'),
  createdBefore: z.string().optional().describe('Filter by creation date (ISO 8601 format) - earlier than or equal to'),
  
  // Response options
  include: z.array(z.string()).optional().describe('Related objects to include (account, verifications, reports, etc.)'),
  fields: z.array(z.string()).optional().describe('Specific inquiry fields to include in response'),
  
  // Display options
  summaryOnly: z.boolean().optional().default(false).describe('Return only summary information instead of full details'),
});

export type ListInquiriesInput = z.infer<typeof listInquiriesInputSchema>;

/**
 * Format inquiry summary for list display
 */
function formatInquirySummary(inquiry: any): string {
  const attributes = inquiry.attributes || {};
  const createdAt = attributes['created-at'] ? new Date(attributes['created-at']).toLocaleDateString() : 'N/A';
  const status = attributes.status || 'N/A';
  const referenceId = attributes['reference-id'] ? ` (${attributes['reference-id']})` : '';
  
  return `- **${inquiry.id}**${referenceId} - ${status} - ${createdAt}`;
}

/**
 * Format inquiry details for list display
 */
function formatInquiryDetails(inquiry: any): string {
  const attributes = inquiry.attributes || {};
  
  return `### ${inquiry.id}
- **Status:** ${attributes.status || 'N/A'}
- **Reference ID:** ${attributes['reference-id'] || 'N/A'}
- **Created:** ${attributes['created-at'] ? new Date(attributes['created-at']).toLocaleString() : 'N/A'}
- **Note:** ${attributes.note || 'No note'}
- **Tags:** ${attributes.tags ? attributes.tags.join(', ') : 'No tags'}`;
}

/**
 * Format pagination information
 */
function formatPagination(links: any, currentSize: number): string {
  const parts: string[] = [];
  
  parts.push(`**Results:** ${currentSize} inquiries`);
  
  if (links?.prev) {
    parts.push('**Previous page:** Available');
  }
  if (links?.next) {
    parts.push('**Next page:** Available');
  }
  
  return parts.join('\n');
}

/**
 * Create status summary
 */
function createStatusSummary(inquiries: any[]): string {
  const statusCounts: Record<string, number> = {};
  
  inquiries.forEach(inquiry => {
    const status = inquiry.attributes?.status || 'unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  
  const statusItems = Object.entries(statusCounts)
    .sort(([, a], [, b]) => b - a) // Sort by count descending
    .map(([status, count]) => `- **${status}:** ${count}`)
    .join('\n');
  
  return `**Status Summary:**\n${statusItems}`;
}

/**
 * List inquiries tool handler
 */
export async function listInquiries(input: ListInquiriesInput) {
  const timer = createTimer('list_inquiries');

  try {
    logger.info('Listing inquiries', {
      pageSize: input.pageSize,
      filters: {
        inquiryIds: input.inquiryIds,
        accountIds: input.accountIds,
        statuses: input.statuses,
        referenceId: input.referenceId,
      },
      include: input.include,
    });

    // Build query parameters
    const queryParams: any = {
      'page[size]': input.pageSize,
      include: input.include,
      'fields[inquiry]': input.fields,
    };

    if (input.pageAfter) {
      queryParams['page[after]'] = input.pageAfter;
    }
    if (input.pageBefore) {
      queryParams['page[before]'] = input.pageBefore;
    }

    // Build filters
    const filter: any = {};
    
    if (input.inquiryIds) {
      filter['inquiry-id'] = input.inquiryIds;
    }
    if (input.accountIds) {
      filter['account-id'] = input.accountIds;
    }
    if (input.note) {
      filter.note = input.note;
    }
    if (input.referenceId) {
      filter['reference-id'] = input.referenceId;
    }
    if (input.inquiryTemplateIds) {
      filter['inquiry-template-id'] = input.inquiryTemplateIds;
    }
    if (input.templateIds) {
      filter['template-id'] = input.templateIds;
    }
    if (input.statuses) {
      filter.status = input.statuses;
    }
    if (input.createdAfter) {
      filter['created-at-start'] = input.createdAfter;
    }
    if (input.createdBefore) {
      filter['created-at-end'] = input.createdBefore;
    }

    if (Object.keys(filter).length > 0) {
      queryParams.filter = filter;
    }

    // Make API call
    const response = await personaAPI.listInquiries(queryParams);

    // Cache individual inquiries
    if (response.data) {
      for (const inquiry of response.data) {
        if (isInquiry(inquiry)) {
          resourceManager.cacheResource('inquiry', inquiry.id, { data: inquiry });
        }
      }
    }

    const duration = timer.end({ success: true });

    logger.info('Inquiries listed successfully', {
      count: response.data?.length || 0,
      hasNext: !!response.links?.next,
      hasPrev: !!response.links?.prev,
      duration,
    });

    // Generate resource URI for the list
    const resourceUri = resourceManager.generateResourceUri('inquiry-list', undefined, {
      ...queryParams,
      filter,
    });

    // Format the response
    const inquiries = response.data || [];
    const statusSummary = createStatusSummary(inquiries);
    const paginationInfo = formatPagination(response.links, inquiries.length);

    let inquiryList: string;
    if (input.summaryOnly) {
      inquiryList = inquiries.map(formatInquirySummary).join('\n');
    } else {
      inquiryList = inquiries.map(formatInquiryDetails).join('\n\n');
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `✅ Found ${inquiries.length} inquiries

${statusSummary}

${paginationInfo}

**Resource URI:** ${resourceUri}

${inquiries.length > 0 ? `\n**Inquiries:**\n${inquiryList}` : '\n*No inquiries found matching the criteria.*'}

${!input.summaryOnly && inquiries.length > 0 ? `\n**Raw JSON Response:**\n\`\`\`json\n${JSON.stringify(response, null, 2)}\n\`\`\`` : ''}`,
        },
      ],
    };
  } catch (error) {
    const duration = timer.end({ success: false });
    
    handleError(error as Error, {
      tool: 'list_inquiries',
      input: {
        pageSize: input.pageSize,
        filters: {
          inquiryIds: input.inquiryIds,
          accountIds: input.accountIds,
          statuses: input.statuses,
        },
      },
      duration,
    });

    logger.error('Failed to list inquiries', error as Error, {
      pageSize: input.pageSize,
      duration,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: `❌ Failed to list inquiries: ${(error as Error).message}`,
        },
      ],
    };
  }
}