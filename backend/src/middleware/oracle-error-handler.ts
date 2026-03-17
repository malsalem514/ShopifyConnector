/**
 * Oracle Error Handler Middleware
 * 
 * Maps Oracle error codes to HTTP status codes
 * Provides user-friendly error messages
 * 
 * Pattern: Centralized error mapping (DRY)
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Oracle error code to HTTP status mapping
 */
const ORACLE_ERROR_MAP: Record<string, { status: number; message: string }> = {
  'ORA-20001': { status: 409, message: 'Resource already exists' },
  'ORA-20002': { status: 404, message: 'Parent resource not found' },
  'ORA-20003': { status: 400, message: 'Maximum hierarchy depth exceeded' },
  'ORA-20004': { status: 404, message: 'Resource not found' },
  'ORA-20005': { status: 404, message: 'Group not found' },
  'ORA-20006': { status: 400, message: 'Invalid hierarchy specification' },
  'ORA-20007': { status: 400, message: 'Must specify either characteristic_type_id or group_id (not both)' },
  'ORA-20008': { status: 409, message: 'Cannot delete resource with dependencies. Remove them first.' },
};

/**
 * Express error handler for Oracle errors
 * Use as route-level error handler: asyncHandler(yourHandler)
 */
export function handleOracleError(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Check for Oracle error codes
  const oracleErrorMatch = error.message.match(/ORA-(\d+):/);
  
  if (oracleErrorMatch) {
    const oracleCode = `ORA-${oracleErrorMatch[1]}`;
    const mapping = ORACLE_ERROR_MAP[oracleCode];
    
    if (mapping) {
      logger.error(`Oracle error: ${oracleCode}`, { 
        path: req.path, 
        method: req.method,
        error: error.message 
      });
      
      return res.status(mapping.status).json({
        success: false,
        error: {
          code: oracleCode,
          message: mapping.message
        }
      });
    }
  }

  // Generic error
  logger.error(`Unhandled error: ${req.method} ${req.path}`, { 
    error: error.message,
    stack: error.stack 
  });
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: error.message || 'Internal server error'
    }
  });
}

/**
 * Async handler wrapper - catches errors and passes to error handler
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

