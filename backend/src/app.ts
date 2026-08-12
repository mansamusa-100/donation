import fs from 'fs';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { HttpError } from './lib/HttpError.js';
import { env } from './config/env.js';
import {
  authRateLimiter,
  configureTrustProxy,
  generalRateLimiter,
  helmetMiddleware
} from './middleware/security.js';
import { accessLogMiddleware } from './middleware/accessLog.js';
import { campaignsRouter } from './routes/campaigns.js';
import { categoriesRouter } from './routes/categories.js';
import { healthRouter } from './routes/health.js';
import { statsRouter } from './routes/stats.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { uploadsRouter } from './routes/uploads.js';
import { paymentsRouter } from './routes/payments.js';
import { payoutMethodsRouter } from './routes/payoutMethods.js';
import { platformBankAccountsRouter } from './routes/platformBankAccounts.js';
import { bankTransfersRouter } from './routes/bankTransfers.js';
import { asyncHandler } from './lib/asyncHandler.js';
import { handleWaveWebhook } from './routes/waveWebhook.js';
import { handleEasypayPartnerWebhook } from './routes/easypayWebhook.js';
import { getUploadsRoot } from './lib/uploadPaths.js';
import {
  buildCampaignOgTags,
  buildStandaloneOgHtml,
  injectHeadTags,
  loadCampaignOgPayload,
  readSpaIndexHtml
} from './lib/campaignOgHtml.js';

export const app = express();

configureTrustProxy(app);
app.use(accessLogMiddleware);
app.use(helmetMiddleware);
app.use(generalRateLimiter);
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true
  })
);
/** Raw body required for Wave-Signature HMAC — must run before global express.json(). */
app.post(
  '/api/payments/wave/webhook',
  express.raw({ type: 'application/json', limit: '256kb' }),
  asyncHandler(handleWaveWebhook)
);
app.post(
  '/api/payments/easypay/webhook',
  express.raw({ type: 'application/json', limit: '256kb' }),
  asyncHandler(handleEasypayPartnerWebhook)
);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

const uploadsRoot = getUploadsRoot();
/** Public campaign imagery and avatars only — verification IDs are admin-only. */
app.use('/uploads/avatars', express.static(path.join(uploadsRoot, 'avatars')));
app.use('/uploads/campaign-covers', express.static(path.join(uploadsRoot, 'campaign-covers')));
app.use('/uploads/verification-ids', (_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use('/api/health', healthRouter);
app.use('/api/auth', authRateLimiter, authRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/payout-methods', payoutMethodsRouter);
app.use('/api/platform-bank-accounts', platformBankAccountsRouter);
app.use('/api/bank-transfers', bankTransfersRouter);

/**
 * Campaign share previews: inject standard Open Graph + Twitter Card tags into the HTML
 * for GET /campaign/:slug so WhatsApp, Facebook, etc. unfurl title, description, and cover.
 */
app.get(
  '/campaign/:slug',
  asyncHandler(async (req, res, next) => {
    const slug = String(req.params.slug ?? '').trim();
    if (!slug) {
      next();
      return;
    }

    const og = await loadCampaignOgPayload(slug);
    if (!og) {
      next();
      return;
    }

    const tags = buildCampaignOgTags(og);
    const spaIndex = path.join(process.cwd(), '..', 'frontend', 'dist', 'index.html');
    const spaHtml = readSpaIndexHtml(spaIndex);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (spaHtml) {
      res.send(injectHeadTags(spaHtml, tags));
      return;
    }

    // API-only / no Vite build: still return valid OG HTML for link crawlers.
    res.send(buildStandaloneOgHtml(og));
  })
);

/** Production: serve Vite build from workspace sibling when present (same container as API). */
const frontendDist = path.join(process.cwd(), '..', 'frontend', 'dist');
const spaIndex = path.join(frontendDist, 'index.html');
if (fs.existsSync(spaIndex)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next();
      return;
    }
    res.sendFile(path.resolve(spaIndex));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      name: 'BarakahFund API',
      status: 'ok'
    });
  });
}

app.use((req, res) => {
  res.status(404).json({
    message: env.NODE_ENV === 'production' ? 'Not found' : `Route not found: ${req.method} ${req.originalUrl}`
  });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    void next;

    if (error instanceof ZodError) {
      res.status(400).json({
        message: 'Invalid request payload',
        issues: error.flatten()
      });
      return;
    }

    if (error instanceof HttpError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    if (error instanceof multer.MulterError) {
      res.status(400).json({
        message:
          error.code === 'LIMIT_FILE_SIZE'
            ? 'File is too large'
            : error.message
      });
      return;
    }

    if (error instanceof Error && error.message.startsWith('Only ')) {
      res.status(400).json({ message: error.message });
      return;
    }

    const message =
      env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error instanceof Error
          ? error.message
          : 'Internal server error';

    console.error(error);
    res.status(500).json({ message });
  }
);
