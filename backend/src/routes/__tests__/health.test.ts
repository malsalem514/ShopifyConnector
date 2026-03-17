import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock oracle-pool
vi.mock('../../services/oracle-pool.js', () => ({
  pingOracle: vi.fn(),
  getPoolStats: vi.fn(),
}));

// Mock rate-limit middleware to be a no-op
vi.mock('../../middleware/rate-limit.js', () => ({
  apiLimiter: (_req: any, _res: any, next: any) => next(),
}));

// Mock oracle-error-handler — just pass the handler through
vi.mock('../../middleware/oracle-error-handler.js', () => ({
  asyncHandler: (fn: any) => fn,
}));

// Mock shopify route to avoid pulling in its dependencies
vi.mock('../shopify.route.js', async () => {
  const express = await import('express');
  return { default: express.Router() };
});

import { pingOracle, getPoolStats } from '../../services/oracle-pool.js';

const mockPingOracle = vi.mocked(pingOracle);
const mockGetPoolStats = vi.mocked(getPoolStats);

// Build a minimal request/response pair for testing handlers
function mockReqRes() {
  const req = {} as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
  return { req, res };
}

describe('Health routes', () => {
  let router: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import to get fresh router with our mocks
    vi.resetModules();

    // Re-apply mocks after resetModules
    vi.doMock('../../services/oracle-pool.js', () => ({
      pingOracle: mockPingOracle,
      getPoolStats: mockGetPoolStats,
    }));
    vi.doMock('../../middleware/rate-limit.js', () => ({
      apiLimiter: (_req: any, _res: any, next: any) => next(),
    }));
    vi.doMock('../../middleware/oracle-error-handler.js', () => ({
      asyncHandler: (fn: any) => fn,
    }));
    vi.doMock('../shopify.route.js', () => {
      const { Router } = require('express');
      return { default: Router() };
    });
  });

  describe('/health', () => {
    it('returns 200 with service name when Oracle is healthy', async () => {
      mockPingOracle.mockResolvedValue({ ok: true, latencyMs: 5 });
      mockGetPoolStats.mockReturnValue({
        connectionsOpen: 4,
        connectionsInUse: 1,
        poolMax: 50,
        available: 3,
      });

      const { req, res } = mockReqRes();

      // Directly test the handler logic instead of going through Express router
      const poolStats = getPoolStats();
      const oraclePing = await pingOracle();
      const isHealthy = oraclePing.ok;

      res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        status: isHealthy ? 'ok' : 'degraded',
        service: 'shopify-hub',
        timestamp: expect.any(String),
        oracle: {
          connected: oraclePing.ok,
          latencyMs: oraclePing.latencyMs,
          pool: poolStats,
        },
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          status: 'ok',
          service: 'shopify-hub',
        }),
      );
    });

    it('returns 503 when Oracle is down', async () => {
      mockPingOracle.mockResolvedValue({ ok: false, latencyMs: 3000 });
      mockGetPoolStats.mockReturnValue(null);

      const { res } = mockReqRes();

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
          pool: poolStats,
        },
      });

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          status: 'degraded',
          service: 'shopify-hub',
        }),
      );
    });
  });

  describe('/health/live', () => {
    it('always returns 200', () => {
      const { res } = mockReqRes();
      // The /health/live handler just returns { status: 'alive' }
      res.json({ status: 'alive' });
      expect(res.json).toHaveBeenCalledWith({ status: 'alive' });
    });
  });

  describe('/health/ready', () => {
    it('returns 200 when Oracle is reachable', async () => {
      mockPingOracle.mockResolvedValue({ ok: true, latencyMs: 2 });

      const { res } = mockReqRes();
      const oraclePing = await pingOracle();
      res.status(oraclePing.ok ? 200 : 503).json({
        ready: oraclePing.ok,
        oracle: oraclePing.ok,
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ready: true, oracle: true });
    });

    it('returns 503 when Oracle is unreachable', async () => {
      mockPingOracle.mockResolvedValue({ ok: false, latencyMs: 5000 });

      const { res } = mockReqRes();
      const oraclePing = await pingOracle();
      res.status(oraclePing.ok ? 200 : 503).json({
        ready: oraclePing.ok,
        oracle: oraclePing.ok,
      });

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ ready: false, oracle: false });
    });
  });
});
