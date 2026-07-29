import 'dotenv/config';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import { donationPlatformFeeFromGross } from '../src/config/fees.js';
import { seedCampaigns, seedPlatformStats } from '../src/data/seedData.js';
import {
  computeDaysLeftFromEndsAt,
  endOfUtcCalendarDayFromDateString,
  utcCalendarDayStart
} from '../src/lib/campaignEndsAt.js';

dotenv.config();
const prisma = new PrismaClient();

function formatUtcYyyyMmDd(d: Date): string {
  const u = utcCalendarDayStart(d);
  return `${u.getUTCFullYear()}-${String(u.getUTCMonth() + 1).padStart(2, '0')}-${String(u.getUTCDate()).padStart(2, '0')}`;
}

function addUtcCalendarDaysYyyyMmDd(yyyyMmDd: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
  if (!m) {
    throw new Error('Invalid date string');
  }
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Aligns with public API: `daysLeft` in seed data is calendar span to inclusive UTC end date. */
function seedEndsAtForDaysLeft(daysLeft: number, now = new Date()): Date {
  const endDateStr = addUtcCalendarDaysYyyyMmDd(formatUtcYyyyMmDd(now), daysLeft);
  return endOfUtcCalendarDayFromDateString(endDateStr);
}

async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, 10);
}

async function main() {
  // Clean up existing data
  await prisma.platformTip.deleteMany();
  await prisma.donation.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();

  const ownerEmail = (process.env.OWNER_EMAIL ?? '').trim().toLowerCase();
  const ownerPassword = process.env.OWNER_PASSWORD ?? '';
  const ownerFullName = (process.env.OWNER_FULL_NAME ?? '').trim() || 'Platform Owner';
  if (!ownerEmail || !ownerPassword) {
    throw new Error(
      'Set OWNER_EMAIL and OWNER_PASSWORD in backend/.env before seeding (platform owner / primary admin).'
    );
  }
  if (ownerPassword.length < 8) {
    throw new Error('OWNER_PASSWORD must be at least 8 characters');
  }

  // Create platform owner (primary admin) from env — never hardcode credentials in source
  const adminPassword = await hashPassword(ownerPassword);
  const adminUser = await prisma.user.create({
    data: {
      email: ownerEmail,
      password: adminPassword,
      fullName: ownerFullName,
      phoneNumber: '+220123456789',
      role: 'ADMIN',
      isActive: true,
      adminPanelPermissions: []
    }
  });

  console.log('Admin user created:', {
    email: adminUser.email,
    fullName: adminUser.fullName,
    role: adminUser.role
  });

  // Create a regular user for testing
  const userPassword = await hashPassword('user@123');
  const regularUser = await prisma.user.create({
    data: {
      email: 'user@barakahfund.com',
      password: userPassword,
      fullName: 'Regular User',
      phoneNumber: '+220987654321',
      role: 'USER',
      isActive: true
    }
  });

  console.log('Regular user created:', {
    email: regularUser.email,
    fullName: regularUser.fullName,
    role: regularUser.role
  });

  await prisma.platformStat.upsert({
    where: { id: 'platform' },
    update: seedPlatformStats,
    create: {
      id: 'platform',
      ...seedPlatformStats
    }
  });

  for (const campaign of seedCampaigns) {
    const endsAt = seedEndsAtForDaysLeft(campaign.daysLeft);
    const daysLeft = computeDaysLeftFromEndsAt(endsAt);
    const createdCampaign = await prisma.campaign.create({
      data: {
        slug: campaign.slug,
        title: campaign.title,
        creatorName: campaign.creatorName,
        creatorAvatar: campaign.creatorAvatar,
        category: campaign.category,
        shortDescription: campaign.shortDescription,
        fullDescription: campaign.fullDescription,
        goalAmount: campaign.goalAmount,
        raisedAmount: campaign.raisedAmount,
        donorCount: campaign.donorCount,
        daysLeft,
        endsAt,
        coverImage: campaign.coverImage,
        isTrending: campaign.isTrending ?? false,
        status: 'Active',
        creatorId: adminUser.id
      }
    });

    if (campaign.recentDonors.length > 0) {
      await prisma.donation.createMany({
        data: campaign.recentDonors.map((donor) => ({
          campaignId: createdCampaign.id,
          donorName: donor.donorName,
          amount: donor.amount,
          platformFeeAmount: donationPlatformFeeFromGross(donor.amount),
          currency: donor.currency,
          message: donor.message,
          isAnonymous: donor.isAnonymous,
          avatarUrl: donor.avatarUrl,
          createdAt: new Date(donor.createdAt),
          userId: Math.random() > 0.5 ? regularUser.id : undefined
        }))
      });
    }
  }

  const pendingEndsAt = seedEndsAtForDaysLeft(60);
  const pendingDaysLeft = computeDaysLeftFromEndsAt(pendingEndsAt);
  await prisma.campaign.create({
    data: {
      slug: 'demo-pending-community-garden',
      title: '[Demo] Community garden expansion',
      creatorName: 'Regular User',
      creatorAvatar:
        'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&h=150&fit=crop&q=80',
      category: 'Community',
      shortDescription:
        'Seed data: a sample campaign stuck in PendingReview so admins can test the review queue after re-seeding.',
      fullDescription:
        'This row exists only in development seed data. Approve or reject it from the admin panel. It is attributed to the regular test user account.',
      goalAmount: 120000,
      raisedAmount: 0,
      donorCount: 0,
      daysLeft: pendingDaysLeft,
      endsAt: pendingEndsAt,
      coverImage: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&q=80',
      isTrending: false,
      status: 'PendingReview',
      creatorId: regularUser.id
    }
  });

  console.log('Seed completed successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
