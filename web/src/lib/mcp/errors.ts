export type McpToolErrorCode =
  | 'ASSET_FORBIDDEN'
  | 'ASSET_NOT_FOUND'
  | 'BOTH_SOURCES'
  | 'COMPONENT_DISABLED'
  | 'EMPTY_CONTENT'
  | 'INTERNAL_ERROR'
  | 'INVALID_PAGE'
  | 'MISSING_SOURCE'
  | 'TOO_LARGE'
  | 'URL_FETCH_FAILED'
  | 'URL_INVALID'
  | 'URL_NOT_PDF'
  | 'URL_TOO_LARGE';

export class McpToolError extends Error {
  constructor(
    public readonly code: McpToolErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

export function toolSuccess(data: Record<string, unknown>) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data),
      },
    ],
  };
}

export function toolError(error: McpToolError | Error) {
  const payload = error instanceof McpToolError
    ? { code: error.code, message: error.message }
    : { code: 'INTERNAL_ERROR', message: 'Internal error' };

  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload),
      },
    ],
  };
}

export function toToolResult<T>(operation: () => Promise<T>) {
  return operation().catch((error: unknown) => {
    if (error instanceof McpToolError) return toolError(error);
    return toolError(error instanceof Error ? error : new Error(String(error)));
  });
}
