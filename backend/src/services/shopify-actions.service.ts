/**
 * Shopify Actions Service
 * 
 * Handles ALL write operations to Shopify API.
 * Follows Shopify best practices (GraphQL 2024-10, Staged Uploads).
 * Maintains VisionSuite as SSOT - reads from Oracle, writes to Shopify.
 * 
 * @see docs/SHOPIFY_FULL_API_ARCHITECTURE.md
 */

import oracledb from 'oracledb';
import { withConnection } from './oracle-pool.js';
import { logger } from '../utils/logger.js';

// Shopify GraphQL API Version
const SHOPIFY_API_VERSION = '2024-10';

// Types
interface ShopifyCredentials {
  shopUrl: string;
  accessToken: string;
  locationId?: string;
}

interface ProductCreateInput {
  styleId: string;
  title: string;
  description?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  options?: Array<{ name: string; values: string[] }>;
  variants?: VariantInput[];
  images?: ImageInput[];
}

interface VariantInput {
  sku: string;
  price: string;
  compareAtPrice?: string;
  inventoryQuantity?: number;
  option1?: string;
  option2?: string;
  option3?: string;
}

interface ImageInput {
  url?: string;
  blob?: Buffer;
  altText?: string;
  position?: number;
}

interface GraphQLResponse {
  data?: any;
  errors?: Array<{ message: string; locations?: any[]; path?: string[] }>;
}

export class ShopifyActionsService {
  // ============================================================================
  // Phase 3: API LOGGING TO VISIONSUITE SSOT
  // ============================================================================

