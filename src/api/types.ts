/**
 * Type definitions for Persona API
 * 
 * This module contains TypeScript type definitions derived from
 * Persona's OpenAPI specification for type-safe API interactions.
 */

/**
 * Common API response structure
 */
export interface APIResponse<T> {
  data: T;
  included?: IncludedObject[];
  links?: PaginationLinks;
}

/**
 * Common API error response
 */
export interface APIErrorResponse {
  errors: APIError[];
}

/**
 * Individual API error
 */
export interface APIError {
  id?: string;
  status?: string;
  code?: string;
  title?: string;
  detail?: string;
  source?: {
    pointer?: string;
    parameter?: string;
  };
  meta?: Record<string, unknown>;
}

/**
 * Pagination links
 */
export interface PaginationLinks {
  prev?: string | null;
  next?: string | null;
}

/**
 * Included objects for relationship expansion
 */
export type IncludedObject = 
  | InquiryTemplate
  | Account
  | Verification
  | Report
  | InquirySession;

/**
 * Base object with common fields
 */
export interface BaseObject {
  type: string;
  id: string;
}

/**
 * Inquiry object structure
 */
export interface Inquiry extends BaseObject {
  type: 'inquiry';
  attributes: {
    status: InquiryStatus;
    'reference-id'?: string | null;
    note?: string | null;
    behaviors?: InquiryBehaviors;
    fields?: Record<string, unknown>;
    tags?: string[];
    'created-at'?: string;
    'updated-at'?: string;
    'started-at'?: string | null;
    'completed-at'?: string | null;
    'declined-at'?: string | null;
    'expired-at'?: string | null;
    'redacted-at'?: string | null;
  };
  relationships?: {
    account?: { data?: { type: 'account'; id: string } | null };
    'inquiry-template'?: { data?: { type: 'inquiry-template'; id: string } | null };
    template?: { data?: { type: 'template'; id: string } | null };
    verifications?: { data: Array<{ type: 'verification'; id: string }> };
    reports?: { data: Array<{ type: 'report'; id: string }> };
    'inquiry-sessions'?: { data: Array<{ type: 'inquiry-session'; id: string }> };
  };
}

/**
 * Inquiry status enumeration
 */
export type InquiryStatus = 
  | 'created'
  | 'pending' 
  | 'completed'
  | 'expired'
  | 'failed'
  | 'needs_review'
  | 'approved'
  | 'declined';

/**
 * Inquiry behavioral data
 */
export interface InquiryBehaviors {
  'api-version-less-than-minimum-count'?: number | null;
  'autofill-cancels'?: number | null;
  'autofill-starts'?: number | null;
  'behavior-threat-level'?: string | null;
  'bot-score'?: number | null;
  'completion-time'?: number | null;
  'devtools-open'?: boolean | null;
  'distraction-events'?: number | null;
  'focus-lost-events'?: number | null;
  'hesitation-baseline'?: number | null;
  'hesitation-count'?: number | null;
  'hesitation-time'?: number | null;
  'shortcut-copies'?: number | null;
  'shortcut-pastes'?: number | null;
  'user-agent'?: string | null;
  'viewport-height'?: number | null;
  'viewport-width'?: number | null;
}

/**
 * Inquiry creation request
 */
export interface CreateInquiryRequest {
  data: {
    attributes: {
      'template-id'?: string | null;
      'inquiry-template-id'?: string | null;
      'inquiry-template-version-id'?: string | null;
      'reference-id'?: string | null;
      'account-id'?: string | null;
      'creator-email-address'?: string | null;
      'theme-id'?: string | null;
      'theme-set-id'?: string | null;
      'redirect-uri'?: string | null;
      note?: string | null;
      fields?: Record<string, unknown>;
      tags?: string[];
      'initial-step-name'?: string | null;
    };
  };
  meta?: {
    'auto-create-account'?: boolean;
    'auto-create-account-type-id'?: string;
    'auto-create-account-reference-id'?: string;
    'expiration-after-create-interval-seconds'?: number | null;
    'expiration-after-start-interval-seconds'?: number | null;
    'expiration-after-resume-interval-seconds'?: number | null;
    'one-time-link-expiration-seconds'?: number | null;
  };
}

/**
 * Inquiry update request
 */
export interface UpdateInquiryRequest {
  data: {
    attributes: {
      note?: string | null;
      fields?: Record<string, unknown>;
      tags?: string[];
    };
  };
}

/**
 * Inquiry list filters
 */
export interface InquiryListFilters {
  'inquiry-id'?: string | string[];
  'account-id'?: string | string[];
  note?: string;
  'reference-id'?: string;
  'inquiry-template-id'?: string | string[];
  'template-id'?: string | string[];
  status?: InquiryStatus | InquiryStatus[];
  'created-at-start'?: string;
  'created-at-end'?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  'page[size]'?: number;
  'page[after]'?: string;
  'page[before]'?: string;
}

/**
 * Query parameters for API requests
 */
export interface QueryParams extends PaginationParams {
  include?: string[];
  'fields[inquiry]'?: string[];
  filter?: InquiryListFilters;
}

/**
 * Account object structure
 */
export interface Account extends BaseObject {
  type: 'account';
  attributes: {
    'reference-id'?: string | null;
    tags?: string[];
    'created-at'?: string;
    'updated-at'?: string;
    'redacted-at'?: string | null;
  };
}

/**
 * Inquiry Template object structure
 */
export interface InquiryTemplate extends BaseObject {
  type: 'inquiry-template';
  attributes: {
    name?: string;
    'created-at'?: string;
    'updated-at'?: string;
  };
}

/**
 * Verification object structure
 */
export interface Verification extends BaseObject {
  type: 'verification';
  attributes: {
    status?: string;
    'created-at'?: string;
    'updated-at'?: string;
  };
}

/**
 * Report object structure
 */
export interface Report extends BaseObject {
  type: 'report';
  attributes: {
    status?: string;
    'created-at'?: string;
    'updated-at'?: string;
  };
}

/**
 * Inquiry Session object structure
 */
export interface InquirySession extends BaseObject {
  type: 'inquiry-session';
  attributes: {
    'created-at'?: string;
    'updated-at'?: string;
  };
}

/**
 * One-time link response
 */
export interface OneTimeLinkResponse {
  data: {
    type: 'one-time-link';
    attributes: {
      url: string;
    };
  };
}

/**
 * HTTP methods
 */
export type HTTPMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * API request configuration
 */
export interface APIRequestConfig {
  method: HTTPMethod;
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data?: unknown;
  timeout?: number;
}

/**
 * Common headers for Persona API requests
 */
export interface PersonaHeaders {
  'Authorization': string;
  'Content-Type'?: string;
  'Persona-Version'?: string;
  'Key-Inflection'?: 'camelCase' | 'snake_case';
  'Idempotency-Key'?: string;
}

/**
 * Type guard functions
 */
export function isInquiry(obj: unknown): obj is Inquiry {
  return typeof obj === 'object' && obj !== null && (obj as any).type === 'inquiry';
}

export function isAccount(obj: unknown): obj is Account {
  return typeof obj === 'object' && obj !== null && (obj as any).type === 'account';
}

export function isAPIErrorResponse(obj: unknown): obj is APIErrorResponse {
  return typeof obj === 'object' && obj !== null && Array.isArray((obj as any).errors);
}