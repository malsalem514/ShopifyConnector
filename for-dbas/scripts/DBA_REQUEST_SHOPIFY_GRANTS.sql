-- ============================================================================
-- DBA REQUEST: Shopify Integration Grants for ATTR_MGR
-- ============================================================================
-- Database: DEMODB (100.90.84.20:1521/DEMODB)
-- Requestor: FarsightIQ Team
-- Purpose: Enable Shopify Hub live publication testing
-- 
-- Run as: SYS AS SYSDBA or each schema owner
-- Time: ~30 seconds
-- Risk: LOW (grants only, no DDL changes)
-- ============================================================================

-- ============================================================================
-- REQUIRED GRANTS (2 statements)
-- ============================================================================

-- 1. INSERT privilege on MERCH.EXT_PRODUCTS
--    Reason: FarsightIQ needs to flag products for Shopify publication
--    Current: ATTR_MGR has SELECT only
--    Needed: INSERT, UPDATE
GRANT INSERT, UPDATE ON MERCH.EXT_PRODUCTS TO ATTR_MGR;

-- 2. EXECUTE privilege on VSTORE.INTFS_SHOPIFY_PK  
--    Reason: Trigger the Shopify sync procedure from FarsightIQ
--    Current: No access
--    Needed: EXECUTE
GRANT EXECUTE ON VSTORE.INTFS_SHOPIFY_PK TO ATTR_MGR;

-- ============================================================================
-- OPTIONAL GRANTS (for full functionality)
-- ============================================================================

-- 3. INSERT on EXT_PRODUCT_VARIANTS (if variant-level control needed)
GRANT INSERT, UPDATE ON MERCH.EXT_PRODUCT_VARIANTS TO ATTR_MGR;

-- 4. Access to scheduler jobs (to enable/disable Shopify jobs from UI)
-- GRANT EXECUTE ON DBMS_SCHEDULER TO ATTR_MGR;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running, verify with:
SELECT grantee, table_name, privilege 
FROM dba_tab_privs 
WHERE grantee = 'ATTR_MGR' 
AND table_name IN ('EXT_PRODUCTS', 'EXT_PRODUCT_VARIANTS', 'INTFS_SHOPIFY_PK');

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
-- REVOKE INSERT, UPDATE ON MERCH.EXT_PRODUCTS FROM ATTR_MGR;
-- REVOKE EXECUTE ON VSTORE.INTFS_SHOPIFY_PK FROM ATTR_MGR;

COMMIT;

-- ============================================================================
-- END OF DBA REQUEST
-- ============================================================================
