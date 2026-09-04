import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { getCampaignWithdrawalBalances, tryFinalizeCampaignEnded } from './campaignLifecycle.js';
import { comparePassword } from './auth.js';
import { HttpError } from './HttpError.js';
import { sendAccountClosedEmail } from './mail.js';
import { recordActivity } from './activityLog.js';

const TOMBSTONE_EMAIL_DOMAIN = 'accounts.closed.barakahfund';

export function tombstoneEmailForUser(userId: string): string {
  return `closed+${userId}@${TOMBSTONE_EMAIL_DOMAIN}`;
}

/** Reasons the account cannot be closed yet (empty = OK to proceed). */
export async function getAccountCloseBlockers(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, accountClosedAt: true, isActive: true }
  });

  if (!user) {
    return ['Account not found.'];
  }
  if (user.accountClosedAt) {
    return ['This account is already closed.'];
  }
  if (user.role === 'ADMIN') {
    return [
      'Administrator accounts cannot be closed here. Ask another admin to deactivate your account instead.'
    ];
  }

  const blockers: string[] = [];

  const [openWithdrawals, pendingBank, pendingWave, pendingEasypay] = await Promise.all([
    prisma.withdrawalRequest.count({
      where: { userId, status: { in: ['Pending', 'Approved'] } }
    }),
    prisma.bankTransferIntent.count({
      where: { userId, status: 'Pending' }
    }),
    prisma.wavePaymentIntent.count({
      where: { userId, donationId: null }
    }),
    prisma.easypayPaymentIntent.count({
      where: { userId, donationId: null, reversedAt: null }
    })
  ]);

  if (openWithdrawals > 0) {
    blockers.push(
      'You have a withdrawal request still being processed. Wait until it is paid or contact support.'
    );
  }
  if (pendingBank > 0) {
    blockers.push(
      'You have a pending bank transfer donation. Complete or let it expire before closing your account.'
    );
  }
  if (pendingWave > 0 || pendingEasypay > 0) {
    blockers.push(
      'You have a payment checkout still in progress. Finish or abandon it before closing your account.'
    );
  }

  const campaigns = await prisma.campaign.findMany({
    where: { creatorId: userId, status: { in: ['Active', 'Closed'] } },
    select: { id: true, title: true, raisedAmount: true }
  });

  for (const campaign of campaigns) {
    const balances = await getCampaignWithdrawalBalances(
      prisma,
      campaign.id,
      campaign.raisedAmount
    );
    if (balances.availableForWithdrawal > 0.005) {
      blockers.push(
        `Campaign "${campaign.title}" still has D${balances.availableForWithdrawal.toFixed(2)} available to withdraw. Request a payout first.`
      );
    }
  }

  return blockers;
}

async function verifyCloseAccountAuth(
  user: {
    id: string;
    email: string;
    password: string | null;
    googleId: string | null;
  },
  params: { password?: string; googleCredential?: string },
  verifyGoogleIdToken: (credential: string) => Promise<{ sub: string; email: string } | null>
): Promise<void> {
  if (params.password && user.password) {
    const ok = await comparePassword(params.password, user.password);
    if (!ok) {
      throw new HttpError(401, 'Incorrect password.');
    }
    return;
  }

  if (params.googleCredential && user.googleId) {
    const payload = await verifyGoogleIdToken(params.googleCredential);
    if (!payload || payload.sub !== user.googleId) {
      throw new HttpError(401, 'Google verification failed. Sign in with the same Google account.');
    }
    if (payload.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new HttpError(401, 'Google account does not match this profile.');
    }
    return;
  }

  if (user.password) {
    throw new HttpError(400, 'Enter your password to confirm account closure.');
  }
  if (user.googleId) {
    throw new HttpError(400, 'Confirm with Google to close this account.');
  }
  throw new HttpError(400, 'Re-authentication is required to close your account.');
}

