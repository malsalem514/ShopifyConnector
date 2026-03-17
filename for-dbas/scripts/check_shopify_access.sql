-- ============================================================================
-- Diagnostic: Check Shopify Cross-Schema Access
-- ============================================================================
-- Run as: ATTR_MGR or SYS
-- Purpose: Identify what grants/synonyms are missing for Shopify Hub
-- ============================================================================

SET SERVEROUTPUT ON;
SET LINESIZE 200;
SET PAGESIZE 100;

PROMPT
PROMPT ============================================================
PROMPT SHOPIFY HUB ACCESS DIAGNOSTIC
PROMPT ============================================================

-- 1. Check existing synonyms
PROMPT
PROMPT --- SYNONYMS IN ATTR_MGR ---
SELECT synonym_name, table_owner, table_name, db_link
FROM all_synonyms 
WHERE owner = 'ATTR_MGR'
AND (table_owner IN ('MERCH', 'OMNI', 'VSTORE') OR table_name LIKE '%SHOPIFY%' OR table_name LIKE '%EXT_%')
ORDER BY table_owner, synonym_name;

-- 2. Check existing grants
PROMPT
PROMPT --- GRANTS TO ATTR_MGR ---
SELECT grantor, table_name, privilege
FROM all_tab_privs
WHERE grantee = 'ATTR_MGR'
AND grantor IN ('MERCH', 'OMNI', 'VSTORE')
ORDER BY grantor, table_name;

-- 3. Check existing DB links
PROMPT
PROMPT --- DATABASE LINKS ---
SELECT owner, db_link, username, host
FROM all_db_links
WHERE owner IN ('ATTR_MGR', 'PUBLIC');

-- 4. Test actual access
PROMPT
PROMPT --- ACCESS TEST RESULTS ---

DECLARE
  v_count NUMBER;
  v_status VARCHAR2(20);
BEGIN
  -- Test MERCH.STYLES
  BEGIN
    EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM MERCH.STYLES WHERE ROWNUM <= 1' INTO v_count;
    v_status := 'OK (' || v_count || ' rows)';
  EXCEPTION WHEN OTHERS THEN v_status := 'FAILED: ' || SQLERRM;
  END;
  DBMS_OUTPUT.PUT_LINE('MERCH.STYLES: ' || v_status);
  
  -- Test MERCH.EXT_PRODUCTS
  BEGIN
    EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM MERCH.EXT_PRODUCTS' INTO v_count;
    v_status := 'OK (' || v_count || ' rows)';
  EXCEPTION WHEN OTHERS THEN v_status := 'FAILED: ' || SQLERRM;
  END;
  DBMS_OUTPUT.PUT_LINE('MERCH.EXT_PRODUCTS: ' || v_status);
  
  -- Test MERCH.EXT_PRODUCT_VARIANTS
  BEGIN
    EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM MERCH.EXT_PRODUCT_VARIANTS WHERE ROWNUM <= 1' INTO v_count;
    v_status := 'OK';
  EXCEPTION WHEN OTHERS THEN v_status := 'FAILED: ' || SQLERRM;
  END;
  DBMS_OUTPUT.PUT_LINE('MERCH.EXT_PRODUCT_VARIANTS: ' || v_status);
  
  -- Test OMNI.BANNERS
  BEGIN
    EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM OMNI.BANNERS' INTO v_count;
    v_status := 'OK (' || v_count || ' rows)';
  EXCEPTION WHEN OTHERS THEN v_status := 'FAILED: ' || SQLERRM;
  END;
  DBMS_OUTPUT.PUT_LINE('OMNI.BANNERS: ' || v_status);
  
  -- Test OMNI.PROVIDER_SERVICES
  BEGIN
    EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM OMNI.PROVIDER_SERVICES WHERE PROVIDER_ID LIKE ''SHOPIFY%''' INTO v_count;
    v_status := 'OK (' || v_count || ' Shopify configs)';
  EXCEPTION WHEN OTHERS THEN v_status := 'FAILED: ' || SQLERRM;
  END;
  DBMS_OUTPUT.PUT_LINE('OMNI.PROVIDER_SERVICES: ' || v_status);
  
  -- Test OMNI.V_ECOMM_ORDERS
  BEGIN
    EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM OMNI.V_ECOMM_ORDERS WHERE ROWNUM <= 1' INTO v_count;
    v_status := 'OK';
  EXCEPTION WHEN OTHERS THEN v_status := 'FAILED: ' || SQLERRM;
  END;
  DBMS_OUTPUT.PUT_LINE('OMNI.V_ECOMM_ORDERS: ' || v_status);
  
  -- Test VSTORE.MV_MERCHANDISE_HIERARCHY
  BEGIN
    EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM VSTORE.MV_MERCHANDISE_HIERARCHY WHERE ROWNUM <= 1' INTO v_count;
    v_status := 'OK';
  EXCEPTION WHEN OTHERS THEN v_status := 'FAILED: ' || SQLERRM;
  END;
  DBMS_OUTPUT.PUT_LINE('VSTORE.MV_MERCHANDISE_HIERARCHY: ' || v_status);
  
  -- Test via synonyms (if they exist)
  BEGIN
    EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM STYLES WHERE ROWNUM <= 1' INTO v_count;
    v_status := 'OK (synonym works)';
  EXCEPTION WHEN OTHERS THEN v_status := 'FAILED: ' || SQLERRM;
  END;
  DBMS_OUTPUT.PUT_LINE('STYLES (synonym): ' || v_status);
  
  BEGIN
    EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM EXT_PRODUCTS' INTO v_count;
    v_status := 'OK (' || v_count || ' rows)';
  EXCEPTION WHEN OTHERS THEN v_status := 'FAILED: ' || SQLERRM;
  END;
  DBMS_OUTPUT.PUT_LINE('EXT_PRODUCTS (synonym): ' || v_status);
  
END;
/

PROMPT
PROMPT ============================================================
PROMPT DIAGNOSIS COMPLETE
PROMPT 
PROMPT If any tests show FAILED, run V069__shopify_cross_schema_access.sql
PROMPT as SYS or a DBA to grant the necessary privileges.
PROMPT ============================================================
