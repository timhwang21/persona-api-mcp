 interface APIErrorResponse {
  errors: APIError[];
}

 interface APIError {
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

export interface QueryParams {
  include?: string | string[];
  'page[size]'?: number;
  'page[after]'?: string;
  'page[before]'?: string;
  sort?: string;
  [key: string]: any;
}

 export type HTTPMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

// Type guards
 export function isAPIErrorResponse(obj: any): obj is APIErrorResponse {
  return obj && Array.isArray(obj.errors);
}

