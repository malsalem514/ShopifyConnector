import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock oracle-pool before importing the service
vi.mock('../oracle-pool.js', () => ({
  withConnection: vi.fn(),
}));

// Mock logger to keep test output clean
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock oracledb
vi.mock('oracledb', () => ({
  default: { OUT_FORMAT_OBJECT: 4001 },
}));

import { TenantContextService } from '../tenant-context.service.js';
import { withConnection } from '../oracle-pool.js';

const mockWithConnection = vi.mocked(withConnection);

describe('TenantContextService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the singleton so each test starts fresh
    // @ts-expect-error accessing private static for test reset
    TenantContextService.instance = undefined;
  });

  describe('getInstance()', () => {
    it('returns a singleton (same instance on multiple calls)', () => {
      const a = TenantContextService.getInstance();
      const b = TenantContextService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('initialize()', () => {
    it('succeeds when SHOPIFY_TENANTS table exists with data', async () => {
      mockWithConnection.mockImplementation(async (fn) => {
        const mockConn = {
          execute: vi.fn()
            // First call: table check
            .mockResolvedValueOnce({ rows: [{ CNT: 1 }] })
            // Second call: select active tenant
            .mockResolvedValueOnce({ rows: [{ TENANT_ID: 'T-100' }] }),
        };
        return fn(mockConn as any);
      });

      const svc = TenantContextService.getInstance();
      await svc.initialize();

      expect(svc.getActiveTenantId()).toBe('T-100');
    });

    it('falls back to env vars when table does not exist (graceful degradation)', async () => {
      vi.stubEnv('SHOPIFY_TENANT_ID', 'ENV-TENANT-42');
      vi.stubEnv('SHOPIFY_TENANT_NAME', 'env-store');

      mockWithConnection.mockImplementation(async (fn) => {
        const mockConn = {
          execute: vi.fn()
            // Table check returns 0
            .mockResolvedValueOnce({ rows: [{ CNT: 0 }] }),
        };
        return fn(mockConn as any);
      });

      const svc = TenantContextService.getInstance();
      await svc.initialize();

      expect(svc.getActiveTenantId()).toBe('ENV-TENANT-42');

      vi.unstubAllEnvs();
    });

    it('falls back to env vars when DB connection fails', async () => {
      vi.stubEnv('SHOPIFY_TENANT_ID', 'FALLBACK-99');

      mockWithConnection.mockRejectedValue(new Error('ORA-12541: TNS:no listener'));

      const svc = TenantContextService.getInstance();
      await svc.initialize();

      expect(svc.getActiveTenantId()).toBe('FALLBACK-99');

      vi.unstubAllEnvs();
    });
  });

  describe('getActiveTenantId()', () => {
    it('returns cached tenant ID after initialize', async () => {
      mockWithConnection.mockImplementation(async (fn) => {
        const mockConn = {
          execute: vi.fn()
            .mockResolvedValueOnce({ rows: [{ CNT: 1 }] })
            .mockResolvedValueOnce({ rows: [{ TENANT_ID: 'CACHED-1' }] }),
        };
        return fn(mockConn as any);
      });

      const svc = TenantContextService.getInstance();
      await svc.initialize();

      // Call multiple times — should always return the cached value
      expect(svc.getActiveTenantId()).toBe('CACHED-1');
      expect(svc.getActiveTenantId()).toBe('CACHED-1');

      // withConnection should only have been called once (during initialize)
      expect(mockWithConnection).toHaveBeenCalledTimes(1);
    });

    it('returns env var fallback when DB is unavailable', async () => {
      vi.stubEnv('SHOPIFY_TENANT_ID', 'ENV-FALLBACK');

      mockWithConnection.mockRejectedValue(new Error('connection refused'));

      const svc = TenantContextService.getInstance();
      await svc.initialize();

      expect(svc.getActiveTenantId()).toBe('ENV-FALLBACK');

      vi.unstubAllEnvs();
    });
  });

  describe('getMode()', () => {
    it("always returns 'READ_WRITE'", () => {
      const svc = TenantContextService.getInstance();
      expect(svc.getMode()).toBe('READ_WRITE');
    });
  });
});