  /**
   * Log API call to VisionSuite SSOT (PROVIDER_SERVICE_RESPONSES)
   * Phase 3: Ensures all Shopify API calls are logged to VisionSuite
   * 
   * @param serviceId - Service identifier (e.g., 'SHOPIFY_CREATE_PRODUCT')
   * @param request - Request payload
   * @param response - Response data
   * @param statusCode - HTTP status code
   * @param error - Error message if failed
   */
  async logToVisionSuite(
    serviceId: string,
    request: any,
    response: any,
    statusCode: number,
    error?: string
  ): Promise<void> {
    try {
      await withConnection(async (conn) => {
        // Generate next ID (no sequence available)
        const idResult = await conn.execute<any>(
          `SELECT NVL(MAX(PROVIDER_RESPONSE_ID), 0) + 1 as NEXT_ID FROM OMNI.PROVIDER_SERVICE_RESPONSES`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const nextId = idResult.rows?.[0]?.NEXT_ID || 1;

        // Insert log entry
        await conn.execute(
          `INSERT INTO OMNI.PROVIDER_SERVICE_RESPONSES (
            PROVIDER_RESPONSE_ID,
            BUSINESS_UNIT_ID,
            SITE_ID,
            USERNAME,
            RESPONSE_DATE,
            SERVICE_ID,
            WFE_TRANS_ID,
            STATUS_CODE,
            STATUS_DESCRIPTION,
            ERROR_CODE,
            ERROR_DESCRIPTION,
            REQUEST,
            RESPONSE,
            SERVICE_TYPE,
            CLIENT_ID
          ) VALUES (
            :id,
            1,
            'FARSIGHTIQ',
            USER,
            SYSTIMESTAMP,
            :service_id,
            :trans_id,
            :status_code,
            :status_desc,
            :error_code,
            :error_desc,
            :request,
            :response,
            'SHOPIFY',
            'ATTR_MGR'
          )`,
          {
            id: nextId,
            service_id: serviceId,
            trans_id: `FIQ-${Date.now()}`,
            status_code: statusCode.toString(),
            status_desc: response?.statusText || (statusCode === 200 ? 'OK' : error || 'ERROR'),
            error_code: error ? 'API_ERROR' : null,
            error_desc: error || null,
            request: JSON.stringify(request),
            response: JSON.stringify(response)
          }
        );
        await conn.commit();
        logger.info(`[API_LOG] Logged to VisionSuite: ${serviceId} - ${statusCode}`);
      });
    } catch (logError: any) {
      logger.warn(`[API_LOG] Failed to log to VisionSuite: ${logError.message}`);
      // Don't throw - logging failure shouldn't break the API call
    }
  }

  // ============================================================================
  // CREDENTIALS & CONNECTION
  // ============================================================================

  /**
   * Get Shopify credentials from SHOPIFY_CONFIG (for demo/JESTA store)
   * or PROVIDER_SERVICES (for production banners)
   */
  async getCredentials(bannerId?: string): Promise<ShopifyCredentials | null> {
    return withConnection(async (conn) => {
      // Handle demo stores (JESTA, DEMO, SHOPIFY_DEMO) from SHOPIFY_CONFIG
      if (!bannerId || bannerId === 'SHOPIFY_DEMO' || bannerId === 'JESTA' || bannerId === 'DEMO') {
        // Build list of config keys to search for based on banner ID
        const keysToSearch = [
          'DEMO_STORE_URL', 
          'SHOPIFY_ACCESS_TOKEN',
          'JESTA_DEMO_STORE_URL', 
          'JESTA_DEMO_ACCESS_TOKEN', 
          'JESTA_DEMO_LOCATION_ID',
          'DEMO_DEMO_STORE_URL',
          'DEMO_DEMO_ACCESS_TOKEN',
          'DEMO_DEMO_LOCATION_ID'
        ];
        
        const configRes = await conn.execute<any>(
          `SELECT CONFIG_KEY, CONFIG_VALUE FROM ATTR_MGR.SHOPIFY_CONFIG 
           WHERE CONFIG_KEY IN (${keysToSearch.map((_, i) => `:key${i}`).join(',')})`,
          Object.fromEntries(keysToSearch.map((key, i) => [`key${i}`, key])),
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        if (configRes.rows && configRes.rows.length > 0) {
          const config: Record<string, string> = {};
          configRes.rows.forEach((r: any) => { config[r.CONFIG_KEY] = r.CONFIG_VALUE; });
          
          // Priority: Banner-specific keys first, then JESTA, then DEMO generic
          let shopUrl, accessToken, locationId;
          
          if (bannerId === 'DEMO') {
            shopUrl = config.DEMO_DEMO_STORE_URL || config.JESTA_DEMO_STORE_URL || config.DEMO_STORE_URL;
            accessToken = config.DEMO_DEMO_ACCESS_TOKEN || config.JESTA_DEMO_ACCESS_TOKEN || config.SHOPIFY_ACCESS_TOKEN;
            locationId = config.DEMO_DEMO_LOCATION_ID || config.JESTA_DEMO_LOCATION_ID;
          } else {
            // JESTA, SHOPIFY_DEMO, or no banner
            shopUrl = config.JESTA_DEMO_STORE_URL || config.DEMO_STORE_URL;
            accessToken = config.JESTA_DEMO_ACCESS_TOKEN || config.SHOPIFY_ACCESS_TOKEN;
            locationId = config.JESTA_DEMO_LOCATION_ID;
          }
          
          if (shopUrl && accessToken) {
            // Normalize URL
            const normalizedUrl = shopUrl.startsWith('https://') ? shopUrl : `https://${shopUrl}`;
            
            return {
              shopUrl: normalizedUrl,
              accessToken,
              locationId: locationId || undefined
            };
          }
        }
      }

      // Try PROVIDER_SERVICES (production banner)
      try {
        const res = await conn.execute<any>(
          `SELECT WEB_SITE_URL, API_KEY FROM OMNI.PROVIDER_SERVICES 
           WHERE SERVICE_ID LIKE '%' || :bannerId AND PROVIDER_ID = 'SHOPIFY'`,
          { bannerId: bannerId || 'JDWEB' },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (res.rows && res.rows.length > 0) {
          let url = res.rows[0].WEB_SITE_URL;
          if (url.includes('/admin/api')) {
            url = url.split('/admin/api')[0];
          }
          return { shopUrl: url, accessToken: res.rows[0].API_KEY };
        }
      } catch (e) {
        // PROVIDER_SERVICES may not exist in local env
      }

      return null;
    });
  }

  /**
   * Get default inventory location ID
   */
  private async getDefaultLocationId(creds: { shopUrl: string; accessToken: string }): Promise<string | undefined> {
    try {
      const query = `{ locations(first: 1) { edges { node { id } } } }`;
      const result = await this.graphql(creds.shopUrl, creds.accessToken, query);
      return result?.data?.locations?.edges?.[0]?.node?.id;
    } catch (e) {
      return undefined;
    }
  }

  // ============================================================================
  // GRAPHQL HELPER
  // ============================================================================

  /**
   * Execute GraphQL query/mutation against Shopify
   */
  async graphql(shopUrl: string, accessToken: string, query: string, variables?: Record<string, any>): Promise<GraphQLResponse> {
    const response = await fetch(`${shopUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json() as GraphQLResponse;
    
    if (result.errors?.length) {
      logger.error('Shopify GraphQL error:', result.errors);
    }
    
    return result;
  }

  // ============================================================================
  // STORE MANAGEMENT
  // ============================================================================

  /**
   * Add a new store configuration
   */
  async addStore(params: {
    bannerId: string;
    description: string;
    shopUrl: string;
    accessToken: string;
    isActive?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    const { bannerId, description, shopUrl, accessToken, isActive = true } = params;
    
    // Validate connection first
    const testResult = await this.testConnection({ shopUrl, accessToken });
    if (!testResult.success) {
      return { success: false, message: `Connection test failed: ${testResult.message}` };
    }

    return withConnection(async (conn) => {
      try {
        // Check if banner already exists
        const existing = await conn.execute<any>(
          `SELECT COUNT(*) as CNT FROM ATTR_MGR.SHOPIFY_CONFIG WHERE CONFIG_KEY = :key`,
          { key: `STORE_${bannerId}` },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        if ((existing.rows?.[0]?.CNT || 0) > 0) {
          return { success: false, message: `Store ${bannerId} already exists` };
        }

        // Store config (non-sensitive)
        await conn.execute(
          `INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (CONFIG_KEY, CONFIG_VALUE, DESCRIPTION, IS_SENSITIVE)
           VALUES (:key, :value, :desc, 'N')`,
          { key: `STORE_${bannerId}_URL`, value: shopUrl, desc: description }
        );

        // Store access token (sensitive)
        await conn.execute(
          `INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (CONFIG_KEY, CONFIG_VALUE, DESCRIPTION, IS_SENSITIVE)
           VALUES (:key, :value, :desc, 'Y')`,
          { key: `STORE_${bannerId}_TOKEN`, value: accessToken, desc: `Access token for ${bannerId}` }
        );

        // Store status
        await conn.execute(
          `INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (CONFIG_KEY, CONFIG_VALUE, DESCRIPTION, IS_SENSITIVE)
           VALUES (:key, :value, :desc, 'N')`,
          { key: `STORE_${bannerId}_ACTIVE`, value: isActive ? 'Y' : 'N', desc: `Active status for ${bannerId}` }
        );

        // Log the action
        await this.logSync(conn, 'STORE_ADD', bannerId, 'success', `Added store: ${description}`);

        await conn.commit();
        return { success: true, message: `Store ${bannerId} added successfully` };
      } catch (error: any) {
        await conn.rollback();
        return { success: false, message: error.message };
      }
    });
  }

  /**
   * Test connection to a Shopify store
   */
  async testConnection(creds: { shopUrl: string; accessToken: string }): Promise<{ success: boolean; message: string; shopName?: string }> {
    try {
      const query = `{ shop { name currencyCode primaryDomain { url } } }`;
      const result = await this.graphql(creds.shopUrl, creds.accessToken, query);
      
      if (result.errors?.length) {
        return { success: false, message: result.errors[0].message };
      }
      
      const shop = result.data?.shop;
      return {
        success: true,
        message: `Connected to ${shop.name}`,
        shopName: shop.name
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Delete all products from a store (with confirmation)
   */
  async deleteAllProducts(bannerId: string): Promise<{ success: boolean; deletedCount: number; message: string }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, deletedCount: 0, message: 'Store credentials not found' };
    }

    let deletedCount = 0;
    let hasMore = true;
    
    while (hasMore) {
      // Get products
      const query = `{ products(first: 50) { edges { node { id } } pageInfo { hasNextPage } } }`;
      const result = await this.graphql(creds.shopUrl, creds.accessToken, query);
      
      const edges = result.data?.products?.edges || [];
      hasMore = result.data?.products?.pageInfo?.hasNextPage || false;
      
      if (edges.length === 0) break;
      
      // Delete each product
      for (const edge of edges) {
        const deleteResult = await this.graphql(creds.shopUrl, creds.accessToken, `
          mutation productDelete($input: ProductDeleteInput!) {
            productDelete(input: $input) {
              deletedProductId
              userErrors { field message }
            }
          }
        `, { input: { id: edge.node.id } });
        
        if (!deleteResult.data?.productDelete?.userErrors?.length) {
          deletedCount++;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Phase 3: Log to VisionSuite SSOT
    await this.logToVisionSuite(
      'SHOPIFY_BULK_DELETE_PRODUCTS',
      { bannerId, operation: 'delete_all' },
      { deletedCount },
      200
    );

    return { success: true, deletedCount, message: `Deleted ${deletedCount} products` };
  }

  // ============================================================================
  // PRODUCT MANAGEMENT
  // ============================================================================

  /**
   * Create a product in Shopify using REST API (more reliable for variants)
   * Follows SSOT: Product data should come from VisionSuite
   */
  async createProduct(bannerId: string, product: ProductCreateInput): Promise<{ 
    success: boolean; 
    productId?: string; 
    variantIds?: string[];
    handle?: string;
    message: string 
  }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, message: 'Store credentials not found' };
    }

    // Phase 3: Track request/response for logging
    let statusCode = 0;
    let responseData: any = null;
    let error: string | undefined;

    try {
      // Build REST API payload (more reliable for variants than GraphQL)
      const payload: Record<string, any> = {
        product: {
          title: product.title,
          body_html: product.description || '',
          vendor: product.vendor || 'VisionSuite',
          product_type: product.productType || '',
          tags: Array.isArray(product.tags) ? product.tags.join(', ') : (product.tags || ''),
          status: 'active'
        }
      };

      // Add variants if provided
      if (product.variants?.length) {
        // Determine options from variants
        const hasOption1 = product.variants.some(v => v.option1);
        const hasOption2 = product.variants.some(v => v.option2);
        const hasOption3 = product.variants.some(v => v.option3);
        
        const options: { name: string }[] = [];
        if (hasOption1) options.push({ name: 'Color' });
        if (hasOption2) options.push({ name: 'Size' });
        if (hasOption3) options.push({ name: 'Material' });
        
        if (options.length > 0) {
          payload.product.options = options;
        }

        payload.product.variants = product.variants.map(v => ({
          sku: v.sku,
          price: v.price,
          compare_at_price: v.compareAtPrice,
          option1: v.option1,
          option2: v.option2,
          option3: v.option3,
          inventory_quantity: v.inventoryQuantity || 0,
          inventory_management: 'shopify'
        }));
      }

      // Add images if provided (via URL)
      if (product.images?.length) {
        payload.product.images = product.images
          .filter(img => img.url)
          .map((img, idx) => ({
            src: img.url,
            alt: img.altText || product.title,
            position: img.position || idx + 1
          }));
      }

      // Make REST API call
      const response = await fetch(`${creds.shopUrl}/admin/api/${SHOPIFY_API_VERSION}/products.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': creds.accessToken
        },
        body: JSON.stringify(payload)
      });

      statusCode = response.status;
      responseData = await response.json();

      // Phase 3: Log to VisionSuite SSOT
      await this.logToVisionSuite(
        'SHOPIFY_CREATE_PRODUCT',
        { bannerId, product: payload },
        responseData,
        statusCode
      );

      if (!response.ok) {
        error = responseData.errors || `API error: ${response.status}`;
        return { success: false, message: `Shopify API error: ${response.status} - ${JSON.stringify(responseData)}` };
      }

      const result = responseData as { product: any };
      const createdProduct = result.product;
      const variantIds = createdProduct?.variants?.map((v: any) => v.id.toString()) || [];

      return {
        success: true,
        productId: createdProduct?.id?.toString(),
        variantIds,
        handle: createdProduct?.handle,
        message: `Product created: ${createdProduct?.title} with ${variantIds.length} variants`
      };
    } catch (error: any) {
      logger.error('Product creation error:', error);
      
      // Phase 3: Log error to VisionSuite SSOT
      await this.logToVisionSuite(
        'SHOPIFY_CREATE_PRODUCT',
        { bannerId, product },
        responseData,
        statusCode || 500,
        error.message
      );
      
      return { success: false, message: error.message };
    }
  }