/** Stop donations and wind down every campaign this user created. */
async function endOrganizerCampaigns(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const now = new Date();
  const campaigns = await tx.campaign.findMany({
    where: {
      creatorId: userId,
      status: { in: ['Active', 'PendingReview', 'Draft'] }
    },
    select: { id: true, status: true, ownerConfirmedEndAt: true, title: true, slug: true }
  });

  let endedCount = 0;

  for (const campaign of campaigns) {
    if (campaign.status === 'Active') {
      await tx.campaign.update({
        where: { id: campaign.id },
        data: {
          ownerConfirmedEndAt: campaign.ownerConfirmedEndAt ?? now,
          status: 'Closed',
          showPublicContact: false,
          contactPhone: null,
          contactWhatsApp: null
        }
      });
      const finalized = await tryFinalizeCampaignEnded(tx, campaign.id);
      if (!finalized) {
        // Still closed — donations stopped; may move to Ended once payouts complete.
        endedCount += 1;
      } else {
        endedCount += 1;
      }

      await recordActivity({
        type: 'CAMPAIGN_STATUS_CHANGED',
        title: `Campaign closed (organizer account closed): ${campaign.title}`,
        detail: `Slug: ${campaign.slug}`,
        campaignId: campaign.id,
        userId,
        actorId: userId
      });
    } else {
      await tx.campaign.update({
        where: { id: campaign.id },
        data: {
          status: 'Closed',
          showPublicContact: false,
          contactPhone: null,
          contactWhatsApp: null
        }
      });
      endedCount += 1;

      await recordActivity({
        type: 'CAMPAIGN_STATUS_CHANGED',
        title: `Campaign closed (organizer account closed): ${campaign.title}`,
        detail: `Slug: ${campaign.slug} · was ${campaign.status}`,
        campaignId: campaign.id,
        userId,
        actorId: userId
      });
    }
  }

  await tx.campaignExtensionRequest.updateMany({
    where: {
      campaign: { creatorId: userId },
      status: 'Pending'
    },
    data: {
      status: 'Rejected',
      adminNote: 'Organizer closed their account.',
      reviewedAt: now
    }
  });

  return endedCount;
}

export async function closeUserAccount(
  userId: string,
  auth: { password?: string; googleCredential?: string },
  verifyGoogleIdToken: (credential: string) => Promise<{ sub: string; email: string } | null>
): Promise<{ campaignsClosed: number }> {
  const blockers = await getAccountCloseBlockers(userId);
  if (blockers.length > 0) {
    throw new HttpError(400, blockers[0]);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      password: true,
      googleId: true,
      accountClosedAt: true,
      role: true
    }
  });

  if (!user || user.accountClosedAt) {
    throw new HttpError(400, 'This account is already closed or does not exist.');
  }

  await verifyCloseAccountAuth(user, auth, verifyGoogleIdToken);

  const notifyEmail = user.email;
  const notifyName = user.fullName;

  const campaignsClosed = await prisma.$transaction(async (tx) => {
    const count = await endOrganizerCampaigns(tx, userId);

    await tx.userPayoutMethod.deleteMany({ where: { userId } });

    await tx.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        accountClosedAt: new Date(),
        tokenVersion: { increment: 1 },
        fullName: 'Deleted account',
        email: tombstoneEmailForUser(userId),
        phoneNumber: null,
        avatarUrl: null,
        googleId: null,
        password: null,
        passwordResetToken: null,
        passwordResetExpires: null,
        kycStatus: 'Unverified',
        kycDocumentUrl: null,
        kycSubmittedAt: null,
        kycReviewedAt: null,
        kycReviewedByAdminId: null,
        kycNotes: null
      }
    });

    return count;
  });

  await recordActivity({
    type: 'USER_ACCOUNT_CLOSED',
    title: 'User closed their account',
    detail: `${campaignsClosed} campaign(s) closed · email anonymized`,
    userId,
    actorId: userId
  });

  void sendAccountClosedEmail({ to: notifyEmail, fullName: notifyName }).catch((err) =>
    console.error('[mail] sendAccountClosedEmail', err)
  );

  return { campaignsClosed };
}
