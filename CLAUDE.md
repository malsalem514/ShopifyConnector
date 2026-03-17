# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FarsightIQ Shopify Hub — an e-commerce integration platform for publishing retail product data to Shopify stores. Split from the FarSightIQ monolith on 2026-03-17 as a fully independent project.

**GitHub**: https://github.com/malsalem514/ShopifyConnector
**Sister project**: Attribute Manager at https://github.com/malsalem514/FarSightIQ-AttributeManager (`/Users/musaalsalem/Projects/FarSightIQ-master`) — these are fully independent repos. Do NOT introduce cross-dependencies.

## Commands

```bash
# Development (from root)
npm install              # Install all workspaces
npm run dev              # Run backend + frontend concurrently
npm run dev:backend      # Backend only (tsx watch, port 3003)
npm run dev:frontend     # Frontend only (Vite HMR, port 5174)

# Build
npm run build            # Build both workspaces
npm run build:backend    # TypeScript → backend/dist/
npm run build:frontend   # Vite → frontend/dist/

# Test
npm test                          # Backend unit tests (vitest, 18 tests)
cd backend && npm run test:watch  # Interactive watch mode
cd backend && npm run test:coverage # With coverage (70% threshold target)

# Type checking
cd backend && npm run typecheck   # tsc --noEmit
cd frontend && npx tsc --noEmit   # Frontend typecheck

# Run single test file
cd backend && npx vitest run src/services/__tests__/tenant-context.service.test.ts

# Docker
docker compose build     # Multi-stage builds (backend + nginx frontend)
docker compose up -d     # Backend :3003, Frontend :80
docker compose logs -f   # Stream logs
```

## Environment Setup

Backend requires `backend/.env` (gitignored). Copy from `backend/.env.template`:

```env
PORT=3003
NODE_ENV=development
ORACLE_USER=attr_mgr
ORACLE_PASSWORD=attr_mgr
ORACLE_CONNECT_STRING=100.90.84.20:1521/DEMODB
ORACLE_CLIENT_PATH=/Users/musaalsalem/oracle/instantclient
ORACLE_POOL_MIN=2
ORACLE_POOL_MAX=50
SHOPIFY_TENANT_ID=DEFAULT
SHOPIFY_TENANT_NAME=Default Shopify Hub
CORS_ORIGINS=http://localhost:5174
```

**VPN required** to reach Oracle at 100.90.84.20.

## Monorepo Structure

npm workspaces with two packages:
- `backend/` — Express API (TypeScript, ESM via `"type": "module"`, port 3003)
- `frontend/` — React 19 frontend (Vite + Tailwind CSS 4, port 5174)

Root `package.json` orchestrates both. Frontend dev server proxies `/api` to `localhost:3003`.

## Architecture

### Backend (`backend/src/`)

- `routes/index.ts` → Health checks + mounts `shopify.route.ts`
- `routes/shopify.route.ts` → All Shopify API endpoints (stores, sync, orders, discounts, etc.)
- `services/shopify.service.ts` → Core Shopify business logic (3K+ LOC — store health, sync, orders, analytics, demo mode)
- `services/shopify-actions.service.ts` → Shopify GraphQL write operations (product create/update/delete)
- `services/shopify-discounts.service.ts` → Discount code management
- `services/shopify-media.service.ts` → Image/media sync to Shopify
- `services/shopify-live-test.service.ts` → End-to-end publication testing
- `services/tenant-context.service.ts` → Tenant resolution from `SHOPIFY_TENANTS` table (replaces SettingsService)
- `services/oracle-pool.ts` → Oracle connection pooling (dual-pool: main + media)
- `middleware/` → asyncHandler, rate limiting
- `utils/` → Structured logger (JSON in prod), errors (`AppError`), retry
- `prompts/shopify-mapping.ts` → AI-assisted hierarchy-to-product-type mapping prompt

