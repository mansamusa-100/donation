import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { serializePlatformBankAccount } from '../lib/platformBankAccountSerialize.js';

export const platformBankAccountsRouter = Router();

/** Public: active receiving accounts for bank transfer donations. */
platformBankAccountsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.platformBankAccount.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    res.json(rows.map(serializePlatformBankAccount));
  })
);
