import { withConnection } from './oracle-pool.js';
import oracledb from 'oracledb';
import { logger } from '../utils/logger.js';

interface StagedUpload {
  url: string;
  resourceUrl: string;
  parameters: { name: string; value: string }[];
}

interface MediaItem {
  url: string;
  type: string;
  view: string;
  source: string;
}

export class ShopifyMediaService {
  /**
   * Orchestrates the full media sync for a style to Shopify
   */
  async syncProductMedia(businessUnitId: number, styleId: string, bannerId: string): Promise<{ success: boolean; syncedCount: number; errors?: string[] }> {
    logger.info(`Starting media sync for style ${styleId} to banner ${bannerId}`);
    const errors: string[] = [];
    let syncedCount = 0;

    try {
      // 1. Get Shopify credentials for the banner
      const credentials = await this.getShopifyCredentials(bannerId);
      if (!credentials) {
        throw new Error(`Credentials not found for banner ${bannerId}`);
      }

      // 2. Get the Shopify Product ID
      const shopifyProductId = await this.getShopifyProductId(businessUnitId, styleId, bannerId);
      if (!shopifyProductId) {
        throw new Error(`Style ${styleId} is not yet published to Shopify on ${bannerId}`);
      }

      // 3. Get images from CATALOG_CACHE (Smart Media Engine)
      const mediaItems = await this.getMediaToSync(businessUnitId, styleId);
      if (mediaItems.length === 0) {
        logger.warn(`No media found in CATALOG_CACHE for style ${styleId}`);
        return { success: true, syncedCount: 0 };
      }

      logger.info(`Found ${mediaItems.length} media items to sync for ${styleId}`);

      // 4. Process each media item
      for (const item of mediaItems) {
        try {
          // A. Fetch the BLOB from VisionSuite
          const fileData = await this.fetchImageBlob(item.url);
          if (!fileData) {
            errors.push(`Failed to fetch image data for ${item.url}`);
            continue;
          }

          // B. Request Staged Upload from Shopify
          const filename = item.url.split('/').pop() || `${styleId}_${item.view}.jpg`;
          const stagedUpload = await this.stagedUploadsCreate(
            credentials.url,
            credentials.apiKey,
            filename,
            'image/jpeg',
            fileData.length
          );

          // C. Upload to S3 (Shopify's temporary storage)
          await this.uploadToStagedUrl(stagedUpload.url, stagedUpload.parameters, fileData);

          // D. Finalize Media in Shopify
          await this.productCreateMedia(
            credentials.url,
            credentials.apiKey,
            shopifyProductId,
            stagedUpload.resourceUrl,
            item.view // use as alt text/identifier
          );

          syncedCount++;
        } catch (err: any) {
          logger.error(`Error syncing media item ${item.url}:`, err.message);
          errors.push(err.message);
        }
      }

      return {
        success: errors.length === 0,
        syncedCount,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (err: any) {
      logger.error(`Media sync failed for ${styleId}:`, err.message);
      return { success: false, syncedCount: 0, errors: [err.message] };
    }
  }

  /**
   * Get Shopify credentials from PROVIDER_SERVICES
   */
  private async getShopifyCredentials(bannerId: string) {
    return withConnection(async (conn) => {
      const res = await conn.execute<any>(
        `SELECT WEB_SITE_URL, API_KEY FROM PROVIDER_SERVICES WHERE SERVICE_ID LIKE '%' || :bannerId AND PROVIDER_ID = 'SHOPIFY'`,
        { bannerId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!res.rows || res.rows.length === 0) return null;
      
      let url = res.rows[0].WEB_SITE_URL;
      if (url.includes('/admin/api')) {
        url = url.split('/admin/api')[0];
      }
      
      return { url, apiKey: res.rows[0].API_KEY };
    });
  }

  /**
   * Get the Shopify Product GID for a style
   */
  private async getShopifyProductId(bu: number, styleId: string, bannerId: string): Promise<string | null> {
    return withConnection(async (conn) => {
      const res = await conn.execute<any>(
        `SELECT DISTINCT SHOPIFY_PRODUCT_ID 
         FROM MERCH_EXT_PRODUCT_VARIANTS 
         WHERE BUSINESS_UNIT_ID = :bu AND STYLE_ID = :styleId AND BANNER_ID = :bannerId
         AND SHOPIFY_PRODUCT_ID IS NOT NULL`,
        { bu, styleId, bannerId }
      );
      
      const id = res.rows?.[0]?.[0];
      if (!id) return null;
      
      // Ensure it's in GraphQL GID format
      return id.toString().startsWith('gid://') ? id.toString() : `gid://shopify/Product/${id}`;
    });
  }

  /**
   * Get media items from CATALOG_CACHE
   */
  private async getMediaToSync(bu: number, styleId: string): Promise<MediaItem[]> {
    return withConnection(async (conn) => {
      const res = await conn.execute<any>(
        `SELECT IMAGE_URLS_JSON FROM ATTR_MGR.CATALOG_CACHE WHERE BUSINESS_UNIT_ID = :bu AND STYLE_ID = :styleId`,
        { bu, styleId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const json = res.rows?.[0]?.IMAGE_URLS_JSON;
      if (!json) return [];

      try {
        const items = typeof json === 'string' ? JSON.parse(json) : json;
        return Array.isArray(items) ? items : [];
      } catch (e) {
        // Handle CLOB if it comes as a stream
        if (json && typeof json.on === 'function') {
          return new Promise((resolve) => {
            const chunks: any[] = [];
            json.on('data', (chunk: any) => chunks.push(chunk));
            json.on('end', () => {
              try {
                const parsed = JSON.parse(chunks.join(''));
                resolve(Array.isArray(parsed) ? parsed : []);
              } catch (e) { resolve([]); }
            });
          });
        }
        return [];
      }
    });
  }

  /**
   * Fetch image BLOB from VisionSuite (via proxy or direct)
   */
  private async fetchImageBlob(imageUrl: string): Promise<Buffer | null> {
    // For demo/development, if it's a relative URL, we might need to resolve it
    // In production, we'd query the BLOB from the DB based on the filename
    const filename = imageUrl.split('/').pop();
    if (!filename) return null;

    return withConnection(async (conn) => {
      // Check STAGING_IMAGES or CENTRAL_IMAGES via synonym
      const res = await conn.execute<any>(
        `SELECT BLOB_DATA FROM (
           SELECT BLOB_DATA FROM ATTR_MGR.STAGING_IMAGES WHERE IMAGE_NAME = :name
           UNION ALL
           SELECT IMAGE_BLOB as BLOB_DATA FROM IMAGES WHERE ORIGINAL_NAME = :name
         ) WHERE ROWNUM = 1`,
        { name: filename },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const lob = res.rows?.[0]?.BLOB_DATA;
      if (!lob) return null;

      const chunks: Buffer[] = [];
      return new Promise((resolve, reject) => {
        lob.on('data', (chunk: Buffer) => chunks.push(chunk));
        lob.on('end', () => resolve(Buffer.concat(chunks)));
        lob.on('error', (err: Error) => reject(err));
      });
    });
  }

  /**
   * Request Staged Upload from Shopify
   */
  private async stagedUploadsCreate(shopUrl: string, accessToken: string, filename: string, mimeType: string, fileSize: number): Promise<StagedUpload> {
    const query = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await fetch(`${shopUrl}/admin/api/2024-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({
        query,
        variables: {
          input: [{
            resource: 'PRODUCT_IMAGE',
            filename,
            mimeType,
            fileSize: fileSize.toString(),
            httpMethod: 'POST'
          }]
        }
      })
    });

    const result = await response.json();
    const data = (result as any).data?.stagedUploadsCreate;

    if (data?.userErrors?.length > 0) {
      throw new Error(`Shopify stagedUploadsCreate error: ${data.userErrors[0].message}`);
    }

    return data.stagedTargets[0];
  }

  /**
   * Upload to Shopify's temporary S3 bucket
   */
  private async uploadToStagedUrl(url: string, parameters: { name: string; value: string }[], fileBuffer: Buffer): Promise<void> {
    const formData = new FormData();
    
    parameters.forEach(p => {
      formData.append(p.name, p.value);
    });
    
    // Add the file as the last parameter as required by S3/Shopify
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
    formData.append('file', blob);

    const response = await fetch(url, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`S3 Upload failed: ${response.statusText} - ${text}`);
    }
  }

  /**
   * Link the uploaded media to the Shopify Product
   */
  private async productCreateMedia(shopUrl: string, accessToken: string, productId: string, resourceUrl: string, altText: string): Promise<void> {
    const query = `
      mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
        productCreateMedia(media: $media, productId: $productId) {
          media {
            id
            alt
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await fetch(`${shopUrl}/admin/api/2024-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({
        query,
        variables: {
          productId,
          media: [{
            originalSource: resourceUrl,
            alt: altText,
            mediaContentType: 'IMAGE'
          }]
        }
      })
    });

    const result = await response.json();
    const data = (result as any).data?.productCreateMedia;

    if (data?.userErrors?.length > 0) {
      throw new Error(`Shopify productCreateMedia error: ${data.userErrors[0].message}`);
    }
  }
}

export const shopifyMediaService = new ShopifyMediaService();
