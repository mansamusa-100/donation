import path from 'path';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { HttpError } from './lib/HttpError.js';
import { env } from './config/env.js';
import { campaignsRouter } from './routes/campaigns.js';
import { categoriesRouter } from './routes/categories.js';
import { healthRouter } from './routes/health.js';
import { statsRouter } from './routes/stats.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { uploadsRouter } from './routes/uploads.js';
import { paymentsRouter } from './routes/payments.js';
import { asyncHandler } from './lib/asyncHandler.js';
import { handleWaveWebhook } from './routes/waveWebhook.js';

export const app = express();

app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true
  })
);
/** Raw body required for Wave-Signature HMAC — must run before global express.json(). */
app.post(
  '/api/payments/wave/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(handleWaveWebhook)
);
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/', (_req, res) => {
  res.json({
    name: 'GambiaFund API',
    status: 'ok'
  });
});

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/uploads', uploadsRouter);

app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`
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
      error instanceof Error ? error.message : 'Internal server error';

    console.error(error);
    res.status(500).json({ message });
  }
);
