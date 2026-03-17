-- ============================================================================
-- V070: Shopify Hub Read Model & Supporting Tables
-- ============================================================================
-- Purpose: Create tenant registry, denormalized product snapshot,
--          publication queue, and inventory alerts tables.
-- Pattern: PAT-ORACLE-PRODUCTION-GRADE-SQL-01
-- Pattern: PAT-IDEMPOTENT-BY-DESIGN-01
-- ============================================================================

SET DEFINE OFF;

-- 1. SHOPIFY_TENANTS: Tenant registry for Shopify Hub
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE ATTR_MGR.SHOPIFY_TENANTS (
        tenant_id           VARCHAR2(50) NOT NULL,
        tenant_name         VARCHAR2(200) NOT NULL,
        is_active           VARCHAR2(1) DEFAULT ''Y'' CHECK (is_active IN (''Y'', ''N'')),
        created_at          TIMESTAMP DEFAULT SYSTIMESTAMP,
        updated_at          TIMESTAMP DEFAULT SYSTIMESTAMP,

        CONSTRAINT pk_shopify_tenants PRIMARY KEY (tenant_id)
    )';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

COMMENT ON TABLE ATTR_MGR.SHOPIFY_TENANTS IS 'Tenant registry for Shopify Hub multi-tenant support';

-- 2. SHOPIFY_PRODUCT_SNAPSHOT: Denormalized product read model
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE ATTR_MGR.SHOPIFY_PRODUCT_SNAPSHOT (
        tenant_id           VARCHAR2(50) NOT NULL,
        style_id            VARCHAR2(20) NOT NULL,
        color_id            VARCHAR2(10) DEFAULT ''000'',
        department_id       VARCHAR2(20),
        dept_name           VARCHAR2(100),
        class_id            VARCHAR2(20),
        class_name          VARCHAR2(100),
        sub_class_id        VARCHAR2(20),
        sub_class_name      VARCHAR2(100),
        brand_name          VARCHAR2(100),
        description         VARCHAR2(500),
        short_description   VARCHAR2(200),
        vendor_style_no     VARCHAR2(50),
        has_image_ind       VARCHAR2(1) DEFAULT ''N'',
        image_urls_json     CLOB,
        shopify_product_id  VARCHAR2(50),
        shopify_status      VARCHAR2(20) DEFAULT ''PENDING'',
        last_synced_at      TIMESTAMP,
        created_at          TIMESTAMP DEFAULT SYSTIMESTAMP,
        updated_at          TIMESTAMP DEFAULT SYSTIMESTAMP,

        CONSTRAINT pk_shopify_product_snapshot PRIMARY KEY (tenant_id, style_id, color_id)
    )';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

-- Indexes for SHOPIFY_PRODUCT_SNAPSHOT
BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX ATTR_MGR.idx_sps_status ON ATTR_MGR.SHOPIFY_PRODUCT_SNAPSHOT (tenant_id, shopify_status)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX ATTR_MGR.idx_sps_dept ON ATTR_MGR.SHOPIFY_PRODUCT_SNAPSHOT (tenant_id, department_id)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

COMMENT ON TABLE ATTR_MGR.SHOPIFY_PRODUCT_SNAPSHOT IS 'Denormalized product read model for Shopify Hub product visibility';

-- 3. SHOPIFY_PUBLICATION_QUEUE: Publication intent / work queue
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE ATTR_MGR.SHOPIFY_PUBLICATION_QUEUE (
        queue_id            NUMBER GENERATED ALWAYS AS IDENTITY,
        tenant_id           VARCHAR2(50) NOT NULL,
        style_id            VARCHAR2(20) NOT NULL,
        color_id            VARCHAR2(10) DEFAULT ''000'',
        banner_id           VARCHAR2(20),
        action              VARCHAR2(20) NOT NULL CHECK (action IN (''CREATE'', ''UPDATE'', ''DELETE'', ''SYNC_INVENTORY'')),
        status              VARCHAR2(20) DEFAULT ''PENDING'' CHECK (status IN (''PENDING'', ''PROCESSING'', ''COMPLETED'', ''FAILED'')),
        payload_json        CLOB,
        error_message       VARCHAR2(4000),
        attempt_count       NUMBER DEFAULT 0,
        created_at          TIMESTAMP DEFAULT SYSTIMESTAMP,
        processed_at        TIMESTAMP,

        CONSTRAINT pk_shopify_pub_queue PRIMARY KEY (queue_id)
    )';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

-- Indexes for SHOPIFY_PUBLICATION_QUEUE
BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX ATTR_MGR.idx_spq_status ON ATTR_MGR.SHOPIFY_PUBLICATION_QUEUE (status, created_at)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX ATTR_MGR.idx_spq_tenant_style ON ATTR_MGR.SHOPIFY_PUBLICATION_QUEUE (tenant_id, style_id)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

COMMENT ON TABLE ATTR_MGR.SHOPIFY_PUBLICATION_QUEUE IS 'Work queue for Shopify product publication intents';

-- 4. SHOPIFY_INVENTORY_ALERTS: Persisted inventory alert state
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE ATTR_MGR.SHOPIFY_INVENTORY_ALERTS (
        alert_id            NUMBER GENERATED ALWAYS AS IDENTITY,
        tenant_id           VARCHAR2(50) NOT NULL,
        banner_id           VARCHAR2(20) NOT NULL,
        style_id            VARCHAR2(20) NOT NULL,
        sku                 VARCHAR2(50),
        alert_type          VARCHAR2(30) NOT NULL CHECK (alert_type IN (''LOW_STOCK'', ''OUT_OF_STOCK'', ''OVERSOLD'')),
        threshold_qty       NUMBER,
        current_qty         NUMBER,
        is_resolved         VARCHAR2(1) DEFAULT ''N'' CHECK (is_resolved IN (''Y'', ''N'')),
        created_at          TIMESTAMP DEFAULT SYSTIMESTAMP,
        resolved_at         TIMESTAMP,

        CONSTRAINT pk_shopify_inv_alerts PRIMARY KEY (alert_id)
    )';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

-- Index for SHOPIFY_INVENTORY_ALERTS
BEGIN
    EXECUTE IMMEDIATE 'CREATE INDEX ATTR_MGR.idx_sia_tenant_banner ON ATTR_MGR.SHOPIFY_INVENTORY_ALERTS (tenant_id, banner_id, is_resolved)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -955 THEN NULL; ELSE RAISE; END IF;
END;
/

COMMENT ON TABLE ATTR_MGR.SHOPIFY_INVENTORY_ALERTS IS 'Persisted inventory alert state for Shopify Hub monitoring';

COMMIT;
