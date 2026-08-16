import { Router } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { writeProfileAvatarWebp } from '../lib/processRasterUpload.js';
import {
  generateToken,
  hashPassword,
  comparePassword,
  authenticate,
  optionalAuthenticate,
  AuthRequest
} from '../lib/auth.js';
import { setAuthCookie, clearAuthCookie } from '../lib/authCookies.js';
import { env } from '../config/env.js';
import { HttpError } from '../lib/HttpError.js';
import { sendEmailVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../lib/mail.js';
import {
  closeUserAccount,
  getAccountCloseBlockers
} from '../lib/closeUserAccount.js';
import {
  loginPasswordSchema,
  newPasswordSchema
} from '../lib/passwordPolicy.js';
import { revokeUserSessions } from '../lib/revokeSessions.js';
import {
  createPasswordResetToken,
  hashPasswordResetToken
} from '../lib/passwordResetToken.js';
import {
  createEmailVerificationToken,
  emailVerificationExpiresAt,
  hashEmailVerificationToken
} from '../lib/emailVerification.js';
import { normalizeEmail } from '../lib/normalizeEmail.js';

const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: newPasswordSchema,
  fullName: z.string().min(2),
  phoneNumber: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: loginPasswordSchema
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Invalid reset link'),
  password: newPasswordSchema
});

const googleAuthSchema = z.object({
  credential: z.string().min(10, 'Missing Google credential')
});

const verifyEmailSchema = z.object({
  token: z.string().min(10, 'Invalid verification link')
});

import { serializeOwnKyc } from '../lib/userKyc.js';
import { isPlatformOwnerEmail } from '../lib/platformOwner.js';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID || undefined);

function serializeAuthUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'USER';
  adminPanelPermissions: string[];
  emailVerifiedAt?: Date | null;
  kycStatus?: import('@prisma/client').KycStatus;
  kycDocumentUrl?: string | null;
  kycSubmittedAt?: Date | null;
  kycReviewedAt?: Date | null;
  kycNotes?: string | null;
}) {
  const kyc =
    user.kycStatus != null
      ? serializeOwnKyc({
          kycStatus: user.kycStatus,
          kycDocumentUrl: user.kycDocumentUrl ?? null,
          kycSubmittedAt: user.kycSubmittedAt ?? null,
          kycReviewedAt: user.kycReviewedAt ?? null,
          kycNotes: user.kycNotes ?? null
        })
      : {
          kycStatus: 'Unverified' as const,
          hasKycDocument: false,
          kycDocumentUrl: null,
          kycSubmittedAt: null,
          kycReviewedAt: null,
          kycNotes: null
        };

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    emailVerified: user.emailVerifiedAt != null,
    adminPanelPermissions: user.role === 'ADMIN' ? user.adminPanelPermissions : undefined,
    /** True only for the OWNER_EMAIL account — can promote/demote admins. */
    isPlatformOwner: user.role === 'ADMIN' && isPlatformOwnerEmail(user.email),
    ...kyc
  };
}

const kycSelect = {
  kycStatus: true,
  kycDocumentUrl: true,
  kycSubmittedAt: true,
  kycReviewedAt: true,
  kycNotes: true
} as const;

async function issueEmailVerification(user: {
  id: string;
  email: string;
  fullName: string;
}): Promise<void> {
  const token = createEmailVerificationToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationToken: hashEmailVerificationToken(token),
      emailVerificationExpires: emailVerificationExpiresAt()
    }
  });
  const base = env.CLIENT_ORIGIN.replace(/\/$/, '');
  const verifyUrl = `${base}/verify-email?token=${encodeURIComponent(token)}`;
  void sendEmailVerificationEmail({
    to: user.email,
    fullName: user.fullName,
    verifyUrl
  });
}

function startSession(
  res: import('express').Response,
  user: { id: string; tokenVersion: number },
  body: Record<string, unknown>,
  status = 200
) {
  const token = generateToken(user.id, user.tokenVersion);
  setAuthCookie(res, token);
  res.status(status).json(body);
}

/**
 * Download the Google profile photo and store it through our own avatar
 * pipeline so we never hotlink Google URLs. Failures are non-fatal.
 */
