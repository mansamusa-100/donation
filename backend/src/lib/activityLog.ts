import { prisma } from './prisma.js';

export async function recordActivity(data: {
  type: string;
  title: string;
  detail?: string | null;
  campaignId?: string | null;
  userId?: string | null;
  actorId?: string | null;
}): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        type: data.type,
        title: data.title,
        detail: data.detail ?? null,
        campaignId: data.campaignId ?? null,
        userId: data.userId ?? null,
        actorId: data.actorId ?? null
      }
    });
  } catch (err) {
    console.error('[activityLog] Failed to record activity:', err);
  }
}
