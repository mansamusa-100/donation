import type { BankTransferIntent } from '@prisma/client';
import { prisma } from './prisma.js';
import { applyDonationToLedger, recordPlatformTip } from './processDonationLedger.js';
import { tryFinalizeCampaignEnded } from './campaignLifecycle.js';
import { sendBankTransferConfirmedEmail } from './mail.js';
import { lockBankTransferIntentForUpdate } from './paymentIntentLock.js';

type IntentWithRelations = BankTransferIntent & {
  campaign: { title: string; slug: string };
};

function resolveNotifyEmail(intent: {
  donorEmail: string | null;
  user?: { email: string } | null;
}): string | null {
  const fromIntent = intent.donorEmail?.trim().toLowerCase();
  if (fromIntent) {
    return fromIntent;
  }
  return intent.user?.email?.trim().toLowerCase() || null;
}

export async function confirmBankTransferIntent(params: {
  intent: IntentWithRelations;
  receivedAmount: number;
  reviewedById: string | null;
  adminNote?: string | null;
}) {
  if (params.receivedAmount < 1) {
    throw new Error('Received amount must be at least 1');
  }

  return prisma.$transaction(async (tx) => {
    await lockBankTransferIntentForUpdate(tx, params.intent.id);

    const current = await tx.bankTransferIntent.findUnique({
      where: { id: params.intent.id }
    });

    if (!current || current.status !== 'Pending') {
      throw new Error('This bank transfer is no longer pending');
    }

    if (current.expiresAt.getTime() < Date.now()) {
      await tx.bankTransferIntent.update({
        where: { id: current.id },
        data: { status: 'Expired' }
      });
      throw new Error('This bank transfer has expired');
    }

    const donation = await applyDonationToLedger(tx, {
      campaignId: current.campaignId,
      campaignSlug: params.intent.campaign.slug,
      userId: current.userId,
      donorName: current.donorName,
      amount: params.receivedAmount,
      currency: current.currency,
      message: current.message,
      isAnonymous: current.isAnonymous,
      avatarUrl: current.avatarUrl
    });

    if (current.platformTipAmount > 0) {
      await recordPlatformTip(tx, {
        amount: current.platformTipAmount,
        currency: current.currency,
        donorName: current.donorName,
        userId: current.userId,
        campaignId: current.campaignId,
        bankTransferIntentId: current.id
      });
    }

    const claimed = await tx.bankTransferIntent.updateMany({
      where: { id: current.id, status: 'Pending', donationId: null },
      data: {
        status: 'Confirmed',
        confirmedAmount: params.receivedAmount,
        donationId: donation.id,
        reviewedById: params.reviewedById,
        reviewedAt: new Date(),
        adminNote: params.adminNote?.trim() || null
      }
    });
    if (claimed.count !== 1) {
      throw new Error('This bank transfer is no longer pending');
    }

    const updated = await tx.bankTransferIntent.findUniqueOrThrow({
      where: { id: current.id },
      include: {
        campaign: { select: { title: true, slug: true } },
        platformBankAccount: true,
        user: { select: { email: true, fullName: true } }
      }
    });

    await tryFinalizeCampaignEnded(tx, current.campaignId);

    return { updated, donation };
  });
}

export async function sendBankTransferConfirmedEmails(
  updated: Awaited<ReturnType<typeof confirmBankTransferIntent>>['updated'],
  donationAmount: number
) {
  const to = resolveNotifyEmail(updated);
  if (!to) {
    return;
  }
  void sendBankTransferConfirmedEmail({
    to,
    donorName: updated.donorName,
    campaignTitle: updated.campaign.title,
    campaignSlug: updated.campaign.slug,
    clientReference: updated.clientReference,
    confirmedAmount: donationAmount,
    platformTipAmount: updated.platformTipAmount
  });
}
