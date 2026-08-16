import type { KycStatus, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { isOwnedVerificationDocumentUrl } from './processRasterUpload.js';

export type PublicKycStatus = KycStatus;

/** Fields safe to expose to the signed-in user about their own KYC. */
export function serializeOwnKyc(user: {
  kycStatus: KycStatus;
  kycDocumentUrl: string | null;
  kycSubmittedAt: Date | null;
  kycReviewedAt: Date | null;
  kycNotes: string | null;
}) {
  return {
    kycStatus: user.kycStatus,
    hasKycDocument: Boolean(user.kycDocumentUrl),
    /** Own document path only — not publicly served. */
    kycDocumentUrl: user.kycDocumentUrl,
    kycSubmittedAt: user.kycSubmittedAt?.toISOString() ?? null,
    kycReviewedAt: user.kycReviewedAt?.toISOString() ?? null,
    /** Rejection notes only — never leak internal notes for Verified. */
    kycNotes: user.kycStatus === 'Rejected' ? user.kycNotes : null
  };
}

/**
 * After a user uploads (or re-uses) an ID document, mark KYC pending for review.
 * Reusing the exact same URL while already Verified leaves status unchanged.
 * Replacing the document after Verified sends them back to Pending.
 */
export async function recordKycDocumentSubmission(
  userId: string,
  documentUrl: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  if (!isOwnedVerificationDocumentUrl(documentUrl, userId)) {
    throw new Error('Invalid verification document URL for user');
  }

  const existing = await tx.user.findUnique({
    where: { id: userId },
    select: { kycStatus: true, kycDocumentUrl: true }
  });

  if (
    existing?.kycStatus === 'Verified' &&
    existing.kycDocumentUrl === documentUrl
  ) {
    return;
  }

  await tx.user.update({
    where: { id: userId },
    data: {
      kycDocumentUrl: documentUrl,
      kycSubmittedAt: new Date(),
      kycStatus: 'Pending',
      kycReviewedAt: null,
      kycReviewedByAdminId: null,
      kycNotes: null
    }
  });
}

/**
 * When an admin approves a campaign, treat the organizer's ID as Verified
 * if they still have a document on file and are not already Verified.
 * @returns true when KYC status was updated
 */
export async function markOrganizerKycVerifiedOnCampaignApprove(params: {
  creatorId: string | null | undefined;
  adminId: string | null | undefined;
  documentUrl?: string | null;
}): Promise<boolean> {
  const { creatorId, adminId, documentUrl } = params;
  if (!creatorId) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { id: creatorId },
    select: { kycStatus: true, kycDocumentUrl: true }
  });
  if (!user) {
    return false;
  }

  const url = documentUrl?.trim() || user.kycDocumentUrl;
  if (!url) {
    return false;
  }

  if (user.kycStatus === 'Verified' && user.kycDocumentUrl) {
    return false;
  }

  await prisma.user.update({
    where: { id: creatorId },
    data: {
      kycDocumentUrl: url,
      kycStatus: 'Verified',
      kycSubmittedAt: user.kycDocumentUrl ? undefined : new Date(),
      kycReviewedAt: new Date(),
      kycReviewedByAdminId: adminId ?? null,
      kycNotes: null
    }
  });
  return true;
}
