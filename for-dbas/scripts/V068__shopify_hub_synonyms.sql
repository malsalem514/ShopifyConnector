-- ============================================================================
-- V068: Shopify Hub Synonyms
-- ============================================================================
-- Purpose: Create synonyms for VisionSuite objects needed by Shopify Hub.
-- Since this is a demo environment, we point directly to local schemas.
-- Pattern: PAT-IDEMPOTENT-BY-DESIGN-01
-- ============================================================================

SET DEFINE OFF;

-- OMNI Synonyms
CREATE OR REPLACE SYNONYM ATTR_MGR.BANNERS FOR OMNI.BANNERS;
CREATE OR REPLACE SYNONYM ATTR_MGR.PROVIDER_SERVICES FOR OMNI.PROVIDER_SERVICES;
CREATE OR REPLACE SYNONYM ATTR_MGR.V_ECOMM_ORDERS FOR OMNI.V_ECOMM_ORDERS;
CREATE OR REPLACE SYNONYM ATTR_MGR.V_ECOMM_ORDER_DETAILS FOR OMNI.V_ECOMM_ORDER_DETAILS;

-- MERCH Synonyms
CREATE OR REPLACE SYNONYM ATTR_MGR.MERCH_EXT_PRODUCT_VARIANTS FOR MERCH.EXT_PRODUCT_VARIANTS;
CREATE OR REPLACE SYNONYM ATTR_MGR.EXT_PRODUCTS FOR MERCH.EXT_PRODUCTS;
CREATE OR REPLACE SYNONYM ATTR_MGR.EXT_PRODUCTS_ACTIVITY FOR MERCH.EXT_PRODUCTS_ACTIVITY;

-- VSTORE Synonyms
CREATE OR REPLACE SYNONYM ATTR_MGR.MV_MERCHANDISE_HIERARCHY FOR VSTORE.MV_MERCHANDISE_HIERARCHY;

-- Grants (if needed, though attr_mgr usually has resource/connect)
-- These should have been handled by DBA setup, but for demo we ensure access.

COMMIT;
