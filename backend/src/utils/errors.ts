/**
 * Error Handling Utilities (HARD-09)
 * 
 * Standardized error codes and response formatting
 */

export enum ErrorCode {
  // Client errors (4xx)
  BAD_REQUEST = 'BAD_REQUEST',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  ORACLE_ERROR = 'ORACLE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  ATTRIBUTEME_ERROR = 'ATTRIBUTEME_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  
  // Business errors
  STYLE_NOT_FOUND = 'STYLE_NOT_FOUND',
  MAPPING_NOT_FOUND = 'MAPPING_NOT_FOUND',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  SYNC_FAILED = 'SYNC_FAILED',
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  INCOMPLETE_ATTRIBUTES = 'INCOMPLETE_ATTRIBUTES'
}

interface ErrorDetails {
  code: ErrorCode;
  message: string;
  details?: unknown;
  suggestion?: string;
}

/**
 * Application Error with structured details
 */
export class AppError extends Error {
  code: ErrorCode;
  statusCode: number;
  details?: unknown;
  suggestion?: string;
  
  constructor(statusCode: number, details: ErrorDetails) {
    super(details.message);
    this.name = 'AppError';
    this.code = details.code;
    this.statusCode = statusCode;
    this.details = details.details;
    this.suggestion = details.suggestion;
  }
  
  toJSON(): { success: false; error: { code: ErrorCode; message: string; details?: unknown; suggestion?: string } } {
    const error: { code: ErrorCode; message: string; details?: unknown; suggestion?: string } = {
      code: this.code,
      message: this.message
    };
    
    if (this.details) error.details = this.details;
    if (this.suggestion) error.suggestion = this.suggestion;
    
    return { success: false, error };
  }
}

// Factory functions for common errors
export const Errors = {
  badRequest: (message: string, details?: unknown) => 
    new AppError(400, { code: ErrorCode.BAD_REQUEST, message, details }),
    
  validation: (message: string, details?: unknown) =>
    new AppError(400, { 
      code: ErrorCode.VALIDATION_ERROR, 
      message, 
      details,
      suggestion: 'Check the request body against the API schema'
    }),
    
  notFound: (resource: string, id?: string) =>
    new AppError(404, { 
      code: ErrorCode.NOT_FOUND, 
      message: `${resource}${id ? ` with ID '${id}'` : ''} not found` 
    }),
    
  conflict: (message: string) =>
    new AppError(409, { code: ErrorCode.CONFLICT, message }),
    
  oracleError: (message: string, oraCode?: string) =>
    new AppError(500, { 
      code: ErrorCode.ORACLE_ERROR, 
      message: `Database error: ${message}`,
      details: oraCode ? { oracleCode: oraCode } : undefined,
      suggestion: 'Check Oracle connection and credentials'
    }),
    
  externalService: (service: string, message: string) =>
    new AppError(502, { 
      code: ErrorCode.EXTERNAL_SERVICE_ERROR, 
      message: `${service} error: ${message}`,
      suggestion: `Check ${service} service health and connectivity`
    }),
    
  timeout: (operation: string, timeoutMs: number) =>
    new AppError(504, { 
      code: ErrorCode.TIMEOUT_ERROR, 
      message: `${operation} timed out after ${timeoutMs}ms`,
      suggestion: 'Try again or reduce batch size'
    }),
    
  syncFailed: (styleId: string, reason: string) =>
    new AppError(500, {
      code: ErrorCode.SYNC_FAILED,
      message: `Failed to sync style ${styleId}: ${reason}`,
      suggestion: 'Check style exists and attributes are valid'
    }),
    
  incomplete: (styleId: string, missing: string[]) =>
    new AppError(400, {
      code: ErrorCode.INCOMPLETE_ATTRIBUTES,
      message: `Style ${styleId} missing required attributes`,
      details: { missingTypes: missing },
      suggestion: 'Add missing attributes or update template'
    })
};

/**
 * Extract Oracle error code from error message
 */
export function extractOracleCode(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/ORA-\d+/);
  return match?.[0];
}

/**
 * Format error for API response
 */
export function formatErrorResponse(error: unknown, isDev = false) {
  if (error instanceof AppError) {
    return error.toJSON();
  }
  
  const message = error instanceof Error ? error.message : 'Unknown error';
  const oracleCode = extractOracleCode(error);
  
  return {
    success: false,
    error: {
      code: oracleCode ? ErrorCode.ORACLE_ERROR : ErrorCode.INTERNAL_ERROR,
      message: isDev ? message : 'Internal server error',
      ...(oracleCode && { oracleCode }),
      ...(isDev && error instanceof Error && { stack: error.stack })
    }
  };
}

