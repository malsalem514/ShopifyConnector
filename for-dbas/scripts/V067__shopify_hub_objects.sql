-- ============================================================================
-- V067: Shopify Hub Database Objects
-- ============================================================================
-- Purpose: Create tables for Shopify Hub visibility and AI-assisted mapping.
-- Pattern: PAT-ORACLE-PRODUCTION-GRADE-SQL-01
-- Pattern: PAT-IDEMPOTENT-BY-DESIGN-01
-- ============================================================================

SET DEFINE OFF;

-- 1. SHOPIFY_HIERARCHY_MAP: AI-assisted hierarchy to product_type mapping
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE ATTR_MGR.SHOPIFY_HIERARCHY_MAP (
        map_id              NUMBER GENERATED ALWAYS AS IDENTITY,
        business_unit_id    NUMBER NOT NULL,
        merchandise_no      VARCHAR2(50) NOT NULL,
        vs_division         VARCHAR2(100),
        vs_group            VARCHAR2(100),
        vs_department       VARCHAR2(100),
        vs_class            VARCHAR2(100),
        vs_subclass         VARCHAR2(100),
        vs_hierarchy_path   VARCHAR2(500),
        shopify_product_type VARCHAR2(255),
        shopify_taxonomy_id  VARCHAR2(50),
        shopify_collection_handle VARCHAR2(255),
        mapped_by           VARCHAR2(50) CHECK (mapped_by IN (''AI'', ''MANUAL'')),
        ai_confidence       NUMBER(5,2),
        ai_alternatives     CLOB,
        is_active           CHAR(1) DEFAULT ''Y'' CHECK (is_active IN (''Y'', ''N'')),
        created_by          VARCHAR2(50) DEFAULT USER,
        created_date        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        modified_by         VARCHAR2(50),
        modified_date       TIMESTAMP,
        
        CONSTRAINT pk_shopify_hierarchy_map PRIMARY KEY (map_id),
        CONSTRAINT uk_shopify_hierarchy UNIQUE (business_unit_id, merchandise_no)
    )';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

-- 2. INDEXES for HIERARCHY_MAP
BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX ATTR_MGR.idx_shm_bu_path ON ATTR_MGR.SHOPIFY_HIERARCHY_MAP (business_unit_id, vs_hierarchy_path)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX ATTR_MGR.idx_shm_product_type ON ATTR_MGR.SHOPIFY_HIERARCHY_MAP (shopify_product_type)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

-- 3. SHOPIFY_SYNC_LOG: Audit trail for all Shopify sync operations
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE ATTR_MGR.SHOPIFY_SYNC_LOG (
        log_id              NUMBER GENERATED ALWAYS AS IDENTITY,
        entity_type         VARCHAR2(50) NOT NULL,
        entity_id           VARCHAR2(100) NOT NULL,
        banner_id           VARCHAR2(50),
        shopify_id          VARCHAR2(100),
        action_type         VARCHAR2(50) NOT NULL,
        status              VARCHAR2(20) NOT NULL,
        request_payload     CLOB,
        response_payload    CLOB,
        error_message       VARCHAR2(4000),
        duration_ms         NUMBER,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT pk_shopify_sync_log_v2 PRIMARY KEY (log_id)
    )';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

-- 4. INDEXES for SYNC_LOG
BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX ATTR_MGR.idx_ssl_entity_v2 ON ATTR_MGR.SHOPIFY_SYNC_LOG (entity_type, entity_id)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX ATTR_MGR.idx_ssl_status_v2 ON ATTR_MGR.SHOPIFY_SYNC_LOG (status, created_at)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

-- 5. SYNONYMS for VisionSuite Access (OMNI/MERCH/VSTORE)
-- Note: These depend on DB links existing. In demo, we use synonyms directly if local.
-- Repointing is handled by ENV_SWITCHER_PKG.

-- Add to ENV_SWITCHER_PKG list of synonyms to repoint
-- (Handled by updating the ENV_SWITCHER_PKG definition later if needed)

COMMENT ON TABLE ATTR_MGR.SHOPIFY_HIERARCHY_MAP IS 'Maps VisionSuite merchandise hierarchy to Shopify product types with AI assistance';
COMMENT ON TABLE ATTR_MGR.SHOPIFY_SYNC_LOG IS 'Audit log for Shopify synchronization operations initiated from FarsightIQ';

-- 5. SHOPIFY_CONFIG: FarsightIQ-specific Shopify configuration
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE ATTR_MGR.SHOPIFY_CONFIG (
        config_key          VARCHAR2(100) NOT NULL,
        config_value        VARCHAR2(4000),
        description         VARCHAR2(500),
        is_sensitive        CHAR(1) DEFAULT ''N'' CHECK (is_sensitive IN (''Y'', ''N'')),
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT pk_shopify_config PRIMARY KEY (config_key)
    )';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

-- Seed default configuration
BEGIN
    INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (config_key, config_value, description, is_sensitive) 
    SELECT 'DEMO_STORE_URL', 'https://jesta-demo.myshopify.com', 'Demo Shopify store URL', 'N' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM ATTR_MGR.SHOPIFY_CONFIG WHERE config_key = 'DEMO_STORE_URL');
    
    INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (config_key, config_value, description, is_sensitive) 
    SELECT 'DEMO_ACCESS_TOKEN', 'shpat_CHANGE_ME', 'Demo store access token', 'Y' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM ATTR_MGR.SHOPIFY_CONFIG WHERE config_key = 'DEMO_ACCESS_TOKEN');
    
    INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (config_key, config_value, description, is_sensitive) 
    SELECT 'DEMO_API_VERSION', '2024-10', 'Shopify API version for demo', 'N' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM ATTR_MGR.SHOPIFY_CONFIG WHERE config_key = 'DEMO_API_VERSION');
    
    INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (config_key, config_value, description, is_sensitive) 
    SELECT 'AI_MAPPING_ENABLED', 'Y', 'Enable AI-assisted hierarchy mapping', 'N' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM ATTR_MGR.SHOPIFY_CONFIG WHERE config_key = 'AI_MAPPING_ENABLED');
    
    INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (config_key, config_value, description, is_sensitive) 
    SELECT 'AUTO_SYNC_INTERVAL_MIN', '5', 'Auto-sync interval in minutes', 'N' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM ATTR_MGR.SHOPIFY_CONFIG WHERE config_key = 'AUTO_SYNC_INTERVAL_MIN');
    
    INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (config_key, config_value, description, is_sensitive) 
    SELECT 'MAX_PRODUCTS_PER_BATCH', '100', 'Maximum products per sync batch', 'N' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM ATTR_MGR.SHOPIFY_CONFIG WHERE config_key = 'MAX_PRODUCTS_PER_BATCH');

    INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (config_key, config_value, description, is_sensitive) 
    SELECT 'ORACLE_WALLET_PATH', 'file:/u01/app/oracle/admin/wallet/shopify', 'Path to Oracle Wallet for HTTPS calls', 'N' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM ATTR_MGR.SHOPIFY_CONFIG WHERE config_key = 'ORACLE_WALLET_PATH');

    INSERT INTO ATTR_MGR.SHOPIFY_CONFIG (config_key, config_value, description, is_sensitive) 
    SELECT 'USE_DEMO_FALLBACK', 'Y', 'Toggle demo fallback data on/off', 'N' FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM ATTR_MGR.SHOPIFY_CONFIG WHERE config_key = 'USE_DEMO_FALLBACK');
END;
/

COMMIT;
