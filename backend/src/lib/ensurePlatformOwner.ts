import bcryptjs from 'bcryptjs';
import { env } from '../config/env.js';
import { PASSWORD_MIN_LENGTH } from './passwordPolicy.js';
import { prisma } from './prisma.js';

/**
 * Ensures the platform owner ADMIN exists when OWNER_EMAIL + OWNER_PASSWORD are set.
 * Does not wipe unrelated users. Password updates only when OWNER_PASSWORD_SYNC=true.
 */
export async function ensurePlatformOwner(): Promise<void> {
  const email = env.OWNER_EMAIL.trim().toLowerCase();
  const password = env.OWNER_PASSWORD;
  const fullName = env.OWNER_FULL_NAME.trim() || 'Platform Owner';

  if (!email || !password) {
    if (env.NODE_ENV === 'production') {
      throw new Error('OWNER_EMAIL and OWNER_PASSWORD are required in production');
    }
    console.warn(
      '[owner] OWNER_EMAIL / OWNER_PASSWORD not set — skipping platform owner bootstrap (set them before production).'
    );
    return;
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`OWNER_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const hash = await bcryptjs.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        password: hash,
        fullName,
        role: 'ADMIN',
        isActive: true,
        adminPanelPermissions: []
      }
    });
    console.log(`[owner] Created platform owner admin: ${email}`);
    return;
  }

  const data: {
    role?: 'ADMIN';
    isActive?: boolean;
    accountClosedAt?: null;
    fullName?: string;
    adminPanelPermissions?: string[];
    password?: string;
    tokenVersion?: number;
  } = {};

  if (existing.role !== 'ADMIN') {
    data.role = 'ADMIN';
    data.adminPanelPermissions = [];
  }
  if (!existing.isActive || existing.accountClosedAt) {
    data.isActive = true;
    data.accountClosedAt = null;
  }
  if (fullName && existing.fullName !== fullName) {
    data.fullName = fullName;
  }
  if (env.OWNER_PASSWORD_SYNC) {
    data.password = await bcryptjs.hash(password, 10);
    data.tokenVersion = existing.tokenVersion + 1;
  }

  if (Object.keys(data).length === 0) {
    console.log(`[owner] Platform owner ready: ${email}`);
    return;
  }

  await prisma.user.update({
    where: { id: existing.id },
    data
  });

  if (env.OWNER_PASSWORD_SYNC) {
    console.log(`[owner] Synced platform owner password from env: ${email}`);
  } else if (existing.role !== 'ADMIN') {
    console.log(`[owner] Promoted existing user to platform owner admin: ${email}`);
  } else {
    console.log(`[owner] Updated platform owner account: ${email}`);
  }
}
