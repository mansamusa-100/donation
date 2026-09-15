import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, AuthRequest } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { getVapidPublicKey, isWebPushConfigured } from '../lib/webPush.js';

export const pushRouter = Router();

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512)
  }),
  userAgent: z.string().max(512).optional().nullable()
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048)
});

pushRouter.get(
  '/vapid-public-key',
  asyncHandler(async (_req, res) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey || !isWebPushConfigured()) {
      res.status(503).json({ message: 'Push notifications are not configured' });
      return;
    }
    res.json({ publicKey });
  })
);

pushRouter.get(
  '/status',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    const count = await prisma.pushSubscription.count({ where: { userId } });
    res.json({
      configured: isWebPushConfigured(),
      deviceCount: count
    });
  })
);

pushRouter.post(
  '/subscribe',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    if (!isWebPushConfigured()) {
      res.status(503).json({ message: 'Push notifications are not configured' });
      return;
    }

    const body = subscribeSchema.parse(req.body);
    const userAgent =
      body.userAgent?.trim() ||
      (typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 512) : null);

    const row = await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent
      },
      update: {
        userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent
      }
    });

    res.status(201).json({
      id: row.id,
      endpoint: row.endpoint,
      createdAt: row.createdAt
    });
  })
);

pushRouter.delete(
  '/subscribe',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const body = unsubscribeSchema.parse(req.body);
    await prisma.pushSubscription.deleteMany({
      where: { userId, endpoint: body.endpoint }
    });
    res.json({ message: 'Unsubscribed' });
  })
);
