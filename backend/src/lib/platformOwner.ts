import { env } from '../config/env.js';
import type { AuthRequest } from './auth.js';
import { prisma } from './prisma.js';
import { HttpError } from './HttpError.js';

/** Normalized platform owner email from env, or empty if not configured. */
export function getPlatformOwnerEmail(): string {
  return env.OWNER_EMAIL.trim().toLowerCase();
}

export function isPlatformOwnerEmail(email: string | null | undefined): boolean {
  const owner = getPlatformOwnerEmail();
  if (!owner || !email) {
    return false;
  }
  return email.trim().toLowerCase() === owner;
}

/**
 * Throws unless the authenticated user is the OWNER_EMAIL admin.
 * Invited admins (even with full panel access) cannot pass.
 */
export async function assertPlatformOwner(req: AuthRequest): Promise<void> {
  const owner = getPlatformOwnerEmail();
  if (!owner) {
    throw new HttpError(
      503,
      'Platform owner is not configured (OWNER_EMAIL). Cannot change admin roles.'
    );
  }

  if (!req.userId) {
    throw new HttpError(401, 'Authentication required');
  }

  const me = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { email: true, role: true, isActive: true }
  });

  if (!me?.isActive || me.role !== 'ADMIN' || !isPlatformOwnerEmail(me.email)) {
    throw new HttpError(
      403,
      'Only the platform owner can promote or demote admin accounts.'
    );
  }
}
