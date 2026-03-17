import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  // Helper to dynamically import config with fresh module state
  async function loadConfig() {
    const mod = await import('../config.js');
    return mod;
  }

  it('default port is 3003', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PORT', '');
    const { config } = await loadConfig();
    expect(config.port).toBe(3003);
  });

  it('CORS throws in production without CORS_ORIGINS', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    // Ensure CORS_ORIGINS is unset
    delete process.env.CORS_ORIGINS;

    await expect(loadConfig()).rejects.toThrow(
      'CORS_ORIGINS must be explicitly set in production',
    );
  });

  it('CORS throws in production with wildcard', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORS_ORIGINS', '*');

    await expect(loadConfig()).rejects.toThrow(
      'CORS wildcard (*) is not allowed in production',
    );
  });

  it('CORS returns dev defaults when not set in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    delete process.env.CORS_ORIGINS;

    const { config } = await loadConfig();
    expect(config.corsOrigins).toEqual([
      'http://localhost:5174',
      'http://localhost:5175',
    ]);
  });

  describe('validateConfig', () => {
    it('returns missing for empty Oracle env vars', async () => {
      vi.stubEnv('ORACLE_USER', '');
      vi.stubEnv('ORACLE_PASSWORD', '');
      vi.stubEnv('ORACLE_CONNECT_STRING', '');
      vi.stubEnv('NODE_ENV', 'development');
      delete process.env.CORS_ORIGINS;

      const { validateConfig } = await loadConfig();
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('ORACLE_USER');
      expect(result.missing).toContain('ORACLE_PASSWORD');
      expect(result.missing).toContain('ORACLE_CONNECT_STRING');
    });

    it('returns valid when all required vars set', async () => {
      vi.stubEnv('ORACLE_USER', 'admin');
      vi.stubEnv('ORACLE_PASSWORD', 'secret');
      vi.stubEnv('ORACLE_CONNECT_STRING', 'localhost:1521/XEPDB1');
      vi.stubEnv('NODE_ENV', 'development');
      delete process.env.CORS_ORIGINS;

      const { validateConfig } = await loadConfig();
      const result = validateConfig();

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });
});
