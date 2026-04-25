import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { serializeCategorySummaries } from '../lib/serializers.js';

export const categoriesRouter = Router();

categoriesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const grouped = await prisma.campaign.groupBy({
      by: ['category'],
      _count: {
        category: true
      },
      where: {
        status: 'Active'
      }
    });

    const counts = grouped.reduce<Record<string, number>>((acc: Record<string, number>, item: any) => {
      acc[item.category] = item._count.category;
      return acc;
    }, {});

    res.json(serializeCategorySummaries(counts));
  })
);
