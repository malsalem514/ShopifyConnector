/**
 * Structured Logger
 *
 * JSON-based logging for production log aggregation.
 * Supports log levels, request correlation IDs, and structured metadata.
 */

import { randomUUID } from 'crypto';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLevel = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'];
const isProduction = process.env.NODE_ENV === 'production';

function emit(level: LogLevel, message: string, meta?: object): void {
  if (LOG_LEVELS[level] < currentLevel) return;

  if (isProduction) {
    // Structured JSON for log aggregation (ELK, CloudWatch, Datadog, etc.)
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta
    };
    const output = JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  } else {
    // Human-readable format for development
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    const output = `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }
}

export const logger = {
  debug(message: string, meta?: object): void {
    emit('debug', message, meta);
  },

  info(message: string, meta?: object): void {
    emit('info', message, meta);
  },

  warn(message: string, meta?: object): void {
    emit('warn', message, meta);
  },

  error(message: string, meta?: object): void {
    emit('error', message, meta);
  },

  /** Generate a unique request correlation ID */
  correlationId(): string {
    return randomUUID();
  }
};
