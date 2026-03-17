import { Router } from 'express';
import { shopifyService } from '../services/shopify.service.js';
import { shopifyMediaService } from '../services/shopify-media.service.js';
import { shopifyLiveTestService } from '../services/shopify-live-test.service.js';
import { shopifyActionsService } from '../services/shopify-actions.service.js';
import { ShopifyDiscountsService } from '../services/shopify-discounts.service.js';
import { withConnection } from '../services/oracle-pool.js';
import { logger } from '../utils/logger.js';
import oracledb from 'oracledb';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const shopifyDiscountsService = new ShopifyDiscountsService();

const router = Router();

// GET /api/shopify/stores
router.get('/stores', asyncHandler(async (req, res) => {
  try {
    const stores = await shopifyService.getStores();
    res.json({ success: true, data: stores });
  } catch (error: any) {
    // Return empty array instead of error for missing tables
    res.json({ success: true, data: [] });
  }
}));

// POST /api/shopify/stores/:bannerId/test
router.post('/stores/:bannerId/test', asyncHandler(async (req, res) => {
  try {
    const result = await shopifyService.testConnection(req.params.bannerId as string);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/stores/:bannerId/health
// Phase 1: Store Health Dashboard - VisionSuite SSOT
// Data sources:
//  - OMNI.PROVIDER_SERVICES (config + health indicators)
//  - OMNI.PROVIDER_SERVICE_RESPONSES (API rate limit)
//  - OMNI.V_ECOMM_ORDERS (recent orders)
//  - Shopify API (live connection test)
router.get('/stores/:bannerId/health', asyncHandler(async (req, res) => {
  try {
    const health = await shopifyService.getStoreHealth(req.params.bannerId as string);
    res.json({ success: true, data: health });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/stores/:bannerId/sync-history
// Phase 2: Sync History - VisionSuite SSOT
// Data source: OMNI.PROVIDER_SERVICE_RESPONSES
router.get('/stores/:bannerId/sync-history', asyncHandler(async (req, res) => {
  try {
    const { statusCode, dateFrom, dateTo, limit } = req.query;
    const result = await shopifyService.getSyncHistory({
      bannerId: req.params.bannerId as string,
      statusCode: statusCode as string,
      dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
      dateTo: dateTo ? new Date(dateTo as string) : undefined,
      limit: parseInt(limit as string || '100')
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/logs/:logId
// Phase 2: Sync Log Detail - VisionSuite SSOT
// Data source: OMNI.PROVIDER_SERVICE_RESPONSES (full request/response CLOBs)
router.get('/logs/:logId', asyncHandler(async (req, res) => {
  try {
    const detail = await shopifyService.getSyncLogDetail(parseInt(req.params.logId as string));
    res.json({ success: true, data: detail });
  } catch (error: any) {
    res.status(404).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/stores/:bannerId/product-sync
// Phase 2: Product Sync Status - VisionSuite SSOT
// Data source: MERCH.EXT_PRODUCTS_ACTIVITY
router.get('/stores/:bannerId/product-sync', asyncHandler(async (req, res) => {
  try {
    const { status, limit } = req.query;
    const result = await shopifyService.getProductSyncStatus({
      bannerId: req.params.bannerId as string,
      status: status as string,
      limit: parseInt(limit as string || '50')
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/stores/:bannerId/sync-summary
// Phase 2: Sync Summary - VisionSuite SSOT
// Data sources: OMNI.PROVIDER_SERVICE_RESPONSES + MERCH.EXT_PRODUCTS_ACTIVITY
router.get('/stores/:bannerId/sync-summary', asyncHandler(async (req, res) => {
  try {
    const summary = await shopifyService.getSyncSummary(req.params.bannerId as string);
    res.json({ success: true, data: summary });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/stores/:bannerId/webhooks
// Phase 4: List webhooks from Shopify API
router.get('/stores/:bannerId/webhooks', asyncHandler(async (req, res) => {
  try {
    const result = await shopifyActionsService.listWebhooks(req.params.bannerId as string);
    res.json({ success: result.success, data: result.webhooks, error: result.message ? { message: result.message } : undefined });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/stores/:bannerId/webhooks
// Phase 4: Create a webhook via Shopify API
router.post('/stores/:bannerId/webhooks', asyncHandler(async (req, res) => {
  try {
    const { topic, address, format } = req.body;
    const result = await shopifyActionsService.createWebhook(req.params.bannerId as string, { topic, address, format });
    res.json({ success: result.success, data: result.webhook, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// DELETE /api/shopify/stores/:bannerId/webhooks/:webhookId
// Phase 4: Delete a webhook via Shopify API
router.delete('/stores/:bannerId/webhooks/:webhookId', asyncHandler(async (req, res) => {
  try {
    const result = await shopifyActionsService.deleteWebhook(req.params.bannerId as string, req.params.webhookId as string);
    res.json({ success: result.success, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/stores/:bannerId/bulk/inventory
// Phase 5: Bulk inventory update from VisionSuite SSOT
router.post('/stores/:bannerId/bulk/inventory', asyncHandler(async (req, res) => {
  try {
    const result = await shopifyActionsService.bulkInventoryUpdate(req.params.bannerId as string);
    res.json({ success: result.success, data: { updatedCount: result.updatedCount, failedCount: result.failedCount, errors: result.errors } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/stores/:bannerId/bulk/publish
// Phase 5: Bulk publish products
router.post('/stores/:bannerId/bulk/publish', asyncHandler(async (req, res) => {
  try {
    const { styleIds } = req.body;
    const result = await shopifyActionsService.bulkPublish(req.params.bannerId as string, styleIds || []);
    res.json({ success: result.success, data: { publishedCount: result.publishedCount, errors: result.errors } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// ============================================================================
// DISCOUNT MANAGEMENT (New Tab)
// ============================================================================

// POST /api/shopify/stores/:bannerId/discounts/code
// Create a discount code
router.post('/stores/:bannerId/discounts/code', asyncHandler(async (req, res) => {
  try {
    const result = await shopifyDiscountsService.createDiscountCode(req.params.bannerId as string, req.body);
    res.json({ success: result.success, data: { discountId: result.discountId, code: result.code }, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/stores/:bannerId/discounts/automatic
// Create an automatic discount
router.post('/stores/:bannerId/discounts/automatic', asyncHandler(async (req, res) => {
  try {
    const result = await shopifyDiscountsService.createAutomaticDiscount(req.params.bannerId as string, req.body);
    res.json({ success: result.success, data: { discountId: result.discountId }, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/stores/:bannerId/discounts
// List all discounts
router.get('/stores/:bannerId/discounts', asyncHandler(async (req, res) => {
  try {
    const first = parseInt(req.query.limit as string || '50');
    const result = await shopifyDiscountsService.listDiscounts(req.params.bannerId as string, first);
    res.json({ success: result.success, data: result.discounts, meta: result.meta });
  } catch (error: any) {
    res.json({ success: true, data: [], meta: { total: 0, active: 0, scheduled: 0, expired: 0 } });
  }
}));

// DELETE /api/shopify/stores/:bannerId/discounts/:discountId
// Delete a discount
router.delete('/stores/:bannerId/discounts/:discountId', asyncHandler(async (req, res) => {
  try {
    const result = await shopifyDiscountsService.deleteDiscount(req.params.bannerId as string, req.params.discountId as string);
    res.json({ success: result.success, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/stats
router.get('/stats', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, period } = req.query;
    const stats = await shopifyService.getDashboardStats(
      parseInt(business_unit_id as string || '1'),
      period as string || 'today'
    );
    res.json({ success: true, data: stats });
  } catch (error: any) {
    // Return empty stats instead of error for missing tables
    res.json({ success: true, data: { 
      revenue: 0, 
      orders: 0, 
      products: 0, 
      avgOrderValue: 0,
      conversionRate: 0,
      syncHealth: 'Unknown' 
    } });
  }
}));

// POST /api/shopify/products/toggle
router.post('/products/toggle', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, style_id, banner_id, publish } = req.body;
    await shopifyService.toggleProductStatus({ 
      businessUnitId: parseInt(business_unit_id || '1'), 
      styleId: style_id, 
      bannerId: banner_id, 
      publish 
    });
    res.json({ success: true, message: `Product ${publish ? 'published' : 'unpublished'}` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/products/sync-inventory
router.post('/products/sync-inventory', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, style_id, banner_id } = req.body;
    await shopifyService.syncInventory({ 
      businessUnitId: parseInt(business_unit_id || '1'), 
      styleId: style_id, 
      bannerId: banner_id 
    });
    res.json({ success: true, message: 'Inventory sync triggered' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/products
router.get('/products', asyncHandler(async (req, res) => {
  try {
    const { banner_id, status, limit, offset } = req.query;
    const result = await shopifyService.getProducts({
      bannerId: banner_id as string,
      status: status as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0
    });
    res.json({ success: true, data: result.products, meta: { total: result.total } });
  } catch (error: any) {
    // Return empty array instead of error for missing tables
    res.json({ success: true, data: [], meta: { total: 0 } });
  }
}));

// GET /api/shopify/orders/stats/origins - Must come before /orders/:orderId
router.get('/orders/stats/origins', asyncHandler(async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const stats = await shopifyService.getOrderOriginStats({
      startDate: start_date as string,
      endDate: end_date as string
    });
    res.json({ success: true, data: stats });
  } catch (error: any) {
    // Graceful fallback on error
    res.json({ 
      success: true, 
      data: { all: 0, shopify: 0, omni: 0, edom: 0, pos: 0 } 
    });
  }
}));

// GET /api/shopify/orders - Extended with origin filter and search
router.get('/orders', asyncHandler(async (req, res) => {
  try {
    logger.debug('GET /api/shopify/orders', { query: req.query });
    const { 
      site_id, 
      status, 
      limit, 
      offset, 
      origin,       // NEW: Filter by ORDER_ORIGIN
      search,       // NEW: Search by customer/order ID
      start_date,   // NEW: Date range filter
      end_date      // NEW: Date range filter
    } = req.query;
    
    const result = await shopifyService.getOrders({
      siteId: site_id as string,
      status: status as string,
      limit: limit ? parseInt(limit as string) : 25,
      offset: offset ? parseInt(offset as string) : 0,
      origin: origin as string,              // NEW
      search: search as string,              // NEW
      startDate: start_date as string,       // NEW
      endDate: end_date as string            // NEW
    });
    
    res.json({ 
      success: true, 
      data: result.orders, 
      meta: { 
        total: result.total, 
        isDemo: result.isDemo 
      } 
    });
  } catch (error: any) {
    // Return empty array instead of error for missing tables
    res.json({ success: true, data: [], meta: { total: 0 } });
  }
}));

// GET /api/shopify/orders/export
router.get('/orders/export', asyncHandler(async (req, res) => {
  try {
    const { site_id, status } = req.query;
    const result = await shopifyService.getOrders({
      siteId: site_id as string,
      status: status as string,
      limit: 1000 // Export more for CSV
    });
    
    // Generate CSV
    const headers = ['Order ID', 'Customer ID', 'Date', 'Status', 'Site', 'Origin'];
    const rows = result.orders.map((o: any) => [
      o.orderId,
      o.customerId,
      new Date(o.orderDate).toLocaleDateString(),
      o.status,
      o.siteId,
      o.origin
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map((r: any) => r.join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=shopify_orders.csv');
    res.send(csvContent);
  } catch (error: any) {
    // Return empty CSV instead of error
    const headers = ['Order ID', 'Customer ID', 'Date', 'Status', 'Site', 'Origin'];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=shopify_orders.csv');
    res.send(headers.join(','));
  }
}));

// GET /api/shopify/orders/:orderId - Enhanced with enrichment option
router.get('/orders/:orderId', asyncHandler(async (req, res) => {
  try {
    logger.debug('GET /api/shopify/orders/:orderId', { orderId: req.params.orderId });
    const { enrich, include_customer, include_timeline, include_shopify } = req.query;
    
    // If enrich=true, use the enhanced version
    if (enrich === 'true') {
      const result = await shopifyService.getEnrichedOrderDetails(req.params.orderId as string, {
        includeCustomer: include_customer !== 'false',
        includeTimeline: include_timeline !== 'false',
        includeShopifyEnrichment: include_shopify !== 'false'
      });
      return res.json({ success: true, data: result });
    }
    
    // Default: basic order details
    const result = await shopifyService.getOrderDetails(req.params.orderId as string);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/customers/:customerId/360 - Customer 360 View
// Phase 1: Unified customer view with metrics, segments, and order history
// Data Source: VisionSuite V_ECOMM_* views (SSOT)
router.get('/customers/:customerId/360', asyncHandler(async (req, res) => {
  try {
    const customerId = req.params.customerId as string;
    logger.debug('GET /api/shopify/customers/:customerId/360', { customerId });
    
    const result = await shopifyService.getCustomer360(customerId);
    
    if (!result) {
      return res.status(404).json({ 
        success: false, 
        error: { message: `Customer ${customerId} not found` } 
      });
    }
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/analytics/revenue
router.get('/analytics/revenue', asyncHandler(async (req, res) => {
  try {
    const { period, banner_id } = req.query;
    const data = await shopifyService.getRevenueAnalytics({
      period: period as string || 'today',
      bannerId: banner_id as string
    });
    res.json({ success: true, data });
  } catch (error: any) {
    // Return empty data instead of error for missing tables
    res.json({ success: true, data: { total: 0, currency: 'USD', orderCount: 0, avgOrderValue: 0 } });
  }
}));

// GET /api/shopify/analytics/fulfillment
router.get('/analytics/fulfillment', asyncHandler(async (req, res) => {
  try {
    const { period, banner_id } = req.query;
    const data = await shopifyService.getFulfillmentMetrics({
      period: period as string || 'today',
      bannerId: banner_id as string
    });
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/analytics/returns
router.get('/analytics/returns', asyncHandler(async (req, res) => {
  try {
    const { period } = req.query;
    const data = await shopifyService.getReturnAnalytics({
      period: period as string || 'today'
    });
    res.json({ success: true, data });
  } catch (error: any) {
    // Return empty data instead of error for missing tables
    res.json({ success: true, data: { totalReturns: 0, returnRate: 0, topReasons: [] } });
  }
}));

// GET /api/shopify/inventory
router.get('/inventory', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, banner_id } = req.query;
    const result = await shopifyService.getInventoryDiscrepancies(
      parseInt(business_unit_id as string || '1'),
      banner_id as string
    );
    // Handle both old array format and new object format
    const data = result?.discrepancies || result || [];
    res.json({ success: true, data, meta: { isDemo: result?.isDemo, total: result?.total } });
  } catch (error: any) {
    // Return empty array instead of error for missing tables
    res.json({ success: true, data: [], meta: { total: 0 } });
  }
}));

// GET /api/shopify/inventory/alerts
router.get('/inventory/alerts', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id } = req.query;
    const result = await shopifyService.getInventoryAlerts(parseInt(business_unit_id as string || '1'));
    // Handle both old array format and new object format
    const data = result?.alerts || result || [];
    res.json({ success: true, data, meta: { isDemo: result?.isDemo, total: result?.total } });
  } catch (error: any) {
    // Return empty array instead of error for missing tables
    res.json({ success: true, data: [], meta: { total: 0 } });
  }
}));

// GET /api/shopify/carts/abandoned
router.get('/carts/abandoned', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id } = req.query;
    const result = await shopifyService.getAbandonedCarts(parseInt(business_unit_id as string || '1'));
    // Handle both old array format and new object format
    const data = result?.carts || result || [];
    res.json({ success: true, data, meta: { isDemo: result?.isDemo, total: result?.total } });
  } catch (error: any) {
    // Return empty array instead of error for missing tables
    res.json({ success: true, data: [], meta: { total: 0 } });
  }
}));

// GET /api/shopify/jobs
router.get('/jobs', asyncHandler(async (req, res) => {
  try {
    const jobs = await shopifyService.getJobs();
    res.json({ success: true, data: jobs });
  } catch (error: any) {
    // Return empty array instead of error for missing tables
    res.json({ success: true, data: [] });
  }
}));

// POST /api/shopify/jobs/:name/run
router.post('/jobs/:name/run', asyncHandler(async (req, res) => {
  try {
    await shopifyService.runJob(req.params.name as string);
    res.json({ success: true, message: `Job ${req.params.name as string} started` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/jobs/:name/toggle
router.post('/jobs/:name/toggle', asyncHandler(async (req, res) => {
  try {
    const { enable } = req.body;
    await shopifyService.toggleJob(req.params.name as string, enable);
    res.json({ success: true, message: `Job ${req.params.name as string} ${enable ? 'enabled' : 'disabled'}` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/mapping
router.get('/mapping', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id } = req.query;
    const mappings = await shopifyService.getMappings(parseInt(business_unit_id as string || '1'));
    res.json({ success: true, data: mappings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/logs
router.get('/logs', asyncHandler(async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const result = await shopifyService.getSyncLogs(
      limit ? parseInt(limit as string) : 50,
      offset ? parseInt(offset as string) : 0
    );
    res.json({ success: true, data: result.logs, meta: { total: result.total } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/config
router.get('/config', asyncHandler(async (req, res) => {
  try {
    const result = await shopifyService.getConfig();
    // Handle new format: { config: [], isDemo: bool, tableExists: bool }
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/config
router.post('/config', asyncHandler(async (req, res) => {
  try {
    const { key, value } = req.body;
    await shopifyService.updateConfig(key, value);
    res.json({ success: true, message: 'Config updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/mapping/auto-map
router.post('/mapping/auto-map', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, merchandise_no } = req.body;
    const result = await shopifyService.autoMapCategory(
      parseInt(business_unit_id as string || '1'),
      merchandise_no
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/mapping/save
router.post('/mapping/save', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, merchandise_no, shopify_product_type } = req.body;
    await shopifyService.saveManualMapping(
      parseInt(business_unit_id as string || '1'),
      merchandise_no,
      shopify_product_type
    );
    res.json({ success: true, message: 'Mapping saved' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/products/sync-media
router.post('/products/sync-media', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, style_id, banner_id } = req.body;
    const result = await shopifyMediaService.syncProductMedia(
      parseInt(business_unit_id || '1'), 
      style_id, 
      banner_id
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// ============================================================================
// LIVE PUBLICATION TEST ENDPOINTS
// ============================================================================

// GET /api/shopify/test/styles - Get available styles for testing
router.get('/test/styles', asyncHandler(async (req, res) => {
  try {
    const { limit } = req.query;
    const styles = await shopifyLiveTestService.getTestableStyles(
      limit ? parseInt(limit as string) : 10
    );
    res.json({ success: true, data: styles });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/test/publish - Run live publication test
router.post('/test/publish', asyncHandler(async (req, res) => {
  try {
    const { style_id, banner_id } = req.body;
    
    if (!style_id) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'style_id is required' } 
      });
    }

    logger.debug('[LIVE TEST] Starting publication test', { style_id });
    
    const result = await shopifyLiveTestService.runLivePublicationTest(
      style_id,
      banner_id || 'SHOPIFY_DEMO'
    );

    logger.debug('[LIVE TEST] Completed', { success: result.success, duration: result.duration });
    
    res.json({ 
      success: true, 
      data: result 
    });
  } catch (error: any) {
    logger.error('[LIVE TEST] Error', { error });
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/test/direct-create - Create product directly in Shopify (bypasses VisionSuite)
// This is for demo purposes when MERCH.EXT_PRODUCTS INSERT is not available
router.post('/test/direct-create', asyncHandler(async (req, res) => {
  try {
    const { style_id } = req.body;
    
    if (!style_id) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'style_id is required' } 
      });
    }

    logger.debug('[DIRECT CREATE] Creating product directly in Shopify', { style_id });
    
    // First get style data from VisionSuite
    const styles = await shopifyLiveTestService.getTestableStyles(100);
    let styleData = styles.find(s => s.styleId === style_id);
    
    if (!styleData) {
      // Fallback - create with minimal data
      styleData = {
        styleId: style_id,
        description: `Demo Product ${style_id}`,
        vendorStyleNo: style_id
      };
    }

    const product = await shopifyLiveTestService.createProductDirectInShopify(styleData);
    
    logger.debug('[DIRECT CREATE] Success', { shopifyProductId: product.id });
    
    res.json({ 
      success: true, 
      data: {
        message: 'Product created directly in Shopify',
        shopifyProductId: product.id,
        shopifyUrl: `https://jesta-demo.myshopify.com/admin/products/${product.id}`,
        product: {
          id: product.id,
          title: product.title,
          status: product.status,
          variantCount: product.variants?.length
        }
      }
    });
  } catch (error: any) {
    logger.error('[DIRECT CREATE] Error', { error });
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// ============================================================================
// SHOPIFY ACTIONS API - Full CRUD Operations
// ============================================================================

// POST /api/shopify/stores - Add a new store
router.post('/stores', asyncHandler(async (req, res) => {
  try {
    const { banner_id, description, shop_url, access_token, is_active } = req.body;
    
    if (!banner_id || !shop_url || !access_token) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'banner_id, shop_url, and access_token are required' } 
      });
    }

    const result = await shopifyActionsService.addStore({
      bannerId: banner_id,
      description: description || banner_id,
      shopUrl: shop_url,
      accessToken: access_token,
      isActive: is_active !== false
    });

    res.json({ success: result.success, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// DELETE /api/shopify/stores/:bannerId/products - Delete all products from store
router.delete('/stores/:bannerId/products', asyncHandler(async (req, res) => {
  try {
    const result = await shopifyActionsService.deleteAllProducts(req.params.bannerId as string);
    res.json({ 
      success: result.success, 
      data: { deletedCount: result.deletedCount },
      message: result.message 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/stores/:bannerId/info - Get shop info
router.get('/stores/:bannerId/info', asyncHandler(async (req, res) => {
  try {
    const info = await shopifyActionsService.getShopInfo(req.params.bannerId as string);
    res.json({ success: true, data: info });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/products/create - Create a product in Shopify
router.post('/products/create', asyncHandler(async (req, res) => {
  try {
    const { banner_id, style_id, title, description, vendor, product_type, tags, variants, images } = req.body;
    
    if (!title) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'title is required' } 
      });
    }

    const result = await shopifyActionsService.createProduct(banner_id || 'SHOPIFY_DEMO', {
      styleId: style_id || '',
      title,
      description,
      vendor,
      productType: product_type,
      tags,
      variants,
      images
    });

    res.json({ 
      success: result.success, 
      data: { productId: result.productId, variantIds: result.variantIds },
      message: result.message 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// PUT /api/shopify/products/:productId - Update a product
router.put('/products/:productId', asyncHandler(async (req, res) => {
  try {
    const { banner_id, title, description, product_type, tags } = req.body;
    
    const result = await shopifyActionsService.updateProduct(
      banner_id || 'SHOPIFY_DEMO',
      req.params.productId as string,
      { title, description, productType: product_type, tags }
    );

    res.json({ success: result.success, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// DELETE /api/shopify/products/:productId - Delete a product
router.delete('/products/:productId', asyncHandler(async (req, res) => {
  try {
    const { banner_id } = req.query;
    const result = await shopifyActionsService.deleteProduct(
      banner_id as string || 'SHOPIFY_DEMO',
      req.params.productId as string
    );
    res.json({ success: result.success, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/products/:productId/images - Upload image to product
router.post('/products/:productId/images', asyncHandler(async (req, res) => {
  try {
    const { banner_id, image_url, alt_text } = req.body;
    
    // For URL-based images, we'll download and re-upload via staged uploads
    if (image_url) {
      const response = await fetch(image_url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = image_url.split('/').pop() || 'image.jpg';
      
      const result = await shopifyActionsService.uploadImage(
        banner_id || 'SHOPIFY_DEMO',
        req.params.productId as string,
        { buffer, filename, mimeType: 'image/jpeg', altText: alt_text }
      );
      
      return res.json({ success: result.success, data: { mediaId: result.mediaId }, message: result.message });
    }

    res.status(400).json({ success: false, error: { message: 'image_url is required' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/products/:styleId/sync-images - Sync all images from VisionSuite
router.post('/products/:styleId/sync-images', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, banner_id } = req.body;
    const result = await shopifyActionsService.syncStyleImages(
      parseInt(business_unit_id || '1'),
      req.params.styleId as string,
      banner_id || 'SHOPIFY_DEMO'
    );
    res.json({ success: result.success, data: { syncedCount: result.syncedCount }, errors: result.errors });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/products/live - Get products directly from Shopify
router.get('/products/live', asyncHandler(async (req, res) => {
  try {
    const { banner_id, limit } = req.query;
    const products = await shopifyActionsService.getProducts(
      banner_id as string || 'SHOPIFY_DEMO',
      limit ? parseInt(limit as string) : 50
    );
    res.json({ success: true, data: products });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/inventory/set - Set inventory quantity
router.post('/inventory/set', asyncHandler(async (req, res) => {
  try {
    const { banner_id, variant_id, quantity, location_id } = req.body;
    
    if (!variant_id || quantity === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'variant_id and quantity are required' } 
      });
    }

    const result = await shopifyActionsService.setInventory(
      banner_id || 'SHOPIFY_DEMO',
      { variantId: variant_id, quantity: parseInt(quantity), locationId: location_id }
    );

    res.json({ success: result.success, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/inventory/adjust - Adjust inventory (add/subtract)
router.post('/inventory/adjust', asyncHandler(async (req, res) => {
  try {
    const { banner_id, variant_id, delta, reason } = req.body;
    
    if (!variant_id || delta === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'variant_id and delta are required' } 
      });
    }

    const result = await shopifyActionsService.adjustInventory(
      banner_id || 'SHOPIFY_DEMO',
      { variantId: variant_id, delta: parseInt(delta), reason }
    );

    res.json({ success: result.success, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/inventory/sync-style - Full inventory sync for a style
router.post('/inventory/sync-style', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, style_id, banner_id } = req.body;
    
    if (!style_id) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'style_id is required' } 
      });
    }

    const result = await shopifyActionsService.syncStyleInventory(
      parseInt(business_unit_id || '1'),
      style_id,
      banner_id || 'SHOPIFY_DEMO'
    );

    res.json({ success: result.success, data: { syncedCount: result.syncedCount }, errors: result.errors });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/inventory/levels/:productId - Get inventory levels from Shopify
router.get('/inventory/levels/:productId', asyncHandler(async (req, res) => {
  try {
    const { banner_id } = req.query;
    const levels = await shopifyActionsService.getInventoryLevels(
      banner_id as string || 'SHOPIFY_DEMO',
      req.params.productId as string
    );
    res.json({ success: true, data: levels });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/orders/import - Import orders from Shopify
router.post('/orders/import', asyncHandler(async (req, res) => {
  try {
    const { banner_id, since, status, limit } = req.body;
    const result = await shopifyActionsService.importOrders(
      banner_id || 'SHOPIFY_DEMO',
      { since: since ? new Date(since) : undefined, status, limit }
    );
    res.json({ success: result.success, data: { importedCount: result.importedCount }, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/orders/:orderId/fulfill - Fulfill an order
router.post('/orders/:orderId/fulfill', asyncHandler(async (req, res) => {
  try {
    const { banner_id, line_item_ids, tracking_number, tracking_url, tracking_company, notify_customer } = req.body;
    
    const result = await shopifyActionsService.fulfillOrder(
      banner_id || 'SHOPIFY_DEMO',
      {
        orderId: req.params.orderId as string,
        lineItemIds: line_item_ids,
        trackingNumber: tracking_number,
        trackingUrl: tracking_url,
        trackingCompany: tracking_company,
        notifyCustomer: notify_customer
      }
    );

    res.json({ success: result.success, data: { fulfillmentId: result.fulfillmentId }, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/fulfillments/:fulfillmentId/tracking - Add tracking info
router.post('/fulfillments/:fulfillmentId/tracking', asyncHandler(async (req, res) => {
  try {
    const { banner_id, tracking_number, tracking_url, tracking_company, notify_customer } = req.body;
    
    if (!tracking_number) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'tracking_number is required' } 
      });
    }

    const result = await shopifyActionsService.addTracking(
      banner_id || 'SHOPIFY_DEMO',
      {
        fulfillmentId: req.params.fulfillmentId as string,
        trackingNumber: tracking_number,
        trackingUrl: tracking_url,
        trackingCompany: tracking_company,
        notifyCustomer: notify_customer
      }
    );

    res.json({ success: result.success, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// ============================================================================
// VISIONSUITE-STYLE PUBLISHING ROUTES (SSOT via SHOPIFY_PUBLICATION_QUEUE)
// ============================================================================

// GET /api/shopify/visionsuite/styles - Get styles with Shopify status per banner
router.get('/visionsuite/styles', asyncHandler(async (req, res) => {
  try {
    const { 
      business_unit_id, 
      dept_id, 
      class_id, 
      subclass_id, 
      brand_id, 
      search, 
      limit, 
      offset,
      shopify_status, // 'all', 'published', 'unpublished', 'pending', 'flagged'
      has_images // 'all', 'yes', 'no'
    } = req.query;

    const result = await shopifyService.getVisionSuiteStyles({
      businessUnitId: parseInt(business_unit_id as string || '1'),
      deptId: dept_id as string,
      classId: class_id as string,
      subclassId: subclass_id as string,
      brandId: brand_id as string,
      search: search as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
      shopifyStatus: shopify_status as string || 'all',
      hasImages: has_images as string || 'all'
    });

    res.json({ 
      success: true, 
      data: result.styles, 
      meta: { 
        total: result.total, 
        banners: result.banners 
      } 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/visionsuite/publish - Publish styles via SHOPIFY_PUBLICATION_QUEUE (SSOT)
router.post('/visionsuite/publish', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, style_ids, banner_id, publish } = req.body;

    if (!style_ids || !Array.isArray(style_ids) || style_ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'style_ids array is required' } 
      });
    }
    if (!banner_id) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'banner_id is required (JDWEB, SZWEB, LSWEB, or PLWEB)' } 
      });
    }

    const result = await shopifyService.publishViaStyleCharacteristics({
      businessUnitId: parseInt(business_unit_id || '1'),
      styleIds: style_ids,
      bannerId: banner_id,
      publish: publish !== false // default to true
    });

    res.json({ 
      success: result.failed === 0, 
      data: { 
        success: result.success, 
        failed: result.failed 
      },
      message: `${result.success} styles ${publish !== false ? 'queued for publishing' : 'unpublished'} to ${banner_id}`,
      errors: result.errors.length > 0 ? result.errors : undefined
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/visionsuite/banners - Get available banners for publishing
router.get('/visionsuite/banners', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id } = req.query;
    const banners = await shopifyService.getAvailableBanners(
      parseInt(business_unit_id as string || '1')
    );
    res.json({ success: true, data: banners });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// GET /api/shopify/visionsuite/pending - Get pending activity count
router.get('/visionsuite/pending', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, banner_id } = req.query;
    const count = await shopifyService.getPendingActivityCount(
      parseInt(business_unit_id as string || '1'),
      banner_id as string
    );
    res.json({ success: true, data: { pendingCount: count } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// POST /api/shopify/visionsuite/publish-direct - Direct publish to Shopify (creates products immediately)
router.post('/visionsuite/publish-direct', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, style_ids, banner_id } = req.body;

    if (!style_ids || !Array.isArray(style_ids) || style_ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'style_ids array is required' } 
      });
    }

    if (!banner_id) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'banner_id is required' } 
      });
    }

    const result = await shopifyService.publishDirectToShopify({
      businessUnitId: parseInt(business_unit_id as string || '1'),
      styleIds: style_ids,
      bannerId: banner_id
    });

    res.json({ 
      success: result.success > 0, 
      data: {
        success: result.success,
        failed: result.failed,
        publishedProducts: result.publishedProducts
      },
      message: `${result.success} products published to Shopify, ${result.failed} failed`,
      errors: result.errors.length > 0 ? result.errors : undefined
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/shopify/products/auto-map
 * Retroactively map existing Shopify products to VisionSuite
 * 
 * This is useful when products exist in Shopify but weren't published via FarsightIQ.
 * Matches Shopify products to VisionSuite styles by SKU (variant.sku = STYLE_ID).
 * 
 * Request body: { banner_id: string, business_unit_id?: number }
 */
router.post('/products/auto-map', asyncHandler(async (req, res) => {
  try {
    const { banner_id, business_unit_id } = req.body;
    const buId = parseInt(business_unit_id as string || '1');
    
    if (!banner_id) {
      return res.status(400).json({ success: false, error: { message: 'banner_id is required' } });
    }
    
    // Get credentials for the banner
    const creds = await withConnection(async (conn) => {
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
    
    if (!creds.accessToken) {
      return res.status(400).json({ success: false, error: { message: 'Shopify credentials not configured' } });
    }
    
    // Fetch all products from Shopify
    const shopifyRes = await fetch(`${creds.shopUrl}/admin/api/2024-10/products.json?limit=250`, {
      headers: { 'X-Shopify-Access-Token': creds.accessToken }
    });
    const shopifyData = await shopifyRes.json() as { products: any[] };
    const products = shopifyData.products || [];
    
    let mapped = 0;
    let skipped = 0;
    let notFound = 0;
    const errors: string[] = [];
    
    // Process each product/variant
    for (const product of products) {
      for (const variant of product.variants || []) {
        const sku = variant.sku;
        const shopifyProductId = product.id;
        const shopifyVariantId = variant.id;
        const inventoryItemId = variant.inventory_item_id;
        
        try {
          await withConnection(async (conn) => {
            // Check if mapping exists
            const existingRes = await conn.execute<any>(
              `SELECT 1 FROM MERCH.EXT_PRODUCT_VARIANTS WHERE SHOPIFY_PRODUCT_ID = :pid AND VARIANT_ID = :vid`,
              { pid: shopifyProductId, vid: shopifyVariantId },
              { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            
            if (existingRes.rows && existingRes.rows.length > 0) {
              skipped++;
              return;
            }
            
            // Check if style exists in STYLE_COLORS
            const styleRes = await conn.execute<any>(
              `SELECT COLOR_ID FROM MERCH.STYLE_COLORS WHERE BUSINESS_UNIT_ID = :bu AND STYLE_ID = :sku FETCH FIRST 1 ROWS ONLY`,
              { bu: buId, sku },
              { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            
            if (!styleRes.rows || styleRes.rows.length === 0) {
              notFound++;
              errors.push(`${product.title} (SKU: ${sku}) - Style not found in VisionSuite`);
              return;
            }
            
            const colorId = styleRes.rows[0].COLOR_ID;
            
            // Get barcode info
            const barcodeRes = await conn.execute<any>(
              `SELECT BAR_CODE_ID, SUB_TYPE, SIZE_ID FROM MERCH.BAR_CODES WHERE BUSINESS_UNIT_ID = :bu AND STYLE_ID = :sku FETCH FIRST 1 ROWS ONLY`,
              { bu: buId, sku },
              { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            
            const barcodeId = barcodeRes.rows?.[0]?.BAR_CODE_ID || sku;
            const subType = barcodeRes.rows?.[0]?.SUB_TYPE || 'SKU';
            const sizeId = barcodeRes.rows?.[0]?.SIZE_ID || 'OS';
            
            // Create EXT_PRODUCTS entry
            // Note: Using p_ prefix for bind variables to avoid Oracle reserved word conflicts (e.g., DESC)
            await conn.execute(
              `MERGE INTO MERCH.EXT_PRODUCTS target
               USING (SELECT :p_bu as BU, :p_style as STYLE, :p_banner as BANNER FROM DUAL) source
               ON (target.BUSINESS_UNIT_ID = source.BU AND target.STYLE_ID = source.STYLE AND target.BANNER_ID = source.BANNER)
               WHEN NOT MATCHED THEN
                 INSERT (BUSINESS_UNIT_ID, STYLE_ID, BANNER_ID, SHOPIFY_PRODUCT_ID, TAGS, DESCRIPTION, PRODUCT_TYPE, VENDOR_NAME, CREATED_BY, CREATED_DATE)
                 VALUES (source.BU, source.STYLE, source.BANNER, :p_shopify_product_id, 'AutoMapped', :p_desc, 'General', :p_vendor, 'AUTO_MAPPER', CURRENT_TIMESTAMP)`,
              { p_bu: buId, p_style: sku, p_banner: banner_id, p_shopify_product_id: shopifyProductId, p_desc: product.title, p_vendor: product.vendor || 'Unknown' }
            );
            
            // Create EXT_PRODUCT_VARIANTS entry
            // Note: Using p_ prefix for bind variables to avoid Oracle reserved word conflicts
            await conn.execute(
              `INSERT INTO MERCH.EXT_PRODUCT_VARIANTS (
                BUSINESS_UNIT_ID, STYLE_ID, BANNER_ID, COLOR_ID, SIZE_ID, DIMENSION_ID, COLOR_DESC,
                BARCODE_ID, SUB_TYPE, SKU_ID, COST, COMPARE_PRICE, PRICE, TAXABLE,
                SHOPIFY_PRODUCT_ID, VARIANT_ID, INVENTORY_ITEM_ID, CREATED_BY, CREATED_DATE
              ) VALUES (
                :p_bu, :p_style, :p_banner, :p_color, :p_size_id, ' ', 'Default',
                :p_barcode, :p_sub_type, :p_style, 0, :p_compare_price, :p_price, 'Y',
                :p_shopify_product_id, :p_variant_id, :p_inventory_item_id, 'AUTO_MAPPER', CURRENT_TIMESTAMP
              )`,
              {
                p_bu: buId, p_style: sku, p_banner: banner_id, p_color: colorId, p_size_id: sizeId,
                p_barcode: barcodeId, p_sub_type: subType,
                p_compare_price: variant.compare_at_price ? parseFloat(variant.compare_at_price) : 0,
                p_price: parseFloat(variant.price) || 0,
                p_shopify_product_id: shopifyProductId, p_variant_id: shopifyVariantId, p_inventory_item_id: inventoryItemId
              }
            );
            
            await conn.commit();
            mapped++;
          });
        } catch (err: any) {
          errors.push(`${product.title} (${sku}): ${err.message?.substring(0, 60)}`);
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        totalProducts: products.length,
        mapped,
        skipped,
        notFound,
        errors: errors.slice(0, 10) // Limit errors returned
      },
      message: `Auto-mapped ${mapped} products, ${skipped} already mapped, ${notFound} not found in VisionSuite`
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// TEMPORARY: GET /api/shopify/debug/schema - Debug database schema
router.get('/debug/schema', asyncHandler(async (req, res) => {
  try {
    const { table } = req.query;
    
    const result = await withConnection(async (conn) => {
      if (table) {
        // Get columns for specific table
        const cols = await conn.execute<any>(
          `SELECT column_name, data_type, nullable FROM user_tab_columns WHERE table_name = :tableName ORDER BY column_id`,
          { tableName: (table as string).toUpperCase() },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return { table, columns: cols.rows };
      } else {
        // List all tables
        const tables = await conn.execute<any>(
          `SELECT table_name FROM user_tables WHERE table_name LIKE '%ECOMM%' OR table_name LIKE '%BANNER%' OR table_name LIKE '%PRODUCT%' OR table_name LIKE '%SHOPIFY%' ORDER BY table_name`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const views = await conn.execute<any>(
          `SELECT view_name FROM user_views WHERE view_name LIKE '%ECOMM%' OR view_name LIKE '%BANNER%' OR view_name LIKE '%PRODUCT%' OR view_name LIKE '%SHOPIFY%' ORDER BY view_name`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return { 
          tables: tables.rows?.map((r: any) => r.TABLE_NAME) || [], 
          views: views.rows?.map((r: any) => r.VIEW_NAME) || []
        };
      }
    });
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/shopify/mapping/sku-fallback
 * Create product mapping using SKU lookup (fallback for missing Shopify IDs)
 * 
 * Use Case: When Shopify product_id/variant_id are null (deleted products, manual orders)
 * Industry Pattern: Similar to Odoo's "auto-create on order import" feature
 * 
 * Request body: {
 *   sku: string,           // Required - VisionSuite style ID / SKU
 *   business_unit_id?: number, // Default: 1
 *   banner_id?: string,    // Default: 'BASE'
 *   shopify_product_id?: number, // Optional - if known
 *   shopify_variant_id?: number  // Optional - if known
 * }
 */
router.post('/mapping/sku-fallback', asyncHandler(async (req, res) => {
  try {
    const { sku, business_unit_id, banner_id, shopify_product_id, shopify_variant_id } = req.body;
    
    if (!sku) {
      return res.status(400).json({ success: false, error: { message: 'sku is required' } });
    }
    
    const result = await shopifyService.createMappingBySku({
      sku,
      businessUnitId: parseInt(business_unit_id as string || '1'),
      bannerId: banner_id || 'BASE',
      shopifyProductId: shopify_product_id ? parseInt(shopify_product_id) : null,
      shopifyVariantId: shopify_variant_id ? parseInt(shopify_variant_id) : null
    });
    
    res.json({ success: result.success, data: result, message: result.message });
  } catch (error: any) {
    logger.error('[SKU-MAPPING] Error:', error);
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/shopify/orders/auto-map-rejected
 * Automatically map rejected order items using SKU lookup
 * 
 * Scans STG_ORDER_DETAILS for items with missing mappings and attempts
 * to create mappings using SKU-based fallback.
 * 
 * Request body: {
 *   business_unit_id?: number, // Default: 1
 *   banner_id?: string         // Default: 'BASE'
 * }
 */
router.post('/orders/auto-map-rejected', asyncHandler(async (req, res) => {
  try {
    const { business_unit_id, banner_id } = req.body;
    
    const result = await shopifyService.autoMapRejectedOrderItems(
      parseInt(business_unit_id as string || '1'),
      banner_id || 'BASE'
    );
    
    res.json({
      success: true,
      data: result,
      message: `Processed ${result.processed} items: ${result.mapped} mapped, ${result.failed} failed`
    });
  } catch (error: any) {
    logger.error('[AUTO-MAP] Error:', error);
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

export default router;
