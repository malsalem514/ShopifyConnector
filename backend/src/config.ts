/**
 * Shopify Hub Configuration
 */
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  oracle: {
    user: process.env.ORACLE_USER || '',
    password: process.env.ORACLE_PASSWORD || '',
    connectString: process.env.ORACLE_CONNECT_STRING || '',
    clientPath: process.env.ORACLE_CLIENT_PATH || undefined,
    poolMin: parseInt(process.env.ORACLE_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.ORACLE_POOL_MAX || '50', 10),
    poolIncrement: 5,
    poolTimeout: 300,
    queueMax: parseInt(process.env.ORACLE_QUEUE_MAX || '200', 10),
    queueTimeout: 60000,
    stmtCacheSize: 30
  },

  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10)
  },

  // Shopify demo store
  shopifyDemo: {
    storeUrl: process.env.JESTA_DEMO_STORE_URL || 'https://jesta-demo.myshopify.com',
    accessToken: process.env.JESTA_DEMO_ACCESS_TOKEN || '',
    locationId: process.env.JESTA_DEMO_LOCATION_ID || '',
  }
};

function parseCorsOrigins(envValue?: string): string[] {
  if (!envValue) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CORS_ORIGINS must be explicitly set in production.');
    }
    return ['http://localhost:5174', 'http://localhost:5175'];
  }
  const origins = envValue.split(',').map(o => o.trim()).filter(Boolean);
  if (origins.includes('*') && process.env.NODE_ENV === 'production') {
    throw new Error('CORS wildcard (*) is not allowed in production.');
  }
  return origins;
}

export function validateConfig(): { valid: boolean; missing: string[] } {
  const required = ['ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONNECT_STRING'];
  const missing = required.filter(key => !process.env[key]);
  return { valid: missing.length === 0, missing };
}
