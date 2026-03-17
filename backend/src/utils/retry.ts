/**
 * Retry Utility (Boring Vanilla)
 * 
 * Exponential backoff for transient Oracle/API failures.
 * No clever hacks, just standard retry logic with jitter.
 */

import { logger } from './logger.js';

interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;      // Base delay in ms
  maxDelay?: number;       // Max delay cap
  factor?: number;         // Exponential factor
  jitter?: boolean;        // Add random jitter
  onRetry?: (error: Error, attempt: number) => void;
  shouldRetry?: (error: any) => boolean;
}

// Oracle transient error codes + Standard Network Errors
const RETRYABLE_CODES = [
  'ORA-00060', // Deadlock
  'ORA-04031', // Unable to allocate memory
  'ORA-12170', // Connect timeout
  'ORA-12514', // Listener doesn't know of service
  'ORA-12541', // No listener
  'ORA-12543', // Destination host unreachable
  'ORA-03113', // End-of-file on communication channel
  'ORA-03114', // Not connected to Oracle
  'ORA-01033', // Oracle initialization/shutdown in progress
  'ORA-01089', // Immediate shutdown in progress
  'NJS-500',   // Node-oracledb internal error
  'NJS-040',   // Connection request timeout
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'socket hang up'
];

/**
 * Check if error is transient (retryable)
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;
  
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code;
  
  return RETRYABLE_CODES.some(rc => message.includes(rc) || code === rc);
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    jitter = true,
    onRetry,
    shouldRetry = isTransientError
  } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry non-transient errors or last attempt
      if (!shouldRetry(error) || attempt === maxAttempts) {
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      let delay = Math.min(baseDelay * Math.pow(factor, attempt - 1), maxDelay);
      
      // Add jitter (0-25% of delay)
      if (jitter) {
        delay += Math.random() * delay * 0.25;
      }
      
      logger.warn(`[Retry] Attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay)}ms`, {
        error: lastError.message
      });
      
      onRetry?.(lastError, attempt);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Retry exhausted');
}

/**
 * Wrap Oracle operations with retry
 */
export async function withOracleRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxAttempts: 3,
    baseDelay: 1000,
    onRetry: (error, attempt) => {
      logger.warn('Oracle operation retry', { attempt, error: error.message });
    }
  });
}
