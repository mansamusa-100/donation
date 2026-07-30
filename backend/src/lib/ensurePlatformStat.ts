import { prisma } from './prisma.js';

/** Ensures the singleton platform stats row exists (required for donation ledger updates). */
export async function ensurePlatformStat(): Promise<void> {
  await prisma.platformStat.upsert({
    where: { id: 'platform' },
    create: {
      id: 'platform',
      totalRaised: 0,
      campaignsFunded: 0,
      totalDonors: 0,
      communitiesHelped: 0,
      totalPlatformTips: 0
    },
    update: {}
  });
}
