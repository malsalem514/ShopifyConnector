# JestaSuite Shopify Connector — Enhancement Specifications

> **Date:** 2026-03-17
> **Status:** Draft — enrichment in progress
> **Product:** JestaSuite Shopify Connector v1
> **Target:** Public Shopify App Marketplace listing

A public Shopify app that connects Shopify stores to JestaSuite Merchandising + VisionOmni. Merchants install from the Shopify App Store, connect their VisionSuite tenant, and get bidirectional sync of catalog, inventory, orders, and fulfillment data.

---

## Architecture Decisions (Fixed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| App shell | Shopify React Router template (MIT) | Required for public app compliance: OAuth, App Bridge, Polaris, GDPR webhooks |
| Backend | Express + Oracle (existing) | Keep proven business logic, services, and Oracle connectivity |
| API version | GraphQL Admin API 2026-01 | Latest stable; REST prohibited for new public apps as of 2025-04-01 |
| Catalog sync mutation | `productSet` | Shopify's recommended mutation for external-source sync (declarative upsert) |
| Connector metadata | `$app` metafields | App-owned, exclusive read/write; required for public apps |
| Multi-tenancy | Schema-per-tenant (Oracle) | Strong isolation; each merchant gets own schema + VisionSuite schemas |
| Frontend | Remix + Polaris + App Bridge | Mandatory for embedded Shopify admin experience |
| Message queue | BullMQ + Redis | Webhook processing, sync jobs, retry with DLQ |
| Observability | OpenTelemetry (pattern from Cloudshelf) | Structured traces, metrics, logs |
| Deployment | Express + Oracle on own infra | Self-managed, schema provisioning per install |

## OSS Donor Policy

