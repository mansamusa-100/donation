import webpush from 'web-push';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';

export type DonationPushPayload = {
  campaignId: string;
  campaignTitle: string;
  campaignSlug: string;
  amount: number;
  currency: string;
  donorName: string;
  isAnonymous: boolean;
};

let configured = false;

function ensureConfigured(): boolean {
  const publicKey = env.VAPID_PUBLIC_KEY.trim();
  const privateKey = env.VAPID_PRIVATE_KEY.trim();
  if (!publicKey || !privateKey) {
    return false;
  }
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT.trim() || 'mailto:support@barakahfund.com', publicKey, privateKey);
    configured = true;
  }
  return true;
}

export function isWebPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY.trim() && env.VAPID_PRIVATE_KEY.trim());
}

export function getVapidPublicKey(): string | null {
  const key = env.VAPID_PUBLIC_KEY.trim();
  return key || null;
}

function formatAmount(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  if (currency === 'GMD') {
    return `D${text}`;
  }
  return `${currency} ${text}`;
}

function buildNotification(params: DonationPushPayload) {
  const donor = params.isAnonymous ? 'Anonymous' : params.donorName.trim() || 'Someone';
  const amount = formatAmount(params.amount, params.currency);
  return {
    title: 'New donation',
    body: `${donor} donated ${amount} to "${params.campaignTitle}"`,
    url: `/dashboard`
  };
}

async function sendToUser(userId: string, payload: ReturnType<typeof buildNotification>): Promise<void> {
  if (!ensureConfigured()) {
    return;
  }

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) {
    return;
  }

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          body,
          { TTL: 60 * 60 * 12, urgency: 'high' }
        );
      } catch (err: unknown) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
          return;
        }
        console.error('[web-push] send failed', { endpoint: sub.endpoint.slice(0, 48), statusCode, err });
      }
    })
  );
}

/** Fire-and-forget: notify the campaign owner that a donation was recorded. */
export function notifyOrganizerOfDonation(params: DonationPushPayload): void {
  void (async () => {
    if (!isWebPushConfigured()) {
      return;
    }
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.campaignId },
      select: { creatorId: true, title: true, slug: true }
    });
    if (!campaign?.creatorId) {
      return;
    }
    await sendToUser(
      campaign.creatorId,
      buildNotification({
        ...params,
        campaignTitle: campaign.title || params.campaignTitle,
        campaignSlug: campaign.slug || params.campaignSlug
      })
    );
  })().catch((err) => console.error('[web-push] organizer donation notify', err));
}