async function importGoogleProfilePicture(pictureUrl: string | undefined): Promise<string | null> {
  if (!pictureUrl) {
    return null;
  }
  try {
    const response = await fetch(pictureUrl);
    if (!response.ok) {
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const { relativeUrl } = await writeProfileAvatarWebp(buffer);
    return relativeUrl;
  } catch (err) {
    console.error('Google profile picture import failed:', err);
    return null;
  }
}

const updateAvatarSchema = z.object({
  avatarUrl: z
    .string()
    .regex(/^\/uploads\/avatars\/[\w.-]+$/, 'Invalid profile picture')
    .nullable()
});

const closeAccountSchema = z.object({
  confirmPhrase: z.literal('CLOSE'),
  password: z.string().optional(),
  googleCredential: z.string().optional()
});

async function verifyGoogleIdForClose(credential: string): Promise<{ sub: string; email: string } | null> {
  if (!env.GOOGLE_CLIENT_ID) {
    return null;
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return null;
    }
    return { sub: payload.sub, email: payload.email.toLowerCase() };
  } catch {
    return null;
  }
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const email = normalizeEmail(body.email);

    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } }
    });

    if (existingUser) {
      res.status(409).json({ message: 'User with this email already exists' });
      return;
    }

    const hashedPassword = await hashPassword(body.password);
    const verifyToken = createEmailVerificationToken();

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        fullName: body.fullName,
        phoneNumber: body.phoneNumber,
        emailVerificationToken: hashEmailVerificationToken(verifyToken),
        emailVerificationExpires: emailVerificationExpiresAt()
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        adminPanelPermissions: true,
        tokenVersion: true,
        emailVerifiedAt: true,
        ...kycSelect
      }
    });

    const base = env.CLIENT_ORIGIN.replace(/\/$/, '');
    const verifyUrl = `${base}/verify-email?token=${encodeURIComponent(verifyToken)}`;
    void sendEmailVerificationEmail({
      to: user.email,
      fullName: user.fullName,
      verifyUrl
    });

    startSession(
      res,
      user,
      {
        user: serializeAuthUser(user),
        emailVerificationRequired: true
      },
      201
    );
  })
);

authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const body = forgotPasswordSchema.parse(req.body);
    const emailInput = normalizeEmail(body.email);

    const user = await prisma.user.findFirst({
      where: { email: { equals: emailInput, mode: 'insensitive' } }
    });

    if (user?.isActive) {
      const token = createPasswordResetToken();
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: hashPasswordResetToken(token),
          passwordResetExpires: expires
        }
      });
      const base = env.CLIENT_ORIGIN.replace(/\/$/, '');
      const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
      void sendPasswordResetEmail({
        to: user.email,
        fullName: user.fullName,
        resetUrl
      });
    }

    res.json({
      message:
        'If an account exists for that email, we have sent password reset instructions. Check your inbox.'
    });
  })
);

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const body = resetPasswordSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hashPasswordResetToken(body.token),
        passwordResetExpires: { gt: new Date() }
      }
    });

    if (!user) {
      res.status(400).json({
        message: 'This reset link is invalid or has expired. Please request a new one.'
      });
      return;
    }

    const hashed = await hashPassword(body.password);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        passwordResetToken: null,
        passwordResetExpires: null,
        tokenVersion: { increment: 1 }
      }
    });

    res.json({ message: 'Your password was updated. You can sign in with your new password.' });
  })
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const email = normalizeEmail(body.email);

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        password: true,
        isActive: true,
        adminPanelPermissions: true,
        tokenVersion: true,
        emailVerifiedAt: true,
        ...kycSelect
      }
    });

    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ message: 'Account is inactive' });
      return;
    }

    if (!user.password) {
      res.status(401).json({
        message:
          'This account uses Google sign-in. Continue with Google, or use “Forgot password” to set a password.'
      });
      return;
    }

    const passwordMatch = await comparePassword(body.password, user.password);

    if (!passwordMatch) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    startSession(res, user, {
      user: serializeAuthUser(user),
      emailVerificationRequired: user.emailVerifiedAt == null
    });
  })
);

authRouter.post(
  '/logout',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    if (req.userId) {
      await revokeUserSessions(req.userId);
    }
    clearAuthCookie(res);
    res.json({ message: 'Signed out' });
  })
);

