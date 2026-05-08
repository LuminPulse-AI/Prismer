import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type McpErrorCode =
  | 'UNKNOWN_COMPONENT'
  | 'COMPONENT_DISABLED'
  | 'EMPTY_CONTENT'
  | 'TOO_LARGE'
  | 'MISSING_SOURCE'
  | 'BOTH_SOURCES'
  | 'ASSET_NOT_FOUND'
  | 'ASSET_FORBIDDEN'
  | 'URL_INVALID'
  | 'URL_FETCH_FAILED'
  | 'URL_NOT_PDF'
  | 'URL_TOO_LARGE'
  | 'INVALID_PAGE'
  | 'INTERNAL_ERROR';

export function toolError(code: McpErrorCode, message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ code, message }) }],
    isError: true,
  };
}

export function toolSuccess<T>(data: T): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    isError: false,
  };
}
