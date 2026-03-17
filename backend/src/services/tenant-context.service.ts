/**
 * Tenant Context Service
 *
 * Provides tenant context for the Shopify Hub.
 * Replaces SettingsService with a lightweight, Shopify-only implementation
 * that reads from the SHOPIFY_TENANTS table (no Attribute Manager dependencies).
 */

import oracledb from 'oracledb';
import { withConnection } from './oracle-pool.js';
import { logger } from '../utils/logger.js';

export class TenantContextService {
  private static instance: TenantContextService;

  private activeTenantId: string = '';
  private initialized = false;

  private constructor() {}

  static getInstance(): TenantContextService {
    if (!TenantContextService.instance) {
      TenantContextService.instance = new TenantContextService();
    }
    return TenantContextService.instance;
  }

  /**
   * Initialize the tenant context.
   *
   * Attempts to read the active tenant from SHOPIFY_TENANTS.
   * Falls back to environment variables if the table doesn't exist yet
   * or contains no rows.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const envTenantId = process.env.SHOPIFY_TENANT_ID || '';
    const envTenantName = process.env.SHOPIFY_TENANT_NAME || 'default';

    try {
      await withConnection(async (conn) => {
        // Check whether the SHOPIFY_TENANTS table exists
        const tableCheck = await conn.execute<{ CNT: number }>(
          `SELECT COUNT(*) AS CNT FROM user_tables WHERE table_name = 'SHOPIFY_TENANTS'`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );

        const tableExists = tableCheck.rows && tableCheck.rows[0]?.CNT > 0;

        if (!tableExists) {
          logger.warn(
            'SHOPIFY_TENANTS table does not exist yet — using env var fallback',
          );
          this.activeTenantId = envTenantId;
          return;
        }

        // Try to read the active tenant
        const result = await conn.execute<{ TENANT_ID: string }>(
          `SELECT TENANT_ID FROM SHOPIFY_TENANTS WHERE IS_ACTIVE = 1 AND ROWNUM = 1`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );

        if (result.rows && result.rows.length > 0) {
          this.activeTenantId = result.rows[0].TENANT_ID;
          logger.info(`Active tenant loaded: ${this.activeTenantId}`);
        } else if (envTenantId) {
          // No active tenant in DB — seed a default from env vars
          logger.info(
            `No active tenant found — seeding default (${envTenantId} / ${envTenantName})`,
          );
          await conn.execute(
            `INSERT INTO SHOPIFY_TENANTS (TENANT_ID, TENANT_NAME, IS_ACTIVE) VALUES (:id, :name, 1)`,
            { id: envTenantId, name: envTenantName },
            { autoCommit: true },
          );
          this.activeTenantId = envTenantId;
        } else {
          logger.warn(
            'No active tenant in SHOPIFY_TENANTS and no SHOPIFY_TENANT_ID env var set',
          );
        }
      });
    } catch (error: any) {
      logger.warn(
        `Failed to read tenant context from database — using env var fallback: ${error.message}`,
      );
      this.activeTenantId = envTenantId;
    }

    this.initialized = true;
    logger.info(`TenantContextService initialized (tenantId=${this.activeTenantId || '<none>'})`);
  }

  /**
   * Return the cached active tenant ID (synchronous after initialize).
   */
  getActiveTenantId(): string {
    return this.activeTenantId;
  }

  /**
   * Return the operational mode. Shopify Hub is always read-write.
   */
  getMode(): string {
    return 'READ_WRITE';
  }
}
