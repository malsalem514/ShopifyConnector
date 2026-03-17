# FarsightIQ Shopify Hub

**E-Commerce Integration Platform** for publishing retail product data to Shopify stores.

## Quick Start

### Prerequisites
- Node.js 20+ (LTS)
- Oracle Instant Client 19c+ (oracledb thick mode)
- Oracle Database with ATTR_MGR schema + Shopify tables deployed

### Install & Run
```bash
npm install
npm run dev
```

- Backend: http://localhost:3003
- Frontend: http://localhost:5174
- Health check: http://localhost:3003/api/health

### Environment Variables
Copy `backend/.env.template` to `backend/.env` and fill in Oracle credentials.

## Database Ownership
This project owns `SHOPIFY_*` tables in the `ATTR_MGR` schema:
- `SHOPIFY_TENANTS` — tenant registry
- `SHOPIFY_PRODUCT_SNAPSHOT` — denormalized product read model
- `SHOPIFY_PUBLICATION_QUEUE` — publication work queue
- `SHOPIFY_CONFIG` — store configuration
- `SHOPIFY_SYNC_LOG` — sync audit trail
- `SHOPIFY_HIERARCHY_MAP` — hierarchy-to-product-type mapping
- `SHOPIFY_INVENTORY_ALERTS` — inventory alert state

Reads from `MERCH.*`, `OMNI.*`, `VSTORE.*` schemas (read-only views).

Does **not** depend on Attribute Manager caches, PL/SQL packages, or environment switcher.
