/**
 * Shopify Hub API Routes
 */
import { Router } from 'express';
import shopifyRouter from './shopify.route.js';
import { getPoolStats, pingOracle } from '../services/oracle-pool.js';
import { asyncHandler } from '../middleware/oracle-error-handler.js';
import { apiLimiter } from '../middleware/rate-limit.js';

const router = Router();

router.use(apiLimiter);

// Health check
router.get('/health', asyncHandler(async (req, res) => {
  const poolStats = getPoolStats();
  const oraclePing = await pingOracle();
  const isHealthy = oraclePing.ok;

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    status: isHealthy ? 'ok' : 'degraded',
    service: 'shopify-hub',
    timestamp: new Date().toISOString(),
    oracle: {
      connected: oraclePing.ok,
      latencyMs: oraclePing.latencyMs,
      pool: poolStats
    }
  });
}));

router.get('/health/live', (req, res) => {
  res.json({ status: 'alive' });
});

router.get('/health/ready', asyncHandler(async (req, res) => {
  const oraclePing = await pingOracle();
  res.status(oraclePing.ok ? 200 : 503).json({
    ready: oraclePing.ok,
    oracle: oraclePing.ok
  });
}));

// Mount Shopify routes
router.use('/shopify', shopifyRouter);

export default router;
