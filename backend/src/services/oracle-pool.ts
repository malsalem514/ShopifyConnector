/**
 * Oracle Connection Pool Service
 * 
 * Standalone Oracle connection pool with graceful shutdown
 */

import oracledb from 'oracledb';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const POOL_ALIAS = 'attributeManager';
const MEDIA_POOL_ALIAS = 'attributeManagerMedia';
let poolCreated = false;
let mediaPoolCreated = false;

/**
 * Initialize Oracle Thick mode (required for some features)
 */
function initThickMode(): void {
  if (!config.oracle.clientPath) return;
  
  try {
    oracledb.initOracleClient({ libDir: config.oracle.clientPath });
    logger.info(`Oracle Thick mode enabled (${config.oracle.clientPath})`);
  } catch (error: any) {
    // Only log if not already initialized
    if (!error.message.includes('already initialized')) {
      logger.debug('Thick mode init skipped', { reason: error.message });
    }
  }
}

/**
 * Create Oracle connection pool (HARD-02: Pool hardening)
 */
export async function createPool(customConfig?: Partial<typeof config.oracle>): Promise<void> {
  if (poolCreated) {
    try {
      await closePool();
    } catch (e) {
      logger.warn('Failed to close existing pools during recreation', { error: (e as Error).message });
    }
  }
  
  const baseConfig = config.oracle;
  const user = customConfig?.user || baseConfig.user;
  const password = customConfig?.password || baseConfig.password;
  const connectString = customConfig?.connectString || baseConfig.connectString;
  
  const { 
    poolMin, poolMax, poolIncrement, poolTimeout,
    queueMax, queueTimeout, stmtCacheSize 
  } = baseConfig;
  
  if (!user || !password || !connectString) {
    throw new Error('Missing Oracle configuration. Set ORACLE_USER, ORACLE_PASSWORD, ORACLE_CONNECT_STRING');
  }
  
  initThickMode();

  // Set global defaults (V012: SSOT for output format)
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsString = [oracledb.CLOB]; // Ensure CLOBs are strings
  
  // 1. Create Main Application Pool
  await oracledb.createPool({
    user,
    password,
    connectString,
    poolAlias: POOL_ALIAS,
    poolMin,
    poolMax,
    poolIncrement,
    poolTimeout,
    queueMax,
    queueTimeout,
    stmtCacheSize
  });
  
  // 2. Create Dedicated Media Pool (Oracle Standard: Workload Isolation)
  // This prevents image materialization from starving the rest of the API
  await oracledb.createPool({
    user,
    password,
    connectString,
    poolAlias: MEDIA_POOL_ALIAS,
    poolMin: 2,
    poolMax: Math.max(poolMax, 50), // Ensure enough room for media
    poolIncrement: 2,
    poolTimeout: 60, // Shorter timeout for media connections
    queueMax: 100,
    queueTimeout: 30000,
    stmtCacheSize: 10
  });
  
  poolCreated = true;
  mediaPoolCreated = true;
  
  logger.info('Oracle dual-pool system initialized', { 
    connectString, 
    user,
    mainPoolSize: `${poolMin}/${poolMax}`,
    mediaPoolSize: `2/${Math.max(poolMax, 50)}`,
    queueMax
  });
}

/**
 * Get connection from main pool
 */
export async function getConnection(): Promise<oracledb.Connection> {
  if (!poolCreated) {
    throw new Error('Oracle main pool not initialized.');
  }
  return oracledb.getConnection(POOL_ALIAS);
}

/**
 * Get connection from dedicated media pool
 */
export async function getMediaConnection(): Promise<oracledb.Connection> {
  if (!mediaPoolCreated) {
    // Fallback to main pool if media pool isn't ready
    return getConnection();
  }
  return oracledb.getConnection(MEDIA_POOL_ALIAS);
}

/**
 * Execute function with auto-release connection (Main Pool)
 */
export async function withConnection<T>(
  fn: (conn: oracledb.Connection) => Promise<T>
): Promise<T> {
  const conn = await getConnection();
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

/**
 * Execute function with auto-release connection (Media Pool)
 */
export async function withMediaConnection<T>(
  fn: (conn: oracledb.Connection) => Promise<T>
): Promise<T> {
  const conn = await getMediaConnection();
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

/**
 * Get pool statistics (HARD-08: Health check depth)
 */
export function getPoolStats(): {
  connectionsOpen: number;
  connectionsInUse: number;
  poolMax: number;
  available: number;
} | null {
  if (!poolCreated) return null;
  
  try {
    const pool = oracledb.getPool(POOL_ALIAS);
    return {
      connectionsOpen: pool.connectionsOpen,
      connectionsInUse: pool.connectionsInUse,
      poolMax: pool.poolMax,
      available: pool.connectionsOpen - pool.connectionsInUse
    };
  } catch {
    return null;
  }
}

/**
 * Ping Oracle to verify connection health
 */
export async function pingOracle(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await withConnection(async (conn) => {
      await conn.execute('SELECT 1 FROM DUAL');
    });
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

/**
 * Close pool (graceful shutdown)
 */
export async function closePool(): Promise<void> {
  if (!poolCreated) return;
  
  try {
    await oracledb.getPool(POOL_ALIAS).close(10);
    poolCreated = false;
    logger.info('Oracle pool closed');
  } catch (error: any) {
    logger.error('Error closing Oracle pool', { error: error.message });
  }
}

// Graceful shutdown
process.on('SIGTERM', closePool);
process.on('SIGINT', closePool);

