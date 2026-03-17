/**
 * Shopify Hub Backend
 *
 * Express.js API server for FarsightIQ Shopify Integration
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config, validateConfig } from './config.js';
import { createPool, closePool } from './services/oracle-pool.js';
import { TenantContextService } from './services/tenant-context.service.js';
import { logger } from './utils/logger.js';
import { formatErrorResponse, AppError } from './utils/errors.js';
import routes from './routes/index.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: config.nodeEnv === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

app.use(compression());

app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  maxAge: 86400
}));

app.use(express.json({ limit: '10mb' }));

// Request correlation ID + logging
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || logger.correlationId();
  res.setHeader('X-Request-ID', requestId);
  (req as any).requestId = requestId;

  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.path}`, {
      requestId,
      status: res.statusCode,
      duration: `${Date.now() - start}ms`
    });
  });
  next();
});

app.use('/api', routes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const isDev = config.nodeEnv === 'development';
  logger.error('Request error', {
    path: req.path,
    method: req.method,
    error: err.message,
    ...(isDev && { stack: err.stack }),
    code: err.code
  });
  if (res.headersSent) return next(err);
  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toJSON());
    return;
  }
  res.status(500).json(formatErrorResponse(err, isDev));
});

let isShuttingDown = false;
let server: ReturnType<typeof app.listen> | null = null;

async function start(): Promise<void> {
  const { valid, missing } = validateConfig();
  if (!valid) {
    logger.error('Missing required configuration', { missing });
    process.exit(1);
  }

  try {
    await createPool();
    const tenantContext = TenantContextService.getInstance();
    await tenantContext.initialize();

    const { ShopifyService } = await import('./services/shopify.service.js');
    const shopifyService = new ShopifyService();
    await shopifyService.ensureReady();
  } catch (error: any) {
    logger.error('Failed to connect to Oracle', { error: error.message });
    process.exit(1);
  }

  server = app.listen(config.port, () => {
    logger.info(`Shopify Hub API running on http://localhost:${config.port}`);
  });
}

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('Shutting down gracefully...');
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
      setTimeout(resolve, 10000);
    });
  }
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});
