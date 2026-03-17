import oracledb from 'oracledb';
import { withConnection } from './oracle-pool.js';
import { logger } from '../utils/logger.js';
import { TenantContextService } from './tenant-context.service.js';
import { config } from '../config.js';

// ============================================================================
// DEMO MODE - HYBRID APPROACH
// ============================================================================
// When USE_DEMO_FALLBACK = 'Y' (or missing): 
//   → Show REAL data + DEMO data merged together
//   → Demo entries are marked with isDemo: true for visual distinction
//   → Great for live demos: start with sample data, then real transactions appear!
//
// When USE_DEMO_FALLBACK = 'N': 
//   → Show ONLY real data from Oracle/Shopify (production mode)
// ============================================================================

export class ShopifyService {
  private static readonly PERIOD_MULTIPLIERS: Record<string, number> = {
    'today': 1, '7d': 7.2, '30d': 31.5, 'ytd': 124.8
  };

  // Cache demo mode for 30 seconds to avoid repeated DB queries
  private _demoModeCache: { value: boolean; timestamp: number } | null = null;
  private readonly DEMO_CACHE_TTL = 30000; // 30 seconds

  /**
   * Helper to check if demo fallback is enabled
   * Cached for 30 seconds to reduce DB overhead
   * Auto-creates config table if missing
   */
  private async isDemoMode(): Promise<boolean> {
    // Check cache first
    if (this._demoModeCache && Date.now() - this._demoModeCache.timestamp < this.DEMO_CACHE_TTL) {
      return this._demoModeCache.value;
    }

    try {
      const result = await withConnection(async (conn) => {
        const res = await conn.execute<any>(
          `SELECT CONFIG_VALUE FROM ATTR_MGR.SHOPIFY_CONFIG WHERE CONFIG_KEY = 'USE_DEMO_FALLBACK'`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const val = res.rows?.[0]?.CONFIG_VALUE;
        // Explicit 'N' means demo mode OFF, anything else means ON
        return val !== 'N';
      });
      
      this._demoModeCache = { value: result, timestamp: Date.now() };
      return result;
    } catch (e) {
      // If table doesn't exist or other error, default to demo mode ON
      this._demoModeCache = { value: true, timestamp: Date.now() };
      return true;
    }
  }

  /**
   * Clear demo mode cache (called when config is updated)
   */
  public clearDemoModeCache(): void {
    this._demoModeCache = null;
  }

  /**
   * Construct Shopify URL from banner ID
   * Helper method since WEB_SITE_URL column doesn't exist in BANNERS table
   */
  private constructShopifyUrl(bannerId: string): string {
    // Map known banner IDs to their Shopify URLs
    const urlMap: Record<string, string> = {
      'JDWEB': 'jdsports.ca',
      'JESTA': 'jesta-demo.myshopify.com',
      'LSWEB': 'deadstock.ca',
      'SZWEB': 'size.ca',
      'PLWEB': 'prodirectsoccer.ca'
    };

    // Return mapped URL or construct from banner ID
    return urlMap[bannerId] || `${bannerId.toLowerCase()}.myshopify.com`;
  }

  /**
   * Public startup hook: ensures SHOPIFY_CONFIG table exists before requests arrive.
   */
  async ensureReady(): Promise<void> {
    await this.ensureConfigTableExists();
  }

  /**
   * Ensure SHOPIFY_CONFIG table exists and has default values
   */
  private async ensureConfigTableExists(): Promise<boolean> {
    return await withConnection(async (conn) => {
      try {
        // Default configuration values
        const defaults = [
          { key: 'USE_DEMO_FALLBACK', value: 'Y', desc: 'Y = Show demo+real data merged, N = Show only real data', sensitive: 'N' },
          { key: 'AI_MAPPING_ENABLED', value: 'Y', desc: 'Enable AI-assisted hierarchy mapping', sensitive: 'N' },
          { key: 'AUTO_SYNC_INTERVAL_MIN', value: '5', desc: 'Auto-sync interval in minutes', sensitive: 'N' },
          { key: 'DEMO_STORE_URL', value: 'https://jesta-demo.myshopify.com', desc: 'Demo Shopify store URL', sensitive: 'N' },
          { key: 'DEMO_API_VERSION', value: '2024-10', desc: 'Shopify API version for demo', sensitive: 'N' },
          { key: 'MAX_PRODUCTS_PER_BATCH', value: '100', desc: 'Maximum products per sync batch', sensitive: 'N' }
        ];

        // Check if table exists
        const check = await conn.execute<any>(
          `SELECT COUNT(*) as CNT FROM ALL_TABLES WHERE OWNER = 'ATTR_MGR' AND TABLE_NAME = 'SHOPIFY_CONFIG'`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        const tableExists = (check.rows?.[0]?.CNT || 0) > 0;

        if (!tableExists) {
          // Create the table
          logger.info('Creating SHOPIFY_CONFIG table...');
          await conn.execute(`
            CREATE TABLE ATTR_MGR.SHOPIFY_CONFIG (
              CONFIG_KEY VARCHAR2(100) PRIMARY KEY,
              CONFIG_VALUE VARCHAR2(4000),
              DESCRIPTION VARCHAR2(500),
              IS_SENSITIVE CHAR(1) DEFAULT 'N',
              CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
          await conn.commit();
          logger.info('SHOPIFY_CONFIG table created');
        }

        // Check if table is empty and seed defaults
        const rowCheck = await conn.execute<any>(
          `SELECT COUNT(*) as CNT FROM ATTR_MGR.SHOPIFY_CONFIG`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        if ((rowCheck.rows?.[0]?.CNT || 0) === 0) {
          logger.info('SHOPIFY_CONFIG table is empty - seeding defaults...');
          for (const d of defaults) {
            await conn.execute(
              `INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (CONFIG_KEY, CONFIG_VALUE, DESCRIPTION, IS_SENSITIVE) VALUES (:configKey, :configValue, :configDesc, :sensitive)`,
              { configKey: d.key, configValue: d.value, configDesc: d.desc, sensitive: d.sensitive }
            );
          }
          await conn.commit();
          logger.info('SHOPIFY_CONFIG seeded with default values');
        }

        return true;
      } catch (error: any) {
        logger.error(`Failed to ensure SHOPIFY_CONFIG table: ${error?.message}`);
        try { await conn.rollback(); } catch (e) {}
        return false;
      }
    });
  }

  // ============================================================================
  // DEMO DATA GENERATORS - Sample data for demos
  // ============================================================================

  private getDemoStores() {
    return [
      { bannerId: 'JESTA', description: 'Jesta Demo Store', url: 'https://jesta-demo.myshopify.com', isActive: true, isDemo: true }
    ];
  }

  private getDemoProducts() {
    return [
      { styleId: 'DEMO-1000019', bannerId: 'JESTA', shopifyProductId: 'gid://shopify/Product/demo1', variantCount: 3, totalInventory: 120, description: 'W WOOLIES STRIPE (Demo)', status: 'synced', publishInd: 'Y', isDemo: true },
      { styleId: 'DEMO-1000020', bannerId: 'JESTA', shopifyProductId: 'gid://shopify/Product/demo2', variantCount: 4, totalInventory: 85, description: 'M WOOLIES BOTTOM (Demo)', status: 'synced', publishInd: 'Y', isDemo: true },
      { styleId: 'DEMO-1000025', bannerId: 'JESTA', shopifyProductId: null, variantCount: 2, totalInventory: 45, description: 'M WOOLIES ZIP (Demo)', status: 'not_published', publishInd: 'N', isDemo: true }
    ];
  }

  private getDemoOrders() {
    return [
      { orderId: 'DEMO-8821', wfeTransId: 'DEMO-1001', customerId: 'DEMO-CUST-001', orderDate: new Date(Date.now() - 3600000), status: 'PENDING', siteId: '100', origin: 'JDWEB', isDemo: true },
      { orderId: 'DEMO-1102', wfeTransId: 'DEMO-1002', customerId: 'DEMO-CUST-002', orderDate: new Date(Date.now() - 86400000), status: 'IN PICKING', siteId: '105', origin: 'SZWEB', isDemo: true },
      { orderId: 'DEMO-9992', wfeTransId: 'DEMO-1003', customerId: 'DEMO-CUST-003', orderDate: new Date(Date.now() - 172800000), status: 'SHIPPED', siteId: '110', origin: 'LSWEB', isDemo: true }
    ];
  }

  private getDemoJobs() {
    return [
      { JOB_NAME: 'DEMO_SHOPIFY_GET_ORDERS', STATE: 'SCHEDULED', REPEAT_INTERVAL: 'FREQ=MINUTELY;INTERVAL=1', LAST_START_DATE: new Date(Date.now() - 45000), NEXT_RUN_DATE: new Date(Date.now() + 15000), isDemo: true },
      { JOB_NAME: 'DEMO_SHOPIFY_SENT_ORDERS', STATE: 'SCHEDULED', REPEAT_INTERVAL: 'FREQ=MINUTELY;INTERVAL=30', LAST_START_DATE: new Date(Date.now() - 1200000), NEXT_RUN_DATE: new Date(Date.now() + 600000), isDemo: true },
      { JOB_NAME: 'DEMO_SHOPIFY_RELEASE', STATE: 'DISABLED', REPEAT_INTERVAL: 'FREQ=MINUTELY;INTERVAL=15', LAST_START_DATE: null, NEXT_RUN_DATE: null, isDemo: true }
    ];
  }

  private getDemoSyncLogs() {
    return [
      { LOG_ID: 'DEMO-1', ENTITY_TYPE: 'PRODUCT', ENTITY_ID: 'DEMO-1000019', BANNER_ID: 'JDWEB', ACTION_TYPE: 'PUBLISH', STATUS: 'SUCCESS', DURATION_MS: 1240, CREATED_AT: new Date(Date.now() - 3600000), isDemo: true },
      { LOG_ID: 'DEMO-2', ENTITY_TYPE: 'ORDER', ENTITY_ID: 'DEMO-99921', BANNER_ID: 'SHOPIFY_DEMO', ACTION_TYPE: 'IMPORT', STATUS: 'SUCCESS', DURATION_MS: 450, CREATED_AT: new Date(Date.now() - 7200000), isDemo: true },
      { LOG_ID: 'DEMO-3', ENTITY_TYPE: 'PRODUCT', ENTITY_ID: 'DEMO-1000025', BANNER_ID: 'SHOPIFY_DEMO', ACTION_TYPE: 'SYNC_INV', STATUS: 'ERROR', ERROR_MESSAGE: 'Shopify API Throttled (Demo)', DURATION_MS: 2100, CREATED_AT: new Date(Date.now() - 10800000), isDemo: true }
    ];
  }

  /**
   * Get all configured Shopify stores
   * Demo mode: Returns REAL stores + DEMO stores merged
   * Production mode: Returns only real stores from BANNERS table
   */
  async getStores(): Promise<any[]> {
    const isDemo = await this.isDemoMode();
    let realStores: any[] = [];
    
    try {
      realStores = await withConnection(async (conn) => {
        const result = await conn.execute<any>(
          `SELECT BANNER_ID, DESCRIPTION, ACTIVE_IND FROM BANNERS 
           WHERE ORIGIN = 'SHOPIFY' 
              OR BANNER_ID LIKE 'SHOPIFY%'
              OR BANNER_ID IN ('DEMO', 'JESTA', 'JDWEB', 'LSWEB', 'SZWEB')`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        return (result.rows || []).map((row: any) => {
          // Override description with actual Shopify store name for known stores
          const storeNameMap: Record<string, string> = {
            'DEMO': 'Jesta-demo',
            'JESTA': 'Jesta-demo',
            'JDWEB': 'JD Sports Canada',
            'LSWEB': 'Deadstock Canada',
            'SZWEB': 'Size Canada'
          };
          
          return {
            bannerId: row.BANNER_ID,
            description: storeNameMap[row.BANNER_ID] || row.DESCRIPTION,
            url: this.constructShopifyUrl(row.BANNER_ID),
            isActive: row.ACTIVE_IND === 'Y',
            isDemo: false
          };
        });
      });
    } catch (e: any) {
      logger.warn(`Database error fetching stores: ${e?.message}`);
      if (!isDemo) throw e; // Production: propagate error
    }

    // DEMO MODE: Merge real stores with demo stores
    if (isDemo) {
      return [...realStores, ...this.getDemoStores()];
    }

    return realStores;
  }

  /**
   * Test connection to a Shopify store
   */
  async testConnection(bannerId: string): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      // Get Shopify credentials
      const creds = await this.getShopifyCredentials(bannerId);
      if (!creds) {
        return { success: false, message: 'Store credentials not found in configuration' };
      }

      // Call Shopify shop.json endpoint to verify connection
      const shopUrl = creds.shopUrl.replace('https://', '').replace('http://', '');
      const apiUrl = `https://${shopUrl}/admin/api/2024-10/shop.json`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': creds.accessToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return { 
          success: false, 
          message: `Shopify API error: ${response.status} ${response.statusText}` 
        };
      }

      const data = await response.json() as { shop: any };
      const shop = data.shop;

      return { 
        success: true, 
        message: `Connection to ${shop.name} verified`,
        details: { 
          shop: shop.name,
          domain: shop.domain,
          email: shop.email,
          currency: shop.currency,
          country: shop.country_name,
          plan: shop.plan_name
        }
      };
    } catch (e: any) {
      logger.error(`Test connection failed for ${bannerId}: ${e?.message}`);
      return { success: false, message: e?.message || 'Connection test failed' };
    }
  }

  /**
   * Get Shopify credentials for a banner
   */
  private async getShopifyCredentials(bannerId: string): Promise<{ shopUrl: string; accessToken: string; locationId?: string } | null> {
    return withConnection(async (conn) => {
      // Handle JESTA/DEMO store
      if (!bannerId || bannerId === 'DEMO' || bannerId === 'JESTA') {
        const configRes = await conn.execute<any>(
          `SELECT CONFIG_KEY, CONFIG_VALUE FROM ATTR_MGR.SHOPIFY_CONFIG 
           WHERE CONFIG_KEY IN ('JESTA_DEMO_STORE_URL', 'JESTA_DEMO_ACCESS_TOKEN', 'JESTA_DEMO_LOCATION_ID')`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        if (configRes.rows && configRes.rows.length > 0) {
          const config: Record<string, string> = {};
          configRes.rows.forEach((r: any) => { config[r.CONFIG_KEY] = r.CONFIG_VALUE; });
          
          const shopUrl = config.JESTA_DEMO_STORE_URL;
          const accessToken = config.JESTA_DEMO_ACCESS_TOKEN;
          const locationId = config.JESTA_DEMO_LOCATION_ID;
          
          if (shopUrl && accessToken) {
            const normalizedUrl = shopUrl.startsWith('https://') ? shopUrl : `https://${shopUrl}`;
            return { shopUrl: normalizedUrl, accessToken, locationId: locationId || undefined };
          }
        }
      }

      // Try PROVIDER_SERVICES for other banners
      const providerRes = await conn.execute<any>(
        `SELECT WEB_SITE_URL, API_KEY FROM OMNI.PROVIDER_SERVICES 
         WHERE BANNER_ID = :banner AND PROVIDER_ID LIKE 'SHOPIFY%' AND ROWNUM = 1`,
        { banner: bannerId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (providerRes.rows && providerRes.rows.length > 0) {
        const row = providerRes.rows[0];
        return {
          shopUrl: row.WEB_SITE_URL,
          accessToken: row.API_KEY
        };
      }

      return null;
    });
  }

  /**
   * Get products synced/flagged for Shopify
   * Demo mode: Returns REAL products + DEMO products merged
   * Production mode: Returns only real products from EXT_PRODUCT_VARIANTS
   */
  async getProducts(params: { bannerId?: string; limit?: number; offset?: number; search?: string; status?: string }): Promise<{ products: any[], total: number, isDemo?: boolean }> {
    const isDemo = await this.isDemoMode();
    let realProducts: any[] = [];
    
    try {
      realProducts = await withConnection(async (conn) => {
        let query = `
          SELECT 
            v.STYLE_ID, 
            v.BANNER_ID, 
            v.SHOPIFY_PRODUCT_ID,
            COUNT(v.VARIANT_ID) as VARIANT_COUNT,
            SUM(v.INVENTORY_QTY) as TOTAL_INVENTORY,
            p.DESCRIPTION,
            p.WEB_PUBLISH_IND
          FROM MERCH_EXT_PRODUCT_VARIANTS v
          LEFT JOIN MERCH.EXT_PRODUCTS p ON v.STYLE_ID = p.STYLE_ID AND v.BANNER_ID = p.BANNER_ID
          WHERE 1=1
        `;

        const binds: any = {};
        if (params.bannerId && !params.bannerId.startsWith('DEMO-')) {
          query += ` AND v.BANNER_ID = :banner`;
          binds.banner = params.bannerId;
        }
        if (params.search) {
          query += ` AND (v.STYLE_ID LIKE '%' || :search || '%' OR p.DESCRIPTION LIKE '%' || :search || '%')`;
          binds.search = params.search;
        }

        query += ` GROUP BY v.STYLE_ID, v.BANNER_ID, v.SHOPIFY_PRODUCT_ID, p.DESCRIPTION, p.WEB_PUBLISH_IND ORDER BY v.STYLE_ID`;

        const result = await conn.execute<any>(query, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return (result.rows || []).map((p: any) => ({
          styleId: p.STYLE_ID,
          bannerId: p.BANNER_ID,
          shopifyProductId: p.SHOPIFY_PRODUCT_ID,
          variantCount: p.VARIANT_COUNT || 0,
          totalInventory: p.TOTAL_INVENTORY || 0,
          description: p.DESCRIPTION || 'No description',
          status: p.SHOPIFY_PRODUCT_ID ? 'synced' : 'not_published',
          publishInd: p.WEB_PUBLISH_IND || 'N',
          isDemo: false // Real data
        }));
      });
    } catch (e: any) {
      logger.warn(`Database error fetching products: ${e?.message}`);
      if (!isDemo) throw e;
    }

    // DEMO MODE: Merge real products with demo products
    if (isDemo) {
      const demoProducts = this.getDemoProducts().filter(dp => {
        // Filter demo products by search if specified
        if (params.search) {
          const search = params.search.toLowerCase();
          return dp.styleId.toLowerCase().includes(search) || dp.description.toLowerCase().includes(search);
        }
        return true;
      });
      const allProducts = [...realProducts, ...demoProducts];
      return { products: allProducts, total: allProducts.length, isDemo: true };
    }

    return { products: realProducts, total: realProducts.length, isDemo: false };
  }

  /**
   * Get Shopify dashboard stats
   * Demo mode: Returns mock revenue/sales data
   * Production mode: Returns real data from Oracle views (zeros if no data)
   */
  async getDashboardStats(businessUnitId: number, period: string = 'today'): Promise<any> {
    const isDemo = await this.isDemoMode();
    try {
      return await withConnection(async (conn) => {
        let totalProducts = 0;
        let pendingOrders = 0;
        let aiMappings = 0;
        let syncedProducts = 0;
        let todayRevenue = 0;
        let totalOrders = 0;

        // Period multipliers for demo data
        const multipliers = ShopifyService.PERIOD_MULTIPLIERS;
        const mult = multipliers[period] || 1;

        // Real data: Product count from EXT_PRODUCT_VARIANTS
        try {
          const res = await conn.execute<any>(
            `SELECT COUNT(DISTINCT STYLE_ID) as CNT FROM MERCH_EXT_PRODUCT_VARIANTS WHERE BUSINESS_UNIT_ID = :bu`, 
            { bu: businessUnitId }, 
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          totalProducts = res.rows?.[0]?.CNT || 0;
        } catch (e) { /* Continue with 0 */ }

        // Real data: Synced products (those with Shopify ID)
        try {
          const res = await conn.execute<any>(
            `SELECT COUNT(DISTINCT STYLE_ID) as CNT FROM MERCH_EXT_PRODUCT_VARIANTS WHERE BUSINESS_UNIT_ID = :bu AND SHOPIFY_PRODUCT_ID IS NOT NULL`, 
            { bu: businessUnitId }, 
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          syncedProducts = res.rows?.[0]?.CNT || 0;
        } catch (e) { /* Continue with 0 */ }

        // Real data: Pending orders
        try {
          const res = await conn.execute<any>(
            `SELECT COUNT(*) as CNT FROM V_ECOMM_ORDERS WHERE BUSINESS_UNIT_ID = :bu AND STATUS = 'PENDING'`, 
            { bu: businessUnitId }, 
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          pendingOrders = res.rows?.[0]?.CNT || 0;
        } catch (e) { /* Continue with 0 */ }

        // Real data: AI mappings count
        try {
          const res = await conn.execute<any>(
            `SELECT COUNT(*) as CNT FROM ATTR_MGR.SHOPIFY_HIERARCHY_MAP WHERE BUSINESS_UNIT_ID = :bu AND MAPPED_BY = 'AI'`, 
            { bu: businessUnitId }, 
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          aiMappings = res.rows?.[0]?.CNT || 0;
        } catch (e) { /* Continue with 0 */ }

        // Real data: Try to get actual revenue from V_ECOMM_ORDERS
        try {
          const periodFilter = period === 'today' ? 'TRUNC(ORDER_DATE) = TRUNC(SYSDATE)'
            : period === '7d' ? 'ORDER_DATE >= SYSDATE - 7'
            : period === '30d' ? 'ORDER_DATE >= SYSDATE - 30'
            : 'ORDER_DATE >= TRUNC(SYSDATE, \'YEAR\')';
          
          const res = await conn.execute<any>(
            `SELECT COUNT(*) as ORDER_CNT, NVL(SUM(TOTAL_AMOUNT), 0) as REVENUE 
             FROM V_ECOMM_ORDERS 
             WHERE BUSINESS_UNIT_ID = :bu AND ${periodFilter}`, 
            { bu: businessUnitId }, 
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          totalOrders = res.rows?.[0]?.ORDER_CNT || 0;
          todayRevenue = res.rows?.[0]?.REVENUE || 0;
        } catch (e) { /* Continue with 0 */ }

        // Charts data - DEMO ONLY
        let salesByChannel: any[] = [];
        let salesByCategory: any[] = [];
        let revenueSplit: any[] = [];

        if (isDemo && todayRevenue === 0) {
          // Only use mock data if we're in demo mode AND have no real data
          todayRevenue = Math.floor(45200 * mult);
          totalOrders = Math.floor(127 * mult);
          syncedProducts = syncedProducts || 379756;
          
          salesByChannel = [
            { name: 'JD Sports', value: Math.floor(26216 * mult) },
            { name: 'Size', value: Math.floor(12656 * mult) },
            { name: 'Deadstock', value: Math.floor(6328 * mult) }
          ];

          salesByCategory = [
            { name: 'Footwear', value: Math.floor(18500 * mult) },
            { name: 'Apparel', value: Math.floor(15200 * mult) },
            { name: 'Accessories', value: Math.floor(11500 * mult) }
          ];

          revenueSplit = [
            { name: 'Online Store', value: Math.floor(todayRevenue * 0.65) },
            { name: 'Shopify POS', value: Math.floor(todayRevenue * 0.35) }
          ];
        }

        return {
          totalProducts,
          syncedProducts,
          pendingOrders,
          aiMappings,
          todayRevenue,
          totalOrders,
          aov: totalOrders > 0 ? todayRevenue / totalOrders : 0,
          netSales: todayRevenue * 0.92,
          salesByChannel,
          salesByCategory,
          revenueSplit,
          isDemo: isDemo && todayRevenue > 0 && totalOrders > 100, // Flag if using mock data
          syncHealth: isDemo ? 'Demo Mode' : 'Live'
        };
      });
    } catch (error) {
      if (!isDemo) throw error;
      // Demo fallback on complete failure
      return {
        totalProducts: 0,
        syncedProducts: 0,
        pendingOrders: 0,
        aiMappings: 0,
        todayRevenue: 0,
        totalOrders: 0,
        aov: 0,
        netSales: 0,
        salesByChannel: [],
        salesByCategory: [],
        revenueSplit: [],
        isDemo: true,
        syncHealth: 'Error'
      };
    }
  }

  /**
   * Get Shopify orders - Extended with origin filter and search
   * VisionSuite SSOT: Queries V_ECOMM_ORDERS
   * Demo mode: Returns mock orders if no real data
   * Production mode: Returns only real orders from V_ECOMM_ORDERS
   */
  async getOrders(params: { 
    siteId?: string; 
    limit?: number; 
    offset?: number; 
    status?: string;
    origin?: string;      // Filter by ORDER_ORIGIN (SHOPIFY, OMNI, EDOM, POS)
    search?: string;      // Search by customer ID, order ID, or WFE trans ID
    startDate?: string;   // Date range filter (YYYY-MM-DD)
    endDate?: string;     // Date range filter (YYYY-MM-DD)
  }): Promise<{ orders: any[], total: number, isDemo?: boolean }> {
    const isDemo = await this.isDemoMode();
    let realOrders: any[] = [];
    
    try {
      realOrders = await withConnection(async (conn) => {
        // Join V_ECOMM_ORDERS with OMNI.ORDERS to get actual ORIGIN (view hardcodes 'OMNI')
        let query = `
          SELECT 
            v.SALES_ORDER_ID as "orderId",
            v.WFE_TRANS_ID as "wfeTransId",
            v.CUSTOMER_ID as "customerId",
            v.ORDER_DATE as "orderDate",
            v.STATUS as "status",
            v.SITE_ID as "siteId",
            NVL(o.ORIGIN, v.ORDER_ORIGIN) as "origin"
          FROM V_ECOMM_ORDERS v
          LEFT JOIN OMNI.ORDERS o ON v.WFE_TRANS_ID = o.ORDER_ID AND v.BUSINESS_UNIT_ID = o.BUSINESS_UNIT_ID
          WHERE 1=1
        `;

        const binds: any = {};
        
        // Existing filters (backwards compatible)
        if (params.siteId) {
          query += ` AND v.SITE_ID = :siteId`;
          binds.siteId = params.siteId;
        }
        if (params.status) {
          query += ` AND v.STATUS = :status`;
          binds.status = params.status;
        }
        
        // Origin filter - use ORDERS.ORIGIN for accurate filtering
        if (params.origin) {
          query += ` AND NVL(o.ORIGIN, v.ORDER_ORIGIN) = :origin`;
          binds.origin = params.origin;
        }
        
        // NEW: Search filter (customer ID, order ID, or WFE trans ID)
        if (params.search) {
          query += ` AND (
            UPPER(v.CUSTOMER_ID) LIKE UPPER(:search) OR 
            UPPER(CAST(v.SALES_ORDER_ID AS VARCHAR2(50))) LIKE UPPER(:search) OR
            UPPER(v.WFE_TRANS_ID) LIKE UPPER(:search)
          )`;
          binds.search = `%${params.search}%`;
        }
        
        // NEW: Date range filters
        if (params.startDate) {
          query += ` AND v.ORDER_DATE >= TO_DATE(:startDate, 'YYYY-MM-DD')`;
          binds.startDate = params.startDate;
        }
        if (params.endDate) {
          query += ` AND v.ORDER_DATE <= TO_DATE(:endDate, 'YYYY-MM-DD') + INTERVAL '1' DAY - INTERVAL '1' SECOND`;
          binds.endDate = params.endDate;
        }

        query += ` ORDER BY v.ORDER_DATE DESC`;
        
        // Apply offset and limit if provided (Oracle requires OFFSET before FETCH FIRST)
        if (params.offset) {
          query += ` OFFSET :offset ROWS`;
          binds.offset = params.offset;
        }
        if (params.limit) {
          query += ` FETCH FIRST :limit ROWS ONLY`;
          binds.limit = params.limit;
        }

        const result = await conn.execute<any>(query, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return (result.rows || []).map((o: any) => ({ ...o, isDemo: false }));
      });
    } catch (e: any) {
      logger.warn(`Database error fetching orders: ${e?.message}`);
      if (!isDemo) throw e;
    }

    // DEMO MODE: Merge real orders with demo orders
    if (isDemo) {
      const demoOrders = this.getDemoOrders().filter(o => 
        (!params.status || o.status === params.status) &&
        (!params.origin || o.origin === params.origin)
      );
      const allOrders = [...realOrders, ...demoOrders];
      return { orders: allOrders, total: allOrders.length, isDemo: true };
    }

    return { orders: realOrders, total: realOrders.length, isDemo: false };
  }

  /**
   * Get order count breakdown by origin
   * VisionSuite SSOT: Queries V_ECOMM_ORDERS and groups by ORDER_ORIGIN
   * @param params - Optional date range filters
   * @returns Object with counts for each origin (all, shopify, omni, edom, pos, etc.)
   */
  async getOrderOriginStats(params: { 
    startDate?: string; 
    endDate?: string 
  } = {}): Promise<{
    all: number;
    shopify: number;
    omni: number;
    edom: number;
    pos: number;
    [key: string]: number;
  }> {
    try {
      return await withConnection(async (conn) => {
        let dateFilter = '';
        const binds: any = {};
        
        if (params.startDate) {
          dateFilter += ` AND v.ORDER_DATE >= TO_DATE(:startDate, 'YYYY-MM-DD')`;
          binds.startDate = params.startDate;
        }
        
        if (params.endDate) {
          dateFilter += ` AND v.ORDER_DATE <= TO_DATE(:endDate, 'YYYY-MM-DD') + INTERVAL '1' DAY - INTERVAL '1' SECOND`;
          binds.endDate = params.endDate;
        }
        
        // Join with OMNI.ORDERS to get actual ORIGIN (view hardcodes 'OMNI')
        const result = await conn.execute<any>(
          `SELECT 
             NVL(o.ORIGIN, v.ORDER_ORIGIN) as ORIGIN,
             COUNT(*) as COUNT
           FROM V_ECOMM_ORDERS v
           LEFT JOIN OMNI.ORDERS o ON v.WFE_TRANS_ID = o.ORDER_ID AND v.BUSINESS_UNIT_ID = o.BUSINESS_UNIT_ID
           WHERE 1=1 ${dateFilter}
           GROUP BY NVL(o.ORIGIN, v.ORDER_ORIGIN)`,
          binds,
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        // Initialize stats with zeros
        const stats: any = { 
          all: 0, 
          shopify: 0, 
          omni: 0, 
          edom: 0, 
          pos: 0 
        };
        
        // Populate from query results
        result.rows?.forEach((row: any) => {
          const origin = (row.ORIGIN || 'UNKNOWN').toLowerCase().trim();
          const count = parseInt(row.COUNT) || 0;
          stats[origin] = count;
          stats.all += count;
        });
        
        logger.info(`[ORDER STATS] Total: ${stats.all}, Shopify: ${stats.shopify}, OMNI: ${stats.omni}, EDOM: ${stats.edom}, POS: ${stats.pos}`);
        
        return stats;
      });
    } catch (e: any) {
      logger.warn(`Error fetching order origin stats: ${e?.message}`);
      // Return zeros on error
      return { all: 0, shopify: 0, omni: 0, edom: 0, pos: 0 };
    }
  }

  /**
   * Get order details
   * Demo mode: Returns mock order if not found
   * Production mode: Returns real order or throws error
   */
  async getOrderDetails(orderId: string): Promise<any> {
    const isDemo = await this.isDemoMode();
    return await withConnection(async (conn) => {
      let order: any = null;
      let items: any[] = [];
      let shipments: any[] = [];

      try {
        // 1. Get header — try SALES_ORDER_ID first, fallback to WFE_TRANS_ID (internal ORDER_ID)
        let orderRes = await conn.execute<any>(
          `SELECT * FROM V_ECOMM_ORDERS WHERE SALES_ORDER_ID = :orderId`,
          { orderId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        order = orderRes.rows?.[0];

        // Fallback: caller may have passed the internal ORDER_ID (WFE_TRANS_ID)
        if (!order) {
          orderRes = await conn.execute<any>(
            `SELECT * FROM V_ECOMM_ORDERS WHERE WFE_TRANS_ID = :orderId`,
            { orderId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          order = orderRes.rows?.[0];
        }

        // Resolve the canonical SALES_ORDER_ID for detail/shipment queries
        const salesOrderId = order?.SALES_ORDER_ID ?? orderId;

        // 2. Get line items
        const itemsRes = await conn.execute<any>(
          `SELECT * FROM V_ECOMM_ORDER_DETAILS WHERE SALES_ORDER_ID = :salesOrderId`,
          { salesOrderId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        items = itemsRes.rows || [];

        // 3. Get shipments and their details
        const shipmentsRes = await conn.execute<any>(
          `SELECT * FROM V_ECOMM_SHIPMENTS WHERE SALES_ORDER_ID = :salesOrderId`,
          { salesOrderId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        const rawShipments = shipmentsRes.rows || [];
        
        // Fetch details for each shipment to support multi-parcel visibility
        for (const s of rawShipments) {
          const detRes = await conn.execute<any>(
            `SELECT * FROM V_ECOMM_SHIPMENT_DETAILS WHERE SHIPMENT_ID = :shipId`,
            { shipId: s.SHIPMENT_ID },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          shipments.push({
            ...s,
            items: detRes.rows || []
          });
        }
      } catch (e: any) {
        logger.warn(`Database error fetching order ${orderId}: ${e?.message}`);
        if (!isDemo) throw e; // PRODUCTION: propagate error
      }

      // DEMO MODE ONLY: Provide mock order if not found
      if (!order && isDemo) {
        return {
          order: { SALES_ORDER_ID: orderId, CUSTOMER_ID: 'DEMO-CUST', ORDER_DATE: new Date(), STATUS: 'PENDING', SITE_ID: '100', isDemo: true },
          items: [{ STYLE_ID: 'DEMO-1000019', COLOR_ID: 'BLK', SIZE_ID: 'M', QTY_ORDERED: 1, UNIT_PRICE: 129.99, isDemo: true }],
          shipments: [],
          isDemo: true
        };
      }

      // PRODUCTION: Return null if order not found
      if (!order && !isDemo) {
        return { order: null, items: [], shipments: [], notFound: true };
      }

      return { order, items, shipments, isDemo: false };
    });
  }

  // ============================================================================
  // PHASE 1: ORDER ENRICHMENT (Customer 360, Timeline, Shopify Data)
  // ============================================================================

  /**
   * Get Customer 360 - Unified customer view with metrics
   * Data Source: VisionSuite V_ECOMM_* views (SSOT)
   */
  async getCustomer360(customerId: string): Promise<any> {
    if (!customerId) return null;
    
    return await withConnection(async (conn) => {
      try {
        // 1. Get customer profile and order metrics in one query
        // Note: V_ECOMM_ORDERS doesn't have EMAIL - we get it from the details view
        const metricsRes = await conn.execute<any>(
          `SELECT 
            o.CUSTOMER_ID,
            COUNT(DISTINCT o.SALES_ORDER_ID) as TOTAL_ORDERS,
            COALESCE(SUM(d.LINE_TOTAL_AMOUNT), 0) as TOTAL_SPENT,
            COALESCE(AVG(d.LINE_TOTAL_AMOUNT), 0) as AVG_ORDER_VALUE,
            MIN(o.ORDER_DATE) as FIRST_ORDER_DATE,
            MAX(o.ORDER_DATE) as LAST_ORDER_DATE,
            ROUND(SYSDATE - MAX(o.ORDER_DATE)) as DAYS_SINCE_LAST
          FROM V_ECOMM_ORDERS o
          LEFT JOIN V_ECOMM_ORDER_DETAILS d ON o.SALES_ORDER_ID = d.SALES_ORDER_ID
          WHERE o.CUSTOMER_ID = :customerId
          GROUP BY o.CUSTOMER_ID`,
          { customerId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        if (!metricsRes.rows || metricsRes.rows.length === 0) {
          return null;
        }
        
        const metrics = metricsRes.rows[0];
        
        // 2. Get recent orders (last 10)
        // Note: V_ECOMM_ORDER_DETAILS uses LINE (not LINE_ID)
        const recentOrdersRes = await conn.execute<any>(
          `SELECT 
            o.SALES_ORDER_ID as "orderId",
            o.ORDER_DATE as "orderDate",
            o.STATUS as "status",
            o.SITE_ID as "siteId",
            COUNT(d.LINE) as "itemCount",
            COALESCE(SUM(d.LINE_TOTAL_AMOUNT), 0) as "total"
          FROM V_ECOMM_ORDERS o
          LEFT JOIN V_ECOMM_ORDER_DETAILS d ON o.SALES_ORDER_ID = d.SALES_ORDER_ID
          WHERE o.CUSTOMER_ID = :customerId
          GROUP BY o.SALES_ORDER_ID, o.ORDER_DATE, o.STATUS, o.SITE_ID
          ORDER BY o.ORDER_DATE DESC
          FETCH FIRST 10 ROWS ONLY`,
          { customerId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        // 3. Calculate loyalty tier based on metrics
        const totalOrders = parseInt(metrics.TOTAL_ORDERS) || 0;
        const daysSinceLast = parseInt(metrics.DAYS_SINCE_LAST) || 999;
        const totalSpent = parseFloat(metrics.TOTAL_SPENT) || 0;
        
        let loyaltyTier = 'new';
        if (totalOrders >= 10 && totalSpent >= 2000) {
          loyaltyTier = 'vip';
        } else if (totalOrders >= 5) {
          loyaltyTier = 'returning';
        } else if (daysSinceLast > 180 && totalOrders > 0) {
          loyaltyTier = 'at-risk';
        } else if (daysSinceLast > 365 && totalOrders > 0) {
          loyaltyTier = 'churned';
        }
        
        // 4. Calculate RFM scores (1-5 scale)
        const recencyScore = daysSinceLast <= 30 ? 5 : daysSinceLast <= 90 ? 4 : daysSinceLast <= 180 ? 3 : daysSinceLast <= 365 ? 2 : 1;
        const frequencyScore = totalOrders >= 20 ? 5 : totalOrders >= 10 ? 4 : totalOrders >= 5 ? 3 : totalOrders >= 2 ? 2 : 1;
        const monetaryScore = totalSpent >= 5000 ? 5 : totalSpent >= 2000 ? 4 : totalSpent >= 1000 ? 3 : totalSpent >= 500 ? 2 : 1;
        
        return {
          profile: {
            customerId: metrics.CUSTOMER_ID,
            // Note: Email not available in V_ECOMM_ORDERS view - would need to query CUSTOMERS table
          },
          metrics: {
            totalOrders,
            totalSpent,
            averageOrderValue: parseFloat(metrics.AVG_ORDER_VALUE) || 0,
            firstOrderDate: metrics.FIRST_ORDER_DATE,
            lastOrderDate: metrics.LAST_ORDER_DATE,
            daysSinceLastOrder: daysSinceLast
          },
          segments: {
            loyaltyTier,
            rfmScore: {
              recency: recencyScore,
              frequency: frequencyScore,
              monetary: monetaryScore,
              total: recencyScore + frequencyScore + monetaryScore
            }
          },
          recentOrders: recentOrdersRes.rows || []
        };
      } catch (e: any) {
        logger.warn(`Error fetching Customer 360 for ${customerId}: ${e?.message}`);
        return null;
      }
    });
  }

  /**
   * Fetch Shopify order enrichment data (fraud, notes, tags)
   * Data Source: Shopify Admin API (enrichment only, not SSOT)
   */
  async fetchShopifyOrderEnrichment(shopifyOrderId: string): Promise<any> {
    try {
      // Get Shopify credentials
      const creds = await this.getDefaultShopifyCredentials();
      if (!creds.accessToken) {
        logger.warn('No Shopify credentials configured for enrichment');
        return null;
      }
      
      const url = `${creds.shopUrl}/admin/api/2024-10/orders/${shopifyOrderId}.json`;
      const response = await fetch(url, {
        headers: { 
          'X-Shopify-Access-Token': creds.accessToken,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        logger.warn(`Shopify API error: ${response.status} for order ${shopifyOrderId}`);
        return null;
      }
      
      const data = await response.json() as { order: any };
      const order = data.order;
      
      if (!order) return null;
      
      // Extract relevant enrichment data
      return {
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        riskLevel: order.risks?.[0]?.recommendation || 'unknown',
        riskRecommendation: order.risks?.[0]?.recommendation || 'accept',
        riskIndicators: order.risks?.map((r: any) => r.message) || [],
        tags: order.tags ? order.tags.split(',').map((t: string) => t.trim()) : [],
        note: order.note || null,
        noteAttributes: order.note_attributes || [],
        cancelReason: order.cancel_reason,
        paymentGateway: order.gateway,
        processingMethod: order.processing_method,
        browserIp: order.browser_ip,
        landingSite: order.landing_site,
        referringSite: order.referring_site,
        customerLocale: order.customer_locale,
        orderNumber: order.order_number,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        closedAt: order.closed_at,
        cancelledAt: order.cancelled_at,
        totalPrice: order.total_price,
        currency: order.currency
      };
    } catch (e: any) {
      logger.warn(`Error fetching Shopify enrichment: ${e?.message}`);
      return null;
    }
  }

  /**
   * Build order timeline from VisionSuite and Shopify data
   */
  buildOrderTimeline(vsData: any, shopifyData: any): any[] {
    const timeline: any[] = [];
    
    // Add VisionSuite events
    if (vsData.order) {
      // Order created
      if (vsData.order.ORDER_DATE || vsData.order.CREATED_DATE) {
        timeline.push({
          timestamp: vsData.order.ORDER_DATE || vsData.order.CREATED_DATE,
          type: 'created',
          source: 'visionsuite',
          description: 'Order received in VisionSuite',
          icon: '📥'
        });
      }
      
      // Status-based events
      const status = vsData.order.STATUS?.toUpperCase();
      if (status === 'OPEN' || status === 'IN PICKING') {
        timeline.push({
          timestamp: vsData.order.ORDER_DATE,
          type: 'processing',
          source: 'visionsuite',
          description: 'Order released for fulfillment',
          icon: '📦'
        });
      }
    }
    
    // Add shipment events
    if (vsData.shipments?.length > 0) {
      for (const ship of vsData.shipments) {
        timeline.push({
          timestamp: ship.SHIP_DATE || ship.CREATED_DATE,
          type: 'shipped',
          source: 'visionsuite',
          description: `Shipped via ${ship.CARRIER_NAME || 'carrier'} - ${ship.TRACKING_NUMBER || 'tracking pending'}`,
          icon: '🚚',
          trackingNumber: ship.TRACKING_NUMBER,
          carrier: ship.CARRIER_NAME
        });
      }
    }
    
    // Add Shopify events
    if (shopifyData) {
      // Payment event
      if (shopifyData.financialStatus === 'paid') {
        timeline.push({
          timestamp: shopifyData.createdAt,
          type: 'paid',
          source: 'shopify',
          description: `Payment captured via ${shopifyData.paymentGateway || 'Shopify Payments'}`,
          icon: '💳'
        });
      }
      
      // Cancellation event
      if (shopifyData.cancelledAt) {
        timeline.push({
          timestamp: shopifyData.cancelledAt,
          type: 'cancelled',
          source: 'shopify',
          description: `Order cancelled: ${shopifyData.cancelReason || 'No reason specified'}`,
          icon: '❌'
        });
      }
      
      // Note added (synthetic event)
      if (shopifyData.note) {
        timeline.push({
          timestamp: shopifyData.updatedAt,
          type: 'note',
          source: 'shopify',
          description: `Note: "${shopifyData.note.substring(0, 100)}${shopifyData.note.length > 100 ? '...' : ''}"`,
          icon: '📝'
        });
      }
    }
    
    // Sort by timestamp descending (newest first)
    timeline.sort((a, b) => {
      const dateA = new Date(a.timestamp || 0).getTime();
      const dateB = new Date(b.timestamp || 0).getTime();
      return dateB - dateA;
    });
    
    return timeline;
  }

  /**
   * Get default Shopify credentials from config (for Jesta demo store)
   */
  private async getDefaultShopifyCredentials(): Promise<{ shopUrl: string; accessToken: string }> {
    try {
      return await withConnection(async (conn) => {
        const configRes = await conn.execute<any>(
          `SELECT CONFIG_KEY, CONFIG_VALUE FROM ATTR_MGR.SHOPIFY_CONFIG 
           WHERE CONFIG_KEY IN ('JESTA_DEMO_STORE_URL', 'JESTA_DEMO_ACCESS_TOKEN')`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const config: Record<string, string> = {};
        configRes.rows?.forEach((r: any) => { config[r.CONFIG_KEY] = r.CONFIG_VALUE; });
        return {
          shopUrl: config.JESTA_DEMO_STORE_URL || 'https://jesta-demo.myshopify.com',
          accessToken: config.JESTA_DEMO_ACCESS_TOKEN || ''
        };
      });
    } catch (e) {
      return { shopUrl: 'https://jesta-demo.myshopify.com', accessToken: '' };
    }
  }

  /**
   * Get enriched order details with Customer 360, Timeline, and Shopify data
   * This is the "delight" version of getOrderDetails
   */
  async getEnrichedOrderDetails(orderId: string, options: {
    includeCustomer?: boolean;
    includeTimeline?: boolean;
    includeShopifyEnrichment?: boolean;
  } = {}): Promise<any> {
    const { 
      includeCustomer = true, 
      includeTimeline = true, 
      includeShopifyEnrichment = true 
    } = options;
    
    // 1. Get base order data from VisionSuite
    const baseData = await this.getOrderDetails(orderId);
    
    if (!baseData.order) {
      return baseData; // Return early if order not found
    }
    
    // 2. Get Customer 360 if requested
    let customer = null;
    if (includeCustomer && baseData.order.CUSTOMER_ID) {
      customer = await this.getCustomer360(baseData.order.CUSTOMER_ID);
    }
    
    // 3. Get Shopify enrichment if this is a Shopify order
    let shopify = null;
    const wfeTransId = baseData.order.WFE_TRANS_ID;
    const isShopifyOrder = wfeTransId?.startsWith('#');
    
    if (includeShopifyEnrichment && isShopifyOrder) {
      // Extract Shopify order number (remove the # prefix)
      const shopifyOrderNumber = wfeTransId.replace('#', '');
      
      // Try to find the Shopify order ID from our mappings or use the order number
      // For now, we'll try to fetch by name (order number)
      try {
        const creds = await this.getDefaultShopifyCredentials();
        if (creds.accessToken) {
          // Search for order by name (order number)
          const searchUrl = `${creds.shopUrl}/admin/api/2024-10/orders.json?name=%23${shopifyOrderNumber}&status=any`;
          const searchRes = await fetch(searchUrl, {
            headers: { 'X-Shopify-Access-Token': creds.accessToken }
          });
          
          if (searchRes.ok) {
            const searchData = await searchRes.json() as { orders: any[] };
            const foundOrder = searchData.orders?.[0];
            if (foundOrder?.id) {
              shopify = await this.fetchShopifyOrderEnrichment(foundOrder.id.toString());
            }
          }
        }
      } catch (e: any) {
        logger.warn(`Could not fetch Shopify enrichment for ${wfeTransId}: ${e?.message}`);
      }
    }
    
    // 4. Build timeline if requested
    let timeline: any[] = [];
    if (includeTimeline) {
      timeline = this.buildOrderTimeline(baseData, shopify);
    }
    
    // 5. Return enriched response
    return {
      ...baseData,
      customer,
      shopify,
      timeline,
      isShopifyOrder,
      enriched: true
    };
  }

  /**
   * Get Shopify scheduler jobs
   * Demo mode: Returns REAL jobs + DEMO jobs merged
   * Production mode: Returns only real jobs from ALL_SCHEDULER_JOBS
   */
  async getJobs(): Promise<any[]> {
    const isDemo = await this.isDemoMode();
    let realJobs: any[] = [];
    
    try {
      realJobs = await withConnection(async (conn) => {
        const result = await conn.execute<any>(
          `SELECT 
            JOB_NAME, 
            STATE, 
            REPEAT_INTERVAL, 
            LAST_START_DATE, 
            NEXT_RUN_DATE
          FROM ALL_SCHEDULER_JOBS 
          WHERE OWNER = 'OMNI' 
          AND JOB_NAME LIKE 'SHOPIFY%'`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return (result.rows || []).map((j: any) => ({ ...j, isDemo: false }));
      });
    } catch (e: any) {
      logger.warn(`Database error fetching jobs: ${e?.message}`);
      if (!isDemo) throw e;
    }

    // DEMO MODE: Merge real jobs with demo jobs
    if (isDemo) {
      return [...realJobs, ...this.getDemoJobs()];
    }

    return realJobs;
  }

  /**
   * Run a scheduler job
   */
  async runJob(jobName: string): Promise<void> {
    return withConnection(async (conn) => {
      await conn.execute(`BEGIN DBMS_SCHEDULER.RUN_JOB(:jobName); END;`, { jobName });
    });
  }

  /**
   * Toggle job state (Enable/Disable)
   */
  async toggleJob(jobName: string, enable: boolean): Promise<void> {
    return withConnection(async (conn) => {
      const proc = enable ? 'DBMS_SCHEDULER.ENABLE' : 'DBMS_SCHEDULER.DISABLE';
      await conn.execute(`BEGIN ${proc}(:jobName); END;`, { jobName });
    });
  }

  /**
   * Publish/Unpublish product to Shopify
   */
  async toggleProductStatus(params: { businessUnitId: number; styleId: string; bannerId: string; publish: boolean }): Promise<void> {
    return withConnection(async (conn) => {
      if (params.publish) {
        // Insert into EXT_PRODUCTS to flag for Shopify sync (presence = publish)
        // Uses MERGE to handle both insert and update cases
        await conn.execute(
          `MERGE INTO MERCH.EXT_PRODUCTS target
           USING (SELECT :bu as BU, :style as STYLE, :banner as BANNER FROM DUAL) source
           ON (target.BUSINESS_UNIT_ID = source.BU AND target.STYLE_ID = source.STYLE AND target.BANNER_ID = source.BANNER)
           WHEN MATCHED THEN UPDATE SET target.MODIFIED_DATE = CURRENT_TIMESTAMP, target.MODIFIED_BY = 'ATTR_MGR'
           WHEN NOT MATCHED THEN INSERT (BUSINESS_UNIT_ID, STYLE_ID, BANNER_ID, CREATED_DATE, CREATED_BY) 
                VALUES (source.BU, source.STYLE, source.BANNER, CURRENT_TIMESTAMP, 'ATTR_MGR')`,
          { bu: params.businessUnitId, style: params.styleId, banner: params.bannerId }
        );
      } else {
        await conn.execute(
          `DELETE FROM MERCH.EXT_PRODUCTS 
           WHERE BUSINESS_UNIT_ID = :bu AND STYLE_ID = :style AND BANNER_ID = :banner`,
          { bu: params.businessUnitId, style: params.styleId, banner: params.bannerId }
        );
      }

      // Log the action
      await conn.execute(
        `INSERT INTO ATTR_MGR.SHOPIFY_SYNC_LOG (ENTITY_TYPE, ENTITY_ID, BANNER_ID, ACTION_TYPE, STATUS, CREATED_AT)
         VALUES ('PRODUCT', :styleId, :bannerId, :action, 'PENDING', CURRENT_TIMESTAMP)`,
        { 
          styleId: params.styleId, 
          bannerId: params.bannerId,
          action: params.publish ? 'PUBLISH' : 'UNPUBLISH'
        }
      );

      await conn.commit();
    });
  }

  /**
   * Sync inventory for a product
   */
  async syncInventory(params: { businessUnitId: number; styleId: string; bannerId: string }): Promise<void> {
    return withConnection(async (conn) => {
      // Now calls the actual VSTORE procedure
      await conn.execute(
        `BEGIN VSTORE.INTFS_SHOPIFY_PK.sync_inventory(:buId, :styleId, :bannerId); END;`,
        { buId: params.businessUnitId, styleId: params.styleId, bannerId: params.bannerId }
      );

      // Log the action
      await conn.execute(
        `INSERT INTO ATTR_MGR.SHOPIFY_SYNC_LOG (ENTITY_TYPE, ENTITY_ID, BANNER_ID, ACTION_TYPE, STATUS, CREATED_AT)
         VALUES ('PRODUCT', :styleId, :bannerId, 'SYNC_INV', 'SUCCESS', CURRENT_TIMESTAMP)`,
        { 
          styleId: params.styleId, 
          bannerId: params.bannerId
        }
      );
      
      await conn.commit();
      logger.info(`Triggered live inventory sync for ${params.styleId} on ${params.bannerId}`);
    });
  }

  /**
   * Get hierarchy mapping from VisionSuite to Shopify
   */
  async getMappings(businessUnitId: number): Promise<any[]> {
    return withConnection(async (conn) => {
      const result = await conn.execute<any>(
        `SELECT 
          mh.DIVISIONDESC as VS_DIVISION,
          mh.GROUPDESC as VS_GROUP,
          mh.DEPARTMENTDESC as VS_DEPARTMENT,
          mh.CLASSDESC as VS_CLASS,
          mh.SUBCLASSDESC as VS_SUBCLASS,
          mh.MERCHANDISE_NO,
          hm.SHOPIFY_PRODUCT_TYPE,
          hm.MAPPED_BY,
          hm.AI_CONFIDENCE,
          hm.AI_ALTERNATIVES
        FROM MV_MERCHANDISE_HIERARCHY mh
        LEFT JOIN ATTR_MGR.SHOPIFY_HIERARCHY_MAP hm 
          ON mh.MERCHANDISE_NO = hm.MERCHANDISE_NO 
          AND hm.BUSINESS_UNIT_ID = :bu
        WHERE ROWNUM <= 100`, // Limiting for demo
        { bu: businessUnitId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return (result.rows || []).map((row: any) => ({
        merchandiseNo: row.MERCHANDISE_NO,
        vsPath: `${row.VS_DIVISION} > ${row.VS_GROUP} > ${row.VS_DEPARTMENT} > ${row.VS_CLASS} > ${row.VS_SUBCLASS}`,
        shopifyProductType: row.SHOPIFY_PRODUCT_TYPE,
        mappedBy: row.MAPPED_BY,
        aiConfidence: row.AI_CONFIDENCE,
        alternatives: row.AI_ALTERNATIVES ? JSON.parse(row.AI_ALTERNATIVES) : []
      }));
    });
  }

  /**
   * Get revenue analytics
   * Demo mode: Returns mock revenue data
   * Production mode: Returns real data from V_ECOMM_ORDERS aggregates
   */
  async getRevenueAnalytics(params: { period: string; bannerId?: string }): Promise<any> {
    const isDemo = await this.isDemoMode();
    const multipliers = ShopifyService.PERIOD_MULTIPLIERS;
    const mult = multipliers[params.period] || 1;

    // Try to get real data first
    try {
      return await withConnection(async (conn) => {
        const periodFilter = params.period === 'today' ? 'TRUNC(ORDER_DATE) = TRUNC(SYSDATE)'
          : params.period === '7d' ? 'ORDER_DATE >= SYSDATE - 7'
          : params.period === '30d' ? 'ORDER_DATE >= SYSDATE - 30'
          : 'ORDER_DATE >= TRUNC(SYSDATE, \'YEAR\')';

        let bannerFilter = '';
        const binds: any = {};
        if (params.bannerId) {
          bannerFilter = ' AND o.ORDER_ORIGIN = :banner';
          binds.banner = params.bannerId;
        }

        const res = await conn.execute<any>(
          `SELECT 
            COUNT(DISTINCT o.SALES_ORDER_ID) as ORDER_CNT, 
            NVL(SUM(d.LINE_TOTAL_AMOUNT), 0) as GROSS_SALES
           FROM V_ECOMM_ORDERS o
           LEFT JOIN V_ECOMM_ORDER_DETAILS d ON o.SALES_ORDER_ID = d.SALES_ORDER_ID
           WHERE ${periodFilter}${bannerFilter}`, 
          binds, 
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const orders = res.rows?.[0]?.ORDER_CNT || 0;
        const grossSales = res.rows?.[0]?.GROSS_SALES || 0;
        const tax = 0; // TAX_AMOUNT column doesn't exist in V_ECOMM_ORDERS
        const shipping = 0; // SHIPPING_AMOUNT column doesn't exist in V_ECOMM_ORDERS

        // If we have real data, return it
        if (orders > 0 || grossSales > 0) {
          return {
            grossSales,
            netSales: grossSales * 0.94,
            orders,
            aov: orders > 0 ? grossSales / orders : 0,
            tax,
            shipping,
            refunds: grossSales * 0.06,
            trends: { revenue: 'N/A', orders: 'N/A', aov: 'N/A' },
            chartData: [],
            isDemo: false
          };
        }

        // DEMO MODE ONLY: Return mock data when no real data exists
        if (isDemo) {
          const baseRevenue = 45200 * mult;
          const baseOrders = 127 * mult;
          return {
            grossSales: baseRevenue,
            netSales: baseRevenue * 0.94,
            orders: Math.floor(baseOrders),
            aov: baseRevenue / (baseOrders || 1),
            tax: baseRevenue * 0.13,
            shipping: baseOrders * 12.50,
            refunds: baseRevenue * 0.06,
            trends: { revenue: '+12.4%', orders: '+8.5%', aov: '+3.6%' },
            chartData: Array.from({ length: params.period === '7d' ? 7 : 12 }).map((_, i) => ({
              name: params.period === '7d' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] : `Month ${i+1}`,
              revenue: Math.floor(Math.random() * 5000 + 3000) * mult,
              orders: Math.floor(Math.random() * 20 + 10) * mult
            })),
            isDemo: true
          };
        }

        // PRODUCTION with no data: Return zeros
        return { grossSales: 0, netSales: 0, orders: 0, aov: 0, tax: 0, shipping: 0, refunds: 0, trends: { revenue: '0%', orders: '0%', aov: '0%' }, chartData: [], isDemo: false };
      });
    } catch (e: any) {
      logger.warn(`Error fetching revenue analytics: ${e?.message}`);
      if (!isDemo) throw e;
      return { grossSales: 0, netSales: 0, orders: 0, aov: 0, tax: 0, shipping: 0, refunds: 0, trends: {}, chartData: [], isDemo: true, error: true };
    }
  }

  /**
   * Get fulfillment performance metrics
   * Demo mode: Returns mock fulfillment data
   * Production mode: Returns real data from V_ECOMM_SHIPMENTS
   */
  async getFulfillmentMetrics(params: { period: string; bannerId?: string }): Promise<any> {
    const isDemo = await this.isDemoMode();
    const multipliers = ShopifyService.PERIOD_MULTIPLIERS;
    const mult = multipliers[params.period] || 1;

    try {
      return await withConnection(async (conn) => {
        // Try to get real shipment data
        const periodFilter = params.period === 'today' ? 'TRUNC(SHIP_DATE) = TRUNC(SYSDATE)'
          : params.period === '7d' ? 'SHIP_DATE >= SYSDATE - 7'
          : params.period === '30d' ? 'SHIP_DATE >= SYSDATE - 30'
          : 'SHIP_DATE >= TRUNC(SYSDATE, \'YEAR\')';

        const res = await conn.execute<any>(
          `SELECT COUNT(*) as SHIP_CNT FROM V_ECOMM_SHIPMENTS WHERE ${periodFilter}`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const shipCount = res.rows?.[0]?.SHIP_CNT || 0;

        // If we have real data, return with actual counts
        if (shipCount > 0) {
          return { avgTimeToShip: 0, slaAttainment: 0, pickAccuracy: 0, carrierPerformance: [], dailySLA: [], shipmentCount: shipCount, isDemo: false };
        }

        // DEMO MODE ONLY: Return mock data
        if (isDemo) {
          return {
            avgTimeToShip: 4.2, 
            slaAttainment: 98.5, 
            pickAccuracy: 99.8, 
            carrierPerformance: [
              { name: 'FedEx (Demo)', shipments: Math.floor(1250 * mult), onTime: 98.2 },
              { name: 'UPS (Demo)', shipments: Math.floor(840 * mult), onTime: 97.5 },
              { name: 'Canada Post (Demo)', shipments: Math.floor(420 * mult), onTime: 94.8 }
            ],
            dailySLA: Array.from({ length: 7 }).map((_, i) => ({
              name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
              percentage: 95 + Math.random() * 5
            })),
            isDemo: true
          };
        }

        // PRODUCTION with no data
        return { avgTimeToShip: 0, slaAttainment: 0, pickAccuracy: 0, carrierPerformance: [], dailySLA: [], isDemo: false };
      });
    } catch (e: any) {
      logger.warn(`Error fetching fulfillment metrics: ${e?.message}`);
      if (!isDemo) throw e;
      return { avgTimeToShip: 0, slaAttainment: 0, pickAccuracy: 0, carrierPerformance: [], dailySLA: [], isDemo: true, error: true };
    }
  }

  /**
   * Get return analytics
   * Demo mode: Returns mock return data
   * Production mode: Returns real data (currently empty - requires RETURNS table)
   */
  async getReturnAnalytics(params: { period: string }): Promise<any> {
    const isDemo = await this.isDemoMode();
    const multipliers = ShopifyService.PERIOD_MULTIPLIERS;
    const mult = multipliers[params.period] || 1;

    // PRODUCTION MODE: Return empty (no returns table configured yet)
    if (!isDemo) {
      return { returnRate: 0, returnsByReason: [], returnTrend: [], isDemo: false, message: 'Returns data not configured' };
    }

    // DEMO MODE: Return mock data
    return {
      returnRate: 8.4,
      returnsByReason: [
        { name: 'Wrong Size (Demo)', count: Math.floor(450 * mult) },
        { name: 'Defective (Demo)', count: Math.floor(120 * mult) },
        { name: 'Changed Mind (Demo)', count: Math.floor(380 * mult) },
        { name: 'Not as Pictured (Demo)', count: Math.floor(85 * mult) }
      ],
      returnTrend: Array.from({ length: 7 }).map((_, i) => ({
        name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
        returns: Math.floor(Math.random() * 50 * mult)
      })),
      isDemo: true
    };
  }

  /**
   * Get abandoned carts
   * Demo mode: Returns mock abandoned carts
   * Production mode: Returns empty (requires Shopify API integration)
   */
  async getAbandonedCarts(businessUnitId?: number): Promise<any> {
    const isDemo = await this.isDemoMode();
    
    // PRODUCTION MODE: Return empty with explanation
    if (!isDemo) {
      return { carts: [], total: 0, isDemo: false, message: 'Abandoned carts require Shopify API webhook integration' };
    }

    // DEMO MODE: Return mock data
    return {
      carts: [
        { id: 'demo_cart_1', email: 'john.doe@example.com', value: 129.99, items: 2, abandonedAt: new Date(Date.now() - 3600000), url: '#', isDemo: true },
        { id: 'demo_cart_2', email: 'sarah.smith@gmail.com', value: 89.00, items: 1, abandonedAt: new Date(Date.now() - 7200000), url: '#', isDemo: true },
        { id: 'demo_cart_3', email: 'mike.jones@outlook.com', value: 245.50, items: 3, abandonedAt: new Date(Date.now() - 86400000), url: '#', isDemo: true },
        { id: 'demo_cart_4', email: 'anna.white@yahoo.com', value: 54.20, items: 1, abandonedAt: new Date(Date.now() - 172800000), url: '#', isDemo: true }
      ],
      total: 4,
      isDemo: true
    };
  }

  /**
   * Get inventory discrepancies
   * Demo mode: Returns mock discrepancies
   * Production mode: Returns empty (requires Shopify API to compare)
   */
  async getInventoryDiscrepancies(businessUnitId: number, bannerId?: string): Promise<any> {
    const isDemo = await this.isDemoMode();
    
    // PRODUCTION MODE: Return empty with explanation
    if (!isDemo) {
      return { discrepancies: [], total: 0, isDemo: false, message: 'Inventory discrepancy check requires Shopify API comparison' };
    }

    // DEMO MODE: Return mock data
    return {
      discrepancies: [
        { styleId: 'DEMO-1000019', barcodeId: '888001221', bannerId: 'JDWEB', vsQty: 45, shopifyQty: 42, discrepancy: -3, isDemo: true },
        { styleId: 'DEMO-1000020', barcodeId: '888001222', bannerId: 'SZWEB', vsQty: 12, shopifyQty: 15, discrepancy: 3, isDemo: true },
        { styleId: 'DEMO-1000030', barcodeId: '888001223', bannerId: 'JDWEB', vsQty: 543, shopifyQty: 543, discrepancy: 0, isDemo: true },
        { styleId: 'DEMO-1000025', barcodeId: '888001224', bannerId: 'JDWEB', vsQty: 0, shopifyQty: 2, discrepancy: 2, isDemo: true }
      ],
      total: 4,
      isDemo: true
    };
  }

  /**
   * Get inventory alerts
   * Demo mode: Returns mock alerts
   * Production mode: Returns real alerts from SHOPIFY_INVENTORY_ALERTS table
   */
  async getInventoryAlerts(businessUnitId: number): Promise<any> {
    const isDemo = await this.isDemoMode();
    
    try {
      return await withConnection(async (conn) => {
        // Try to get real alerts from ATTR_MGR.SHOPIFY_INVENTORY_ALERTS
        const res = await conn.execute<any>(
          `SELECT ALERT_ID, STYLE_ID, ALERT_TYPE, CURRENT_QTY, SEVERITY, CREATED_AT
           FROM ATTR_MGR.SHOPIFY_INVENTORY_ALERTS 
           WHERE BUSINESS_UNIT_ID = :bu AND ACKNOWLEDGED_IND = 'N'
           ORDER BY SEVERITY DESC, CREATED_AT DESC`,
          { bu: businessUnitId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const alerts = res.rows || [];
        if (alerts.length > 0) {
          return { alerts, total: alerts.length, isDemo: false };
        }

        // DEMO MODE ONLY: Return mock alerts
        if (isDemo) {
          return {
            alerts: [
              { id: 1, styleId: 'DEMO-1000019', type: 'OUT_OF_STOCK', current: 0, lost_revenue: 450, isDemo: true },
              { id: 2, styleId: 'DEMO-1000025', type: 'LOW_STOCK', current: 2, lost_revenue: 0, isDemo: true },
              { id: 3, styleId: 'DEMO-1000030', type: 'DISCREPANCY', current: 543, lost_revenue: 0, isDemo: true }
            ],
            total: 3,
            isDemo: true
          };
        }

        // PRODUCTION with no alerts
        return { alerts: [], total: 0, isDemo: false };
      });
    } catch (e: any) {
      logger.warn(`Error fetching inventory alerts: ${e?.message}`);
      if (!isDemo) throw e;
      return { alerts: [], total: 0, isDemo: true, error: true };
    }
  }

  /**
   * Get sync logs
   * Demo mode: Returns REAL logs + DEMO logs merged
   * Production mode: Returns only real logs
   */
  async getSyncLogs(limit: number = 50, offset: number = 0): Promise<any> {
    const isDemo = await this.isDemoMode();
    let realLogs: any[] = [];
    let total = 0;
    
    try {
      const result = await withConnection(async (conn) => {
        const query = `
          SELECT 
            LOG_ID, ENTITY_TYPE, ENTITY_ID, BANNER_ID, SHOPIFY_ID, 
            ACTION_TYPE, STATUS, ERROR_MESSAGE, DURATION_MS, CREATED_AT,
            DBMS_LOB.SUBSTR(REQUEST_PAYLOAD, 200, 1) as REQ_PREVIEW,
            DBMS_LOB.SUBSTR(RESPONSE_PAYLOAD, 200, 1) as RES_PREVIEW
          FROM ATTR_MGR.SHOPIFY_SYNC_LOG
          ORDER BY CREATED_AT DESC
        `;

        let cnt = 0;
        try {
          const countResult = await conn.execute<any>(`SELECT COUNT(*) as TOTAL FROM ATTR_MGR.SHOPIFY_SYNC_LOG`, []);
          cnt = countResult.rows?.[0]?.[0] || 0;
        } catch (e) { /* Continue with 0 */ }

        const pagedQuery = `
          SELECT * FROM (
            SELECT a.*, ROWNUM rnum FROM (${query}) a WHERE ROWNUM <= :limit + :offset
          ) WHERE rnum > :offset
        `;

        let rows: any[] = [];
        try {
          const res = await conn.execute<any>(pagedQuery, { limit, offset }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
          rows = (res.rows || []).map((r: any) => ({ ...r, isDemo: false }));
        } catch (e) { /* Continue with empty */ }

        return { logs: rows, total: cnt };
      });
      realLogs = result.logs;
      total = result.total;
    } catch (e: any) {
      logger.warn(`Error fetching sync logs: ${e?.message}`);
      if (!isDemo) throw e;
    }

    // DEMO MODE: Merge real logs with demo logs
    if (isDemo) {
      const demoLogs = this.getDemoSyncLogs();
      const allLogs = [...realLogs, ...demoLogs];
      return { logs: allLogs, total: total + demoLogs.length, isDemo: true };
    }

    return { logs: realLogs, total, isDemo: false };
  }

  /**
   * Get log detail with full payloads
   * Demo mode: Returns mock detail for demo log IDs
   * Production mode: Returns real log or error
   */
  async getLogDetail(logId: number): Promise<any> {
    const isDemo = await this.isDemoMode();
    try {
      return await withConnection(async (conn) => {
        const result = await conn.execute<any>(
          `SELECT * FROM ATTR_MGR.SHOPIFY_SYNC_LOG WHERE LOG_ID = :logId`,
          { logId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows && result.rows.length > 0) {
          return { ...result.rows[0], isDemo: false };
        }

        // DEMO MODE ONLY: Mock detail for demo IDs
        if (isDemo && logId <= 3) {
          return {
            LOG_ID: logId,
            ENTITY_TYPE: logId % 2 === 0 ? 'ORDER' : 'PRODUCT',
            ENTITY_ID: 'DEMO-' + logId,
            STATUS: 'SUCCESS',
            CREATED_AT: new Date(),
            REQUEST_PAYLOAD: JSON.stringify({ demo: true, action: 'test', note: 'This is demo data' }),
            RESPONSE_PAYLOAD: JSON.stringify({ success: true, shopify_id: 'demo_12345' }),
            isDemo: true
          };
        }

        // PRODUCTION: Log not found
        return { notFound: true, logId };
      });
    } catch (e: any) {
      logger.warn(`Error fetching log detail ${logId}: ${e?.message}`);
      throw e;
    }
  }

  /**
   * Get Shopify hub configuration
   * Auto-creates SHOPIFY_CONFIG table if it doesn't exist
   */
  async getConfig(): Promise<any> {
    // Ensure table exists first
    const tableCreated = await this.ensureConfigTableExists();
    
    if (!tableCreated) {
      // Could not create table - return minimal config
      return { 
        config: [
          { CONFIG_KEY: 'USE_DEMO_FALLBACK', CONFIG_VALUE: 'Y', DESCRIPTION: 'Demo mode (table creation failed)', IS_SENSITIVE: 'N' }
        ], 
        isDemo: true, 
        tableExists: false,
        error: 'Could not create SHOPIFY_CONFIG table - check ATTR_MGR schema permissions'
      };
    }

    // Table exists, fetch config
    const isDemo = await this.isDemoMode();
    
    try {
      return await withConnection(async (conn) => {
        const result = await conn.execute<any>(
          `SELECT CONFIG_KEY, CONFIG_VALUE, DESCRIPTION, IS_SENSITIVE FROM ATTR_MGR.SHOPIFY_CONFIG ORDER BY CONFIG_KEY`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const rows = result.rows || [];
        return { config: rows, isDemo, tableExists: true };
      });
    } catch (error: any) {
      logger.warn(`Error fetching SHOPIFY_CONFIG: ${error?.message}`);
      return { config: [], isDemo: true, tableExists: true, error: error?.message };
    }
  }

  /**
   * Update Shopify configuration
   * Auto-creates table if missing, clears demo cache when USE_DEMO_FALLBACK changes
   */
  async updateConfig(key: string, value: string): Promise<void> {
    // Ensure table exists first
    const tableCreated = await this.ensureConfigTableExists();
    if (!tableCreated) {
      throw new Error('SHOPIFY_CONFIG table does not exist and could not be created');
    }

    try {
      await withConnection(async (conn) => {
        // Try UPDATE first
        const updateResult = await conn.execute(
          `UPDATE ATTR_MGR.SHOPIFY_CONFIG SET CONFIG_VALUE = :value, UPDATED_AT = CURRENT_TIMESTAMP WHERE CONFIG_KEY = :key`,
          { value, key }
        );
        
        // If no rows updated, INSERT
        if ((updateResult.rowsAffected || 0) === 0) {
          await conn.execute(
            `INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (CONFIG_KEY, CONFIG_VALUE, CREATED_AT, UPDATED_AT) VALUES (:key, :value, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            { key, value }
          );
        }
        
        await conn.commit();
        
        // Clear demo mode cache when demo fallback setting changes
        if (key === 'USE_DEMO_FALLBACK') {
          this.clearDemoModeCache();
          logger.info(`Demo mode ${value === 'Y' ? 'ENABLED' : 'DISABLED'} - cache cleared`);
        }
      });
    } catch (error: any) {
      logger.error(`Failed to update SHOPIFY_CONFIG[${key}]: ${error?.message}`);
      throw error; // Propagate error so UI knows it failed
    }
  }
  /**
   * AI-assisted category mapping
   */
  async autoMapCategory(businessUnitId: number, merchandiseNo: string): Promise<any> {
    return await withConnection(async (conn) => {
      // 1. Get category info
      const res = await conn.execute<any>(
        `SELECT DIVISIONDESC, GROUPDESC, DEPARTMENTDESC, CLASSDESC, SUBCLASSDESC FROM MV_MERCHANDISE_HIERARCHY WHERE MERCHANDISE_NO = :mno`,
        { merchandiseNo },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!res.rows || res.rows.length === 0) throw new Error('Category not found');
      
      const cat = res.rows[0];
      const path = `${cat.DIVISIONDESC} > ${cat.GROUPDESC} > ${cat.DEPARTMENTDESC} > ${cat.CLASSDESC} > ${cat.SUBCLASSDESC}`;

      // FOR DEMO: Simulate LLM call
      // In production, this would call LLMService with the hierarchy path and sample products
      const suggestions = [
        { type: 'Jackets & Coats', confidence: 0.95 },
        { type: 'Outerwear', confidence: 0.82 },
        { type: 'Apparel', confidence: 0.45 }
      ];

      const result = {
        shopifyProductType: suggestions[0].type,
        aiConfidence: suggestions[0].confidence * 100,
        alternatives: suggestions.map(s => s.type)
      };

      // 2. Save mapping as 'AI'
      await conn.execute(
        `MERGE INTO ATTR_MGR.SHOPIFY_HIERARCHY_MAP t
         USING (SELECT :bu as BU, :mno as MNO FROM DUAL) s
         ON (t.BUSINESS_UNIT_ID = s.BU AND t.MERCHANDISE_NO = s.MNO)
         WHEN MATCHED THEN UPDATE SET SHOPIFY_PRODUCT_TYPE = :type, MAPPED_BY = 'AI', AI_CONFIDENCE = :conf, AI_ALTERNATIVES = :alts, MODIFIED_DATE = CURRENT_TIMESTAMP
         WHEN NOT MATCHED THEN INSERT (BUSINESS_UNIT_ID, MERCHANDISE_NO, SHOPIFY_PRODUCT_TYPE, MAPPED_BY, AI_CONFIDENCE, AI_ALTERNATIVES, CREATED_DATE)
         VALUES (s.BU, s.MNO, :type, 'AI', :conf, :alts, CURRENT_TIMESTAMP)`,
        { 
          bu: businessUnitId, 
          mno: merchandiseNo, 
          type: result.shopifyProductType, 
          conf: result.aiConfidence,
          alts: JSON.stringify(result.alternatives)
        }
      );
      await conn.commit();

      return result;
    });
  }

  /**
   * Save manual hierarchy mapping
   */
  async saveManualMapping(businessUnitId: number, merchandiseNo: string, productType: string): Promise<void> {
    return await withConnection(async (conn) => {
      await conn.execute(
        `MERGE INTO ATTR_MGR.SHOPIFY_HIERARCHY_MAP t
         USING (SELECT :bu as BU, :mno as MNO FROM DUAL) s
         ON (t.BUSINESS_UNIT_ID = s.BU AND t.MERCHANDISE_NO = s.MNO)
         WHEN MATCHED THEN UPDATE SET SHOPIFY_PRODUCT_TYPE = :type, MAPPED_BY = 'MANUAL', MODIFIED_DATE = CURRENT_TIMESTAMP
         WHEN NOT MATCHED THEN INSERT (BUSINESS_UNIT_ID, MERCHANDISE_NO, SHOPIFY_PRODUCT_TYPE, MAPPED_BY, CREATED_DATE)
         VALUES (s.BU, s.MNO, :type, 'MANUAL', CURRENT_TIMESTAMP)`,
        { bu: businessUnitId, mno: merchandiseNo, type: productType }
      );
      await conn.commit();
    });
  }

  // ============================================================================
  // VISIONSUITE-STYLE PRODUCT PUBLISHING (Uses SHOPIFY_PRODUCT_SNAPSHOT like Attribute Manager)
  // ============================================================================

  /**
   * Get VisionSuite styles with their Shopify publish status per banner
   * Uses SHOPIFY_PRODUCT_SNAPSHOT (same as Attribute Manager) for product data
   * Enriches with Shopify status from BANNERS_JSON field
   */
  async getVisionSuiteStyles(params: {
    businessUnitId: number;
    deptId?: string;
    classId?: string;
    subclassId?: string;
    brandId?: string;
    search?: string;
    limit?: number;
    offset?: number;
    shopifyStatus?: string; // 'all', 'published', 'unpublished', 'pending', 'flagged'
    hasImages?: string; // 'all', 'yes', 'no'
  }): Promise<{ styles: any[], total: number, banners: string[] }> {
    // Use the same pattern as ProductsService - get tenant from settings
    const tenantContext = TenantContextService.getInstance();
    const tenantId = tenantContext.getActiveTenantId();
    const buId = params.businessUnitId;
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    // For demo: Only show Jesta Demo store
    const activeBanners = ['JESTA'];

    return await withConnection(async (conn) => {
      // Build conditions (same pattern as ProductsService)
      const binds: any = { tenant: tenantId, buId };
      const conds = [`TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :buId`];

      if (params.deptId) {
        const depts = params.deptId.split(',');
        conds.push(`DEPARTMENT_ID IN (${depts.map((_, i) => `:d${i}`).join(',')})`);
        depts.forEach((d, i) => binds[`d${i}`] = d);
      }
      if (params.classId) {
        const classes = params.classId.split(',');
        conds.push(`CLASS_ID IN (${classes.map((_, i) => `:c${i}`).join(',')})`);
        classes.forEach((c, i) => binds[`c${i}`] = c);
      }
      if (params.subclassId) {
        const subs = params.subclassId.split(',');
        conds.push(`SUB_CLASS_ID IN (${subs.map((_, i) => `:sc${i}`).join(',')})`);
        subs.forEach((sc, i) => binds[`sc${i}`] = sc);
      }
      if (params.brandId) {
        const brands = params.brandId.split(',');
        conds.push(`BRAND_NAME IN (${brands.map((_, i) => `:br${i}`).join(',')})`);
        brands.forEach((b, i) => binds[`br${i}`] = b);
      }
      if (params.search) {
        conds.push(`(STYLE_ID LIKE :search OR DESCRIPTION LIKE :search)`);
        binds.search = `%${params.search}%`;
      }
      // Has images filter (same as ProductsService)
      if (params.hasImages === 'yes') {
        conds.push(`HAS_IMAGE_IND = 'Y'`);
      } else if (params.hasImages === 'no') {
        conds.push(`HAS_IMAGE_IND = 'N'`);
      }

      const whereClause = conds.join(' AND ');

      // Get total count
      const totalRes = await conn.execute<any>(
        `SELECT COUNT(DISTINCT STYLE_ID) as TOTAL FROM SHOPIFY_PRODUCT_SNAPSHOT WHERE ${whereClause}`,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const total = totalRes.rows?.[0]?.TOTAL || 0;

      // Get products from SHOPIFY_PRODUCT_SNAPSHOT (same table as Attribute Manager)
      // Use SELECT * like ProductsService does - column names vary per environment
      const productsRes = await conn.execute<any>(
        `SELECT * FROM SHOPIFY_PRODUCT_SNAPSHOT 
         WHERE ${whereClause}
         ORDER BY DATE_CREATED DESC
         OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY`,
        { ...binds, off: offset, lim: limit },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      // Transform products with Shopify status from BANNERS_JSON
      // Use same field mapping pattern as ProductsService
      const styles = (productsRes.rows || []).map((row: any) => {
        // Parse image URLs (same as ProductsService)
        let imageUrl = null;
        let media: any[] = [];
        try {
          if (row.IMAGE_URLS_JSON) {
            media = typeof row.IMAGE_URLS_JSON === 'string' ? JSON.parse(row.IMAGE_URLS_JSON) : row.IMAGE_URLS_JSON;
            const primary = media.find((m: any) => m.type === 'PRIMARY') || media[0];
            imageUrl = primary?.url;
          }
        } catch (e) {}

        // Parse banners to get Shopify status
        let banners: any[] = [];
        try {
          if (row.BANNERS_JSON) {
            banners = typeof row.BANNERS_JSON === 'string' ? JSON.parse(row.BANNERS_JSON) : row.BANNERS_JSON;
          }
        } catch (e) {}

        // Build banner statuses
        const bannerStatuses: Record<string, any> = {};
        for (const bannerId of activeBanners) {
          const bannerInfo = banners.find((b: any) => b.id === bannerId);
          bannerStatuses[bannerId] = {
            flagged: !!bannerInfo,
            pending: bannerInfo?.status === 'pending',
            shopifyId: bannerInfo?.shopify_id || null,
            status: bannerInfo?.shopify_id ? 'published' : (bannerInfo?.status === 'pending' ? 'pending' : (bannerInfo ? 'flagged' : 'unpublished'))
          };
        }

        return {
          // Same field mapping as ProductsService.getProducts()
          styleId: row.STYLE_ID,
          styleName: row.SHORT_DESCRIPTION || row.DESCRIPTION || 'Untitled Style',
          brandName: row.BRAND_NAME || null,
          deptName: row.DEPT_NAME || 'Unknown Dept',
          className: row.CLASS_NAME || 'Unknown Class',
          subclassName: row.SUB_CLASS_NAME || 'Unknown Subclass', // May not exist in all envs
          imageUrl,
          media,
          hasImage: row.HAS_IMAGE_IND === 'Y',
          colorCount: media.length || 0, // Approximate from media array
          skuCount: row.SKU_COUNT || row.VARIANT_COUNT || 0, // If available in cache
          bannerStatuses
        };
      });

      // Filter by Shopify status if specified
      let filteredStyles = styles;
      if (params.shopifyStatus && params.shopifyStatus !== 'all') {
        filteredStyles = styles.filter((s: any) => {
          const statuses = Object.values(s.bannerStatuses) as any[];
          if (params.shopifyStatus === 'published') {
            return statuses.some(st => st.status === 'published');
          } else if (params.shopifyStatus === 'pending') {
            return statuses.some(st => st.status === 'pending');
          } else if (params.shopifyStatus === 'flagged') {
            return statuses.some(st => st.status === 'flagged' && st.status !== 'published');
          } else if (params.shopifyStatus === 'unpublished') {
            return statuses.every(st => st.status === 'unpublished');
          }
          return true;
        });
      }

      return { styles: filteredStyles, total, banners: activeBanners };
    });
  }

  /**
   * Publish styles to Shopify using VisionSuite SSOT approach
   * This updates SHOPIFY_PUBLICATION_QUEUE table, which triggers the VisionSuite flow:
   * SHOPIFY_PUBLICATION_QUEUE → EXT_PRODUCTS → EXT_PRODUCTS_ACTIVITY → Scheduled Job → Shopify API
   */
  async publishViaStyleCharacteristics(params: {
    businessUnitId: number;
    styleIds: string[];
    bannerId: string; // 'JDWEB', 'SZWEB', 'LSWEB', 'PLWEB'
    publish: boolean; // true = set to 'Y', false = set to 'N'
  }): Promise<{ success: number; failed: number; errors: string[] }> {
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    await withConnection(async (conn) => {
      for (const styleId of params.styleIds) {
        try {
          // MERGE into SHOPIFY_PUBLICATION_QUEUE - this is exactly what Vision Merchandising does
          await conn.execute(
            `MERGE INTO SHOPIFY_PUBLICATION_QUEUE target
             USING (SELECT :bu as BU, :style as STYLE, :banner as CHR_TYPE FROM DUAL) source
             ON (target.BUSINESS_UNIT_ID = source.BU AND target.STYLE_ID = source.STYLE AND target.CHARACTERISTIC_TYPE_ID = source.CHR_TYPE)
             WHEN MATCHED THEN UPDATE SET CHARACTERISTIC_VALUE_ID = :val, MODIFIED_DATE = CURRENT_TIMESTAMP, MODIFIED_BY = 'FARSIGHTIQ'
             WHEN NOT MATCHED THEN INSERT (BUSINESS_UNIT_ID, STYLE_ID, CHARACTERISTIC_TYPE_ID, CHARACTERISTIC_VALUE_ID, CREATED_DATE, CREATED_BY)
                                   VALUES (source.BU, source.STYLE, source.CHR_TYPE, :val, CURRENT_TIMESTAMP, 'FARSIGHTIQ')`,
            { 
              bu: params.businessUnitId, 
              style: styleId, 
              banner: params.bannerId, 
              val: params.publish ? 'Y' : 'N' 
            }
          );
          success++;
          logger.info(`[SSOT] ${params.publish ? 'Flagged' : 'Unflagged'} style ${styleId} for ${params.bannerId}`);
        } catch (err: any) {
          failed++;
          errors.push(`${styleId}: ${err?.message || 'Unknown error'}`);
          logger.error(`[SSOT] Failed to flag style ${styleId} for ${params.bannerId}: ${err?.message}`);
        }
      }

      // Commit all changes
      await conn.commit();
      
      // Log the batch action
      try {
        await conn.execute(
          `INSERT INTO ATTR_MGR.SHOPIFY_SYNC_LOG (ENTITY_TYPE, ENTITY_ID, BANNER_ID, ACTION_TYPE, STATUS, DETAILS, CREATED_AT)
           VALUES ('BATCH', :batch, :banner, :action, 'QUEUED', :details, CURRENT_TIMESTAMP)`,
          { 
            batch: `BATCH-${Date.now()}`,
            banner: params.bannerId,
            action: params.publish ? 'BULK_PUBLISH' : 'BULK_UNPUBLISH',
            details: JSON.stringify({ count: success, failed, styles: params.styleIds.slice(0, 10) })
          }
        );
        await conn.commit();
      } catch (logErr: any) {
        logger.warn(`Failed to log batch action: ${logErr?.message || logErr}`);
      }
    });

    return { success, failed, errors };
  }

  /**
   * Direct publish to Shopify - creates products immediately
   * Gets product data from SHOPIFY_PRODUCT_SNAPSHOT and pushes to Shopify API
   */
  async publishDirectToShopify(params: {
    businessUnitId: number;
    styleIds: string[];
    bannerId: string;
  }): Promise<{ success: number; failed: number; errors: string[]; publishedProducts: Array<{ styleId: string; shopifyId: string; handle: string }> }> {
    const { ShopifyActionsService } = await import('./shopify-actions.service.js');
    const actionsService = new ShopifyActionsService();
    
    const errors: string[] = [];
    const publishedProducts: Array<{ styleId: string; shopifyId: string; handle: string }> = [];
    let success = 0;
    let failed = 0;

    // Map bannerId to actual Shopify store (JESTA is the demo store)
    const storeMap: Record<string, string> = {
      'JESTA': 'JESTA',
      'JDWEB': 'JDWEB',
      'SZWEB': 'SZWEB', 
      'LSWEB': 'LSWEB'
    };
    const targetBanner = storeMap[params.bannerId] || 'JESTA';

    // Get settings
    const tenantContext = TenantContextService.getInstance();
    const tenantId = tenantContext.getActiveTenantId();

    for (const styleId of params.styleIds) {
      try {
        // Get product data from SHOPIFY_PRODUCT_SNAPSHOT (using SELECT * to handle varying columns)
        const productData = await withConnection(async (conn) => {
          const result = await conn.execute<any>(
            `SELECT * FROM SHOPIFY_PRODUCT_SNAPSHOT 
             WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :bu AND STYLE_ID = :styleId`,
            { tenant: tenantId, bu: params.businessUnitId, styleId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          return result.rows?.[0] as any;
        });

        if (!productData) {
          errors.push(`${styleId}: Product not found in catalog`);
          failed++;
          continue;
        }

        // Parse images - keep track of local URLs for later upload
        let localImageUrls: string[] = [];
        let externalImageUrls: string[] = [];
        try {
          if (productData.IMAGE_URLS_JSON) {
            const media = typeof productData.IMAGE_URLS_JSON === 'string' 
              ? JSON.parse(productData.IMAGE_URLS_JSON) 
              : productData.IMAGE_URLS_JSON;
            media.forEach((m: any) => {
              if (m.url) {
                if (m.url.startsWith('/api/')) {
                  localImageUrls.push(m.url);
                } else if (m.url.startsWith('http')) {
                  externalImageUrls.push(m.url);
                }
              }
            });
          }
        } catch (e) {}

        // Get price from available columns (RETAIL_PRICE, PRICE, or default)
        const price = String(productData.RETAIL_PRICE || productData.PRICE || productData.UNIT_PRICE || '99.99');

        // Step A: Query ALL color×size×dimension variants from Oracle
        const variantRows = await withConnection(async (conn) => {
          const res = await conn.execute<any>(
            `SELECT DISTINCT
               bc.COLOR_ID, c.DESCRIPTION AS COLOR_DESC,
               bc.SIZE_ID, bc.DIMENSION_ID,
               bc.BAR_CODE_ID AS BARCODE_ID
             FROM MERCH.BAR_CODES bc
             JOIN MERCH.STYLE_COLORS sc ON sc.BUSINESS_UNIT_ID = bc.BUSINESS_UNIT_ID AND sc.STYLE_ID = bc.STYLE_ID AND sc.COLOR_ID = bc.COLOR_ID
             JOIN MERCH.COLORS c ON c.BUSINESS_UNIT_ID = bc.BUSINESS_UNIT_ID AND c.COLOR_ID = bc.COLOR_ID
             WHERE bc.BUSINESS_UNIT_ID = :bu AND bc.STYLE_ID = :styleId
               AND bc.SUB_TYPE = 'UPCA'
             ORDER BY bc.COLOR_ID, bc.SIZE_ID, bc.DIMENSION_ID`,
            { bu: params.businessUnitId, styleId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          return (res.rows || []) as Array<{ COLOR_ID: string; COLOR_DESC: string; SIZE_ID: string; DIMENSION_ID: string | null; BARCODE_ID: string }>;
        });

        // Fallback: if no UPCA barcodes, try any SUB_TYPE
        let variants = variantRows;
        if (variants.length === 0) {
          variants = await withConnection(async (conn) => {
            const res = await conn.execute<any>(
              `SELECT DISTINCT
                 bc.COLOR_ID, c.DESCRIPTION AS COLOR_DESC,
                 bc.SIZE_ID, bc.DIMENSION_ID,
                 bc.BAR_CODE_ID AS BARCODE_ID
               FROM MERCH.BAR_CODES bc
               JOIN MERCH.STYLE_COLORS sc ON sc.BUSINESS_UNIT_ID = bc.BUSINESS_UNIT_ID AND sc.STYLE_ID = bc.STYLE_ID AND sc.COLOR_ID = bc.COLOR_ID
               JOIN MERCH.COLORS c ON c.BUSINESS_UNIT_ID = bc.BUSINESS_UNIT_ID AND c.COLOR_ID = bc.COLOR_ID
               WHERE bc.BUSINESS_UNIT_ID = :bu AND bc.STYLE_ID = :styleId
               ORDER BY bc.COLOR_ID, bc.SIZE_ID, bc.DIMENSION_ID`,
              { bu: params.businessUnitId, styleId },
              { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            return (res.rows || []) as Array<{ COLOR_ID: string; COLOR_DESC: string; SIZE_ID: string; DIMENSION_ID: string | null; BARCODE_ID: string }>;
          });
          if (variants.length === 0) {
            errors.push(`${styleId}: No barcode variants found in MERCH.BAR_CODES`);
            failed++;
            continue;
          }
          logger.warn(`[Shopify] ${styleId}: No UPCA barcodes, using fallback SUB_TYPE (${variants.length} variants)`);
        }

        // Shopify hard limit: 100 variants per product
        if (variants.length > 100) {
          logger.warn(`[Shopify] ${styleId}: ${variants.length} variants exceeds Shopify limit of 100 — truncating`);
          variants = variants.slice(0, 100);
        }

        // Step B: Determine options — include Dimension only if any variant uses it
        const hasDimension = variants.some(v => v.DIMENSION_ID != null);
        const productOptions: Array<{ name: string; values: string[] }> = [
          { name: 'Color', values: [...new Set(variants.map(v => v.COLOR_DESC || v.COLOR_ID))] },
          { name: 'Size', values: [...new Set(variants.map(v => v.SIZE_ID))] },
        ];
        if (hasDimension) {
          productOptions.push({ name: 'Dimension', values: [...new Set(variants.filter(v => v.DIMENSION_ID).map(v => v.DIMENSION_ID!))] });
        }

        // Step C: Build Shopify variant array
        const shopifyVariants = variants.map(v => ({
          sku: v.BARCODE_ID,
          price,
          inventoryQuantity: 100,
          option1: v.COLOR_DESC || v.COLOR_ID,
          option2: v.SIZE_ID,
          ...(hasDimension ? { option3: v.DIMENSION_ID || 'N/A' } : {}),
        }));

        // Create product in Shopify with full variants
        const shopifyResult = await actionsService.createProduct(targetBanner, {
          styleId,
          title: productData.SHORT_DESCRIPTION || productData.DESCRIPTION || styleId,
          description: `<p>${productData.DESCRIPTION || ''}</p><p>Brand: ${productData.BRAND_NAME || 'N/A'}</p><p>Category: ${productData.DEPT_NAME} > ${productData.CLASS_NAME}</p>`,
          vendor: productData.BRAND_NAME || 'Unknown',
          productType: `${productData.DEPT_NAME} - ${productData.CLASS_NAME}`,
          tags: [productData.DEPT_NAME, productData.CLASS_NAME, productData.BRAND_NAME, 'FarsightIQ', styleId].filter(Boolean) as string[],
          options: productOptions,
          variants: shopifyVariants,
          // Only include external URLs directly - local ones need staged upload
          images: externalImageUrls.length > 0 ? externalImageUrls.map(url => ({ url })) : undefined
        });

        if (shopifyResult.success && shopifyResult.productId) {
          // Upload local images via staged upload
          if (localImageUrls.length > 0) {
            logger.info(`[Shopify] Uploading ${localImageUrls.length} local images for ${styleId}...`);
            for (const localUrl of localImageUrls) {
              try {
                // Fetch image from our local API
                const imageName = localUrl.replace('/api/images/', '');
                const backendUrl = process.env.BACKEND_BASE_URL || `http://localhost:${config.port}`;
                const imageRes = await fetch(`${backendUrl}/api/images/${encodeURIComponent(imageName)}`);
                if (imageRes.ok) {
                  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
                  const mimeType = imageRes.headers.get('content-type') || 'image/jpeg';
                  
                  // Upload to Shopify using staged upload
                  await actionsService.uploadImage(targetBanner, shopifyResult.productId, {
                    buffer: imageBuffer,
                    filename: imageName,
                    mimeType,
                    altText: productData.DESCRIPTION || styleId
                  });
                  logger.info(`[Shopify] Uploaded image ${imageName} for ${styleId}`);
                }
              } catch (imgErr: any) {
                logger.warn(`[Shopify] Failed to upload image for ${styleId}: ${imgErr?.message}`);
              }
            }
          }
          success++;
          publishedProducts.push({
            styleId,
            shopifyId: shopifyResult.productId,
            handle: shopifyResult.handle || styleId.toLowerCase()
          });
          logger.info(`[Shopify] Published ${styleId} → ${shopifyResult.productId}`);

          // ⭐ CRITICAL: Store Shopify ID mapping for order processing
          // VisionSuite's PK_INTFS_SHOPIFY.insert_stg_order_details looks up products via:
          // SELECT * FROM merch_ext_product_variants WHERE shopify_product_id = X AND variant_id = Y
          // FK constraints require: EXT_PRODUCTS entry first, then EXT_PRODUCT_VARIANTS with valid STYLE_COLORS ref
          try {
            const shopifyProductIdNum = shopifyResult.productId ? parseInt(shopifyResult.productId) : null;
            // Shopify returns variants in same order as input
            const returnedVariants = (shopifyResult as any).variants || [];
            const returnedVariantIds = shopifyResult.variantIds || [];

            await withConnection(async (conn) => {
              // Step 1: Create EXT_PRODUCTS entry first (required FK for EXT_PRODUCT_VARIANTS)
              await conn.execute(
                `MERGE INTO MERCH.EXT_PRODUCTS target
                 USING (SELECT :bu as BU, :style as STYLE, :banner as BANNER FROM DUAL) source
                 ON (target.BUSINESS_UNIT_ID = source.BU AND target.STYLE_ID = source.STYLE AND target.BANNER_ID = source.BANNER)
                 WHEN MATCHED THEN
                   UPDATE SET SHOPIFY_PRODUCT_ID = :shopifyProductId, MODIFIED_DATE = CURRENT_TIMESTAMP, MODIFIED_BY = 'ATTR_MGR'
                 WHEN NOT MATCHED THEN
                   INSERT (BUSINESS_UNIT_ID, STYLE_ID, BANNER_ID, SHOPIFY_PRODUCT_ID, TAGS, DESCRIPTION, PRODUCT_TYPE, VENDOR_NAME, CREATED_BY, CREATED_DATE)
                   VALUES (source.BU, source.STYLE, source.BANNER, :shopifyProductId, 'FarsightIQ', :p_desc, :prodType, :vendor, 'ATTR_MGR', CURRENT_TIMESTAMP)`,
                {
                  bu: params.businessUnitId,
                  style: styleId,
                  banner: params.bannerId,
                  shopifyProductId: shopifyProductIdNum,
                  p_desc: productData.DESCRIPTION || styleId,
                  prodType: productData.DEPT_NAME || 'General',
                  vendor: productData.BRAND_NAME || 'Unknown'
                }
              );

              // Step 2: Map each returned Shopify variant back to Oracle variant data
              for (let i = 0; i < variants.length; i++) {
                const oracleVariant = variants[i];
                const shopifyVariantId = returnedVariantIds[i] || returnedVariants[i]?.id || null;
                const inventoryItemId = returnedVariants[i]?.inventory_item_id || null;
                const variantIdNum = shopifyVariantId ? parseInt(String(shopifyVariantId)) : null;

                await conn.execute(
                  `MERGE INTO MERCH.EXT_PRODUCT_VARIANTS target
                   USING (SELECT :bu as BU, :style as STYLE, :banner as BANNER, :color as COLOR, :p_size as SIZEID, :dim as DIMID FROM DUAL) source
                   ON (target.BUSINESS_UNIT_ID = source.BU AND target.STYLE_ID = source.STYLE AND target.BANNER_ID = source.BANNER
                       AND target.COLOR_ID = source.COLOR AND target.SIZE_ID = source.SIZEID
                       AND NVL(target.DIMENSION_ID, '~') = NVL(source.DIMID, '~'))
                   WHEN MATCHED THEN
                     UPDATE SET SHOPIFY_PRODUCT_ID = :shopifyProductId, VARIANT_ID = :variantId,
                                INVENTORY_ITEM_ID = :invItemId,
                                MODIFIED_DATE = CURRENT_TIMESTAMP, MODIFIED_BY = 'ATTR_MGR'
                   WHEN NOT MATCHED THEN
                     INSERT (BUSINESS_UNIT_ID, STYLE_ID, BANNER_ID, COLOR_ID, SIZE_ID, DIMENSION_ID, COLOR_DESC,
                             BARCODE_ID, SUB_TYPE, SKU_ID, COST, COMPARE_PRICE, PRICE, TAXABLE,
                             SHOPIFY_PRODUCT_ID, VARIANT_ID, INVENTORY_ITEM_ID, CREATED_BY, CREATED_DATE)
                     VALUES (source.BU, source.STYLE, source.BANNER, source.COLOR, source.SIZEID, source.DIMID, :colorDesc,
                             :barcode, 'UPCA', :barcode, 0, 0, :price, 'Y',
                             :shopifyProductId, :variantId, :invItemId, 'ATTR_MGR', CURRENT_TIMESTAMP)`,
                  {
                    bu: params.businessUnitId,
                    style: styleId,
                    banner: params.bannerId,
                    color: oracleVariant.COLOR_ID,
                    p_size: oracleVariant.SIZE_ID,
                    dim: oracleVariant.DIMENSION_ID || null,
                    colorDesc: oracleVariant.COLOR_DESC || oracleVariant.COLOR_ID,
                    barcode: oracleVariant.BARCODE_ID,
                    price: parseFloat(price) || 0,
                    shopifyProductId: shopifyProductIdNum,
                    variantId: variantIdNum,
                    invItemId: inventoryItemId ? parseInt(String(inventoryItemId)) : null
                  }
                );
              }

              await conn.commit();
              logger.info(`[Shopify] Stored ${variants.length} variant mappings for ${styleId} → Shopify ${shopifyProductIdNum}`);
            });
          } catch (mappingErr: any) {
            // CRITICAL: Mapping failure means orders won't process! Report this clearly.
            const mappingError = `MAPPING FAILED: ${mappingErr?.message || 'Unknown error'}`;
            logger.error(`[Shopify] ⚠️ ${styleId}: ${mappingError}`);
            errors.push(`${styleId}: Product created in Shopify (${shopifyResult.productId}) but ${mappingError}. Orders for this product will fail until mapping is fixed.`);
            // Still count as success since Shopify product was created, but error is reported
          }

          // Log to sync table
          try {
            await withConnection(async (conn) => {
              await conn.execute(
                `INSERT INTO SHOPIFY_SYNC_LOG (ENTITY_TYPE, ENTITY_ID, BANNER_ID, ACTION_TYPE, STATUS, DETAILS, CREATED_AT)
                 VALUES ('PRODUCT', :styleId, :banner, 'CREATE', 'SUCCESS', :details, CURRENT_TIMESTAMP)`,
                { styleId, banner: targetBanner, details: JSON.stringify({ shopifyId: shopifyResult.productId, variantIds: shopifyResult.variantIds }) }
              );
              await conn.commit();
            });
          } catch (logErr) { /* ignore logging errors */ }
        } else {
          failed++;
          errors.push(`${styleId}: ${shopifyResult.message || 'Unknown Shopify error'}`);
        }
      } catch (err: any) {
        failed++;
        errors.push(`${styleId}: ${err?.message || 'Unknown error'}`);
        logger.error(`[Shopify] Failed to publish ${styleId}: ${err?.message}`);
      }
    }

    return { success, failed, errors, publishedProducts };
  }

  /**
   * Get available banners (Shopify stores) for publishing
   * Simplified for demo - returns only the Jesta Demo store
   */
  async getAvailableBanners(businessUnitId: number): Promise<any[]> {
    // For demo: Only return the Jesta Demo store
    return [
      { 
        bannerId: 'JESTA', 
        bannerName: 'Jesta Demo Store', 
        storeUrl: 'https://jesta-demo.myshopify.com', 
        isActive: true, 
        publishedCount: 0, 
        pendingCount: 0 
      }
    ];
  }

  /**
   * Get pending activity count (styles waiting to be synced)
   */
  async getPendingActivityCount(businessUnitId: number, bannerId?: string): Promise<number> {
    return await withConnection(async (conn) => {
      let query = `SELECT COUNT(*) as CNT FROM MERCH.EXT_PRODUCTS_ACTIVITY WHERE STATUS = 'N' AND BUSINESS_UNIT_ID = :bu`;
      const binds: any = { bu: businessUnitId };
      
      if (bannerId) {
        query += ` AND BANNER_ID = :banner`;
        binds.banner = bannerId;
      }

      const result = await conn.execute<any>(query, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return result.rows?.[0]?.CNT || 0;
    });
  }

  /**
   * Phase 1: Get comprehensive store health from VisionSuite SSOT
   * Data sources:
   *  - OMNI.PROVIDER_SERVICES (store config + health indicators)
   *  - OMNI.PROVIDER_SERVICE_RESPONSES (API rate limit tracking)
   *  - OMNI.V_ECOMM_ORDERS (recent order count)
   *  - Shopify API (live connection test)
   * 
   * @param bannerId - Banner ID (e.g., 'DEMO', 'JESTA', 'JDWEB')
   * @returns StoreHealth object with overall health score (0-100), connection status, API health, and recent activity
   */
  async getStoreHealth(bannerId: string): Promise<{
    bannerId: string;
    overallHealth: 'excellent' | 'good' | 'warning' | 'critical';
    overallHealthScore: number;
    connection: {
      isActive: boolean;
      isInstalled: boolean;
      isPingable: boolean;
      lastUpdated: Date | null;
      shopifyApiTest: { success: boolean; message: string; details?: any };
    };
    apiHealth: {
      currentRate: number;
      maxRate: number;
      percentage: number;
      status: 'healthy' | 'warning' | 'critical';
    };
    syncConfig: {
      intervalMinutes: number | null;
      apiVersion: string | null;
    };
    recentActivity: {
      ordersLast7Days: number;
      lastOrderDate: Date | null;
    };
    checks: Record<string, boolean>;
  }> {
    return withConnection(async (conn) => {
      // 1. Get provider service configuration from VisionSuite SSOT
      logger.info(`[HEALTH] Querying PROVIDER_SERVICES for banner: ${bannerId}`);
      
      const configResult = await conn.execute<any>(
        `SELECT 
          PROVIDER_ID,
          SERVICE_ID,
          WEB_SITE_URL,
          ACTIVE_IND,
          INSTALLED_IND,
          PINGABLE_IND,
          TELNET_IND,
          WEBCHECK_IND,
          VERSION_NUMBER,
          INTERVAL as SYNC_INTERVAL,
          MODIFIED_DATE as LAST_UPDATED
        FROM OMNI.PROVIDER_SERVICES
        WHERE (PROVIDER_ID LIKE 'SHOPIFY%')
          AND (SERVICE_ID LIKE '%' || :banner || '%' OR :banner = 'DEMO')
        ORDER BY PROVIDER_ID
        FETCH FIRST 1 ROWS ONLY`,
        { banner: bannerId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      // Default config if no provider service found
      const config = configResult.rows?.[0] || {
        PROVIDER_ID: null,
        SERVICE_ID: null,
        WEB_SITE_URL: null,
        ACTIVE_IND: 'N',
        INSTALLED_IND: 'N',
        PINGABLE_IND: 'N',
        TELNET_IND: 'N',
        WEBCHECK_IND: 'N',
        VERSION_NUMBER: null,
        SYNC_INTERVAL: null,
        LAST_UPDATED: null
      };

      logger.info(`[HEALTH] Provider service found: ${config.PROVIDER_ID || 'NONE'}`);

      // 2. Get API rate limit from VisionSuite SSOT (PROVIDER_SERVICE_RESPONSES)
      logger.info(`[HEALTH] Checking API rate limit from PROVIDER_SERVICE_RESPONSES`);
      
      const rateLimitResult = await conn.execute<any>(
        `SELECT COUNT(*) as CALL_COUNT
         FROM OMNI.PROVIDER_SERVICE_RESPONSES
         WHERE SERVICE_ID LIKE '%SHOPIFY%'
           AND RESPONSE_DATE >= SYSTIMESTAMP - INTERVAL '1' MINUTE`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const callsLastMinute = rateLimitResult.rows?.[0]?.CALL_COUNT || 0;
      const maxCallsPerMinute = 500; // Shopify standard rate limit: 500 calls/min
      const rateLimitPercentage = (callsLastMinute / maxCallsPerMinute) * 100;

      logger.info(`[HEALTH] API calls in last minute: ${callsLastMinute}/${maxCallsPerMinute} (${Math.round(rateLimitPercentage)}%)`);

      // 3. Get recent order count from VisionSuite SSOT (V_ECOMM_ORDERS)
      logger.info(`[HEALTH] Querying V_ECOMM_ORDERS for recent orders`);
      
      const orderResult = await conn.execute<any>(
        `SELECT 
          COUNT(*) as TOTAL_ORDERS,
          MAX(ORDER_DATE) as LAST_ORDER_DATE
         FROM OMNI.V_ECOMM_ORDERS
         WHERE ORDER_ORIGIN = :banner
           AND ORDER_DATE >= SYSDATE - 7`,
        { banner: bannerId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const orderStats = orderResult.rows?.[0] || { TOTAL_ORDERS: 0, LAST_ORDER_DATE: null };
      
      logger.info(`[HEALTH] Orders (last 7 days): ${orderStats.TOTAL_ORDERS}, Last order: ${orderStats.LAST_ORDER_DATE || 'None'}`);

      // 4. Test live connection to Shopify API
      logger.info(`[HEALTH] Testing live Shopify API connection`);
      
      let shopifyConnectionTest: any = { success: false, message: 'Not tested' };
      try {
        shopifyConnectionTest = await this.testConnection(bannerId);
        logger.info(`[HEALTH] Shopify API test: ${shopifyConnectionTest.success ? 'SUCCESS' : 'FAILED'} - ${shopifyConnectionTest.message}`);
      } catch (e: any) {
        shopifyConnectionTest = { success: false, message: e.message };
        logger.error(`[HEALTH] Shopify API test error: ${e.message}`);
      }

      // 5. Calculate overall health score (0-100) based on all checks
      const healthChecks = {
        isActive: config.ACTIVE_IND === 'Y',
        isInstalled: config.INSTALLED_IND === 'Y',
        isPingable: config.PINGABLE_IND === 'Y',
        isTelnetable: config.TELNET_IND === 'Y',
        isWebCheckable: config.WEBCHECK_IND === 'Y',
        shopifyConnects: shopifyConnectionTest.success,
        rateLimitHealthy: rateLimitPercentage < 80 // Healthy if under 80% of rate limit
      };

      const passedChecks = Object.values(healthChecks).filter(v => v).length;
      const totalChecks = Object.keys(healthChecks).length;
      const overallHealthScore = Math.round((passedChecks / totalChecks) * 100);

      // 6. Determine overall health status based on score
      let overallHealth: 'excellent' | 'good' | 'warning' | 'critical';
      if (overallHealthScore >= 90) overallHealth = 'excellent';
      else if (overallHealthScore >= 70) overallHealth = 'good';
      else if (overallHealthScore >= 50) overallHealth = 'warning';
      else overallHealth = 'critical';

      logger.info(`[HEALTH] Overall health: ${overallHealth} (${overallHealthScore}/100) - ${passedChecks}/${totalChecks} checks passed`);

      // Determine API health status
      let apiHealthStatus: 'healthy' | 'warning' | 'critical';
      if (rateLimitPercentage < 50) apiHealthStatus = 'healthy';
      else if (rateLimitPercentage < 80) apiHealthStatus = 'warning';
      else apiHealthStatus = 'critical';

      return {
        bannerId,
        overallHealth,
        overallHealthScore,
        connection: {
          isActive: config.ACTIVE_IND === 'Y',
          isInstalled: config.INSTALLED_IND === 'Y',
          isPingable: config.PINGABLE_IND === 'Y',
          lastUpdated: config.LAST_UPDATED,
          shopifyApiTest: shopifyConnectionTest
        },
        apiHealth: {
          currentRate: callsLastMinute,
          maxRate: maxCallsPerMinute,
          percentage: Math.round(rateLimitPercentage),
          status: apiHealthStatus
        },
        syncConfig: {
          intervalMinutes: config.SYNC_INTERVAL,
          apiVersion: config.VERSION_NUMBER
        },
        recentActivity: {
          ordersLast7Days: orderStats.TOTAL_ORDERS,
          lastOrderDate: orderStats.LAST_ORDER_DATE
        },
        checks: healthChecks
      };
    });
  }

  /**
   * Phase 2: Get sync history from VisionSuite SSOT (PROVIDER_SERVICE_RESPONSES)
   * Returns API call history for debugging and monitoring
   * 
   * @param params - Filter parameters
   * @returns Sync history with stats
   */
  async getSyncHistory(params: {
    bannerId?: string;
    statusCode?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
  }): Promise<{
    logs: Array<any>;
    total: number;
    stats: {
      successCount: number;
      errorCount: number;
      successRate: number;
    };
  }> {
    return withConnection(async (conn) => {
      const limit = params.limit || 100;
      const binds: any = { limit };

      // Build WHERE clause dynamically
      let whereClause = "WHERE SERVICE_ID LIKE '%SHOPIFY%'";

      if (params.bannerId) {
        whereClause += " AND SERVICE_ID LIKE '%' || :bannerId || '%'";
        binds.bannerId = params.bannerId;
      }

      if (params.statusCode) {
        whereClause += " AND STATUS_CODE = :statusCode";
        binds.statusCode = params.statusCode;
      }

      if (params.dateFrom) {
        whereClause += " AND RESPONSE_DATE >= :dateFrom";
        binds.dateFrom = params.dateFrom;
      }

      if (params.dateTo) {
        whereClause += " AND RESPONSE_DATE <= :dateTo";
        binds.dateTo = params.dateTo;
      }

      logger.info(`[SYNC_HISTORY] Querying logs with filters: bannerId=${params.bannerId}, status=${params.statusCode}, from=${params.dateFrom}, to=${params.dateTo}`);

      // Get logs
      const logsResult = await conn.execute<any>(
        `SELECT 
          PROVIDER_RESPONSE_ID as "logId",
          RESPONSE_DATE as "timestamp",
          SERVICE_ID as "service",
          STATUS_CODE as "status",
          STATUS_DESCRIPTION as "message",
          ERROR_CODE as "errorCode",
          DBMS_LOB.SUBSTR(REQUEST, 500) as "requestPreview",
          DBMS_LOB.SUBSTR(RESPONSE, 500) as "responsePreview",
          WFE_TRANS_ID as "transactionId",
          SERVICE_TYPE as "type"
        FROM OMNI.PROVIDER_SERVICE_RESPONSES
        ${whereClause}
        ORDER BY RESPONSE_DATE DESC
        FETCH FIRST :limit ROWS ONLY`,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      // Get stats (total count, success count, error count)
      const statsResult = await conn.execute<any>(
        `SELECT 
          COUNT(*) as "total",
          COUNT(CASE WHEN STATUS_CODE LIKE '2%' THEN 1 END) as "successCount",
          COUNT(CASE WHEN STATUS_CODE NOT LIKE '2%' THEN 1 END) as "errorCount"
        FROM OMNI.PROVIDER_SERVICE_RESPONSES
        ${whereClause}`,
        params.bannerId ? { bannerId: params.bannerId } : {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const stats = statsResult.rows?.[0] || { total: 0, successCount: 0, errorCount: 0 };
      const successRate = stats.total > 0 ? Math.round((stats.successCount / stats.total) * 100) : 0;

      logger.info(`[SYNC_HISTORY] Found ${logsResult.rows?.length || 0} logs, ${stats.successCount} success, ${stats.errorCount} errors, ${successRate}% success rate`);

      return {
        logs: logsResult.rows || [],
        total: stats.total,
        stats: {
          successCount: stats.successCount,
          errorCount: stats.errorCount,
          successRate
        }
      };
    });
  }

  /**
   * Phase 2: Get full log detail with complete request/response CLOBs
   * 
   * @param logId - PROVIDER_RESPONSE_ID
   * @returns Complete log entry with full REQUEST and RESPONSE
   */
  async getSyncLogDetail(logId: number): Promise<any> {
    return withConnection(async (conn) => {
      logger.info(`[SYNC_LOG_DETAIL] Fetching log ID: ${logId}`);

      const result = await conn.execute<any>(
        `SELECT 
          PROVIDER_RESPONSE_ID as "logId",
          RESPONSE_DATE as "timestamp",
          SERVICE_ID as "service",
          STATUS_CODE as "status",
          STATUS_DESCRIPTION as "message",
          ERROR_CODE as "errorCode",
          ERROR_DESCRIPTION as "errorDescription",
          REQUEST as "requestFull",
          RESPONSE as "responseFull",
          WFE_TRANS_ID as "transactionId",
          SERVICE_TYPE as "type",
          BUSINESS_UNIT_ID as "businessUnitId",
          SITE_ID as "siteId",
          USERNAME as "username"
        FROM OMNI.PROVIDER_SERVICE_RESPONSES
        WHERE PROVIDER_RESPONSE_ID = :logId`,
        { logId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error(`Log entry ${logId} not found`);
      }

      const log = result.rows[0];

      // Convert CLOBs to strings
      if (log.requestFull && typeof log.requestFull.getData === 'function') {
        log.requestFull = await log.requestFull.getData();
      }
      if (log.responseFull && typeof log.responseFull.getData === 'function') {
        log.responseFull = await log.responseFull.getData();
      }
      if (log.errorDescription && typeof log.errorDescription.getData === 'function') {
        log.errorDescription = await log.errorDescription.getData();
      }

      logger.info(`[SYNC_LOG_DETAIL] Retrieved log: ${log.service} - ${log.status}`);

      return log;
    });
  }

  /**
   * Phase 2: Get product sync queue status from EXT_PRODUCTS_ACTIVITY
   * 
   * @param params - Filter parameters
   * @returns Product sync activities with stats
   */
  async getProductSyncStatus(params: {
    bannerId?: string;
    status?: string; // N (new), Y (processed), E (error)
    limit?: number;
  }): Promise<{
    activities: Array<any>;
    stats: {
      pending: number;
      processed: number;
      errors: number;
    };
  }> {
    return withConnection(async (conn) => {
      const limit = params.limit || 50;
      const binds: any = { limit };

      // Build WHERE clause
      let whereClause = "WHERE 1=1";

      if (params.bannerId) {
        whereClause += " AND BANNER_ID = :bannerId";
        binds.bannerId = params.bannerId;
      }

      if (params.status) {
        whereClause += " AND STATUS = :status";
        binds.status = params.status;
      }

      logger.info(`[PRODUCT_SYNC] Querying activities: bannerId=${params.bannerId}, status=${params.status}`);

      // Get activities
      const activitiesResult = await conn.execute<any>(
        `SELECT 
          STYLE_ID as "styleId",
          BANNER_ID as "bannerId",
          DESCRIPTION as "description",
          ACTIVITY_TYPE as "activityType",
          STATUS as "status",
          CREATED_DATE as "createdDate",
          PROCESSED_DATE as "processedDate",
          SHOPIFY_PRODUCT_ID as "shopifyProductId",
          VENDOR_STYLE_NO as "vendorStyleNo",
          PRODUCT_TYPE as "productType",
          TAGS as "tags"
        FROM MERCH.EXT_PRODUCTS_ACTIVITY
        ${whereClause}
        ORDER BY CREATED_DATE DESC
        FETCH FIRST :limit ROWS ONLY`,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      // Get stats
      const statsBinds: any = {};
      let statsWhere = "WHERE 1=1";
      if (params.bannerId) {
        statsWhere += " AND BANNER_ID = :bannerId";
        statsBinds.bannerId = params.bannerId;
      }

      const statsResult = await conn.execute<any>(
        `SELECT 
          COUNT(CASE WHEN STATUS = 'N' THEN 1 END) as "pending",
          COUNT(CASE WHEN STATUS = 'Y' THEN 1 END) as "processed",
          COUNT(CASE WHEN STATUS = 'E' THEN 1 END) as "errors"
        FROM MERCH.EXT_PRODUCTS_ACTIVITY
        ${statsWhere}`,
        statsBinds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const stats = statsResult.rows?.[0] || { pending: 0, processed: 0, errors: 0 };

      logger.info(`[PRODUCT_SYNC] Found ${activitiesResult.rows?.length || 0} activities, ${stats.pending} pending, ${stats.processed} processed, ${stats.errors} errors`);

      return {
        activities: activitiesResult.rows || [],
        stats
      };
    });
  }

  /**
   * Phase 2: Get sync summary for dashboard
   * Combines data from PROVIDER_SERVICE_RESPONSES and EXT_PRODUCTS_ACTIVITY
   * 
   * @param bannerId - Banner ID
   * @returns Comprehensive sync summary
   */
  async getSyncSummary(bannerId: string): Promise<{
    lastSyncDate: Date | null;
    last24Hours: {
      totalCalls: number;
      successfulCalls: number;
      failedCalls: number;
      successRate: number;
    };
    productQueue: {
      pending: number;
      processed: number;
      errors: number;
    };
    recentErrors: Array<{
      timestamp: Date;
      service: string;
      error: string;
    }>;
  }> {
    return withConnection(async (conn) => {
      logger.info(`[SYNC_SUMMARY] Getting summary for banner: ${bannerId}`);

      // Get last 24 hours API call stats
      const callStatsResult = await conn.execute<any>(
        `SELECT 
          COUNT(*) as "totalCalls",
          COUNT(CASE WHEN STATUS_CODE LIKE '2%' THEN 1 END) as "successfulCalls",
          COUNT(CASE WHEN STATUS_CODE NOT LIKE '2%' THEN 1 END) as "failedCalls",
          MAX(RESPONSE_DATE) as "lastSyncDate"
        FROM OMNI.PROVIDER_SERVICE_RESPONSES
        WHERE SERVICE_ID LIKE '%SHOPIFY%'
          AND SERVICE_ID LIKE '%' || :bannerId || '%'
          AND RESPONSE_DATE >= SYSTIMESTAMP - INTERVAL '1' DAY`,
        { bannerId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const callStats = callStatsResult.rows?.[0] || { 
        totalCalls: 0, 
        successfulCalls: 0, 
        failedCalls: 0, 
        lastSyncDate: null 
      };

      const successRate = callStats.totalCalls > 0 
        ? Math.round((callStats.successfulCalls / callStats.totalCalls) * 100) 
        : 0;

      // Get product queue stats
      const queueStatsResult = await conn.execute<any>(
        `SELECT 
          COUNT(CASE WHEN STATUS = 'N' THEN 1 END) as "pending",
          COUNT(CASE WHEN STATUS = 'Y' THEN 1 END) as "processed",
          COUNT(CASE WHEN STATUS = 'E' THEN 1 END) as "errors"
        FROM MERCH.EXT_PRODUCTS_ACTIVITY
        WHERE BANNER_ID = :bannerId`,
        { bannerId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const queueStats = queueStatsResult.rows?.[0] || { pending: 0, processed: 0, errors: 0 };

      // Get recent errors (last 5)
      const errorsResult = await conn.execute<any>(
        `SELECT 
          RESPONSE_DATE as "timestamp",
          SERVICE_ID as "service",
          STATUS_DESCRIPTION as "error"
        FROM OMNI.PROVIDER_SERVICE_RESPONSES
        WHERE SERVICE_ID LIKE '%SHOPIFY%'
          AND SERVICE_ID LIKE '%' || :bannerId || '%'
          AND STATUS_CODE NOT LIKE '2%'
        ORDER BY RESPONSE_DATE DESC
        FETCH FIRST 5 ROWS ONLY`,
        { bannerId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      logger.info(`[SYNC_SUMMARY] Summary: ${callStats.totalCalls} calls (${successRate}% success), ${queueStats.pending} pending, ${errorsResult.rows?.length || 0} recent errors`);

      return {
        lastSyncDate: callStats.lastSyncDate,
        last24Hours: {
          totalCalls: callStats.totalCalls,
          successfulCalls: callStats.successfulCalls,
          failedCalls: callStats.failedCalls,
          successRate
        },
        productQueue: queueStats,
        recentErrors: errorsResult.rows || []
      };
    });
  }

  /**
   * SKU-BASED FALLBACK MAPPING
   * 
   * Creates product mapping when Shopify product_id/variant_id are null or missing.
   * This handles edge cases like:
   * - Products deleted from Shopify after orders were placed
   * - Manual order creation without product links
   * - Third-party integrations that only provide SKU
   * 
   * Pattern based on industry best practices (Odoo, Akeneo):
   * 1. Primary lookup: shopify_product_id + variant_id (VisionSuite native)
   * 2. Fallback: SKU lookup in VSTORE.SKU → MERCH.STYLE_COLORS → mapping
   * 
   * @param sku - The SKU from the Shopify order line item
   * @param businessUnitId - VisionSuite business unit (default 1)
   * @param bannerId - VisionSuite banner (default 'BASE')
   * @param shopifyProductId - Optional: Shopify product ID if known (for mapping)
   * @param shopifyVariantId - Optional: Shopify variant ID if known (for mapping)
   * @returns Mapping result with style_id, color_id, size_id, barcode_id
   */
  async createMappingBySku(params: {
    sku: string;
    businessUnitId?: number;
    bannerId?: string;
    shopifyProductId?: number | null;
    shopifyVariantId?: number | null;
  }): Promise<{
    success: boolean;
    styleId?: string;
    colorId?: string;
    sizeId?: string;
    barcodeId?: string;
    message: string;
    alreadyExists?: boolean;
  }> {
    const { sku, businessUnitId = 1, bannerId = 'BASE', shopifyProductId, shopifyVariantId } = params;

    return await withConnection(async (conn) => {
      logger.info(`[SKU-MAPPING] Starting SKU-based mapping for: ${sku}`);

      // Step 1: Check if mapping already exists (by SKU as style_id)
      const existingMapping = await conn.execute<any>(
        `SELECT STYLE_ID, COLOR_ID, SIZE_ID, SHOPIFY_PRODUCT_ID, VARIANT_ID 
         FROM MERCH.EXT_PRODUCT_VARIANTS 
         WHERE STYLE_ID = :sku AND BUSINESS_UNIT_ID = :buId AND BANNER_ID = :banner`,
        { sku, buId: businessUnitId, banner: bannerId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (existingMapping.rows && existingMapping.rows.length > 0) {
        const existing = existingMapping.rows[0];
        logger.info(`[SKU-MAPPING] Mapping already exists for ${sku}: ${JSON.stringify(existing)}`);
        return {
          success: true,
          styleId: existing.STYLE_ID,
          colorId: existing.COLOR_ID,
          sizeId: existing.SIZE_ID,
          message: 'Mapping already exists',
          alreadyExists: true
        };
      }

      // Step 2: Look up product in VSTORE.SKU (the source of truth for SKU data)
      const skuLookup = await conn.execute<any>(
        `SELECT s.SKUSTYLE as STYLE_ID, s.SKUCOLOR as COLOR_ID, s.SKUSIZE as SIZE_ID, s.FKSTYLENO
         FROM VSTORE.SKU s
         WHERE s.SKUSTYLE = :sku AND s.FKORGANIZATIONNO = :buId
         FETCH FIRST 1 ROWS ONLY`,
        { sku, buId: businessUnitId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!skuLookup.rows || skuLookup.rows.length === 0) {
        logger.warn(`[SKU-MAPPING] SKU ${sku} not found in VSTORE.SKU`);
        return {
          success: false,
          message: `SKU ${sku} not found in VisionSuite product catalog`
        };
      }

      const skuData = skuLookup.rows[0];
      const styleId = skuData.STYLE_ID || skuData.FKSTYLENO;
      const colorId = skuData.COLOR_ID || '001';
      const sizeId = skuData.SIZE_ID || 'OS';

      logger.info(`[SKU-MAPPING] Found in VSTORE.SKU: style=${styleId}, color=${colorId}, size=${sizeId}`);

      // Step 3: Get barcode info from MERCH.BAR_CODES
      // CRITICAL: Prefer UPCE barcode where BAR_CODE_ID = STYLE_ID (matches Shopify SKU)
      const barcodeRes = await conn.execute<any>(
        `SELECT BAR_CODE_ID, SUB_TYPE FROM MERCH.BAR_CODES
         WHERE BUSINESS_UNIT_ID = :buId AND STYLE_ID = :style AND COLOR_ID = :color AND SIZE_ID = :size
         ORDER BY CASE WHEN BAR_CODE_ID = STYLE_ID AND SUB_TYPE = 'UPCE' THEN 0 ELSE 1 END
         FETCH FIRST 1 ROWS ONLY`,
        { buId: businessUnitId, style: styleId, color: colorId, size: sizeId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const barcodeId = barcodeRes.rows?.[0]?.BAR_CODE_ID || styleId;
      const subType = barcodeRes.rows?.[0]?.SUB_TYPE || 'SKU';

      // Step 4: Create EXT_PRODUCTS entry (parent for FK constraint)
      await conn.execute(
        `MERGE INTO MERCH.EXT_PRODUCTS target
         USING (SELECT :p_bu as BU, :p_style as STYLE, :p_banner as BANNER FROM DUAL) source
         ON (target.BUSINESS_UNIT_ID = source.BU AND target.STYLE_ID = source.STYLE AND target.BANNER_ID = source.BANNER)
         WHEN NOT MATCHED THEN
           INSERT (BUSINESS_UNIT_ID, STYLE_ID, BANNER_ID, SHOPIFY_PRODUCT_ID, TAGS, DESCRIPTION, PRODUCT_TYPE, VENDOR_NAME, CREATED_BY, CREATED_DATE)
           VALUES (source.BU, source.STYLE, source.BANNER, :p_shopify_id, 'SKU-Mapped', :p_desc, 'General', 'VisionSuite', 'SKU_MAPPER', CURRENT_TIMESTAMP)`,
        {
          p_bu: businessUnitId,
          p_style: styleId,
          p_banner: bannerId,
          p_shopify_id: shopifyProductId || null,
          p_desc: `Product ${styleId}`
        }
      );

      // Step 5: Create EXT_PRODUCT_VARIANTS entry with mapping
      await conn.execute(
        `INSERT INTO MERCH.EXT_PRODUCT_VARIANTS (
          BUSINESS_UNIT_ID, STYLE_ID, BANNER_ID, COLOR_ID, SIZE_ID, DIMENSION_ID, COLOR_DESC,
          BARCODE_ID, SUB_TYPE, SKU_ID, COST, COMPARE_PRICE, PRICE, TAXABLE,
          SHOPIFY_PRODUCT_ID, VARIANT_ID, CREATED_BY, CREATED_DATE
        ) VALUES (
          :p_bu, :p_style, :p_banner, :p_color, :p_size, NULL, 'Default',
          :p_barcode, :p_sub_type, :p_style, 0, 0, 0, 'Y',
          :p_shopify_product_id, :p_shopify_variant_id, 'SKU_MAPPER', CURRENT_TIMESTAMP
        )`,
        {
          p_bu: businessUnitId,
          p_style: styleId,
          p_banner: bannerId,
          p_color: colorId,
          p_size: sizeId,
          p_barcode: barcodeId,
          p_sub_type: subType,
          p_shopify_product_id: shopifyProductId || null,
          p_shopify_variant_id: shopifyVariantId || null
        }
      );

      await conn.commit();
      logger.info(`[SKU-MAPPING] Successfully created mapping for ${sku} → ${styleId}/${colorId}/${sizeId}`);

      return {
        success: true,
        styleId,
        colorId,
        sizeId,
        barcodeId,
        message: `Mapping created for ${sku}`
      };
    });
  }

  /**
   * Auto-map order line items that failed due to missing mapping
   * 
   * Scans STG_ORDER_DETAILS for rejected items and attempts SKU-based mapping.
   * Called after order fetch to recover unmapped products.
   * 
   * @param businessUnitId - VisionSuite business unit
   * @param bannerId - VisionSuite banner
   * @returns Summary of mapping attempts
   */
  async autoMapRejectedOrderItems(businessUnitId: number = 1, bannerId: string = 'BASE'): Promise<{
    processed: number;
    mapped: number;
    failed: number;
    errors: string[];
  }> {
    return await withConnection(async (conn) => {
      logger.info(`[AUTO-MAP] Starting auto-map for rejected order items`);

      // Find rejected order details with SKU info from REFERENCE_NO
      // REFERENCE_NO format: "product_id/variant_id"
      const rejectedItems = await conn.execute<any>(
        `SELECT DISTINCT 
           d.ORDER_ID, d.LINE, d.REFERENCE_NO, d.EXT_PRODUCT_ID, d.EXT_VARIANT_ID
         FROM OMNI.STG_ORDER_DETAILS d
         WHERE d.BUSINESS_UNIT_ID = :buId
           AND d.STG_STATUS = 'X'
           AND d.STYLE_ID IS NULL
           AND d.EXT_PRODUCT_ID IS NOT NULL`,
        { buId: businessUnitId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const items = rejectedItems.rows || [];
      logger.info(`[AUTO-MAP] Found ${items.length} rejected items to process`);

      let processed = 0;
      let mapped = 0;
      let failed = 0;
      const errors: string[] = [];

      // For each rejected item, try to fetch SKU from Shopify and create mapping
      for (const item of items) {
        processed++;
        const productId = item.EXT_PRODUCT_ID;
        const variantId = item.EXT_VARIANT_ID;

        try {
          // Get Shopify credentials
          const configRes = await conn.execute<any>(
            `SELECT CONFIG_KEY, CONFIG_VALUE FROM ATTR_MGR.SHOPIFY_CONFIG 
             WHERE CONFIG_KEY IN ('JESTA_DEMO_STORE_URL', 'JESTA_DEMO_ACCESS_TOKEN')`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          const config: Record<string, string> = {};
          configRes.rows?.forEach((r: any) => { config[r.CONFIG_KEY] = r.CONFIG_VALUE; });
          
          const shopUrl = config.JESTA_DEMO_STORE_URL || 'https://jesta-demo.myshopify.com';
          const accessToken = config.JESTA_DEMO_ACCESS_TOKEN;

          if (!accessToken) {
            errors.push(`${item.ORDER_ID}/${item.LINE}: No Shopify credentials`);
            failed++;
            continue;
          }

          // Fetch product from Shopify to get SKU
          const shopifyRes = await fetch(`${shopUrl}/admin/api/2024-10/products/${productId}.json`, {
            headers: { 'X-Shopify-Access-Token': accessToken }
          });

          let sku: string | null = null;

          if (shopifyRes.ok) {
            const shopifyData = await shopifyRes.json() as { product?: { variants?: Array<{ id: number; sku: string }> } };
            const variant = shopifyData.product?.variants?.find((v: any) => v.id === variantId);
            sku = variant?.sku || shopifyData.product?.variants?.[0]?.sku || null;
          }

          if (!sku) {
            errors.push(`${item.ORDER_ID}/${item.LINE}: No SKU found in Shopify`);
            failed++;
            continue;
          }

          // Try SKU-based mapping
          const mapResult = await this.createMappingBySku({
            sku,
            businessUnitId,
            bannerId,
            shopifyProductId: productId,
            shopifyVariantId: variantId
          });

          if (mapResult.success) {
            mapped++;
            logger.info(`[AUTO-MAP] Mapped ${item.ORDER_ID}/${item.LINE}: ${sku}`);
          } else {
            failed++;
            errors.push(`${item.ORDER_ID}/${item.LINE}: ${mapResult.message}`);
          }
        } catch (err: any) {
          failed++;
          errors.push(`${item.ORDER_ID}/${item.LINE}: ${err.message?.substring(0, 50)}`);
        }
      }

      logger.info(`[AUTO-MAP] Complete: ${processed} processed, ${mapped} mapped, ${failed} failed`);
      return { processed, mapped, failed, errors: errors.slice(0, 10) };
    });
  }
}

export const shopifyService = new ShopifyService();