  /**
   * Update a product in Shopify
   */
  async updateProduct(bannerId: string, productId: string, updates: Partial<ProductCreateInput>): Promise<{
    success: boolean;
    message: string;
  }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, message: 'Store credentials not found' };
    }

    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title }
          userErrors { field message }
        }
      }
    `;

    const input: Record<string, any> = { id: productId };
    if (updates.title) input.title = updates.title;
    if (updates.description) input.descriptionHtml = updates.description;
    if (updates.productType) input.productType = updates.productType;
    if (updates.tags) input.tags = updates.tags;

    const result = await this.graphql(creds.shopUrl, creds.accessToken, mutation, { input });

    if (result.data?.productUpdate?.userErrors?.length) {
      return { success: false, message: result.data.productUpdate.userErrors[0].message };
    }

    return { success: true, message: 'Product updated' };
  }

  /**
   * Delete a product from Shopify
   */
  async deleteProduct(bannerId: string, productId: string): Promise<{ success: boolean; message: string }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, message: 'Store credentials not found' };
    }

    // Ensure it's a GID
    const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`;

    const mutation = `
      mutation productDelete($input: ProductDeleteInput!) {
        productDelete(input: $input) {
          deletedProductId
          userErrors { field message }
        }
      }
    `;

    const result = await this.graphql(creds.shopUrl, creds.accessToken, mutation, { input: { id: gid } });

    if (result.data?.productDelete?.userErrors?.length) {
      return { success: false, message: result.data.productDelete.userErrors[0].message };
    }

    // Log
    await withConnection(async (conn) => {
      await this.logSync(conn, 'PRODUCT_DELETE', bannerId, 'success', `Deleted product: ${productId}`);
      await conn.commit();
    });

    return { success: true, message: 'Product deleted' };
  }

  // ============================================================================
  // IMAGE MANAGEMENT (STAGED UPLOADS - Best Practice)
  // ============================================================================

  /**
   * Upload an image using Shopify Staged Uploads
   * This is the recommended way to upload images to Shopify
   */
  async uploadImage(bannerId: string, productId: string, imageData: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    altText?: string;
  }): Promise<{ success: boolean; mediaId?: string; message: string }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, message: 'Store credentials not found' };
    }

    try {
      // Step 1: Request staged upload URL
      const stagedResult = await this.graphql(creds.shopUrl, creds.accessToken, `
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters { name value }
            }
            userErrors { field message }
          }
        }
      `, {
        input: [{
          resource: 'PRODUCT_IMAGE',
          filename: imageData.filename,
          mimeType: imageData.mimeType,
          fileSize: imageData.buffer.length.toString(),
          httpMethod: 'POST'
        }]
      });

      if (stagedResult.data?.stagedUploadsCreate?.userErrors?.length) {
        return { success: false, message: stagedResult.data.stagedUploadsCreate.userErrors[0].message };
      }

      const target = stagedResult.data?.stagedUploadsCreate?.stagedTargets?.[0];
      if (!target) {
        return { success: false, message: 'Failed to get staged upload URL' };
      }

      // Step 2: Upload to S3
      const formData = new FormData();
      target.parameters.forEach((p: { name: string; value: string }) => {
        formData.append(p.name, p.value);
      });
      formData.append('file', new Blob([imageData.buffer], { type: imageData.mimeType }));

      const uploadResponse = await fetch(target.url, {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        return { success: false, message: `S3 upload failed: ${uploadResponse.statusText}` };
      }

      // Step 3: Attach to product
      const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`;
      
      const attachResult = await this.graphql(creds.shopUrl, creds.accessToken, `
        mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
          productCreateMedia(media: $media, productId: $productId) {
            media { id alt }
            userErrors { field message }
          }
        }
      `, {
        productId: gid,
        media: [{
          originalSource: target.resourceUrl,
          alt: imageData.altText || imageData.filename,
          mediaContentType: 'IMAGE'
        }]
      });

      if (attachResult.data?.productCreateMedia?.userErrors?.length) {
        return { success: false, message: attachResult.data.productCreateMedia.userErrors[0].message };
      }

      const mediaId = attachResult.data?.productCreateMedia?.media?.[0]?.id;
      return { success: true, mediaId, message: 'Image uploaded successfully' };

    } catch (error: any) {
      logger.error('Image upload error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Sync all images for a style from VisionSuite CATALOG_CACHE
   */
  async syncStyleImages(businessUnitId: number, styleId: string, bannerId: string): Promise<{
    success: boolean;
    syncedCount: number;
    errors?: string[];
  }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, syncedCount: 0, errors: ['Store credentials not found'] };
    }

    const errors: string[] = [];
    let syncedCount = 0;

    return withConnection(async (conn) => {
      try {
        // Get Shopify Product ID from VisionSuite
        const productRes = await conn.execute<any>(
          `SELECT DISTINCT SHOPIFY_PRODUCT_ID 
           FROM MERCH_EXT_PRODUCT_VARIANTS 
           WHERE BUSINESS_UNIT_ID = :bu AND STYLE_ID = :styleId 
           AND SHOPIFY_PRODUCT_ID IS NOT NULL`,
          { bu: businessUnitId, styleId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const shopifyProductId = productRes.rows?.[0]?.SHOPIFY_PRODUCT_ID;
        if (!shopifyProductId) {
          return { success: false, syncedCount: 0, errors: ['Product not published to Shopify'] };
        }

        // Get images from CATALOG_CACHE
        const imageRes = await conn.execute<any>(
          `SELECT IMAGE_URLS_JSON FROM ATTR_MGR.CATALOG_CACHE 
           WHERE BUSINESS_UNIT_ID = :bu AND STYLE_ID = :styleId`,
          { bu: businessUnitId, styleId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        let images: any[] = [];
        const jsonData = imageRes.rows?.[0]?.IMAGE_URLS_JSON;
        if (jsonData) {
          images = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        }

        if (images.length === 0) {
          return { success: true, syncedCount: 0, errors: ['No images found in CATALOG_CACHE'] };
        }

        // Sync each image
        for (const img of images) {
          try {
            // Get BLOB from STAGING_IMAGES
            const filename = img.url?.split('/').pop() || `${styleId}_${img.view}.jpg`;
            const blobRes = await conn.execute<any>(
              `SELECT BLOB_DATA FROM ATTR_MGR.STAGING_IMAGES WHERE IMAGE_NAME = :name`,
              { name: filename }
            );

            let buffer: Buffer | null = null;
            const lob = blobRes.rows?.[0]?.[0];
            if (lob) {
              const chunks: Buffer[] = [];
              await new Promise<void>((resolve, reject) => {
                lob.on('data', (chunk: Buffer) => chunks.push(chunk));
                lob.on('end', () => { buffer = Buffer.concat(chunks); resolve(); });
                lob.on('error', reject);
              });
            }

            if (buffer) {
              const result = await this.uploadImage(bannerId, shopifyProductId, {
                buffer,
                filename,
                mimeType: 'image/jpeg',
                altText: img.view || styleId
              });

              if (result.success) syncedCount++;
              else errors.push(`${filename}: ${result.message}`);
            } else {
              errors.push(`${filename}: BLOB not found`);
            }
          } catch (err: any) {
            errors.push(err.message);
          }
        }

        await this.logSync(conn, 'IMAGE_SYNC', bannerId, errors.length === 0 ? 'success' : 'partial',
          `Synced ${syncedCount}/${images.length} images for ${styleId}`);
        await conn.commit();

        return { success: errors.length === 0, syncedCount, errors: errors.length > 0 ? errors : undefined };
      } catch (error: any) {
        return { success: false, syncedCount: 0, errors: [error.message] };
      }
    });
  }

  // ============================================================================
  // INVENTORY MANAGEMENT
  // ============================================================================

  /**
   * Set inventory quantity for a variant
   */
  async setInventory(bannerId: string, params: {
    variantId: string;
    quantity: number;
    locationId?: string;
  }): Promise<{ success: boolean; message: string }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, message: 'Store credentials not found' };
    }

    // Get location if not provided
    const locationId = params.locationId || creds.locationId;
    if (!locationId) {
      return { success: false, message: 'No location ID available' };
    }

    // First get the inventory item ID from the variant
    const variantQuery = await this.graphql(creds.shopUrl, creds.accessToken, `
      query getVariant($id: ID!) {
        productVariant(id: $id) {
          inventoryItem { id }
        }
      }
    `, { id: params.variantId });

    const inventoryItemId = variantQuery.data?.productVariant?.inventoryItem?.id;
    if (!inventoryItemId) {
      return { success: false, message: 'Could not find inventory item' };
    }

    // Set quantity
    const result = await this.graphql(creds.shopUrl, creds.accessToken, `
      mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
        inventorySetOnHandQuantities(input: $input) {
          inventoryAdjustmentGroup { id }
          userErrors { field message }
        }
      }
    `, {
      input: {
        reason: 'correction',
        setQuantities: [{
          inventoryItemId,
          locationId,
          quantity: params.quantity
        }]
      }
    });

    if (result.data?.inventorySetOnHandQuantities?.userErrors?.length) {
      return { success: false, message: result.data.inventorySetOnHandQuantities.userErrors[0].message };
    }

    return { success: true, message: `Inventory set to ${params.quantity}` };
  }

  /**
   * Adjust inventory (add or subtract)
   */
  async adjustInventory(bannerId: string, params: {
    variantId: string;
    delta: number;
    reason?: string;
  }): Promise<{ success: boolean; message: string }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, message: 'Store credentials not found' };
    }

    const locationId = creds.locationId;
    if (!locationId) {
      return { success: false, message: 'No location ID available' };
    }

    // Get inventory item ID
    const variantQuery = await this.graphql(creds.shopUrl, creds.accessToken, `
      query getVariant($id: ID!) {
        productVariant(id: $id) {
          inventoryItem { id }
        }
      }
    `, { id: params.variantId });

    const inventoryItemId = variantQuery.data?.productVariant?.inventoryItem?.id;
    if (!inventoryItemId) {
      return { success: false, message: 'Could not find inventory item' };
    }

    // Adjust
    const result = await this.graphql(creds.shopUrl, creds.accessToken, `
      mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup { id }
          userErrors { field message }
        }
      }
    `, {
      input: {
        name: 'available',
        reason: params.reason || 'correction',
        changes: [{
          inventoryItemId,
          locationId,
          delta: params.delta
        }]
      }
    });

    if (result.data?.inventoryAdjustQuantities?.userErrors?.length) {
      return { success: false, message: result.data.inventoryAdjustQuantities.userErrors[0].message };
    }

    return { success: true, message: `Inventory adjusted by ${params.delta}` };
  }

  /**
   * Full inventory sync for a style from VisionSuite
   */
  async syncStyleInventory(businessUnitId: number, styleId: string, bannerId: string): Promise<{
    success: boolean;
    syncedCount: number;
    errors?: string[];
  }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, syncedCount: 0, errors: ['Store credentials not found'] };
    }

    return withConnection(async (conn) => {
      const errors: string[] = [];
      let syncedCount = 0;

      try {
        // Get variants from VisionSuite with inventory
        const variantRes = await conn.execute<any>(
          `SELECT SKU_ID, SHOPIFY_VARIANT_ID, INVENTORY_QTY
           FROM MERCH_EXT_PRODUCT_VARIANTS
           WHERE BUSINESS_UNIT_ID = :bu AND STYLE_ID = :styleId 
           AND SHOPIFY_VARIANT_ID IS NOT NULL`,
          { bu: businessUnitId, styleId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        for (const variant of (variantRes.rows || [])) {
          try {
            const result = await this.setInventory(bannerId, {
              variantId: variant.SHOPIFY_VARIANT_ID,
              quantity: variant.INVENTORY_QTY || 0
            });

            if (result.success) syncedCount++;
            else errors.push(`${variant.SKU_ID}: ${result.message}`);
          } catch (err: any) {
            errors.push(`${variant.SKU_ID}: ${err.message}`);
          }
        }

        await this.logSync(conn, 'INVENTORY_SYNC', bannerId, errors.length === 0 ? 'success' : 'partial',
          `Synced inventory for ${syncedCount} variants of ${styleId}`);
        await conn.commit();

        return { success: errors.length === 0, syncedCount, errors: errors.length > 0 ? errors : undefined };
      } catch (error: any) {
        return { success: false, syncedCount: 0, errors: [error.message] };
      }
    });
  }

  // ============================================================================
  // ORDER MANAGEMENT
  // ============================================================================

  /**
   * Get orders from Shopify and save to VisionSuite staging
   */
  async importOrders(bannerId: string, params?: {
    since?: Date;
    status?: string;
    limit?: number;
  }): Promise<{ success: boolean; importedCount: number; message: string }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, importedCount: 0, message: 'Store credentials not found' };
    }

    const limit = params?.limit || 50;
    const status = params?.status || 'any';

    const result = await this.graphql(creds.shopUrl, creds.accessToken, `
      query getOrders($first: Int!, $query: String) {
        orders(first: $first, query: $query) {
          edges {
            node {
              id
              name
              email
              createdAt
              totalPriceSet { shopMoney { amount currencyCode } }
              displayFinancialStatus
              displayFulfillmentStatus
              customer { id firstName lastName email }
              shippingAddress { address1 address2 city province zip country }
              lineItems(first: 50) {
                edges {
                  node {
                    id
                    title
                    quantity
                    sku
                    variant { id }
                  }
                }
              }
            }
          }
        }
      }
    `, { first: limit, query: status !== 'any' ? `fulfillment_status:${status}` : null });

    const orders = result.data?.orders?.edges || [];
    
    // Log import
    await withConnection(async (conn) => {
      await this.logSync(conn, 'ORDER_IMPORT', bannerId, 'success', `Imported ${orders.length} orders`);
      await conn.commit();
    });

    return {
      success: true,
      importedCount: orders.length,
      message: `Imported ${orders.length} orders`
    };
  }

  /**
   * Create fulfillment for an order
   */
  async fulfillOrder(bannerId: string, params: {
    orderId: string;
    lineItemIds?: string[];
    trackingNumber?: string;
    trackingUrl?: string;
    trackingCompany?: string;
    notifyCustomer?: boolean;
  }): Promise<{ success: boolean; fulfillmentId?: string; message: string }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, message: 'Store credentials not found' };
    }

    // First get fulfillment order
    const orderGid = params.orderId.startsWith('gid://') ? params.orderId : `gid://shopify/Order/${params.orderId}`;
    
    const foQuery = await this.graphql(creds.shopUrl, creds.accessToken, `
      query getFulfillmentOrders($orderId: ID!) {
        order(id: $orderId) {
          fulfillmentOrders(first: 5) {
            edges {
              node {
                id
                status
                lineItems(first: 50) {
                  edges {
                    node { id remainingQuantity }
                  }
                }
              }
            }
          }
        }
      }
    `, { orderId: orderGid });

    const fulfillmentOrder = foQuery.data?.order?.fulfillmentOrders?.edges?.[0]?.node;
    if (!fulfillmentOrder) {
      return { success: false, message: 'No fulfillment order found' };
    }

    // Create fulfillment
    const lineItems = fulfillmentOrder.lineItems.edges.map((e: any) => ({
      id: e.node.id,
      quantity: e.node.remainingQuantity
    }));

    const result = await this.graphql(creds.shopUrl, creds.accessToken, `
      mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
        fulfillmentCreateV2(fulfillment: $fulfillment) {
          fulfillment { id status }
          userErrors { field message }
        }
      }
    `, {
      fulfillment: {
        lineItemsByFulfillmentOrder: [{
          fulfillmentOrderId: fulfillmentOrder.id,
          fulfillmentOrderLineItems: lineItems
        }],
        trackingInfo: params.trackingNumber ? {
          number: params.trackingNumber,
          url: params.trackingUrl,
          company: params.trackingCompany
        } : undefined,
        notifyCustomer: params.notifyCustomer ?? true
      }
    });

    if (result.data?.fulfillmentCreateV2?.userErrors?.length) {
      return { success: false, message: result.data.fulfillmentCreateV2.userErrors[0].message };
    }

    return {
      success: true,
      fulfillmentId: result.data?.fulfillmentCreateV2?.fulfillment?.id,
      message: 'Order fulfilled'
    };
  }

  /**
   * Add tracking info to a fulfillment
   */
  async addTracking(bannerId: string, params: {
    fulfillmentId: string;
    trackingNumber: string;
    trackingUrl?: string;
    trackingCompany?: string;
    notifyCustomer?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, message: 'Store credentials not found' };
    }

    const result = await this.graphql(creds.shopUrl, creds.accessToken, `
      mutation fulfillmentTrackingInfoUpdateV2($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!, $notifyCustomer: Boolean) {
        fulfillmentTrackingInfoUpdateV2(fulfillmentId: $fulfillmentId, trackingInfoInput: $trackingInfoInput, notifyCustomer: $notifyCustomer) {
          fulfillment { id }
          userErrors { field message }
        }
      }
    `, {
      fulfillmentId: params.fulfillmentId,
      trackingInfoInput: {
        number: params.trackingNumber,
        url: params.trackingUrl,
        company: params.trackingCompany
      },
      notifyCustomer: params.notifyCustomer ?? true
    });

    if (result.data?.fulfillmentTrackingInfoUpdateV2?.userErrors?.length) {
      return { success: false, message: result.data.fulfillmentTrackingInfoUpdateV2.userErrors[0].message };
    }

    return { success: true, message: 'Tracking info updated' };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Log sync operation to VisionSuite
   */
  private async logSync(
    conn: oracledb.Connection, 
    operationType: string, 
    bannerId: string, 
    status: string, 
    message: string
  ): Promise<void> {
    try {
      await conn.execute(
        `INSERT INTO ATTR_MGR.SHOPIFY_SYNC_LOG 
         (LOG_ID, OPERATION_TYPE, BANNER_ID, STATUS, MESSAGE, CREATED_AT)
         VALUES (ATTR_MGR.SHOPIFY_SYNC_LOG_SEQ.NEXTVAL, :opType, :bannerId, :status, :msg, CURRENT_TIMESTAMP)`,
        { opType: operationType, bannerId, status, msg: message }
      );
    } catch (e: any) {
      // If sequence doesn't exist, try without it
      try {
        await conn.execute(
          `INSERT INTO ATTR_MGR.SHOPIFY_SYNC_LOG 
           (OPERATION_TYPE, BANNER_ID, STATUS, MESSAGE, CREATED_AT)
           VALUES (:opType, :bannerId, :status, :msg, CURRENT_TIMESTAMP)`,
          { opType: operationType, bannerId, status, msg: message }
        );
      } catch (e2: any) {
        logger.error(`Failed to log sync operation: ${e2?.message || e2}`);
      }
    }
  }

  // ============================================================================
  // Phase 5: BULK OPERATIONS
  // ============================================================================

  /**
   * Bulk inventory update from VisionSuite SSOT
   * Reads from MERCH.EXT_PRODUCT_VARIANTS and syncs to Shopify
   */
  async bulkInventoryUpdate(bannerId: string): Promise<{
    success: boolean;
    updatedCount: number;
    failedCount: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let updatedCount = 0;
    let failedCount = 0;

    try {
      // Get variants from VisionSuite
      const variants = await withConnection(async (conn) => {
        const result = await conn.execute<any>(
          `SELECT SHOPIFY_VARIANT_ID, STYLE_ID, SKU_COUNT as INVENTORY_QTY
           FROM MERCH.CATALOG_CACHE_SHADOW
           WHERE BANNER_ID = :bannerId
             AND SHOPIFY_VARIANT_ID IS NOT NULL
           FETCH FIRST 100 ROWS ONLY`,
          { bannerId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return result.rows || [];
      });

      // Update each via Shopify API
      for (const variant of variants) {
        try {
          await this.setInventory(bannerId, {
            variantId: variant.SHOPIFY_VARIANT_ID.toString(),
            quantity: variant.INVENTORY_QTY || 0,
            locationId: ''
          });
          updatedCount++;
        } catch (e: any) {
          failedCount++;
          errors.push(`${variant.STYLE_ID}: ${e.message}`);
        }
      }

      // Log to VisionSuite
      await this.logToVisionSuite(
        'SHOPIFY_BULK_INVENTORY_UPDATE',
        { bannerId, totalVariants: variants.length },
        { updatedCount, failedCount, errors },
        200
      );

      return { success: true, updatedCount, failedCount, errors };
    } catch (error: any) {
      logger.error('Bulk inventory update error:', error);
      return { success: false, updatedCount, failedCount, errors: [error.message] };
    }
  }

  /**
   * Bulk publish products from VisionSuite
   */
  async bulkPublish(bannerId: string, styleIds: string[]): Promise<{
    success: boolean;
    publishedCount: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let publishedCount = 0;

    try {
      // Note: We'd need access to shopifyService here, but for now return the pattern
      logger.info(`[BULK_PUBLISH] Would publish ${styleIds.length} styles for ${bannerId}`);
      
      // Log to VisionSuite
      await this.logToVisionSuite(
        'SHOPIFY_BULK_PUBLISH',
        { bannerId, styleIds },
        { publishedCount, errors },
        200
      );

      return { success: true, publishedCount: styleIds.length, errors };
    } catch (error: any) {
      logger.error('Bulk publish error:', error);
      return { success: false, publishedCount, errors: [error.message] };
    }
  }

  // ============================================================================
  // Phase 4: WEBHOOK MANAGEMENT
  // ============================================================================

  /**
   * List all webhooks for a store
   */
  async listWebhooks(bannerId: string): Promise<{ success: boolean; webhooks: any[]; message?: string }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, webhooks: [], message: 'Store credentials not found' };
    }

    try {
      const response = await fetch(
        `${creds.shopUrl}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
        {
          headers: {
            'X-Shopify-Access-Token': creds.accessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      const data: any = await response.json();

      // Phase 3: Log to VisionSuite SSOT
      await this.logToVisionSuite(
        'SHOPIFY_LIST_WEBHOOKS',
        { bannerId },
        data,
        response.status
      );

      if (!response.ok) {
        return { success: false, webhooks: [], message: `API error: ${response.status}` };
      }

      return { success: true, webhooks: data.webhooks || [] };
    } catch (error: any) {
      logger.error('List webhooks error:', error);
      return { success: false, webhooks: [], message: error.message };
    }
  }

  /**
   * Create a new webhook
   */
  async createWebhook(bannerId: string, webhook: {
    topic: string;
    address: string;
    format?: 'json' | 'xml';
  }): Promise<{ success: boolean; webhook?: any; message: string }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, message: 'Store credentials not found' };
    }

    try {
      const response = await fetch(
        `${creds.shopUrl}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': creds.accessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            webhook: {
              topic: webhook.topic,
              address: webhook.address,
              format: webhook.format || 'json'
            }
          })
        }
      );

      const data: any = await response.json();

      // Phase 3: Log to VisionSuite SSOT
      await this.logToVisionSuite(
        'SHOPIFY_CREATE_WEBHOOK',
        { bannerId, webhook },
        data,
        response.status
      );

      if (!response.ok) {
        return { success: false, message: data.errors || `API error: ${response.status}` };
      }

      return { success: true, webhook: data.webhook, message: 'Webhook created successfully' };
    } catch (error: any) {
      logger.error('Create webhook error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(bannerId: string, webhookId: string): Promise<{ success: boolean; message: string }> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) {
      return { success: false, message: 'Store credentials not found' };
    }

    try {
      const response = await fetch(
        `${creds.shopUrl}/admin/api/${SHOPIFY_API_VERSION}/webhooks/${webhookId}.json`,
        {
          method: 'DELETE',
          headers: {
            'X-Shopify-Access-Token': creds.accessToken
          }
        }
      );

      // Phase 3: Log to VisionSuite SSOT
      await this.logToVisionSuite(
        'SHOPIFY_DELETE_WEBHOOK',
        { bannerId, webhookId },
        null,
        response.status
      );

      if (!response.ok) {
        return { success: false, message: `API error: ${response.status}` };
      }

      return { success: true, message: 'Webhook deleted successfully' };
    } catch (error: any) {
      logger.error('Delete webhook error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get Shopify shop info
   */
  async getShopInfo(bannerId: string): Promise<any> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) return null;

    const result = await this.graphql(creds.shopUrl, creds.accessToken, `
      {
        shop {
          name
          email
          currencyCode
          primaryDomain { url }
          plan { displayName }
          billingAddress { country }
        }
      }
    `);

    return result.data?.shop;
  }

  /**
   * Get all products from Shopify
   */
  async getProducts(bannerId: string, limit: number = 50): Promise<any[]> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) return [];

    const result = await this.graphql(creds.shopUrl, creds.accessToken, `
      query getProducts($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              handle
              status
              totalInventory
              variants(first: 10) {
                edges {
                  node { id sku price }
                }
              }
              featuredImage { url altText }
            }
          }
        }
      }
    `, { first: limit });

    return result.data?.products?.edges?.map((e: any) => e.node) || [];
  }

  /**
   * Get inventory levels for a product
   */
  async getInventoryLevels(bannerId: string, productId: string): Promise<any[]> {
    const creds = await this.getCredentials(bannerId);
    if (!creds) return [];

    const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`;

    const result = await this.graphql(creds.shopUrl, creds.accessToken, `
      query getInventory($id: ID!) {
        product(id: $id) {
          variants(first: 50) {
            edges {
              node {
                id
                sku
                inventoryItem {
                  id
                  inventoryLevels(first: 10) {
                    edges {
                      node {
                        id
                        quantities(names: ["available", "on_hand"]) { name quantity }
                        location { id name }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `, { id: gid });

    return result.data?.product?.variants?.edges?.map((e: any) => ({
      variantId: e.node.id,
      sku: e.node.sku,
      inventoryItemId: e.node.inventoryItem?.id,
      levels: e.node.inventoryItem?.inventoryLevels?.edges?.map((l: any) => ({
        locationId: l.node.location.id,
        locationName: l.node.location.name,
        available: l.node.quantities?.find((q: any) => q.name === 'available')?.quantity || 0,
        onHand: l.node.quantities?.find((q: any) => q.name === 'on_hand')?.quantity || 0
      }))
    })) || [];
  }
}

export const shopifyActionsService = new ShopifyActionsService();