authRouter.post(
  '/google',
  asyncHandler(async (req, res) => {
    if (!env.GOOGLE_CLIENT_ID) {
      res.status(503).json({ message: 'Google sign-in is not available right now.' });
      return;
    }

    const body = googleAuthSchema.parse(req.body);

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: body.credential,
        audience: env.GOOGLE_CLIENT_ID
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error('Google ID token verification failed:', err);
      res.status(401).json({ message: 'Google sign-in failed. Please try again.' });
      return;
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      res.status(401).json({ message: 'We could not verify your Google account email.' });
      return;
    }

    const email = normalizeEmail(payload.email);

    let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });
    let isNewUser = false;

    if (!user) {
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } }
      });

      if (existing) {
        res.status(409).json({
          message:
            'An account with this email already exists. Sign in with your email and password instead.'
        });
        return;
      }

      isNewUser = true;
      const avatarUrl = await importGoogleProfilePicture(payload.picture);
      user = await prisma.user.create({
        data: {
          email,
          fullName: payload.name?.trim() || email.split('@')[0],
          googleId: payload.sub,
          avatarUrl,
          emailVerifiedAt: new Date()
        }
      });
    } else if (!user.emailVerifiedAt) {
      // Returning Google users with verified Google email — mark verified.
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          emailVerificationToken: null,
          emailVerificationExpires: null
        }
      });
    }

    if (!user.isActive) {
      res.status(401).json({ message: 'Account is inactive' });
      return;
    }

    if (isNewUser) {
      void sendWelcomeEmail({ to: user.email, fullName: user.fullName });
    }

    startSession(res, user, {
      user: serializeAuthUser(user),
      isNewUser
    });
  })
);

authRouter.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const body = verifyEmailSchema.parse(req.body);
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: hashEmailVerificationToken(body.token),
        emailVerificationExpires: { gt: new Date() }
      }
    });

    if (!user) {
      res.status(400).json({
        message: 'This verification link is invalid or has expired. Request a new one from your account.'
      });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpires: null
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        adminPanelPermissions: true,
        tokenVersion: true,
        emailVerifiedAt: true,
        ...kycSelect
      }
    });

    void sendWelcomeEmail({ to: updated.email, fullName: updated.fullName });

    startSession(res, updated, {
      user: serializeAuthUser(updated),
      message: 'Your email is verified. Welcome to BarakahFund.'
    });
  })
);

authRouter.post(
  '/resend-verification',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        emailVerifiedAt: true,
        isActive: true
      }
    });

    if (!user || !user.isActive) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    if (user.emailVerifiedAt) {
      res.json({ message: 'Your email is already verified.', alreadyVerified: true });
      return;
    }

    await issueEmailVerification(user);

    res.json({
      message: 'If this account needs verification, we sent a new confirmation link. Check your inbox.'
    });
  })
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        createdAt: true,
        adminPanelPermissions: true,
        emailVerifiedAt: true,
        ...kycSelect
      }
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      emailVerified: user.emailVerifiedAt != null,
      adminPanelPermissions: user.role === 'ADMIN' ? user.adminPanelPermissions : undefined,
      isPlatformOwner: user.role === 'ADMIN' && isPlatformOwnerEmail(user.email),
      ...serializeOwnKyc(user)
    });
  })
);

authRouter.patch(
  '/me/avatar',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const body = updateAvatarSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { avatarUrl: body.avatarUrl },
      select: { id: true, avatarUrl: true }
    });

    // Keep organizer photos in sync on every campaign this user created.
    await prisma.campaign.updateMany({
      where: { creatorId: user.id },
      data: { creatorAvatar: body.avatarUrl }
    });

    res.json({ avatarUrl: user.avatarUrl });
  })
);

authRouter.get(
  '/me/close-account/eligibility',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const blockers = await getAccountCloseBlockers(req.userId!);
    res.json({
      canClose: blockers.length === 0,
      blockers
    });
  })
);

authRouter.post(
  '/me/close-account',
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const body = closeAccountSchema.parse(req.body);
    const blockers = await getAccountCloseBlockers(req.userId!);
    if (blockers.length > 0) {
      res.status(400).json({
        message: blockers[0],
        blockers
      });
      return;
    }

    try {
      const result = await closeUserAccount(
        req.userId!,
        {
          password: body.password,
          googleCredential: body.googleCredential
        },
        verifyGoogleIdForClose
      );
      clearAuthCookie(res);
      res.json({
        message: 'Your account has been closed.',
        campaignsClosed: result.campaignsClosed
      });
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ message: err.message });
        return;
      }
      throw err;
    }
  })
);

export { authRouter };
