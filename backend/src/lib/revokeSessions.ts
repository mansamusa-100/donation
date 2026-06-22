import { prisma } from './prisma.js';

/** Invalidate all outstanding JWTs for a user by bumping `tokenVersion`. */
export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } }
  });
}