**Key patterns:**
- All async route handlers wrapped with `asyncHandler()`
- `TenantContextService` singleton — reads from `SHOPIFY_TENANTS`, falls back to env vars
- Oracle connection pooling (smaller pool: max 50 vs AM's 100)
- Shopify GraphQL API (version 2024-10)
- Demo mode with `SHOPIFY_CONFIG` table toggle (`USE_DEMO_FALLBACK`)
- `ensureReady()` called at startup (not on hot path)
- Period multipliers extracted as `PERIOD_MULTIPLIERS` class constant

### Frontend (`frontend/`)

- `App.tsx` — Standalone shell rendering ShopifyHubPage
- `pages/ShopifyHubPage.tsx` — Main page with 12 tabs (stores, orders, analytics, discounts, etc.)
- `components/shopify/` — Store health, sync history, bulk ops, discounts, orders, webhooks, publishers
- `components/shared/UI.tsx` — Shared UI primitives (Button, Select, StatusBadge)
- `src/api/config.ts` — API base URL configuration

## Database

Oracle schema `ATTR_MGR` on `100.90.84.20:1521/DEMODB`.

### Shopify-owned tables (this project manages these):
- `SHOPIFY_TENANTS` — Tenant registry and active tenant resolution
- `SHOPIFY_PRODUCT_SNAPSHOT` — Denormalized product read model for UI/publishing
- `SHOPIFY_PUBLICATION_QUEUE` — Publication intent/work queue
- `SHOPIFY_CONFIG` — Store configuration (demo tokens, sync settings)
- `SHOPIFY_SYNC_LOG` — Sync audit trail
- `SHOPIFY_HIERARCHY_MAP` — Hierarchy-to-product-type mapping
- `SHOPIFY_INVENTORY_ALERTS` — Inventory alert state

### Read-only upstream access:
- `MERCH.*` — Product master data, variants, barcodes, vendors
- `OMNI.*` — Banners, orders, shipments, customers
- `VSTORE.*` — Inventory levels, merchandise hierarchy

**This project does NOT use Attribute Manager tables** (no HIERARCHY_CACHE, CATALOG_CACHE_SHADOW, AI_*, STAGING_*, APP_ENVIRONMENTS, ENV_SWITCHER_PKG).

### DDL Scripts (in `for-dbas/scripts/`):
- `V067` — Original Shopify hub objects (SHOPIFY_CONFIG, SHOPIFY_SYNC_LOG, SHOPIFY_HIERARCHY_MAP)
- `V068` — Synonyms for MERCH/OMNI/VSTORE access
- `V069` — Cross-schema access grants
- `V070` — New read model tables (SHOPIFY_TENANTS, SHOPIFY_PRODUCT_SNAPSHOT, SHOPIFY_PUBLICATION_QUEUE, SHOPIFY_INVENTORY_ALERTS)

## TypeScript Conventions

- Backend: ES2022, NodeNext module resolution (ESM — imports require `.js` extensions), strict mode
- Frontend: ES2022, bundler module resolution, strict mode, JSX react-jsx
- Test files: `src/**/*.test.ts`, vitest globals enabled
- All `req.params.*` values cast as `string` (Express 5 types)

## Production Hardening (completed)

- Helmet security headers (HSTS in production)
- Response compression
- All async handlers wrapped with `asyncHandler()`
- Graceful shutdown (drain HTTP, close Oracle pools)
- Structured JSON logging with correlation IDs
- Global API rate limiting
- CORS fails in production without explicit config
- Error handler suppresses stack traces in production
- Hardcoded Shopify token removed — reads from `config.shopifyDemo`
- Dead config properties removed
- `ensureConfigTableExists` moved from hot path to startup
- OFFSET/FETCH FIRST SQL ordering bug fixed
- Duplicate route registration removed
- console.log replaced with structured logger throughout

## CI/CD

- GitHub Actions: typecheck → test → build on push/PR to main
- Docker: multi-stage builds (node:20-slim builder → production, nginx:alpine for frontend)
- Vitest coverage threshold: 70% (target)

## Key Dependencies

- **oracledb** (thick mode locally, thin mode in Docker)
- **express** + **helmet** + **compression** + **cors** — HTTP framework + security
- **Tailwind CSS 4** + **Lucide React** — frontend styling and icons
- No LLM dependencies (no openai, no @google/generative-ai)
- No file upload dependencies (no multer, no adm-zip)

## Known Remaining Work

- Shopify service tests (shopify.service.ts is 3K+ LOC with zero test coverage)
- N+1 query in getOrderDetails (shipment details fetched per-shipment)
- Sequential independent DB queries in getDashboardStats, getStoreHealth, getSyncSummary (should use Promise.all)
- Auto-map route opens new DB connection per variant (pool exhaustion risk)
- Large inline business logic in shopify.route.ts auto-map handler (should extract to service)
- Duplicate banner-to-domain mapping (constructShopifyUrl + storeNameMap)
- Dead demo generators (getDemoAbandonedCarts etc. — were removed, verify no new ones)
