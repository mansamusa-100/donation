import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';

export const statsRouter = Router();

statsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const stats = await prisma.platformStat.findUnique({
      where: { id: 'platform' }
    });

    if (!stats) {
      res.status(404).json({ message: 'Platform stats not found' });
      return;
    }

    res.json({
      totalRaised: stats.totalRaised,
      campaignsFunded: stats.campaignsFunded,
      totalDonors: stats.totalDonors,
      communitiesHelped: stats.communitiesHelped
    });
  })
);