| Source | License | Usage | What to take |
|--------|---------|-------|-------------|
| [Shopify/shopify-app-template-react-router](https://github.com/Shopify/shopify-app-template-react-router) | MIT | **Copy/adapt** | Auth flow, session management, App Bridge wiring, webhook registration via TOML, Polaris layout patterns, `shopify.server.ts` auth helper |
| [Cloudshelf/Shopify_CSConnector](https://github.com/Cloudshelf/Shopify_CSConnector) | MIT | **Copy/adapt** | NestJS-style module boundaries, service/repository layering, OpenTelemetry instrumentation, queue/job orchestration, integration config patterns |
| [unopim/shopify-connector](https://github.com/unopim/shopify-connector) | MIT | **Copy/adapt** | Attribute mapping patterns, locale mapping, metafield mapping, multi-store export batching, filtered export patterns |
| [frappe/ecommerce_integrations](https://github.com/frappe/ecommerce_integrations) | GPL-3.0 | **Reference only — no code** | Order import semantics, inventory source-of-truth policy, warehouse/location 1:1 mapping, retry/backfill patterns, `temp_shopify_session` decorator concept, `EVENT_MAPPER` dispatch table pattern, log-then-enqueue webhook pattern, `EcommerceItem` linking table concept, idempotency guards, SKU matching before creation |

---

## SPEC-ARCH-01 — System Architecture

### Objective

Define the component topology, trust boundaries, runtime layout, and package structure for the JestaSuite Shopify Connector as a public embedded Shopify app backed by the existing Express + Oracle infrastructure.

### Scope

- Component diagram and runtime topology
- Package/repo layout
- Trust boundaries and network flows
- Deployment model
- What changes from the existing codebase

### Out of Scope

- Individual domain sync logic (covered in SPEC-CATALOG-01 through SPEC-FULFILLMENT-01)
- Detailed job/queue design (SPEC-JOBS-01)
- Observability instrumentation details (SPEC-OBS-01)

### Assumptions

- Shopify App Store review requires embedded admin, App Bridge v4, Polaris, OAuth, and GDPR webhooks
- As of 2025-04-01, new public apps must use GraphQL Admin API exclusively (no REST)
- Oracle remains the persistence layer; no migration to PostgreSQL/MySQL
- VPN access to Oracle at 100.90.84.20 continues to be available from production servers
- Each merchant has their own VisionSuite schemas (MERCH, OMNI, VSTORE) — fully isolated

### Architecture

#### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Shopify Platform                         │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ App Store │  │ Admin iframe │  │ Webhook Delivery       │ │
│  │ (install) │  │ (embedded)   │  │ (HMAC-signed POST)     │ │
│  └─────┬─────┘  └──────┬───────┘  └───────────┬────────────┘ │
└────────┼────────────────┼──────────────────────┼─────────────┘
         │                │                      │
    OAuth │         Session│Token            Webhooks│
         │                │                      │
┌────────▼────────────────▼──────────────────────▼─────────────┐
│                    App Server (Node.js)                        │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Remix App (frontend)                                  │   │
│  │  - Polaris UI components                               │   │
│  │  - App Bridge integration                              │   │
│  │  - Route loaders call backend API                      │   │
│  └────────────────────┬───────────────────────────────────┘   │
│                       │ HTTP (internal)                        │
│  ┌────────────────────▼───────────────────────────────────┐   │
│  │  Express API (backend)                                 │   │
│  │  ┌─────────────┐ ┌──────────────┐ ┌────────────────┐  │   │
│  │  │ Auth Module  │ │ Tenant Router│ │ Webhook Ingress│  │   │
│  │  └──────┬──────┘ └──────┬───────┘ └───────┬────────┘  │   │
│  │         │               │                  │           │   │
│  │  ┌──────▼───────────────▼──────────────────▼────────┐  │   │
│  │  │              Domain Services                     │  │   │
│  │  │  catalog | inventory | orders | fulfillment      │  │   │
│  │  │  mappings | discounts | media | analytics        │  │   │
│  │  └──────────────────────┬───────────────────────────┘  │   │
│  │                         │                              │   │
│  │  ┌──────────────────────▼───────────────────────────┐  │   │
│  │  │           Infrastructure Layer                   │  │   │
│  │  │  Oracle Pool | Shopify GraphQL | BullMQ | OTel   │  │   │
│  │  └──────┬─────────────┬─────────────┬──────────────┘  │   │
│  └─────────┼─────────────┼─────────────┼─────────────────┘   │
└────────────┼─────────────┼─────────────┼─────────────────────┘
             │             │             │
    ┌────────▼──────┐  ┌──▼──────┐  ┌───▼────┐
    │  Oracle DB    │  │ Shopify │  │ Redis  │
    │  (per-tenant  │  │ GraphQL │  │(queues)│
    │   schemas)    │  │  API    │  │        │
    └───────────────┘  └─────────┘  └────────┘
```

#### Trust Boundaries

1. **Shopify → App Server**: All inbound requests validated via HMAC-SHA256 (webhooks) or session token JWT (admin UI). No unauthenticated endpoints except health checks.
2. **App Server → Shopify API**: Authenticated via offline access tokens stored encrypted in Oracle. Rate-limited per Shopify plan.
3. **App Server → Oracle**: Within private network (VPN). Schema-switched per tenant.
4. **App Server → Redis**: Within private network. No auth required (internal only).

#### Proposed Repository Structure

```
jestasuite-shopify-connector/
  apps/
    admin-app/                        # Shopify React Router template
      app/
        routes/                       # Remix routes → Polaris pages
          _index.tsx                  # Dashboard
          app.stores.tsx              # Store management
          app.catalog.tsx             # Catalog sync
          app.inventory.tsx           # Inventory sync
          app.orders.tsx              # Order management
          app.fulfillment.tsx         # Fulfillment tracking
          app.mappings.tsx            # Hierarchy/attribute mapping
          app.jobs.tsx                # Sync jobs
          app.logs.tsx                # Audit logs
          app.settings.tsx            # Configuration
          webhooks.tsx                # Webhook receiver (not embedded)
          auth.$.tsx                  # OAuth callbacks
        shopify.server.ts             # Auth helper (from template)
      extensions/
        theme-widget/                 # Storefront app embed (optional)
      # Session storage: Redis via @shopify/shopify-app-session-storage-redis (no Prisma/SQLite)
      shopify.app.toml                # App manifest
  packages/
    connector-core/                   # Domain logic (extracted from current backend)
      src/
        modules/
          catalog/                    # Product sync service
          inventory/                  # Inventory sync service
          orders/                     # Order ingestion service
          fulfillment/                # Fulfillment sync service
          mappings/                   # Hierarchy + attribute mapping
          shops/                      # Store + tenant management
          jobs/                       # Job orchestration
          audit/                      # Sync logging + audit trail
        infrastructure/
          shopify/                    # GraphQL client, rate limiter, bulk ops
          oracle/                     # Pool, tenant schema switching
          queue/                      # BullMQ producers + consumers
          telemetry/                  # OpenTelemetry setup
        contracts/                    # Shared interfaces, domain entities
    shared-types/                     # TypeScript types shared across packages
  workers/
    webhook-worker/                   # BullMQ consumer for webhook events
    sync-worker/                      # BullMQ consumer for sync jobs
    reconcile-worker/                 # Scheduled reconciliation
  for-dbas/
    scripts/                          # DDL scripts (V067-V070 + new)
  docs/
    specs/                            # This document
    adr/                              # Architecture Decision Records
  .github/
    workflows/                        # CI/CD
```

**OSS reference — Cloudshelf connector:** The `modules/` structure mirrors Cloudshelf's NestJS module boundaries (`src/modules/catalog/`, `src/modules/inventory/`, etc.) where each module encapsulates its own service, repository, and controller. We adapt this to Express + plain TypeScript classes instead of NestJS decorators, but the boundary pattern is the same.

**OSS reference — Shopify template:** The `apps/admin-app/` directory is scaffolded from `shopify-app-template-react-router`. We keep `shopify.server.ts`, `shopify.app.toml`, and the webhook route structure. The template's Prisma/SQLite session storage is replaced with `@shopify/shopify-app-session-storage-redis` (Redis is already a dependency for BullMQ). The Remix route files replace our current `ShopifyHubPage.tsx` 12-tab SPA.

#### What Changes From Existing Codebase

| Current | Target |
|---------|--------|
| Single `shopify.service.ts` (3,270 LOC) | Split into domain modules (~500 LOC each) |
| Single `shopify.route.ts` (1,483 LOC, 69 routes) | Remix route loaders + smaller Express API modules |
| `frontend/` custom React+Tailwind SPA | `apps/admin-app/` Remix+Polaris embedded app |
| `TenantContextService` from env var | Tenant resolution from OAuth session token → schema lookup |
| No message queue | BullMQ + Redis for async processing |
| No webhook receiver | Webhook ingress → BullMQ → domain handlers |
| REST + GraphQL mixed (2024-10) | GraphQL only (2026-01) |
| Hardcoded demo credentials | OAuth access tokens, encrypted at rest |
| `SHOPIFY_CONFIG` key-value table | App-owned metafields + tenant-scoped config |

#### Deployment Model

- **Single server deployment** (existing infra): Express process serves both Remix SSR and API routes. Redis runs alongside or on a nearby host. Oracle remains at 100.90.84.20.
- **Docker Compose** updated: add Redis service, replace nginx frontend with Remix SSR in the Express process.
- **Shopify CLI** used for local development: `shopify app dev` tunnels HTTPS to local, handles App Bridge handshake.

#### Session Storage

**Decision:** Use Redis for Shopify session storage (via `@shopify/shopify-app-session-storage-redis`).

**Rationale:** Redis is already a dependency for BullMQ. Using it for session storage avoids introducing a third data tier (SQLite/Postgres). The Shopify template's Prisma adapter is replaced with the official Redis session storage adapter. Sessions are short-lived (session tokens expire in 1 minute) so Redis's in-memory model is appropriate.

**Fallback:** If Redis is unavailable, session validation fails and App Bridge re-authenticates (transparent to merchant). No data loss since sessions are stateless JWT tokens.

#### Token Encryption

Access tokens are the most security-critical data in the system. Encryption specification:

- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Library:** Node.js built-in `crypto.createCipheriv` / `crypto.createDecipheriv`
- **Key source:** `SHOPIFY_TOKEN_ENCRYPTION_KEY` environment variable (64 hex chars = 256 bits). In production, sourced from a secret manager (e.g., HashiCorp Vault, AWS Secrets Manager).
- **IV:** Random 12-byte IV generated per encryption, prepended to ciphertext. Stored together in `access_token_encrypted` RAW column.
- **Auth tag:** 16-byte GCM auth tag appended to ciphertext. Format: `[12-byte IV][ciphertext][16-byte auth tag]`.
- **Key rotation:** When rotating keys, re-encrypt all active tokens in a batch job. Store `encryption_key_version` in TENANT_REGISTRY to support concurrent old/new key decryption during rotation window.

#### Schema Provisioning Procedure

The `SHOPIFY_PROVISION_PKG` PL/SQL package runs with DBA-level privileges (definer's rights). Called by the app via a limited-privilege proxy procedure.

```sql
-- Executed by DBA during initial setup
CREATE OR REPLACE PACKAGE SHOPIFY_MASTER.SHOPIFY_PROVISION_PKG AS
  PROCEDURE create_tenant_schema(
    p_shop_domain       IN  VARCHAR2,
    p_schema_name       OUT VARCHAR2,
    p_visionsuite_prefix IN VARCHAR2  -- e.g., 'ACME' → ACME_MERCH, ACME_OMNI, ACME_VSTORE
  );
  PROCEDURE drop_tenant_schema(
    p_schema_name IN VARCHAR2
  );
END;
```

**`create_tenant_schema` steps:**
1. Generate schema name: `SHOPIFY_T_` + first 6 chars of SHA-256(shop_domain) → e.g., `SHOPIFY_T_A1B2C3`
2. `CREATE USER {schema_name} IDENTIFIED BY {random_password} DEFAULT TABLESPACE SHOPIFY_DATA QUOTA UNLIMITED ON SHOPIFY_DATA`
3. `GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE PROCEDURE TO {schema_name}`
4. Execute **new V071+ DDL** in the tenant schema. V067-V070 are NOT run per-tenant — they define the shared `SHOPIFY_MASTER` schema objects and are run once during initial platform setup. Per-tenant DDL creates:
   - Connector binding tables: PRODUCT_BINDING, INVENTORY_BINDING, ORDER_BINDING, FULFILLMENT_BINDING
   - Job/audit tables: SYNC_JOB, SYNC_EVENT
   - Config tables: LOCATION_MAPPING, JESTA_TENANT_CONNECTION, SHOP_INSTALLATION
   - Tenant-scoped operational tables: SHOPIFY_PRODUCT_SNAPSHOT (per-tenant copy), SHOPIFY_PUBLICATION_QUEUE (per-tenant copy), SHOPIFY_SYNC_LOG (per-tenant copy), SHOPIFY_HIERARCHY_MAP (per-tenant copy), SHOPIFY_CONFIG (per-tenant copy), SHOPIFY_INVENTORY_ALERTS (per-tenant copy)
6. Create synonyms pointing to VisionSuite schemas: `CREATE SYNONYM {schema_name}.STYLES FOR {prefix}_MERCH.STYLES` (repeat for all MERCH/OMNI/VSTORE objects from V068)
7. Grant cross-schema access per V069 pattern
8. Return `p_schema_name`

**`drop_tenant_schema` steps:**
1. Verify schema starts with `SHOPIFY_T_` (safety check)
2. `DROP USER {schema_name} CASCADE`

**Rollback:** If provisioning fails at any step, the procedure drops the partially-created schema and raises an exception.

**App-side proxy:** The connector calls provisioning via a restricted Oracle user that has `EXECUTE` on `SHOPIFY_PROVISION_PKG` but no direct DDL privileges.

#### Capacity Planning

**Designed for up to 500 concurrent tenants in year 1.**

| Resource | Per-tenant cost | At 500 tenants |
|----------|----------------|----------------|
| Oracle schemas | ~15 tables + indexes | 7,500 objects (well within Oracle limits) |
| Oracle pool connections | Shared pool, schema-switched | Pool max: 200 connections shared |
| Redis memory (sessions) | ~1KB per active session | ~500KB (negligible) |
| Redis memory (queues) | ~10KB per pending job | ~5MB at 500 jobs |
| BullMQ workers | Shared across tenants | 10-20 worker threads |

**If exceeding 500 tenants:** Evaluate row-level tenancy with `TENANT_ID` discriminator as an alternative. Schema-per-tenant provides stronger isolation but adds DBA overhead at scale. The `withTenantConnection` abstraction layer means switching from schema-based to row-based tenancy requires changes only in the infrastructure layer, not in domain services.

### Sequence: Install Flow

```
Merchant                Shopify               App Server            Oracle
   │                      │                      │                    │
   ├─ Click Install ─────►│                      │                    │
   │                      ├─ OAuth redirect ────►│                    │
   │                      │                      ├─ Validate HMAC     │
   │                      │                      ├─ Generate nonce    │
   │◄─ Consent screen ───┤                      │                    │
   ├─ Approve ───────────►│                      │                    │
   │                      ├─ Auth code ─────────►│                    │
   │                      │                      ├─ Exchange for token │
   │                      │                      ├─ Encrypt token     │
   │                      │                      ├─ INSERT TENANT_REGISTRY ──►│
   │                      │                      ├─ CALL PROVISION_SCHEMA ───►│
   │                      │                      │                    ├─ CREATE SCHEMA
   │                      │                      │                    ├─ RUN DDL V071+ (per-tenant objects only)
   │                      │                      │                    ├─ CREATE SYNONYMS
   │                      │                      │◄─ schema_name ─────┤
   │                      │                      ├─ Register webhooks │
   │                      │                      │  (via TOML deploy) │
   │◄─ Redirect to app ──┤                      │                    │
   │                      │                      │                    │
```

### Failure Modes

| Failure | Impact | Mitigation |
|---------|--------|------------|
| OAuth token exchange fails | Install incomplete | Retry with exponential backoff; show error page with "try again" |
| Schema provisioning fails | Tenant cannot use app | Rollback: delete TENANT_REGISTRY row, log error, notify ops |
| Redis down | Webhook queue unavailable | Return 500 to Shopify (triggers automatic retry — up to 8 times over 4h); alert ops. Reconciliation job catches any missed events after Redis recovers. |
| Oracle down | All tenants affected | Health check fails, Shopify shows app unavailable; retry with `withOracleRetry` |

### Migration Notes

- Existing `backend/src/services/` code is extracted into `packages/connector-core/src/modules/`. Method bodies stay the same; they move into domain-specific service classes.
- Existing `frontend/` is archived. New UI built in `apps/admin-app/` using Polaris components. Domain components (StoreHealthDashboard, SyncHistoryPanel, etc.) are rebuilt in Polaris; their API call patterns transfer directly.
- Database tables are unchanged initially. New tables added for tenant registry (Oracle). OAuth session storage uses Redis (not Oracle).
- The migration can be incremental: stand up the Remix shell with OAuth first, then port one tab at a time from the old frontend.

### Acceptance Criteria

- [ ] `shopify app dev` starts the app, opens in Shopify admin iframe
- [ ] OAuth install flow completes and provisions a tenant schema
- [ ] App Bridge session token authenticates every admin request
- [ ] Health check endpoint returns 200 with pool stats and Redis status
- [ ] All 69 existing API routes are reachable from the new architecture
- [ ] HMAC validation rejects forged webhook payloads with 401

### Open Questions

1. Should Remix SSR and Express API run in the same process or separate containers?
2. Do we need a separate Redis instance per environment (dev/staging/prod)?
3. What is the expected max number of concurrent tenants in year 1?
4. Should the admin-app use Shopify's direct admin API access (`shopify:admin/api/...`) or proxy through our Express backend?

---

## SPEC-DOMAIN-01 — Domain Model

### Objective

Define the core entities, their identifiers, ownership rules, lifecycle states, and retention policies for the connector.

### Scope

- Entity definitions with fields and types
- ID formats and uniqueness constraints
- System-of-record ownership matrix
- Lifecycle state machines
- Retention and purge rules

### Out of Scope

- Oracle DDL (handled in each domain spec)
- GraphQL query/mutation details (SPEC-SHOPIFY-01)
- Sync logic (SPEC-CATALOG-01 through SPEC-FULFILLMENT-01)

### Assumptions

- Shopify GIDs are the authoritative Shopify-side identifiers (format: `gid://shopify/Product/12345`)
- VisionSuite IDs (STYLE_ID, SKU, BUSINESS_UNIT_ID) are the authoritative Jesta-side identifiers
- All entities are scoped to a tenant (schema isolation makes this implicit in queries but explicit in the registry)

### System-of-Record Ownership Matrix

**OSS reference — Frappe ecommerce_integrations:** This ownership model follows ERPNext's documented pattern where ERP is source of truth for catalog and inventory, while Shopify originates orders. Frappe's `EcommerceItem` linking table concept informs our `ProductBinding` entity — a dedicated junction table rather than polluting either system's domain objects.

| Domain | Source of Truth | Direction | Notes |
|--------|----------------|-----------|-------|
| Catalog (products, variants) | **VisionSuite** | Jesta → Shopify | VisionSuite is the PIM. Shopify reflects what Jesta publishes. |
| Prices | **VisionSuite** | Jesta → Shopify | Default. Merchant can opt into Shopify-owned pricing per store (future). |
| Inventory quantities | **VisionSuite** | Jesta → Shopify | Via PL/SQL event triggers. Reconciliation catches drift. |
| Orders | **Shopify** | Shopify → Jesta | Shopify originates. Imported into VisionSuite for fulfillment. |
| Fulfillment/tracking | **VisionSuite** | Jesta → Shopify | Jesta manages warehouse ops, pushes tracking back to Shopify. |
| Customer data | **Shopify** | Shopify → Jesta (read-only) | Minimal PII stored; GDPR compliance required. |
| Connector metadata | **Connector** | Internal | Stored in `$app` metafields (Shopify-side) and tenant Oracle schema. |

### Migration from Existing Tables

The current codebase has `SHOPIFY_TENANTS` (simple tenant registry with `tenant_id`, `tenant_name`, `is_active`) and `SHOPIFY_CONFIG` (key-value config). These evolve as follows:

| Current table | Target entity | Migration |
|--------------|---------------|-----------|
| `ATTR_MGR.SHOPIFY_TENANTS` | `SHOPIFY_MASTER.TENANT_REGISTRY` + per-tenant `SHOP_INSTALLATION` | TENANT_REGISTRY is the new shared lookup. SHOP_INSTALLATION holds OAuth tokens and lifecycle state per tenant schema. Existing SHOPIFY_TENANTS rows are migrated to TENANT_REGISTRY with `status = 'ACTIVE'` and a provisioned schema. |
| `ATTR_MGR.SHOPIFY_CONFIG` | Per-tenant `SHOPIFY_CONFIG` + `shopify.app.toml` for app-level config | Tenant-scoped config stays in per-tenant schema. Global app config (API version, scopes) moves to TOML. Sensitive config (tokens) moves to encrypted SHOP_INSTALLATION columns. |
| `TenantContextService` (singleton, env var) | `TenantService` (resolves from OAuth session token → TENANT_REGISTRY → schema) | Complete rewrite. The singleton pattern is replaced by request-scoped tenant resolution. |

### Entity Definitions

#### ShopInstallation

Represents a Shopify store that has installed the app.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `shop_domain` | VARCHAR2(255) | Shopify OAuth | Primary lookup key. e.g., `acme.myshopify.com` |
| `shopify_shop_id` | NUMBER | Shopify | Numeric shop ID from OAuth response |
| `access_token_encrypted` | RAW(512) | OAuth token exchange | AES-256 encrypted offline token |
| `refresh_token_encrypted` | RAW(512) | OAuth (if expiring tokens) | Nullable; for future expiring token support |
| `token_expires_at` | TIMESTAMP | OAuth | Null for non-expiring offline tokens |
| `granted_scopes` | VARCHAR2(1000) | OAuth | Comma-separated. e.g., `read_products,write_products,...` |
| `api_version` | VARCHAR2(20) | Config | Pinned version. e.g., `2026-01` |
| `status` | VARCHAR2(20) | Lifecycle | `INSTALLING`, `ACTIVE`, `SUSPENDED`, `UNINSTALLED`, `PURGED` |
| `schema_name` | VARCHAR2(30) | Provisioning | Oracle schema. e.g., `SHOPIFY_T_A1B2C3` |
| `visionsuite_schema_prefix` | VARCHAR2(30) | Setup | Prefix for MERCH/OMNI/VSTORE schemas |
| `installed_at` | TIMESTAMP | OAuth | First install time |
| `uninstalled_at` | TIMESTAMP | Webhook | Null until uninstall |
| `purge_after` | TIMESTAMP | Lifecycle | `uninstalled_at + 30 days` |

**Lifecycle:**
```
INSTALLING → ACTIVE → SUSPENDED → ACTIVE (reactivate)
                   → UNINSTALLED → PURGED
```

#### JestaTenantConnection

Represents the link between a Shopify installation and its VisionSuite tenant.

| Field | Type | Notes |
|-------|------|-------|
| `shop_domain` | VARCHAR2(255) | FK to ShopInstallation |
| `jesta_tenant_id` | VARCHAR2(50) | VisionSuite tenant identifier |
| `business_unit_id` | NUMBER | Default BU for this connection |
| `connection_status` | VARCHAR2(20) | `PENDING`, `CONNECTED`, `ERROR`, `DISCONNECTED` |
| `last_verified_at` | TIMESTAMP | Last successful Oracle connectivity check |
| `config_json` | CLOB | Tenant-specific config overrides (JSON) |

#### LocationMapping

Maps Shopify locations to VisionSuite warehouses/sites.

**OSS reference — Frappe ecommerce_integrations:** ERPNext documents a strict 1:1 warehouse-to-Shopify-location mapping. Inventory sync only operates on mapped locations. We adopt this pattern: unmapped locations are ignored during sync.

| Field | Type | Notes |
|-------|------|-------|
| `mapping_id` | NUMBER (identity) | PK |
| `shop_domain` | VARCHAR2(255) | FK to ShopInstallation |
| `shopify_location_gid` | VARCHAR2(100) | `gid://shopify/Location/12345` |
| `shopify_location_name` | VARCHAR2(255) | Display name |
| `jesta_site_id` | VARCHAR2(20) | VisionSuite site/warehouse ID |
| `jesta_site_name` | VARCHAR2(200) | Display name |
| `is_default` | CHAR(1) | `Y`/`N` — fallback location for unmapped inventory |
| `sync_inventory` | CHAR(1) | `Y`/`N` — whether to sync inventory for this pair |
| `is_active` | CHAR(1) | `Y`/`N` |

#### ProductBinding

Links a Shopify product/variant to its VisionSuite style/SKU. This is the connector's linking table — it does not pollute either system's domain objects.

**OSS reference — Frappe ecommerce_integrations:** Modeled after ERPNext's `EcommerceItem` doctype which maps `(integration, integration_item_code, variant_id, sku)` to `erpnext_item_code`. We add `payload_hash` for change detection and `inventory_synced_on` for timestamp-based inventory diff (both patterns from ERPNext).

| Field | Type | Notes |
|-------|------|-------|
| `binding_id` | NUMBER (identity) | PK |
| `shop_domain` | VARCHAR2(255) | FK |
| `shopify_product_gid` | VARCHAR2(100) | `gid://shopify/Product/12345` |
| `shopify_variant_gid` | VARCHAR2(100) | `gid://shopify/ProductVariant/67890` |
| `jesta_business_unit_id` | NUMBER | VisionSuite BU |
| `jesta_style_id` | VARCHAR2(20) | VisionSuite style |
| `jesta_sku` | VARCHAR2(50) | VisionSuite SKU (barcode-level) |
| `jesta_color_id` | VARCHAR2(10) | Color code |
| `payload_hash` | VARCHAR2(64) | SHA-256 of last synced product payload — for change detection |
| `last_synced_at` | TIMESTAMP | Last successful product sync |
| `inventory_synced_on` | TIMESTAMP | Last successful inventory push (defaults to epoch for never-synced) |
| `sync_status` | VARCHAR2(20) | `SYNCED`, `PENDING`, `ERROR`, `ORPHANED` |
| `sync_direction` | VARCHAR2(10) | `JESTA_TO_SHOPIFY` (default) |

**Unique constraint:** `(shop_domain, shopify_variant_gid)` and `(shop_domain, jesta_style_id, jesta_sku)`

#### InventoryBinding

Tracks inventory state per variant-location pair.

| Field | Type | Notes |
|-------|------|-------|
| `binding_id` | NUMBER (identity) | PK |
| `shop_domain` | VARCHAR2(255) | FK |
| `shopify_variant_gid` | VARCHAR2(100) | FK to ProductBinding |
| `shopify_inventory_item_gid` | VARCHAR2(100) | `gid://shopify/InventoryItem/...` |
| `shopify_location_gid` | VARCHAR2(100) | FK to LocationMapping |
| `jesta_site_id` | VARCHAR2(20) | VisionSuite warehouse |
| `last_pushed_qty` | NUMBER | Quantity last sent to Shopify |
| `last_source_qty` | NUMBER | Quantity read from VisionSuite |
| `last_source_timestamp` | TIMESTAMP | When VisionSuite qty was read |
| `last_pushed_at` | TIMESTAMP | When qty was last sent to Shopify |

**Unique constraint:** `(shop_domain, shopify_variant_gid, shopify_location_gid)`

#### OrderBinding

Links a Shopify order to its VisionSuite import.

| Field | Type | Notes |
|-------|------|-------|
| `binding_id` | NUMBER (identity) | PK |
| `shop_domain` | VARCHAR2(255) | FK |
| `shopify_order_gid` | VARCHAR2(100) | `gid://shopify/Order/12345` |
| `shopify_order_name` | VARCHAR2(50) | Display number e.g., `#1001` |
| `jesta_order_id` | VARCHAR2(50) | VisionSuite sales order ID |
| `jesta_wfe_trans_id` | VARCHAR2(50) | VisionSuite WFE transaction ID |
| `import_status` | VARCHAR2(20) | `PENDING`, `IMPORTED`, `PARTIALLY_IMPORTED`, `FAILED`, `CANCELLED` |
| `idempotency_key` | VARCHAR2(100) | `{shop_domain}:{shopify_order_gid}` — prevents duplicate imports |
| `imported_at` | TIMESTAMP | |
| `last_updated_at` | TIMESTAMP | |
| `error_message` | VARCHAR2(4000) | Last error if FAILED |

**Unique constraint:** `(shop_domain, shopify_order_gid)`

#### FulfillmentBinding

Links a VisionSuite shipment event to a Shopify fulfillment.

| Field | Type | Notes |
|-------|------|-------|
| `binding_id` | NUMBER (identity) | PK |
| `shop_domain` | VARCHAR2(255) | FK |
| `shopify_order_gid` | VARCHAR2(100) | Parent order |
| `shopify_fulfillment_gid` | VARCHAR2(100) | `gid://shopify/Fulfillment/...` — null until created |
| `shopify_fulfillment_order_gid` | VARCHAR2(100) | Fulfillment order GID |
| `jesta_shipment_id` | VARCHAR2(50) | VisionSuite shipment ID |
| `tracking_number` | VARCHAR2(100) | |
| `tracking_url` | VARCHAR2(500) | |
| `tracking_company` | VARCHAR2(100) | |
| `status` | VARCHAR2(20) | `PENDING`, `FULFILLED`, `PARTIALLY_FULFILLED`, `CANCELLED` |
| `created_at` | TIMESTAMP | |
| `fulfilled_at` | TIMESTAMP | |

#### SyncJob

Represents a unit of sync work (webhook-triggered, scheduled, or manual).

| Field | Type | Notes |
|-------|------|-------|
| `job_id` | VARCHAR2(50) | UUID |
| `shop_domain` | VARCHAR2(255) | Tenant scope |
| `job_type` | VARCHAR2(30) | `CATALOG_SYNC`, `INVENTORY_SYNC`, `ORDER_IMPORT`, `FULFILLMENT_PUSH`, `RECONCILIATION`, `BOOTSTRAP` |
| `trigger_source` | VARCHAR2(20) | `WEBHOOK`, `SCHEDULE`, `MANUAL`, `PL_SQL_EVENT`, `RECONCILIATION` |
| `scope` | VARCHAR2(50) | e.g., `product:12345` or `full` |
| `status` | VARCHAR2(20) | `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `DEAD_LETTERED` |
| `attempt_count` | NUMBER | Default 0 |
| `max_attempts` | NUMBER | Default 3 |
| `idempotency_key` | VARCHAR2(200) | `{shop}:{type}:{scope}:{payload_hash}` |
| `payload_hash` | VARCHAR2(64) | SHA-256 of job payload |
| `payload_json` | CLOB | Full job payload |
| `error_message` | VARCHAR2(4000) | |
| `queued_at` | TIMESTAMP | |
| `started_at` | TIMESTAMP | |
| `completed_at` | TIMESTAMP | |
| `next_retry_at` | TIMESTAMP | Calculated from backoff |

**Unique constraint:** `(idempotency_key)` — prevents duplicate jobs from webhook replay

#### SyncEvent (Audit Log)

Immutable audit record for every state change.

| Field | Type | Notes |
|-------|------|-------|
| `event_id` | NUMBER (identity) | PK |
| `shop_domain` | VARCHAR2(255) | |
| `job_id` | VARCHAR2(50) | FK to SyncJob (nullable for system events) |
| `event_type` | VARCHAR2(30) | `JOB_QUEUED`, `JOB_STARTED`, `JOB_COMPLETED`, `JOB_FAILED`, `PRODUCT_SYNCED`, `INVENTORY_PUSHED`, `ORDER_IMPORTED`, `FULFILLMENT_SENT`, `CONFIG_CHANGED`, `WEBHOOK_RECEIVED` |
| `source_system` | VARCHAR2(20) | `SHOPIFY`, `VISIONSUITE`, `CONNECTOR` |
| `object_type` | VARCHAR2(30) | `PRODUCT`, `VARIANT`, `ORDER`, `FULFILLMENT`, `INVENTORY`, `CONFIG` |
| `object_id` | VARCHAR2(100) | Shopify GID or Jesta ID |
| `diff_summary_json` | CLOB | JSON of what changed (nullable) |
| `correlation_id` | VARCHAR2(50) | Request/job correlation |
| `error_code` | VARCHAR2(50) | From ErrorCode enum |
| `error_message` | VARCHAR2(4000) | |
| `created_at` | TIMESTAMP | Immutable |

### Retention Policy

| Entity | Active retention | After uninstall | Purge |
|--------|-----------------|-----------------|-------|
| ShopInstallation | Indefinite | 30 days | Drop schema, archive registry row |
| All binding tables | Indefinite | 30 days (in tenant schema) | Dropped with schema |
| SyncJob | 90 days (completed) | 30 days | DELETE WHERE completed_at < 90d |
| SyncEvent | 1 year | 30 days | DELETE WHERE created_at < 1y |
| Access tokens | Until revoked/uninstall | Immediate delete on uninstall | N/A |

### Acceptance Criteria

- [ ] All entities have DDL scripts with constraints, indexes, and identity columns
- [ ] Unique constraints prevent duplicate bindings
- [ ] Idempotency keys on SyncJob prevent duplicate processing
- [ ] Ownership matrix is enforced in code: write operations only allowed in the source-of-truth direction
- [ ] Retention purge job runs weekly and respects the policy above

### Open Questions

1. Should `ProductBinding.payload_hash` use SHA-256 of the full Shopify product JSON or a normalized subset?
2. Should `SyncEvent` be stored in the tenant schema or a shared audit schema?
3. Maximum expected bindings per tenant? (Affects index strategy)

---

## SPEC-SHOPIFY-01 — Shopify Integration Layer

### Objective

Define how the connector communicates with Shopify's GraphQL Admin API: client setup, version pinning, authentication, rate limiting, error handling, and the full query/mutation inventory.

### Scope

- GraphQL client architecture
- API version management
- Rate limit handling (cost-based throttling)
- Authentication wrapper
- Error classification and retry rules
- Complete query/mutation catalog

### Out of Scope

- Bulk operations (SPEC-BULK-01)
- Webhook ingestion (SPEC-WEBHOOK-01)
- Domain-specific sync logic (SPEC-CATALOG-01+)

### Assumptions

- Target plans: Shopify Advanced (200 pts/s) and Plus (1,000 pts/s)
- GraphQL Admin API 2026-01 is the initial target version
- Single query max cost: 1,000 points; input array max: 250 items
- All REST endpoints currently in the codebase must be migrated to GraphQL

### Architecture

#### Shopify GraphQL Client

**OSS reference — Cloudshelf connector:** Cloudshelf wraps Shopify API calls in a service layer with automatic retry, cost tracking, and OpenTelemetry spans. We adapt this pattern to our Express context. Their `ShopifyGraphqlClient` service handles:
- Automatic `X-Shopify-Access-Token` header injection
- Response error extraction from `userErrors` and `extensions.cost`
- Retry with backoff on throttled responses
- Span creation per API call

```typescript
// Conceptual interface (not Cloudshelf code — our adaptation)
interface ShopifyClient {
  query<T>(operation: string, variables?: Record<string, unknown>): Promise<T>;
  mutate<T>(operation: string, variables?: Record<string, unknown>): Promise<T>;
  getCostBudget(): { available: number; maximum: number; restoreRate: number };
}
```

**Auth wrapper pattern — inspired by Frappe's `@temp_shopify_session`:** Every function that calls Shopify API goes through a `withShopifyClient(shopDomain, fn)` wrapper that:
1. Resolves tenant from `shop_domain`
2. Decrypts access token
3. Creates a scoped client instance with correct API version
4. Tears down after function returns
5. Bypasses auth in test mode (checking a test flag, similar to Frappe's `frappe.flags.in_test`)

#### API Version Management

- Pin to `2026-01` in `shopify.app.toml` and in the GraphQL client base URL
- Store `api_version` per ShopInstallation for future per-tenant version pinning
- Quarterly upgrade cadence: test against next version in staging before rollout
- Version appears in all API call logs for debugging

#### Rate Limit Handling

Shopify uses a **cost-based leaky bucket** for GraphQL:

| Plan | Bucket size | Restore rate |
|------|------------|--------------|
| Advanced | 1,000 pts | 200 pts/s |
| Plus | 2,000 pts | 1,000 pts/s |

**Strategy:**
1. Read `extensions.cost` from every GraphQL response
2. Track `currentlyAvailable` points per shop in memory (Map<shopDomain, bucket>)
3. Before each request: if `requestedQueryCost > currentlyAvailable`, delay until enough points restore (calculated from restore rate)
4. On `THROTTLED` response: read `maximumAvailable` and `restoreRate` from response, recalibrate, backoff 1 second, retry
5. Never exceed 3 retries for throttling per request

**Per-shop isolation:** Rate limit state is per `shop_domain`, not global. Each tenant's bucket is independent.

#### Error Classification

| Error type | Source | Retry? | Action |
|------------|--------|--------|--------|
| `THROTTLED` | `extensions.cost.throttleStatus` | Yes (backoff) | Wait for bucket restore |
| `userErrors` | Mutation response | No (usually) | Log, surface to user. Some are retryable (e.g., `TAKEN` on idempotency key collision → skip, already processed) |
| `INTERNAL_SERVER_ERROR` | Shopify 5xx | Yes (3x) | Exponential backoff: 1s, 2s, 4s |
| `ACCESS_DENIED` | 401/403 | No | Token revoked or scopes insufficient. Suspend tenant, alert. |
| `NOT_FOUND` | Resource deleted | No | Update binding to `ORPHANED` |
| Network errors | DNS/TCP/TLS | Yes (3x) | Same as 5xx backoff |

#### REST → GraphQL Migration

All 11 REST call sites in the current codebase must be migrated to GraphQL:

| Current REST call | Location | GraphQL replacement |
|-------------------|----------|-------------------|
| `GET /shop.json` | shopify.service.ts:269 | `{ shop { name currencyCode primaryDomain { url } } }` ✅ already exists |
| `GET /orders/{id}.json` | shopify.service.ts:962 | `query order($id: ID!) { order(id: $id) { ... } }` |
| `GET /orders.json?name=...` | shopify.service.ts:1171 | `query orders($query: String!) { orders(first: 50, query: $query) { ... } }` |
| `GET /products/{id}.json` | shopify.service.ts:3224 | `query product($id: ID!) { product(id: $id) { ... } }` |
| `POST /products.json` | shopify-actions.service.ts:494 | `mutation productSet(...)` (replaces both create and update) |
| `GET /products.json?limit=250` | shopify.route.ts:1257 (auto-map) | `query products($query: String!) { ... }` |
| `GET /products.json?vendor=...` | shopify-live-test.service.ts:274 | `query products($query: String!) { products(query: $query) { ... } }` |
| `POST /products.json` | shopify-live-test.service.ts:320 | `mutation productSet(...)` or deprecate (dev/QA only) |
| `GET /webhooks.json` | shopify-actions.service.ts:1325 | `{ webhookSubscriptions(first: 50) { ... } }` |
| `POST /webhooks.json` | shopify-actions.service.ts:1370 | Declarative via `shopify.app.toml` (no runtime registration) |
| `DELETE /webhooks/{id}.json` | shopify-actions.service.ts:1419 | `mutation webhookSubscriptionDelete(...)` (rarely needed; TOML handles lifecycle) |

#### Query/Mutation Inventory (2026-01)

**Queries:**
- `shop` — connection test, plan info, currency
- `product(id)` — single product with variants, images, metafields
- `products(first, query)` — paginated product list
- `productVariant(id)` — variant with inventory item
- `order(id)` — single order with line items, shipping, transactions
- `orders(first, query)` — paginated order list with filters
- `locations(first)` — all active locations
- `inventoryItem(id)` — inventory item with levels per location
- `fulfillmentOrders(first, query)` — fulfillment orders for an order
- `bulkOperation(id)` — poll bulk operation status
- `webhookSubscriptions(first)` — list active webhooks

**Mutations:**
- `productSet` — declarative product upsert (primary catalog sync mutation)
- `productDelete` — delete product
- `inventorySetOnHandQuantities` — set inventory to absolute value
- `inventoryAdjustQuantities` — adjust inventory by delta
- `fulfillmentCreate` — create fulfillment with tracking
- `fulfillmentTrackingInfoUpdate` — update tracking info
- `stagedUploadsCreate` — initiate media upload
- `productCreateMedia` — attach uploaded media to product
- `discountCodeBasicCreate` — create discount code
- `discountAutomaticBasicCreate` — create automatic discount
- `discountCodeDelete` — delete discount

### Acceptance Criteria

- [ ] All Shopify API calls go through the `ShopifyClient` wrapper — no direct `fetch()` to Shopify
- [ ] Rate limit bucket is tracked per shop and pre-flight checked before each call
- [ ] `THROTTLED` responses trigger automatic backoff and retry (max 3)
- [ ] All REST calls migrated to GraphQL
- [ ] API version is centrally configured and logged with every call
- [ ] `withShopifyClient(shopDomain, fn)` wraps all Shopify-calling functions
- [ ] Error responses are classified and routed to correct handling path (retry, skip, alert)

### Open Questions

1. Should we cache the plan type per shop to optimize rate limit pre-flight calculations?
2. Do we need `read_all_orders` scope (for orders older than 60 days)?
3. Should the client support request batching (multiple operations in one HTTP request)?

---

## SPEC-WEBHOOK-01 — Webhook Ingestion

### Objective

Define how the connector receives, validates, deduplicates, and processes Shopify webhook events and VisionSuite PL/SQL-triggered events.

### Scope

- Inbound Shopify webhook receiver
- VisionSuite PL/SQL event listener
- Event dispatch to domain handlers
- Deduplication and idempotency
- Dead-letter queue and replay
- GDPR mandatory webhooks

### Out of Scope

- Domain-specific handler logic (SPEC-CATALOG-01+)
- Bulk operations completion webhooks (SPEC-BULK-01)

### Assumptions

- Shopify retries failed HTTPS webhook deliveries up to 8 times over 4 hours
- Shopify does NOT guarantee delivery — reconciliation is the safety net
- Webhooks must respond within 5 seconds to avoid Shopify marking them as failed
- VisionSuite PL/SQL events can call an HTTP endpoint or insert into a notifications table

### Architecture

#### Shopify Webhook Receiver

**OSS reference — Frappe ecommerce_integrations:** Frappe's `store_request_data()` pattern: validate HMAC → parse payload → create log entry (status: Queued) → enqueue background job. The log entry is created *synchronously before* the job is enqueued, ensuring an audit trail even if the queue fails. We adopt this "log-then-enqueue" pattern directly.

**OSS reference — Frappe's `EVENT_MAPPER`:** A single dict maps webhook topics to handler functions. Used for both routing and logging — one place to add a new event type. We implement this as a TypeScript `Record<string, HandlerConfig>`.

**Flow:**
```
Shopify POST /webhooks
    │
    ├─ 1. Validate HMAC-SHA256 (reject 401 if invalid)
    ├─ 2. Extract X-Shopify-Topic, X-Shopify-Shop-Domain, X-Shopify-Webhook-Id
    ├─ 3. Check dedup: has this webhook_id been processed? (Redis SET with TTL)
    │      ├─ Yes → respond 200 (idempotent ack)
    │      └─ No → continue
    ├─ 4. INSERT SyncEvent (status: QUEUED) — synchronous, before enqueue
    ├─ 5. Enqueue to BullMQ: topic-specific queue with payload + metadata
    ├─ 6. Respond 200 to Shopify (< 5 seconds total)
    │
    └─ (async) BullMQ consumer picks up job:
        ├─ 7. Resolve tenant from shop_domain
        ├─ 8. Dispatch to domain handler via EVENT_MAPPER
        ├─ 9. Handler processes (with withTenantConnection + withShopifyClient)
        ├─ 10. On success: UPDATE SyncEvent status → COMPLETED
        └─ 11. On failure: retry up to 3x, then → DEAD_LETTERED
```

#### Event Dispatch Table

```typescript
const EVENT_MAPPER: Record<string, { queue: string; handler: string; module: string }> = {
  'products/create':        { queue: 'catalog',     handler: 'handleProductCreate',     module: 'catalog' },
  'products/update':        { queue: 'catalog',     handler: 'handleProductUpdate',     module: 'catalog' },
  'products/delete':        { queue: 'catalog',     handler: 'handleProductDelete',     module: 'catalog' },
  'orders/create':          { queue: 'orders',      handler: 'handleOrderCreate',       module: 'orders' },
  'orders/updated':         { queue: 'orders',      handler: 'handleOrderUpdate',       module: 'orders' },
  'orders/cancelled':       { queue: 'orders',      handler: 'handleOrderCancel',       module: 'orders' },
  'inventory_levels/update':{ queue: 'inventory',   handler: 'handleInventoryUpdate',   module: 'inventory' },
  'fulfillments/create':    { queue: 'fulfillment', handler: 'handleFulfillmentCreate', module: 'fulfillment' },
  'fulfillments/update':    { queue: 'fulfillment', handler: 'handleFulfillmentUpdate', module: 'fulfillment' },
  'app/uninstalled':        { queue: 'lifecycle',   handler: 'handleAppUninstalled',    module: 'shops' },
  'app/scopes_update':      { queue: 'lifecycle',   handler: 'handleScopesUpdate',      module: 'shops' },
  'bulk_operations/finish': { queue: 'bulk',        handler: 'handleBulkFinished',      module: 'jobs' },
};
```

#### Webhook Topic List

**Mandatory (GDPR + lifecycle):**
- `app/uninstalled` — clean up tokens, mark tenant UNINSTALLED
- `customers/data_request` — respond with stored customer data
- `customers/redact` — delete customer PII within 30 days
- `shop/redact` — delete all shop data (sent 48h after uninstall)

**Catalog:**
- `products/create` — update ProductBinding if created externally
- `products/update` — detect Shopify-side changes (conflict detection when Jesta is SSOT)
- `products/delete` — mark ProductBinding as ORPHANED

**Inventory:**
- `inventory_levels/update` — detect Shopify-side inventory changes (conflict when Jesta is SSOT)

**Orders:**
- `orders/create` — primary order import trigger
- `orders/updated` — update order status in Jesta
- `orders/cancelled` — cancel order in Jesta

**Fulfillment:**
- `fulfillments/create` — confirm fulfillment was applied in Shopify
- `fulfillments/update` — tracking info updates

**Operations:**
- `bulk_operations/finish` — trigger result processing for bulk queries/mutations
- `app/scopes_update` — track scope changes, trigger re-auth if needed

#### VisionSuite PL/SQL Event Listener

VisionSuite pushes change events via Oracle PL/SQL procedures. Two approaches:

**Approach A: HTTP callback** — PL/SQL calls `UTL_HTTP.REQUEST` to POST to the connector's internal event endpoint:
```
POST /internal/events/visionsuite
{
  "event_type": "PRODUCT_UPDATED",
  "tenant_id": "ACME",
  "business_unit_id": 1,
  "style_id": "STY-001",
  "timestamp": "2026-03-17T10:00:00Z"
}
```

**Approach B: Notification table** — PL/SQL inserts into a `VISIONSUITE_EVENTS` table; the connector polls every N seconds:
```sql
INSERT INTO VISIONSUITE_EVENTS (event_type, tenant_id, style_id, created_at)
VALUES ('PRODUCT_UPDATED', 'ACME', 'STY-001', SYSTIMESTAMP);
```

**Recommendation:** Approach A (HTTP callback) for low latency; Approach B as fallback if network restrictions prevent PL/SQL → HTTP. Support both.

#### GDPR Webhook Implementation

```
POST /webhooks (topic: customers/data_request)
    ├─ Validate HMAC
    ├─ Log request to SyncEvent
    ├─ Query tenant schema for customer data:
    │   - OrderBinding WHERE customer matches
    │   - Any PII in sync logs
    ├─ Respond 200
    └─ (async) Compile data, store for merchant retrieval

POST /webhooks (topic: customers/redact)
    ├─ Validate HMAC
    ├─ Log request
    ├─ Enqueue: delete customer PII from:
    │   - OrderBinding (anonymize customer fields)
    │   - SyncEvent (redact PII from payloads)
    ├─ Respond 200
    └─ (async) Complete within 30 days

POST /webhooks (topic: shop/redact)
    ├─ Validate HMAC
    ├─ Log request
    ├─ Enqueue: full tenant data purge
    │   - Mark ShopInstallation as PURGED
    │   - Schedule schema drop
    ├─ Respond 200
    └─ (async) Complete within 30 days
```

#### Deduplication

- **Shopify webhook ID**: `X-Shopify-Webhook-Id` header is unique per delivery attempt. Store in Redis SET with 4h TTL (matches Shopify's HTTPS retry window of 8 retries over 4 hours). Note: repeated failures can cause Shopify to remove the webhook subscription entirely — monitor subscription health.
- **Payload hash**: SHA-256 of the webhook body. Used as secondary dedup for cases where the same logical event arrives with different webhook IDs (Shopify bug/retry edge cases).
- **SyncJob idempotency key**: `{shop}:{topic}:{object_id}:{payload_hash}` — prevents the same logical change from being processed twice.

#### Dead-Letter Queue

After 3 failed processing attempts:
1. Move job to DLQ (BullMQ built-in)
2. Update SyncEvent status to `DEAD_LETTERED`
3. Surface in admin UI under "Failed Events"
4. Admin can inspect payload, error, and click "Retry" to re-enqueue

### Failure Modes

| Failure | Impact | Mitigation |
|---------|--------|------------|
| HMAC validation fails | Forged/corrupted webhook rejected | 401 response, logged as security event |
| Redis down during dedup check | Cannot check for duplicates | Fall through to processing (accept potential duplicate; idempotent handlers make this safe) |
| BullMQ enqueue fails | Event not processed | Return 500 to Shopify (triggers retry). SyncEvent log entry exists for manual replay. |
| Handler throws after 3 retries | Event stuck in DLQ | Admin UI shows failed events. Reconciliation job catches missed state. |

### Acceptance Criteria

- [ ] All webhooks declared in `shopify.app.toml` and registered via `shopify app deploy`
- [ ] HMAC-SHA256 validated on every inbound webhook; 401 for invalid
- [ ] SyncEvent log entry created *before* BullMQ enqueue
- [ ] Webhook endpoint responds < 5 seconds
- [ ] Duplicate webhook IDs (same `X-Shopify-Webhook-Id`) return 200 without reprocessing
- [ ] Failed events appear in DLQ and are visible in admin UI
- [ ] GDPR webhooks implemented and respond 200
- [ ] VisionSuite PL/SQL events trigger connector processing within 10 seconds

### Open Questions

1. Should VisionSuite events use HTTP callback or notification table polling? (Depends on DBA network policy)
2. What is the expected webhook volume per tenant per day? (Affects Redis sizing)
3. Should the DLQ have an auto-purge after 30 days or retain indefinitely?

---

## SPEC-BULK-01 — Bootstrap and Backfill

### Objective

Define how to perform initial data loads (bootstrap) and periodic large-scale syncs (backfill) using Shopify's bulk operation APIs.

### Scope

- Bootstrap flow when VisionSuite is source of truth (Jesta → Shopify)
- Bootstrap flow when Shopify has existing data (Shopify → Jesta binding)
- Bulk query operations (export from Shopify)
- Bulk mutation operations (import to Shopify)
- JSONL parsing and checkpointing
- Recovery from interrupted bulk operations

### Out of Scope

- Incremental sync (SPEC-CATALOG-01, SPEC-INVENTORY-01)
- Webhook-driven delta sync (SPEC-WEBHOOK-01)

### Assumptions

- Shopify allows 1 running bulk query and 1 running bulk mutation per shop concurrently (verify against 2026-01 docs at implementation time — newer versions may support more)
- Bulk operation results delivered as JSONL; result URL expires after 7 days
- Bulk mutation input max: 100MB JSONL file
- Offline tokens required (online tokens expire in 24h; bulk ops can run longer)
- `productSet` is used for bulk catalog sync (up to 100 variants per product on standard plans; up to 2,000 on Shopify Plus with expanded variants)

### Architecture

#### Bootstrap A: VisionSuite is Source of Truth (Jesta → Shopify)

This is the primary bootstrap path. Merchant has products in VisionSuite, needs them published to Shopify.

```
1. Admin clicks "Start Bootstrap" in setup wizard
2. Connector reads from SHOPIFY_PRODUCT_SNAPSHOT (tenant schema)
   - Paginated: 100 products at a time
3. For each batch:
   a. Transform to productSet input format
   b. Generate JSONL file (one line per productSet mutation input)
   c. Upload JSONL via stagedUploadsCreate
   d. Call bulkOperationRunMutation with productSet
   e. Poll or wait for bulk_operations/finish webhook
   f. Parse result JSONL: extract Shopify GIDs
   g. Create ProductBinding rows for each product/variant
   h. Update SHOPIFY_PRODUCT_SNAPSHOT.shopify_product_id
4. After all batches: run inventory push for all bound products
5. Log bootstrap completion in SyncEvent
```

**OSS reference — Unopim connector:** Unopim's product export uses batched writes with attribute mapping and locale mapping applied per product before export. We adapt their mapping pipeline: each product passes through `AttributeMapper → LocaleMapper → MetafieldMapper → ProductSetInputBuilder` before JSONL serialization.

#### Bootstrap B: Shopify Has Existing Data (Shopify → Jesta Binding)

Merchant already has products on Shopify. Connector needs to build bindings without overwriting.

```
1. Admin clicks "Import Existing Products" in setup wizard
2. Call bulkOperationRunQuery with products query:
   query { products { edges { node {
     id title vendor variants(first:100) {
       edges { node { id sku barcode inventoryItem { id } } }
     }
   } } } }
3. Wait for bulk_operations/finish webhook
4. Download JSONL result
5. For each product/variant:
   a. Attempt SKU match against MERCH.BAR_CODES
   b. If match found: create ProductBinding (sync_status: SYNCED)
   c. If no match: create ProductBinding (sync_status: ORPHANED, needs manual mapping)
6. Surface unmatched products in admin UI for manual mapping
```

**OSS reference — Frappe ecommerce_integrations:** ERPNext's `_match_sku_and_link_item()` attempts SKU matching before creating new items. We adopt this "SKU match first, create binding, flag unmatched" pattern.

#### JSONL Format

**Bulk mutation input (one line per mutation call):**
```jsonl
{"input":{"title":"Style ABC","productType":"Shoes","vendor":"Nike","variants":[{"sku":"ABC-BLK-10","price":"99.99","barcode":"123456789"}]}}
{"input":{"title":"Style DEF","productType":"Apparel","vendor":"Adidas","variants":[{"sku":"DEF-WHT-M","price":"49.99"}]}}
```

**Bulk query output (one JSON object per line, with `__parentId` for nested objects):**
```jsonl
{"id":"gid://shopify/Product/1","title":"Style ABC","vendor":"Nike"}
{"id":"gid://shopify/ProductVariant/10","sku":"ABC-BLK-10","__parentId":"gid://shopify/Product/1"}
```

#### Checkpointing

- Track progress in `SyncJob.payload_json`: `{ batchesSent: 5, batchesCompleted: 3, lastProcessedStyleId: "STY-500" }`
- On bulk operation failure: resume from `lastProcessedStyleId` instead of restarting
- Each completed batch updates the checkpoint
- Admin UI shows progress: "Batch 3/10 — 300 products synced, 2 errors"

#### Recovery

| Failure | Recovery |
|---------|----------|
| Bulk operation times out (10 days query / 24h mutation) | Restart with remaining items from checkpoint |
| JSONL upload fails | Re-upload the same JSONL file (staged upload is idempotent by filename) |
| Result download fails (URL expired after 7 days) | Re-run the bulk operation |
| Partial mutation failure (some lines succeed, some fail) | Maintain a batch manifest mapping JSONL line number → style_id (result JSONL has line-by-line correspondence with input). For correlation, set the product `handle` to a deterministic value derived from the style_id (e.g., `handle: "jesta-STYLE-001"`). Alternatively, use Shopify's `ProductSetIdentifiers.id` for updates where the Shopify GID is already known from ProductBinding. Retry failed lines in next batch. |
| App crashes mid-bootstrap | SyncJob status remains `PROCESSING`; on restart, check for in-flight bulk operations via `currentBulkOperation` query and resume |

### Acceptance Criteria

- [ ] Bootstrap A creates ProductBinding rows for every product/variant in SHOPIFY_PRODUCT_SNAPSHOT
- [ ] Bootstrap B matches SKUs against MERCH.BAR_CODES and creates bindings
- [ ] Unmatched products in Bootstrap B are flagged as ORPHANED and visible in admin UI
- [ ] Bulk operations use JSONL format per Shopify spec
- [ ] Progress is checkpointed per batch; interrupted bootstrap resumes from checkpoint
- [ ] `bulk_operations/finish` webhook triggers result processing
- [ ] Polling fallback exists if webhook is not delivered within 5 minutes
- [ ] Bootstrap can be re-run safely (idempotent — updates existing bindings)

### Open Questions

1. What is the expected max catalog size per tenant? (Affects batch sizing and timeout)
2. Should bootstrap lock the tenant from incremental sync until complete?
3. How should image sync be handled during bootstrap — inline or as a follow-up job?

---

## SPEC-CATALOG-01 — Catalog Sync

### Objective

Define how products are synchronized from VisionSuite to Shopify, including product creation, updates, deletion, variant management, attribute mapping, and conflict handling.

### Scope

- Product lifecycle: create, update, delete in Shopify
- Variant mapping (VisionSuite SKU → Shopify variant)
- Attribute mapping (VisionSuite hierarchy → Shopify product type, tags, metafields)
- Image/media sync
- Change detection (payload hash comparison)
- Conflict handling when Shopify-side edits occur

### Out of Scope

- Initial bulk load (SPEC-BULK-01)
- Inventory quantities (SPEC-INVENTORY-01)
- Pricing as a separate domain (handled inline with product sync for now)

### Assumptions

- VisionSuite is source of truth for catalog data
- `productSet` is the primary mutation for all product writes
- Changes trigger via VisionSuite PL/SQL events → connector webhook/event listener
- `SHOPIFY_PRODUCT_SNAPSHOT` contains denormalized product data ready for sync
- Each product in VisionSuite maps to one product in Shopify; each SKU maps to one variant

### Architecture

#### Sync Flow (Incremental)

```
VisionSuite PL/SQL event: "PRODUCT_UPDATED for STYLE-001"
    │
    ├─ 1. Event arrives at connector (HTTP callback or notification table)
    ├─ 2. Enqueue SyncJob: type=CATALOG_SYNC, scope=product:STYLE-001
    │
    └─ (async) Catalog handler:
        ├─ 3. Read product data from SHOPIFY_PRODUCT_SNAPSHOT
        ├─ 4. Read variants from MERCH.BAR_CODES + MERCH.STYLE_COLORS
        ├─ 5. Read hierarchy mapping from SHOPIFY_HIERARCHY_MAP
        ├─ 6. Compute payload hash (SHA-256 of normalized product JSON)
        ├─ 7. Compare with ProductBinding.payload_hash
        │      ├─ Same → skip (no change)
        │      └─ Different → continue
        ├─ 8. Build productSet input:
        │      ├─ Map VisionSuite fields → Shopify fields
        │      ├─ Map hierarchy → productType (from SHOPIFY_HIERARCHY_MAP)
        │      ├─ Map attributes → options (color, size)
        │      ├─ Map variants → Shopify variants (SKU, price, barcode)
        │      ├─ Set $app metafields (jesta_style_id, business_unit_id, last_sync)
        │      └─ Include images if changed
        ├─ 9. Call productSet mutation via ShopifyClient
        ├─ 10. On success:
        │      ├─ Update ProductBinding (GIDs, payload_hash, last_synced_at)
        │      ├─ Create/update variant-level bindings
        │      ├─ Update SHOPIFY_PRODUCT_SNAPSHOT.shopify_product_id
        │      └─ Log SyncEvent (PRODUCT_SYNCED)
        └─ 11. On failure:
               ├─ Log SyncEvent with error
               ├─ Retry up to 3x (transient errors only)
               └─ After 3 failures → DLQ
```

#### Field Mapping

| VisionSuite (SHOPIFY_PRODUCT_SNAPSHOT) | Shopify (productSet input) |
|---------------------------------------|---------------------------|
| `DESCRIPTION` | `title` |
| `SHORT_DESCRIPTION` | `descriptionHtml` |
| `BRAND_NAME` | `vendor` |
| Hierarchy → `SHOPIFY_HIERARCHY_MAP.shopify_product_type` | `productType` |
| `STYLE_ID` | `$app:jesta_style_id` metafield |
| `VENDOR_STYLE_NO` | `$app:vendor_style_no` metafield |
| `DEPT_NAME / CLASS_NAME / SUB_CLASS_NAME` | `tags` (optional) |
| Color/Size from `MERCH.STYLE_COLORS` + `MERCH.SIZES` | `options` (Option1: Color, Option2: Size) |
| `MERCH.BAR_CODES.UPC_CODE` | Variant `barcode` |
| SKU from `MERCH.BAR_CODES` | Variant `sku` |
| Price from VisionSuite pricing | Variant `price` |

**OSS reference — Unopim connector:** Unopim's attribute mapping pipeline transforms PIM attributes to Shopify product fields with locale support and metafield mapping. We adapt their mapper pattern: a chain of `FieldMapper` functions, each responsible for one field group.

#### Attribute and Hierarchy Mapping

Existing `SHOPIFY_HIERARCHY_MAP` table continues to serve as the mapping source:
- `merchandise_no` → `shopify_product_type`
- AI-assisted mapping (`autoMapCategory`) suggests product types
- Manual override always takes precedence

For metafield mapping, define connector-owned metafields in `shopify.app.toml`:
```toml
[[metafields]]
namespace = "app"
key = "jesta_style_id"
type = "single_line_text_field"

[[metafields]]
namespace = "app"
key = "jesta_business_unit_id"
type = "number_integer"

[[metafields]]
namespace = "app"
key = "last_synced_at"
type = "date_time"
```

#### Image Sync

Images sync as part of the product update flow:
1. Read `IMAGE_URLS_JSON` from `SHOPIFY_PRODUCT_SNAPSHOT`
2. Compare image list with existing Shopify product media
3. For new images: `stagedUploadsCreate` → upload to S3 → `productCreateMedia`
4. For removed images: `productDeleteMedia`
5. Image sync is a sub-step of product sync, not a separate job

**Note:** Current `syncStyleImages` reads from `ATTR_MGR.CATALOG_CACHE` and `ATTR_MGR.STAGING_IMAGES` (Attribute Manager tables that CLAUDE.md says this project should not depend on). Migration plan:
1. Populate `SHOPIFY_PRODUCT_SNAPSHOT.IMAGE_URLS_JSON` from VisionSuite's image source during the product snapshot refresh
2. Refactor `syncStyleImages` to read from `SHOPIFY_PRODUCT_SNAPSHOT.IMAGE_URLS_JSON` instead of CATALOG_CACHE
3. For BLOB image data: add a new `TENANT_IMAGES` table in the per-tenant schema, or use VisionSuite's native image URLs directly with staged uploads (preferred — avoids storing BLOBs in the connector schema)

#### Conflict Handling

Since VisionSuite is SSOT, Shopify-side edits are overwritten on next sync. However:
1. `products/update` webhook fires when merchant edits in Shopify admin
2. Catalog handler checks if the change came from our app (via `$app:last_synced_at` metafield timestamp)
3. If change is external: log a `CONFLICT_DETECTED` SyncEvent with diff summary
4. On next VisionSuite-triggered sync: overwrite with VisionSuite data (SSOT wins)
5. Future enhancement: surface conflicts in admin UI and let merchant choose

#### Deletion

When a product is unpublished in VisionSuite:
1. PL/SQL event: `PRODUCT_DELETED for STYLE-001`
2. Catalog handler calls `productDelete` mutation
3. Update ProductBinding: `sync_status = 'DELETED'`
4. Retain binding row for audit (purged per retention policy)

### Reconciliation

Nightly reconciliation job (separate from incremental sync):
1. Query all ProductBindings with `sync_status = 'SYNCED'`
2. For each: compare `payload_hash` with current VisionSuite data
3. Queue sync for any that have drifted
4. Check for orphaned Shopify products (no matching VisionSuite style)
5. Log reconciliation summary in SyncEvent

### Acceptance Criteria

- [ ] `productSet` mutation used for all product creates and updates
- [ ] Payload hash prevents unnecessary Shopify API calls when nothing changed
- [ ] ProductBinding created/updated for every synced product and variant
- [ ] `$app` metafields set on every synced product
- [ ] Attribute mapping pipeline transforms VisionSuite fields to Shopify fields
- [ ] Image sync uses staged uploads (not direct URL references)
- [ ] Conflict detection logs external Shopify edits
- [ ] Nightly reconciliation catches drift
- [ ] Deletion unpublishes product and updates binding status

### Open Questions

1. Should conflict detection block the next VisionSuite sync or just log?
2. How should collection membership be managed — via tags or explicit collection mutations?
3. Should price sync be a separate spec or stay bundled with catalog?

---

## SPEC-INVENTORY-01 — Inventory Sync

### Objective

Define how inventory quantities are synchronized from VisionSuite to Shopify, including location mapping, change detection, quantity semantics, and reconciliation.

### Scope

- VisionSuite → Shopify inventory push
- Location mapping (1:1 warehouse-to-location)
- Change detection (timestamp-based, from Frappe pattern)
- Quantity rounding and business rules
- Reconciliation
- Rate-limited write queue

### Out of Scope

- Product sync (SPEC-CATALOG-01)
- Shopify → VisionSuite inventory sync (not in v1 — VisionSuite is SSOT)

### Assumptions

- VisionSuite is the source of truth for inventory
- Changes arrive via PL/SQL events (inventory adjustments trigger an event)
- Shopify `inventorySetOnHandQuantities` mutation sets absolute quantities (not deltas)
- Inventory is synced per variant-location pair
- Only mapped locations participate in sync (unmapped locations are ignored)

### Architecture

#### Sync Flow

**OSS reference — Frappe ecommerce_integrations:** ERPNext's inventory sync uses timestamp comparison (`Bin.modified` vs `EcommerceItem.inventory_synced_on`) to detect changes, processes in batches of 50, commits after each item for progress durability, and generates a CSV-like success summary. We adopt all four patterns.

```
VisionSuite PL/SQL event: "INVENTORY_CHANGED for SKU-001 at WAREHOUSE-A"
    │
    ├─ 1. Event arrives → enqueue SyncJob: type=INVENTORY_SYNC
    │
    └─ (async) Inventory handler:
        ├─ 2. Resolve ProductBinding for this SKU
        ├─ 3. Resolve LocationMapping for this warehouse
        │      └─ No mapping? → skip, log warning
        ├─ 4. Read current VisionSuite quantity from VSTORE.SKUINVENTORY
        ├─ 5. Read InventoryBinding.last_pushed_qty
        │      ├─ Same → skip (no change)
        │      └─ Different → continue
        ├─ 6. Call inventorySetOnHandQuantities:
        │      { inventoryItemId, locationId, quantity }
        ├─ 7. On success:
        │      ├─ Update InventoryBinding (last_pushed_qty, last_pushed_at)
        │      ├─ Update ProductBinding.inventory_synced_on
        │      └─ Log SyncEvent (INVENTORY_PUSHED)
        └─ 8. On failure:
               ├─ Retry up to 3x
               ├─ On permanent failure: log error, continue to next item
               └─ Per-item commit ensures one failure doesn't block others
```

#### Batch Processing

For scheduled full inventory sync (not event-driven):
1. Query all ProductBindings where `inventory_synced_on < VSTORE.SKUINVENTORY.modified` (timestamp comparison)
2. Process in batches of 50
3. For each item in batch:
   - Read VisionSuite qty
   - Compare with last_pushed_qty
   - If different: push to Shopify
   - Commit after each item (Frappe pattern)
4. Generate summary: `{ total: 500, success: 495, not_found: 3, failed: 2, success_rate: "99%" }`

#### Location Mapping Rules

**OSS reference — Frappe ecommerce_integrations:** ERPNext documents strict 1:1 warehouse-to-location mapping. Unmapped locations are excluded from sync. We adopt this directly.

- Each VisionSuite warehouse maps to exactly one Shopify location (1:1)
- One location can be marked as `is_default` — used as fallback for unmapped warehouses
- If a warehouse has no mapping and no default exists: skip, log warning
- Location mapping is configured in admin UI during setup
- Changes to mapping trigger a full inventory reconciliation for affected locations

#### Quantity Semantics

- VisionSuite quantities are integers (whole units)
- Shopify `inventorySetOnHandQuantities` expects integers
- Negative quantities: if VisionSuite reports negative (oversold), push 0 to Shopify and log an OVERSOLD alert in `SHOPIFY_INVENTORY_ALERTS`
- Quantity name: Default to `"available"` in `inventorySetOnHandQuantities`. Note: the mutation name says "OnHand" but the `quantities.name` field determines which quantity is set. `"available"` = what customers can purchase; `"on_hand"` = total physical stock (includes committed/reserved). For most merchants, `"available"` is correct. If a merchant uses Shopify's inventory tracking with reserved quantities, this should be configurable per tenant via `JestaTenantConnection.config_json`.

#### Reconciliation

Scheduled reconciliation (configurable frequency, default: nightly):
1. For each active LocationMapping:
   a. Read all VisionSuite quantities for mapped products at this warehouse
   b. Query Shopify inventory levels for the corresponding location (via bulk query if > 100 items)
   c. Compare VisionSuite qty vs Shopify qty
   d. Queue correction for any discrepancies > threshold (default: 0, i.e., any difference)
2. Log reconciliation results as SyncEvent
3. Surface drift metrics in admin dashboard

### Failure Modes

| Failure | Impact | Mitigation |
|---------|--------|------------|
| Shopify API throttled during batch | Remaining items delayed | Rate limiter pre-flight pauses; resume after bucket restores |
| VisionSuite qty unavailable | Cannot determine current state | Skip item, retry on next batch |
| Location deleted in Shopify | Inventory push fails (NOT_FOUND) | Deactivate LocationMapping, alert admin |
| Variant deleted in Shopify | Inventory push fails | Mark ProductBinding as ORPHANED, log |

### Acceptance Criteria

- [ ] Inventory push uses `inventorySetOnHandQuantities` with absolute values
- [ ] Only mapped locations participate in sync
- [ ] Change detection uses timestamp comparison (not full scan)
- [ ] Per-item commit: one failure does not block the batch
- [ ] Negative quantities clamped to 0 with OVERSOLD alert
- [ ] Reconciliation detects and corrects drift
- [ ] Batch summary logged with success/failure counts

### Open Questions

1. Should inventory sync respect a minimum interval between pushes per variant? (Rate protection)
2. What is the expected inventory change volume per tenant per hour?
3. Should reconciliation auto-correct or just report drift?

---

## SPEC-ORDER-01 — Order Ingestion

### Objective

Define how Shopify orders are imported into VisionSuite, including order normalization, tax/shipping mapping, idempotency, and error handling.

### Scope

- Webhook-driven order import (orders/create, orders/updated, orders/cancelled)
- Order normalization to VisionSuite contract
- Tax and shipping mapping
- Idempotent import (no duplicates)
- Error handling and retry
- Order status sync

### Out of Scope

- Fulfillment (SPEC-FULFILLMENT-01)
- Order analytics (existing, unchanged)
- Abandoned carts (requires separate webhook topic and UX design)

### Assumptions

- Shopify originates orders; VisionSuite is the import target
- Each Shopify order maps to one VisionSuite sales order
- The existing `OMNI.STG_ORDERS` / `OMNI.STG_ORDER_DETAILS` staging tables receive imported orders
- PL/SQL procedures in VisionSuite process staged orders into final tables
- Tax calculation is Shopify-authoritative (tax amounts come from Shopify, not recalculated)

### Architecture

#### Import Flow

**OSS reference — Frappe ecommerce_integrations:** ERPNext's order sync is idempotent (checks for existing Sales Order by Shopify order ID before creating), syncs missing products via `create_items_if_not_exist()`, and conditionally creates Invoice/Delivery Note based on `financial_status` and fulfillment state. We adopt: idempotency guard at top, product sync on demand, and conditional downstream doc creation.

```
Shopify webhook: orders/create
    │
    ├─ 1. Webhook receiver validates, enqueues to 'orders' queue
    │
    └─ (async) Order handler:
        ├─ 2. Idempotency check: does OrderBinding exist for this order?
        │      ├─ Yes + IMPORTED → skip (acknowledge duplicate)
        │      ├─ Yes + FAILED → retry (update existing binding)
        │      └─ No → create OrderBinding (status: PENDING)
        ├─ 3. Fetch full order from Shopify if webhook payload is insufficient:
        │      query order($id: ID!) { ... lineItems ... shippingAddress ... transactions }
        ├─ 4. For each line item:
        │      ├─ Resolve ProductBinding by Shopify variant GID
        │      ├─ If no binding: attempt SKU match via $app:jesta_style_id metafield
        │      ├─ If still no match: flag as unmapped, continue (partial import)
        │      └─ Map to VisionSuite item: style_id, sku, color, size, qty, price
        ├─ 5. Normalize order:
        │      ├─ Map Shopify shipping → VisionSuite shipping method
        │      ├─ Map Shopify tax lines → VisionSuite tax fields
        │      ├─ Map customer → VisionSuite customer (minimal PII)
        │      └─ Generate VisionSuite order number
        ├─ 6. Write to staging:
        │      ├─ INSERT INTO OMNI.STG_ORDERS
        │      └─ INSERT INTO OMNI.STG_ORDER_DETAILS (per line item)
        ├─ 7. Trigger PL/SQL processing:
        │      CALL OMNI.PROCESS_STAGED_ORDERS()
        ├─ 8. On success:
        │      ├─ Update OrderBinding (jesta_order_id, status: IMPORTED)
        │      └─ Log SyncEvent (ORDER_IMPORTED)
        └─ 9. On failure:
               ├─ Update OrderBinding (status: FAILED, error_message)
               ├─ If partial (some items mapped, some not): status: PARTIALLY_IMPORTED
               └─ Surface in admin UI for manual resolution
```

#### Order Update Handling

```
Shopify webhook: orders/updated
    ├─ Check what changed (compare with stored order data)
    ├─ If status changed to 'cancelled': trigger cancellation flow
    ├─ If shipping address changed: update in VisionSuite
    ├─ If line items changed (edited order): re-import with updated items
    └─ Log all changes in SyncEvent

Shopify webhook: orders/cancelled
    ├─ Idempotency: check OrderBinding.import_status
    ├─ If IMPORTED: call VisionSuite cancellation procedure
    ├─ Update OrderBinding (status: CANCELLED)
    └─ Log SyncEvent
```

**OSS reference — Frappe ecommerce_integrations:** ERPNext only cancels Sales Orders if no downstream documents (Invoice, Delivery Note) exist. Otherwise, it updates a status field but does not cancel. We adopt this guard: check for fulfillment bindings before allowing cancellation.

#### Tax and Shipping Mapping

| Shopify field | VisionSuite field | Mapping |
|--------------|-------------------|---------|
| `taxLines[].rate` | Tax rate | Direct (Shopify-authoritative) |
| `taxLines[].price` | Tax amount | Direct |
| `totalTaxSet.shopMoney.amount` | Total tax | Direct |
| `shippingLines[].title` | Shipping method | Map via config table |
| `shippingLines[].price` | Shipping amount | Direct |
| `totalShippingPriceSet` | Total shipping | Direct |

#### Customer Mapping

- Minimal PII stored: customer ID, email (hashed after import), shipping address
- Customer matched by email first, then by Shopify customer ID
- New customers created in VisionSuite if no match
- GDPR: customer PII redacted on `customers/redact` webhook

### Acceptance Criteria

- [ ] Idempotency: same order cannot be imported twice (OrderBinding check)
- [ ] All line items resolved to VisionSuite SKUs where possible
- [ ] Unmapped items flagged in OrderBinding for manual resolution
- [ ] Tax amounts taken from Shopify (not recalculated)
- [ ] Order written to OMNI.STG_ORDERS staging tables
- [ ] Cancellation checks for downstream fulfillments before proceeding
- [ ] OrderBinding tracks full lifecycle (PENDING → IMPORTED → CANCELLED)

### Open Questions

1. Should partially-imported orders (some items unmapped) block or continue?
2. What VisionSuite PL/SQL procedure processes staged orders?
3. Should refund webhooks be handled in v1 or deferred?

---

## SPEC-FULFILLMENT-01 — Fulfillment Sync

### Objective

Define how fulfillment and tracking information flows from VisionSuite to Shopify.

### Scope

- Shipment creation in Shopify from VisionSuite events
- Tracking number and URL updates
- Partial fulfillment support
- Cancellation/hold handling

### Out of Scope

- Shopify-originated fulfillments (not in v1 — VisionSuite manages warehouse ops)
- Returns/refunds (deferred)

### Assumptions

- VisionSuite originates fulfillments (warehouse management system)
- Fulfillment events arrive via PL/SQL triggers
- Shopify fulfillment orders API (v2) is used
- One VisionSuite shipment may cover part of an order (partial fulfillment)

### Architecture

#### Fulfillment Flow

```
VisionSuite PL/SQL event: "SHIPMENT_CREATED for ORDER-001, SHIPMENT-A"
    │
    ├─ 1. Enqueue SyncJob: type=FULFILLMENT_PUSH
    │
    └─ (async) Fulfillment handler:
        ├─ 2. Resolve OrderBinding by jesta_order_id
        │      └─ No binding? → skip (order not from Shopify)
        ├─ 3. Resolve FulfillmentBinding: check if already created
        │      ├─ Exists + FULFILLED → skip (idempotent)
        │      └─ Exists + PENDING or New → continue
        ├─ 4. Query Shopify fulfillment orders:
        │      order(id) { fulfillmentOrders(first:5) { ... lineItems } }
        ├─ 5. Map VisionSuite shipment items → Shopify fulfillment order line items
        ├─ 6. Call fulfillmentCreate:
        │      { fulfillmentOrderId, lineItemsByFulfillmentOrder, trackingInfo }
        ├─ 7. On success:
        │      ├─ Update FulfillmentBinding (shopify_fulfillment_gid, status: FULFILLED)
        │      └─ Log SyncEvent (FULFILLMENT_SENT)
        └─ 8. On failure: retry up to 3x, then DLQ
```

#### Tracking Updates

```
VisionSuite PL/SQL event: "TRACKING_UPDATED for SHIPMENT-A"
    │
    └─ (async) Tracking handler:
        ├─ 1. Resolve FulfillmentBinding
        ├─ 2. Call fulfillmentTrackingInfoUpdate:
        │      { fulfillmentId, trackingInfoInput: { number, url, company } }
        ├─ 3. Update FulfillmentBinding.tracking_*
        └─ 4. Log SyncEvent
```

#### Partial Fulfillment

- A Shopify order may have multiple fulfillment orders (one per location)
- A VisionSuite shipment may cover only some line items
- Each partial shipment creates a separate FulfillmentBinding
- Order is marked fully fulfilled only when all fulfillment orders are complete

#### Cancellation/Hold

- If VisionSuite cancels a shipment before it's pushed to Shopify: delete pending FulfillmentBinding
- If shipment is on hold: do not push to Shopify until hold is released
- If fulfillment was already created in Shopify: cannot cancel via API (Shopify limitation); log as manual action needed

### Acceptance Criteria

- [ ] Fulfillment creates Shopify fulfillment with correct line items and tracking
- [ ] Partial fulfillment supported (multiple shipments per order)
- [ ] Tracking updates propagate to Shopify
- [ ] Idempotent: same shipment cannot create duplicate fulfillments
- [ ] FulfillmentBinding tracks full lifecycle

### Open Questions

1. What PL/SQL event structure does VisionSuite use for shipment notifications?
2. Does VisionSuite support split shipments (same order, multiple warehouses)?
3. Should notify_customer be configurable per tenant?

---

## SPEC-ADMIN-01 — Embedded Admin UX

### Objective

Define the embedded admin app pages, permissions, and user flows built on Shopify's React Router template with Polaris.

### Scope

- Page map and navigation
- Per-page functionality and API calls
- App Bridge integration points
- Permission model
- Merchant onboarding wizard

### Out of Scope

- Polaris component-level design (handled during implementation)
- Storefront widget (SPEC-THEME-01)

### Assumptions

- Built on Shopify React Router app template (Remix + Polaris + App Bridge)
- All API calls go through Remix loaders/actions → Express backend
- App Bridge handles navigation, toasts, modals, resource pickers
- Merchant can access all pages after initial setup; no role-based access in v1

### Page Map

| Route | Page | Primary function | Current equivalent |
|-------|------|------------------|--------------------|
| `/` | **Overview** | Connection health, queue depth, failed jobs, last sync times, alert banners | Dashboard tab |
| `/setup` | **Setup Wizard** | Connect Jesta tenant, configure credentials, choose bootstrap direction | (new) |
| `/stores` | **Store Management** | Add/remove stores, test connections, view health | Stores tab |
| `/locations` | **Location Mapping** | Shopify location ↔ Jesta warehouse mapping, default fallback | (new) |
| `/catalog` | **Catalog Settings** | Sync direction, field mappings, publish filters, hierarchy mapping | Products tab + Mapping tab merged |
| `/inventory` | **Inventory Settings** | Enabled locations, sync cadence, thresholds, reconciliation schedule | Inventory tab |
| `/orders` | **Order Settings** | Import config, tax/shipping mapping, cancellation behavior | Orders tab (config part) |
| `/orders/list` | **Order Browser** | Order list, detail drawer, origin filter, export | Orders tab (data part) |
| `/analytics` | **Analytics** | Revenue, fulfillment, returns analytics | Analytics tab |
| `/jobs` | **Sync Jobs** | Active/completed/failed jobs, run/retry controls | Jobs tab + Logs tab merged |
| `/logs` | **Audit Logs** | Object-level sync events, error details, replay controls | Logs tab |
| `/discounts` | **Discounts** | Create/manage discount codes and automatic discounts | Discounts tab |
| `/settings` | **App Settings** | App configuration, demo mode toggle, API version | Config tab |

#### Onboarding Wizard (`/setup`)

First-run experience after OAuth install:

```
Step 1: Welcome
  "Connect your VisionSuite tenant to start syncing"

Step 2: Connect VisionSuite
  - Tenant ID input
  - Verify connection (test Oracle connectivity)

Step 3: Location Mapping
  - Show Shopify locations (from API)
  - Show VisionSuite warehouses (from Oracle)
  - Drag-and-drop or dropdown mapping

Step 4: Choose Bootstrap Direction
  - "VisionSuite → Shopify" (publish VisionSuite catalog)
  - "Map existing Shopify products" (build bindings from existing catalog)

Step 5: Start Bootstrap
  - Show progress bar
  - "This may take a few minutes for large catalogs"

Step 6: Done
  - Redirect to Overview dashboard
```

**Wizard error handling:**

| Step | Failure | UX |
|------|---------|-----|
| Step 2: Connect VisionSuite | Oracle connectivity check fails | Show error banner: "Could not reach VisionSuite. Check credentials and VPN." Retry button. Do not advance. |
| Step 3: Location Mapping | Shopify locations API fails | Show error banner: "Could not load Shopify locations." Retry button. Allow skip (can map later in `/locations`). |
| Step 4: Choose Bootstrap | N/A (no external calls) | N/A |
| Step 5: Start Bootstrap | Bootstrap fails partway | Show progress with error count. "3 of 500 products failed." Allow "Continue" (skip failures) or "Retry Failed". Failed items visible in `/logs`. |
| Any step | Session token expires | App Bridge re-authenticates transparently. Wizard state preserved in URL params. |

### Acceptance Criteria

- [ ] All pages render inside Shopify admin iframe via App Bridge
- [ ] Navigation uses App Bridge (not raw HTML links)
- [ ] Setup wizard completes tenant connection and bootstrap
- [ ] Overview shows real-time health metrics
- [ ] Failed jobs visible with retry controls
- [ ] All Polaris components used for consistent Shopify admin look

### Open Questions

1. Should analytics pages be in v1 or deferred?
2. Should the setup wizard be skippable for re-installs?
3. Do we need merchant-facing documentation/help pages within the app?

---

## SPEC-THEME-01 — Storefront Widget

### Objective

Define an optional storefront-facing theme app extension for displaying VisionSuite-sourced data on the Shopify storefront.

### Scope

- Theme app extension type and configuration
- Widget types (availability, delivery promise, store lookup)
- Data source and caching model
- Performance requirements

### Out of Scope

- Full storefront rebuild
- Custom checkout UI
- POS integration

### Assumptions

- Optional feature — not required for v1 launch
- Uses Shopify theme app extensions (mandatory for public apps; no manual liquid injection)
- Widget reads from published metafields or a lightweight API
- Must not degrade Lighthouse scores by more than 10 points (Shopify requirement)

### Widget Types

| Widget | Purpose | Data source |
|--------|---------|-------------|
| **Availability Badge** | "In Stock at 3 locations" | `$app` metafield (precomputed) |
| **Delivery Promise** | "Ships within 2 business days" | `$app` metafield + location mapping |
| **Store Pickup** | "Available for pickup at Store X" | `$app` metafield per location |
| **Order Tracking** | "Your order is shipped — Track" | Customer-facing API endpoint |

### Architecture

- **App embed block**: Renders in theme via Shopify's app embed mechanism
- **Configuration**: Merchant enables/disables widgets in theme editor
- **Data**: Pre-computed and stored in `$app` metafields during catalog/inventory sync. Widget reads metafields at render time (no runtime API calls).
- **Caching**: Shopify CDN caches metafield values. Updates propagate on next sync.

### Acceptance Criteria

- [ ] Theme app extension defined in `extensions/theme-widget/`
- [ ] Widgets configurable in Shopify theme editor
- [ ] No runtime API calls from storefront (metafield-only reads)
- [ ] Lighthouse impact < 10 points

### Open Questions

1. Which widgets are needed for v1 vs future phases?
2. Should order tracking be a separate app block or redirect to a dedicated page?
3. What metafield structure best supports the availability badge?

---

## SPEC-JOBS-01 — Jobs, Queues, and Scheduling

### Objective

Define the queue topology, job types, concurrency controls, retry policies, and dead-letter handling for all async work in the connector.

### Scope

- BullMQ queue architecture
- Job types and their queue assignments
- Concurrency limits per queue
- Retry policies
- Dead-letter queue (DLQ) and replay
- Scheduled jobs (reconciliation, cleanup)

### Out of Scope

- Job-specific business logic (covered in domain specs)
- Redis deployment/operations

### Assumptions

- BullMQ backed by Redis (single instance, not cluster, for v1)
- Each job type has its own queue for independent concurrency control
- Jobs are idempotent (safe to replay)
- Admin UI provides visibility into all queues

### Architecture

#### Queue Topology

| Queue name | Job types | Concurrency | Retry policy | Notes |
|------------|-----------|-------------|--------------|-------|
| `webhook` | Shopify webhook events | 10 total | 3 retries, exponential backoff (1s, 4s, 16s) | Highest priority |
| `catalog` | Product create/update/delete | 5 total | 3 retries, 2s/8s/32s | Throttled by Shopify rate limit |
| `inventory` | Inventory push/reconciliation | 5 total | 3 retries, 1s/4s/16s | Per-item commit |
| `orders` | Order import/update/cancel | 5 total | 3 retries, 2s/8s/32s | Idempotent by OrderBinding |
| `fulfillment` | Fulfillment push/tracking | 3 total | 3 retries, 2s/8s/32s | |
| `bulk` | Bootstrap, backfill, bulk ops | 2 total | 1 retry | Long-running; exclusive per tenant |
| `lifecycle` | Install/uninstall/GDPR | 1 total | 3 retries | Tenant provisioning/teardown |
| `reconciliation` | Scheduled reconciliation | 2 total | 1 retry | Runs on cron schedule |
| `maintenance` | Log cleanup, alert purge | 1 total | No retry | Scheduled |

**Per-tenant fairness:** BullMQ OSS does not support per-group concurrency (group rate limiting is a BullMQ Pro feature). Instead, implement tenant fairness using a **custom Redis semaphore**:
- Use a Redis key per tenant per queue: `tenant:{shopDomain}:slots:{queueName}`
- A Lua acquire script atomically initializes the key to `maxConcurrent` if missing, decrements it only when the remaining slot count is `> 0`, and sets a lease TTL
- While the job is running, the worker renews the lease on a heartbeat interval (for example, every 30 seconds) so long-running jobs do not lose their slot when the original TTL expires
- On job completion or terminal failure, a Lua release script increments the counter back up to `maxConcurrent` and clears the worker's lease token
- If a worker crashes and heartbeats stop, the lease TTL eventually expires and the slot is reclaimed automatically
- If acquire fails because no slots remain, the job is delayed (re-queued with backoff)
- Default: 3 concurrent jobs per tenant per queue
- This is lightweight (one Redis key plus lease metadata per active tenant per queue) and does not require BullMQ Pro

#### Retry Policy

Follows the existing `withRetry` pattern but adapted for BullMQ:

```typescript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,  // base delay in ms
  },
}
```

After all retries exhausted: move to DLQ (BullMQ built-in `removeOnFail: false`).

#### Dead-Letter Queue

- Each queue has an associated DLQ: `{queue_name}:dlq`
- DLQ jobs retain full payload, error history, and attempt metadata
- Admin UI "Failed Jobs" page shows DLQ contents grouped by queue
- Replay: admin clicks "Retry" → job moved from DLQ back to original queue
- Bulk replay: "Retry All" for a specific queue's DLQ
- Auto-purge DLQ entries after 30 days

#### Scheduled Jobs

| Job | Schedule | Queue | Description |
|-----|----------|-------|-------------|
| Catalog reconciliation | Nightly (02:00) | `reconciliation` | Compare ProductBinding hashes with VisionSuite |
| Inventory reconciliation | Configurable (default: nightly) | `reconciliation` | Compare inventory levels across all bindings |
| Log cleanup | Weekly (Sunday 03:00) | `maintenance` | Delete SyncEvents older than 1 year, completed SyncJobs older than 90 days |
| Alert purge | Daily (04:00) | `maintenance` | Resolve stale inventory alerts |
| Schema purge | Weekly | `maintenance` | Drop schemas for tenants past purge_after date |

**OSS reference — Cloudshelf connector:** Cloudshelf uses NestJS-style job orchestration with typed job definitions, queue-per-domain separation, and OpenTelemetry spans per job. We adapt their pattern: each domain module registers its job types with the queue system, and the queue infrastructure handles scheduling, retry, and observability.

### Acceptance Criteria

- [ ] All async work goes through BullMQ queues (no fire-and-forget promises)
- [ ] Per-tenant concurrency limits prevent one tenant from starving others
- [ ] Failed jobs land in DLQ with full context
- [ ] Admin UI shows queue depths, active jobs, DLQ contents
- [ ] Scheduled jobs run on cron and log results
- [ ] Replay from DLQ works for all job types

### Open Questions

1. Should Redis be shared with other applications or dedicated to this connector?
2. What is the expected total job throughput across all tenants? (Affects Redis sizing)
3. Should concurrency limits be configurable per tenant?

---

## SPEC-OBS-01 — Observability and Audit

### Objective

Define the logging, tracing, metrics, and alerting infrastructure for the connector.

### Scope

- Structured logging standards
- Distributed tracing (OpenTelemetry)
- Key metrics and dashboards
- Alert rules
- Audit schema

### Out of Scope

- Monitoring infrastructure deployment (Grafana, Prometheus, etc.)
- Log aggregation platform choice

### Assumptions

- OpenTelemetry SDK for Node.js is the instrumentation standard
- Existing structured logger (`backend/src/utils/logger.ts`) is extended, not replaced
- Traces, metrics, and logs export to configurable backends via OTLP

### Architecture

**OSS reference — Cloudshelf connector:** Cloudshelf integrates OpenTelemetry throughout their NestJS modules, creating spans for each Shopify API call, database query, and job execution. We adapt their instrumentation approach to our Express + BullMQ stack.

#### Structured Logging

Extend the existing logger with mandatory fields:

```json
{
  "timestamp": "2026-03-17T10:00:00.000Z",
  "level": "info",
  "message": "Product synced to Shopify",
  "correlation_id": "abc-123",
  "shop_domain": "acme.myshopify.com",
  "job_id": "job-456",
  "domain": "catalog",
  "object_type": "product",
  "object_id": "gid://shopify/Product/789",
  "duration_ms": 234,
  "shopify_api_cost": 42,
  "trace_id": "0af7651916cd43dd8448eb211c80319c"
}
```

**Rules:**
- No secrets in logs (tokens, passwords, PII)
- Payload diffs summarized, not full payloads (except in debug mode)
- Retryability flag on error logs (`"retryable": true`)
- All Shopify API calls log: method, cost, throttle status, response time

#### Error Taxonomy

Extend the existing `ErrorCode` enum:

| Category | Error codes | Retryable? |
|----------|------------|------------|
| Auth | `AUTH_TOKEN_EXPIRED`, `AUTH_SCOPE_INSUFFICIENT`, `AUTH_HMAC_INVALID` | No |
| Config | `CONFIG_MISSING_MAPPING`, `CONFIG_INVALID_LOCATION` | No |
| Validation | `VALIDATION_MISSING_FIELD`, `VALIDATION_INVALID_SKU` | No |
| Mapping | `MAPPING_NOT_FOUND`, `MAPPING_AMBIGUOUS` | No |
| Rate limit | `SHOPIFY_THROTTLED` | Yes (backoff) |
| Dependency | `ORACLE_UNAVAILABLE`, `REDIS_UNAVAILABLE`, `SHOPIFY_5XX` | Yes |
| Conflict | `CONFLICT_SHOPIFY_EDITED`, `CONFLICT_DUPLICATE_BINDING` | No |
| Partial | `PARTIAL_SYNC_SOME_ITEMS_FAILED` | Partial |

#### Tracing

OpenTelemetry spans for:
- Each HTTP request (root span)
- Each Shopify GraphQL call (child span with `shopify.api.cost`, `shopify.api.throttled`)
- Each Oracle query (child span with `db.statement` — sanitized)
- Each BullMQ job (root span with `job.type`, `job.shop_domain`)
- Each webhook received (root span with `webhook.topic`, `webhook.shop_domain`)

#### Metrics

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `sync_jobs_total` | Counter | `type`, `status`, `shop_domain` | Job throughput |
| `sync_job_duration_seconds` | Histogram | `type`, `shop_domain` | Job performance |
| `shopify_api_requests_total` | Counter | `operation`, `status`, `shop_domain` | API usage |
| `shopify_api_cost_total` | Counter | `shop_domain` | Rate limit budget consumption |
| `shopify_api_throttled_total` | Counter | `shop_domain` | Throttle frequency |
| `webhook_received_total` | Counter | `topic`, `shop_domain` | Webhook volume |
| `webhook_lag_seconds` | Histogram | `topic` | Time from Shopify event to processing |
| `queue_depth` | Gauge | `queue_name` | Current queue size |
| `dlq_depth` | Gauge | `queue_name` | Failed jobs pending |
| `reconciliation_drift_items` | Gauge | `domain`, `shop_domain` | Items out of sync |
| `active_tenants` | Gauge | — | Connected merchants |

#### Alert Rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| DLQ depth > 100 | `dlq_depth > 100` for 5 min | Critical |
| Webhook lag > 5 min | `webhook_lag_seconds p95 > 300` | Warning |
| Shopify throttle rate > 10% | `throttled / total > 0.1` for 15 min | Warning |
| Oracle connection pool exhausted | `pool_available == 0` for 1 min | Critical |
| Tenant auth failure | `AUTH_TOKEN_EXPIRED` event | Critical (per tenant) |
| Reconciliation drift > 5% | `drift_items / total_items > 0.05` | Warning |

### Acceptance Criteria

- [ ] All log entries include `correlation_id`, `shop_domain`, `domain`
- [ ] No secrets in logs
- [ ] OpenTelemetry spans created for API calls, DB queries, and jobs
- [ ] Metrics exportable via OTLP
- [ ] Alert rules documented and configurable
- [ ] SyncEvent table serves as queryable audit trail

### Open Questions

1. What monitoring platform will be used? (Affects export format)
2. Should per-shop dashboards be available to merchants in the admin UI?
3. What is the log retention policy for the aggregation platform?

---

## SPEC-TEST-01 — Test Strategy

### Objective

Define the testing approach at every level: unit, integration, contract, Shopify sandbox, and failure injection.

### Scope

- Test types and their purposes
- Coverage targets per module
- Mocking strategy for Shopify API
- Test data management
- CI/CD integration

### Out of Scope

- Specific test case lists (generated during implementation)
- Performance/load testing (deferred)

### Assumptions

- Vitest remains the test runner (already configured)
- Shopify provides dev stores for sandbox testing
- Oracle test schemas can be provisioned for integration tests
- Current coverage: ~30% (3 test files, 17 tests) — must improve significantly

### Test Pyramid

| Level | What | Target coverage | Tooling |
|-------|------|----------------|---------|
| **Unit** | Service methods, mappers, validators, utility functions | 80% of connector-core | Vitest, mocked dependencies |
| **Integration** | Oracle queries, BullMQ job processing, full request→response | 60% of routes | Vitest, test Oracle schema, test Redis |
| **Contract** | Shopify GraphQL request/response shapes | All mutations and queries | Vitest, recorded fixtures |
| **Sandbox** | End-to-end against Shopify dev store | Core flows (bootstrap, sync, webhook) | Vitest + real API, dev store |
| **Failure injection** | Error handling, retry, DLQ | All error paths | Vitest, fault injection helpers |

#### Unit Tests

- **Mock strategy**: Mock Oracle connections (return test data), mock Shopify client (return fixture responses), mock BullMQ (capture enqueued jobs)
- **Focus**: Business logic in domain modules — field mapping, change detection, idempotency guards, conflict detection
- **Example**: `catalog.service.test.ts` — given a product snapshot, verify the `productSet` input is correctly built

#### Contract Tests

**OSS reference — Frappe ecommerce_integrations test approach:** Frappe uses `pyactiveresource.testing` to intercept Shopify API calls at the HTTP level with fixture JSON files from a `data/` directory. We adapt this pattern to TypeScript: record real Shopify API responses as JSON fixtures, replay them in tests via a mock HTTP layer.

- Record real Shopify GraphQL responses as fixtures in `tests/fixtures/shopify/`
- Tests verify our code handles the actual response shape correctly
- Updated when API version changes (quarterly)
- Example: `fixtures/shopify/productSet-response.json`, `fixtures/shopify/bulk-operation-result.jsonl`

#### Integration Tests

- Require a test Oracle schema (provisioned in CI or local Docker)
- Test full Oracle queries against real schema with seed data
- Test BullMQ job lifecycle against real Redis
- Test webhook HMAC validation with real crypto

#### Sandbox Tests

- Run against a Shopify dev store (configured via env vars)
- Test: OAuth install flow, product sync, inventory push, webhook delivery
- Slow (real network calls) — run in CI nightly, not on every PR
- Dev store reset between test runs

#### Failure Injection

- Test Shopify API returning `THROTTLED` → verify backoff and retry
- Test Oracle connection timeout → verify `withOracleRetry` kicks in
- Test Redis down → verify webhook handler degrades gracefully
- Test malformed webhook payload → verify 400 response
- Test expired OAuth token → verify tenant suspension flow

### CI/CD Integration

```yaml
# Updated CI pipeline
jobs:
  typecheck:
    - tsc --noEmit (backend + frontend)

  unit-tests:
    - vitest run (connector-core unit tests)
    - Coverage threshold: 70% (current), target 80%

  integration-tests:
    - Requires: Oracle test schema, Redis
    - vitest run --config vitest.integration.config.ts

  contract-tests:
    - vitest run --config vitest.contract.config.ts
    - Uses fixture files, no external deps

  build:
    - npm run build

  sandbox-tests: (nightly only)
    - Requires: Shopify dev store credentials
    - vitest run --config vitest.sandbox.config.ts
```

### Acceptance Criteria

- [ ] Unit test coverage ≥ 70% for connector-core modules
- [ ] Contract tests exist for every Shopify GraphQL operation
- [ ] Integration tests run in CI with test Oracle schema
- [ ] Failure injection tests cover all retry/DLQ paths
- [ ] Sandbox tests run nightly against dev store
- [ ] CI pipeline fails on coverage regression

### Open Questions

1. Can we provision a test Oracle schema in CI (Docker Oracle XE)?
2. How many Shopify dev stores do we need for parallel CI runs?
3. Should we use Shopify's mock API for unit tests or record/replay real responses?

---

## SPEC-OSS-01 — Open Source Provenance

### Objective

Track all borrowed code and patterns, maintain license compliance, and establish review controls.

### Scope

- Donor matrix (what was taken from where)
- License compliance rules
- `THIRD_PARTY_NOTICES.md` structure
- PR review checklist for borrowed code

### Donor Matrix

| Donor repo | License | What we take | Files affected |
|------------|---------|-------------|----------------|
| shopify-app-template-react-router | MIT | Auth flow, session management hooks, App Bridge wiring, TOML config, webhook route structure | `apps/admin-app/app/shopify.server.ts`, `apps/admin-app/app/routes/auth.$.tsx`, `apps/admin-app/app/routes/webhooks.tsx`, `shopify.app.toml` |
| Cloudshelf/Shopify_CSConnector | MIT | Module boundary pattern, service/repository layering, OpenTelemetry setup, queue job orchestration | `packages/connector-core/src/modules/` structure, `packages/connector-core/src/infrastructure/telemetry/` |
| unopim/shopify-connector | MIT | Attribute mapping pipeline, locale mapping, metafield mapping patterns, multi-store export batching | `packages/connector-core/src/modules/catalog/mappers/`, `packages/connector-core/src/modules/mappings/` |
| frappe/ecommerce_integrations | GPL-3.0 | **Patterns only, no code**: log-then-enqueue, EVENT_MAPPER dispatch table, EcommerceItem linking table concept, timestamp-based inventory change detection, SKU matching, per-item commit, `temp_shopify_session` wrapper concept, idempotency guards, 1:1 warehouse-to-location mapping | Patterns adapted throughout; no file-level derivation |

### License Compliance Rules

1. **MIT donors**: Code may be copied and adapted. Preserve original copyright notice in copied files. Add entry to `THIRD_PARTY_NOTICES.md`.
2. **GPL-3.0 donors (Frappe)**: **No code copying.** Study for patterns, test case ideas, and workflow design only. No line-by-line translations. When implementing a pattern inspired by Frappe, document it as "pattern inspired by ERPNext" in the code comment, not as borrowed code.
3. All new files that contain adapted code from a donor must include a header comment: `// Adapted from {repo} ({license}) — {what was adapted}`
4. `THIRD_PARTY_NOTICES.md` updated on every PR that introduces donor code.

### PR Review Checklist

For any PR that introduces code from a donor repo:

- [ ] Donor repo identified in PR description
- [ ] License verified as compatible (MIT for copy; GPL for reference only)
- [ ] Header comment added to affected files
- [ ] `THIRD_PARTY_NOTICES.md` updated
- [ ] No GPL-derived code copied or line-by-line translated
- [ ] No proprietary code from other projects included

### Acceptance Criteria

- [ ] `THIRD_PARTY_NOTICES.md` exists at repo root with all donor attributions
- [ ] Every adapted file has a header comment citing the source
- [ ] No GPL code copied into the codebase
- [ ] PR template includes donor code checklist

### Open Questions

1. Should we maintain a separate `LICENSES/` directory with full license texts?
2. Do we need legal review before the first Shopify App Store submission?

---

## Cross-Cutting Concerns

### Security Rules (All Specs)

- Offline tokens for long-running bulk jobs (online tokens expire in 24h)
- Access tokens encrypted at rest (AES-256, key from env var / secret manager)
- Scoped tokens only — request minimum necessary scopes
- Per-shop tenant isolation via schema-per-tenant
- PII minimized: hash customer emails after import, redact on GDPR webhook
- HMAC-SHA256 verification on all inbound webhooks
- Audit trail for all config changes (SyncEvent with `CONFIG_CHANGED`)
- No secrets in logs, metrics, or error messages

### Idempotency Rules (All Specs)

Every write operation must be idempotent:

| Operation | Idempotency mechanism |
|-----------|----------------------|
| Product sync | `ProductBinding` existence check + `payload_hash` comparison |
| Inventory push | `InventoryBinding.last_pushed_qty` comparison |
| Order import | `OrderBinding` existence check by `shopify_order_gid` |
| Fulfillment push | `FulfillmentBinding` existence check by `jesta_shipment_id` |
| Webhook processing | `X-Shopify-Webhook-Id` dedup in Redis + `SyncJob.idempotency_key` |
| Bulk operations | Checkpoint in `SyncJob.payload_json` |

### Non-Negotiable Acceptance Criteria (All Specs)

Every spec implementation must include:
- [ ] Exact scope documented
- [ ] Assumptions listed
- [ ] Inputs/outputs defined
- [ ] Sequence diagrams for complex flows
- [ ] Data contracts (TypeScript interfaces)
- [ ] Failure modes and mitigations
- [ ] Idempotency mechanism
- [ ] Observability hooks (logs, traces, metrics)
- [ ] Migration/rollback notes
- [ ] Acceptance tests written before or alongside implementation

---

## Appendix: Existing Codebase Migration Map

### Backend Services → Domain Modules

| Current file | LOC | Target module | Notes |
|-------------|-----|---------------|-------|
| `shopify.service.ts` | 3,270 | Split into: `catalog/`, `inventory/`, `orders/`, `analytics/`, `mappings/`, `shops/`, `jobs/` | 3K LOC monolith → ~500 LOC per module |
| `shopify-actions.service.ts` | 1,552 | Split into: `catalog/shopify-catalog.client.ts`, `inventory/shopify-inventory.client.ts`, `orders/shopify-orders.client.ts`, `fulfillment/shopify-fulfillment.client.ts` | Shopify API calls grouped by domain |
| `shopify-discounts.service.ts` | 568 | `discounts/` module | Minimal changes |
| `shopify-media.service.ts` | 337 | `catalog/media.service.ts` | Remove CATALOG_CACHE/STAGING_IMAGES dependencies |
| `shopify-live-test.service.ts` | 669 | `testing/` module | Used for dev/QA only |
| `tenant-context.service.ts` | 111 | `shops/tenant.service.ts` | Major rewrite for OAuth + schema-per-tenant |
| `oracle-pool.ts` | 214 | `infrastructure/oracle/pool.ts` | Add `withTenantConnection` schema switching |

### Frontend Pages → Remix Routes

| Current tab | Target route | Polaris components |
|------------|-------------|-------------------|
| Dashboard | `/` | `Page`, `Layout`, `Card`, `DataTable`, `Badge` |
| Stores | `/stores` | `Page`, `ResourceList`, `Card`, `Modal`, `Form` |
| Products | `/catalog` | `Page`, `IndexTable`, `Filters`, `Tabs`, `Modal` |
| Orders | `/orders/list` | `Page`, `IndexTable`, `Filters`, `Badge`, `Modal` |
| Inventory | `/inventory` | `Page`, `DataTable`, `Banner`, `ProgressBar` |
| Mapping | `/catalog` (sub-tab) | `Page`, `DataTable`, `Select`, `Badge` |
| Jobs | `/jobs` | `Page`, `ResourceList`, `Badge`, `Button` |
| Logs | `/logs` | `Page`, `IndexTable`, `Modal`, `Code` |
| Config | `/settings` | `Page`, `SettingToggle`, `TextField`, `FormLayout` |
| Analytics | `/analytics` | `Page`, `Card`, `DataTable` |
| Discounts | `/discounts` | `Page`, `IndexTable`, `Modal`, `Form` |
| Abandoned | Deferred | — |

### Database: DDL Script Strategy

**Shared schema (`SHOPIFY_MASTER`) — run once during platform setup:**
- V067-V070 are **not** run per tenant. They define the original shared tables.
- New shared DDL: `SHOPIFY_MASTER.TENANT_REGISTRY` (shop domain → schema mapping)

**Per-tenant schema — V071+ DDL run by `SHOPIFY_PROVISION_PKG` on each install:**

| Table | Purpose | Spec |
|-------|---------|------|
| `SHOP_INSTALLATION` | OAuth tokens, status, API version | SPEC-DOMAIN-01 |
| `JESTA_TENANT_CONNECTION` | VisionSuite connection config | SPEC-DOMAIN-01 |
| `LOCATION_MAPPING` | Shopify location ↔ Jesta warehouse | SPEC-DOMAIN-01 |
| `PRODUCT_BINDING` | Product/variant linkage | SPEC-DOMAIN-01 |
| `INVENTORY_BINDING` | Inventory state per variant-location | SPEC-DOMAIN-01 |
| `ORDER_BINDING` | Order linkage + import status | SPEC-DOMAIN-01 |
| `FULFILLMENT_BINDING` | Fulfillment/tracking linkage | SPEC-DOMAIN-01 |
| `SYNC_JOB` | Job queue state | SPEC-DOMAIN-01 |
| `SYNC_EVENT` | Audit log | SPEC-DOMAIN-01 |
| `SHOPIFY_PRODUCT_SNAPSHOT` | Per-tenant copy (same schema as V070) | SPEC-CATALOG-01 |
| `SHOPIFY_PUBLICATION_QUEUE` | Per-tenant copy (same schema as V070) | SPEC-CATALOG-01 |
| `SHOPIFY_SYNC_LOG` | Per-tenant copy (same schema as V067) | SPEC-OBS-01 |
| `SHOPIFY_HIERARCHY_MAP` | Per-tenant copy (same schema as V067) | SPEC-CATALOG-01 |
| `SHOPIFY_CONFIG` | Per-tenant copy (same schema as V067) | SPEC-ADMIN-01 |
| `SHOPIFY_INVENTORY_ALERTS` | Per-tenant copy (same schema as V070) | SPEC-INVENTORY-01 |
| `VISIONSUITE_EVENTS` | PL/SQL event notification (if polling approach) | SPEC-WEBHOOK-01 |

**Note:** `SHOPIFY_TENANTS` (from V070) is NOT created per-tenant. Its role is replaced by the shared `SHOPIFY_MASTER.TENANT_REGISTRY` + per-tenant `SHOP_INSTALLATION`.

### Shopify API: Current → Target

| Current (2024-10) | Target (2026-01) | Change |
|--------------------|-----------------|--------|
| REST `POST /products.json` | GraphQL `productSet` mutation | Replace |
| REST `GET /orders/{id}.json` | GraphQL `order(id)` query | Replace |
| REST `GET /orders.json` | GraphQL `orders(query)` query | Replace |
| REST `GET /products/{id}.json` | GraphQL `product(id)` query | Replace |
| REST `GET /webhooks.json` | TOML declarative + `webhookSubscriptions` query | Replace |
| REST `POST /webhooks.json` | TOML declarative (`shopify app deploy`) | Replace |
| REST `DELETE /webhooks/{id}.json` | `webhookSubscriptionDelete` mutation | Replace |
| REST `GET /shop.json` | GraphQL `shop` query | Already exists as GraphQL |
| GraphQL `productUpdate` | `productSet` | Replace (declarative upsert) |
| GraphQL `productDelete` | `productDelete` | Keep |
| GraphQL `inventorySetOnHandQuantities` | Same | Keep |
| GraphQL `inventoryAdjustQuantities` | Same | Keep |
| GraphQL `fulfillmentCreate` | Same | Keep |
| GraphQL `fulfillmentTrackingInfoUpdate` | Same | Keep |
| GraphQL `stagedUploadsCreate` | Same | Keep |
| GraphQL `productCreateMedia` | Same | Keep |

---

## Appendix: Deferred Capabilities (Not in v1)

These capabilities are explicitly deferred from v1. Their absence should NOT block Shopify App Store approval unless noted.

| Capability | Webhook topics needed | Blocks App Store? | Target version |
|------------|----------------------|-------------------|----------------|
| **Refund handling** | `refunds/create` | No — refunds are optional for connector apps | v2 |
| **Returns management** | `returns/create`, `returns/update` | No | v2 |
| **Abandoned cart recovery** | N/A (checkout data via API, not webhook) | No | v2 |
| **Shopify → Jesta catalog sync** (reverse direction) | `products/create`, `products/update` (already subscribed for conflict detection) | No | v2 |
| **Shopify-owned pricing** (merchant edits prices in Shopify) | `products/update` | No | v2 |
| **POS integration** | Various POS topics | No — explicitly out of scope | TBD |
| **Multi-currency pricing** | N/A (API support exists) | No | v2 |
| **Collection management** | `collections/create`, `collections/update` | No | v1.1 |
| **Customer sync** (bidirectional) | `customers/create`, `customers/update` | No — GDPR webhooks are mandatory (included in v1) | v2 |
| **Draft orders** | `draft_orders/create`, `draft_orders/update` | No | v2 |

**App Store approval blockers (all included in v1):**
- OAuth 2.0 install/uninstall flow ✅ SPEC-ARCH-01
- GDPR mandatory webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) ✅ SPEC-WEBHOOK-01
- App Bridge + Polaris embedded UI ✅ SPEC-ADMIN-01
- HMAC webhook verification ✅ SPEC-WEBHOOK-01
- GraphQL-only API usage ✅ SPEC-SHOPIFY-01

---

## Appendix: OSS Donor File References

Specific files and directories in donor repos to reference during implementation.

### Shopify React Router Template

| Our target | Template source file | What to adapt |
|-----------|---------------------|---------------|
| `app/shopify.server.ts` | `app/shopify.server.ts` | Auth helper: `shopify.authenticate.admin()`, session storage config, webhook auth |
| `app/routes/webhooks.tsx` | `app/routes/webhooks.tsx` | Webhook handler route (not nested under app layout) |
| `app/routes/auth.$.tsx` | `app/routes/auth.$.tsx` | OAuth callback handler |
| `shopify.app.toml` | `shopify.app.toml` | App manifest with scopes, webhook declarations, GDPR endpoints |
| `app/routes/app.tsx` | `app/routes/app.tsx` | App layout with Polaris `AppProvider` and navigation |

### Cloudshelf Connector (`Shopify_CSConnector`)

| Our target | Cloudshelf source | What to adapt |
|-----------|-------------------|---------------|
| `packages/connector-core/src/modules/` | `src/modules/` | Module boundary pattern: each module has `*.module.ts`, `*.service.ts`, `*.resolver.ts` |
| `infrastructure/telemetry/` | `src/modules/configuration/open-telemetry/` | OTel SDK setup, span naming, attribute conventions |
| `infrastructure/queue/` | `src/modules/*/jobs/` | Job definitions, queue registration pattern |
| `infrastructure/shopify/graphql-client.ts` | `src/graphql/` | GraphQL client with error handling and cost tracking |
| Module structure example | `src/modules/catalogue/catalogue.module.ts` | How a domain module encapsulates service + repo + controller |

### Unopim Connector (`unopim/shopify-connector`)

| Our target | Unopim source | What to adapt |
|-----------|---------------|---------------|
| `modules/catalog/mappers/` | `src/Helpers/Mappers/` | Product field mapping pipeline: attribute → Shopify field |
| `modules/mappings/` | `src/DataGrids/` | Attribute mapping data grid UI patterns |
| Multi-store export | `src/Exporters/` | How to batch product exports per store with filtered criteria |
| Metafield mapping | `src/Helpers/Mappers/MetafieldMapper.php` | Map PIM attributes to Shopify metafields with type conversion |

### Frappe ecommerce_integrations (Reference Only — GPL-3.0, No Code)

| Our pattern | Frappe source concept | How we adapt (clean-room) |
|------------|----------------------|---------------------------|
| `withShopifyClient()` wrapper | `@temp_shopify_session` decorator in `connection.py` | TypeScript async wrapper that resolves tenant, decrypts token, creates scoped client |
| `EVENT_MAPPER` dispatch table | `EVENT_MAPPER` dict in `connection.py` | TypeScript `Record<string, HandlerConfig>` mapping webhook topics to handlers |
| Log-then-enqueue | `store_request_data()` in `connection.py` | INSERT SyncEvent before BullMQ enqueue |
| `ProductBinding` linking table | `EcommerceItem` doctype | Dedicated junction table, not custom fields on domain objects |
| Timestamp-based inventory diff | `inventory_synced_on` field on `EcommerceItem` | `ProductBinding.inventory_synced_on` compared against `VSTORE.SKUINVENTORY.modified` |
| SKU matching before creation | `_match_sku_and_link_item()` in `product.py` | Match against `MERCH.BAR_CODES` before creating new bindings |
| Per-item commit in batch | Inventory sync in `inventory.py` | `connection.commit()` after each item in batch, not per-batch |
| 1:1 warehouse-to-location mapping | `ShopifyWarehouseMapping` child table | `LocationMapping` entity with strict 1:1 enforcement |
| Idempotency guards | Top-of-function existence checks in `order.py` | Every sync handler's first line checks binding table |
