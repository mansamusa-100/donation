import bcryptjs from 'bcryptjs';
import { env } from '../config/env.js';
import { PASSWORD_MIN_LENGTH } from './passwordPolicy.js';
import { prisma } from './prisma.js';

/**
 * Ensures the platform owner ADMIN exists when OWNER_EMAIL + OWNER_PASSWORD are set.
 * Does not wipe unrelated users. Password updates only when OWNER_PASSWORD_SYNC=true.
 *
 * Security: never promote an existing non-admin to ADMIN without OWNER_PASSWORD_SYNC —
 * otherwise an attacker who pre-registered OWNER_EMAIL would keep their password and
 * gain full admin panels on the next boot.
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

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } }
  });

  if (!existing) {
    const hash = await bcryptjs.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        password: hash,
        fullName,
        role: 'ADMIN',
        isActive: true,
        adminPanelPermissions: [],
        emailVerifiedAt: new Date()
      }
    });
    console.log(`[owner] Created platform owner admin: ${email}`);
    return;
  }

  if (existing.role !== 'ADMIN' && !env.OWNER_PASSWORD_SYNC) {
    const message =
      `[owner] Refusing to promote existing user ${existing.email} to platform owner without ` +
      'OWNER_PASSWORD_SYNC=true. That flag resets the password from OWNER_PASSWORD so a ' +
      'pre-registered account cannot keep attacker credentials. Set OWNER_PASSWORD_SYNC=true ' +
      'for one boot, then turn it off.';
    if (env.NODE_ENV === 'production') {
      throw new Error(message);
    }
    console.error(message);
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
    email?: string;
    emailVerifiedAt?: Date;
  } = {};

  if (existing.email !== email) {
    data.email = email;
  }

  if (existing.role !== 'ADMIN') {
    data.role = 'ADMIN';
    data.adminPanelPermissions = [];
  }
  if (!existing.isActive || existing.accountClosedAt) {
    data.isActive = true;
    data.accountClosedAt = null;
  }
  if (!existing.emailVerifiedAt) {
    data.emailVerifiedAt = new Date();
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

  if (env.OWNER_PASSWORD_SYNC && existing.role !== 'ADMIN') {
    console.log(`[owner] Promoted and password-synced platform owner: ${email}`);
  } else if (env.OWNER_PASSWORD_SYNC) {
    console.log(`[owner] Synced platform owner password from env: ${email}`);
  } else if (existing.role !== 'ADMIN') {
    console.log(`[owner] Promoted existing user to platform owner admin: ${email}`);
  } else {
    console.log(`[owner] Updated platform owner account: ${email}`);
  }
}
