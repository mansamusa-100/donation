import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireEmailVerified, AuthRequest } from '../lib/auth.js';
import {
  createPayoutMethodSchema,
  serializePayoutMethod,
  updatePayoutMethodSchema,
  validatePayoutDetails
} from '../lib/payoutMethods.js';

export const payoutMethodsRouter = Router();

payoutMethodsRouter.use(authenticate);

async function clearOtherDefaults(userId: string, exceptId?: string) {
  await prisma.userPayoutMethod.updateMany({
    where: {
      userId,
      ...(exceptId ? { id: { not: exceptId } } : {})
    },
    data: { isDefault: false }
  });
}

payoutMethodsRouter.get(
  '/',
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const rows = await prisma.userPayoutMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });

    res.json(rows.map(serializePayoutMethod));
  })
);

payoutMethodsRouter.post(
  '/',
  requireEmailVerified,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const body = createPayoutMethodSchema.parse(req.body);
    const details = validatePayoutDetails(body.type, body.details);

    const existingCount = await prisma.userPayoutMethod.count({ where: { userId } });
    const makeDefault = body.isDefault === true || existingCount === 0;

    const created = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await clearOtherDefaults(userId);
      }
      return tx.userPayoutMethod.create({
        data: {
          userId,
          type: body.type,
          label: body.label?.trim() || null,
          isDefault: makeDefault,
          details: details as Prisma.InputJsonValue
        }
      });
    });

    res.status(201).json(serializePayoutMethod(created));
  })
);

payoutMethodsRouter.patch(
  '/:id',
  requireEmailVerified,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const id = String(req.params.id);
    const existing = await prisma.userPayoutMethod.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      res.status(404).json({ message: 'Payout method not found' });
      return;
    }

    const body = updatePayoutMethodSchema.parse(req.body);
    let details: Prisma.InputJsonValue = existing.details as Prisma.InputJsonValue;
    if (body.details !== undefined) {
      details = validatePayoutDetails(existing.type, body.details) as Prisma.InputJsonValue;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await clearOtherDefaults(userId, id);
      }
      return tx.userPayoutMethod.update({
        where: { id },
        data: {
          ...(body.label !== undefined ? { label: body.label.trim() || null } : {}),
          ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
          ...(body.details !== undefined ? { details } : {})
        }
      });
    });

    res.json(serializePayoutMethod(updated));
  })
);

payoutMethodsRouter.delete(
  '/:id',
  requireEmailVerified,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const id = String(req.params.id);
    const existing = await prisma.userPayoutMethod.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      res.status(404).json({ message: 'Payout method not found' });
      return;
    }

    await prisma.userPayoutMethod.delete({ where: { id } });

    if (existing.isDefault) {
      const next = await prisma.userPayoutMethod.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' }
      });
      if (next) {
        await prisma.userPayoutMethod.update({
          where: { id: next.id },
          data: { isDefault: true }
        });
      }
    }

    res.json({ message: 'Payout method removed' });
  })
);
