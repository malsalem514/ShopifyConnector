/**
 * Rate Limiting Middleware (HARD-01)
 * 
 * Prevents DoS attacks with configurable limits
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number;     // Time window in ms
  max: number;          // Max requests per window
  message?: string;     // Error message
  keyGenerator?: (req: Request) => string;
  name?: string;        // Added to prevent store collision
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every minute
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetTime) store.delete(key);
  }
}, 60000);

// Allow graceful shutdown to clear the interval
cleanupInterval.unref();

/**
 * Create rate limiter middleware
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests, please try again later',
    keyGenerator = (req) => req.ip || 'unknown',
    name = 'limiter'
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${keyGenerator(req)}`;
    const now = Date.now();
    
    let entry = store.get(key);
    
    if (!entry || now > entry.resetTime) {
      entry = { count: 1, resetTime: now + windowMs };
      store.set(key, entry);
    } else {
      entry.count++;
    }
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));
    
    if (entry.count > max) {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfter: Math.ceil((entry.resetTime - now) / 1000)
        }
      });
      return;
    }
    
    next();
  };
}

// Pre-configured limiters
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000,                 // Increased for E2E testing
  message: 'Too many API requests',
  name: 'api'
});

export const syncLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: 1000,                 // Increased from 100 to support high-frequency polling
  message: 'Sync rate limit exceeded',
  name: 'sync'
});

export const extractLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: process.env.NODE_ENV === 'production' ? 20 : 200,  // 200 in dev
  message: 'Extraction rate limit exceeded',
  name: 'extract'
});

