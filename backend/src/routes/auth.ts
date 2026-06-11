import { randomBytes } from 'node:crypto';
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
  AuthRequest
} from '../lib/auth.js';
import { env } from '../config/env.js';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../lib/mail.js';

const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(2),
  phoneNumber: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Invalid reset link'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const googleAuthSchema = z.object({
  credential: z.string().min(10, 'Missing Google credential')
});

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID || undefined);

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

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email }
    });

    if (existingUser) {
      res.status(409).json({ message: 'User with this email already exists' });
      return;
    }

    const hashedPassword = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        password: hashedPassword,
        fullName: body.fullName,
        phoneNumber: body.phoneNumber
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        adminPanelPermissions: true
      }
    });

    const token = generateToken(user.id);

    void sendWelcomeEmail({ to: user.email, fullName: user.fullName });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        adminPanelPermissions: user.role === 'ADMIN' ? user.adminPanelPermissions : undefined
      },
      token
    });
  })
);

authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const body = forgotPasswordSchema.parse(req.body);
    const emailInput = body.email.trim();

    const user = await prisma.user.findFirst({
      where: { email: { equals: emailInput, mode: 'insensitive' } }
    });

    if (user?.isActive) {
      const token = randomBytes(32).toString('base64url');
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: token,
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
        passwordResetToken: body.token,
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
        passwordResetExpires: null
      }
    });

    res.json({ message: 'Your password was updated. You can sign in with your new password.' });
  })
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        password: true,
        isActive: true,
        adminPanelPermissions: true
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

    const token = generateToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        adminPanelPermissions: user.role === 'ADMIN' ? user.adminPanelPermissions : undefined
      },
      token
    });
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

    const email = payload.email.toLowerCase();

    let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });
    let isNewUser = false;

    if (!user) {
      // Auto-link: Google verified ownership of this email, so it is safe to
      // attach the Google identity to an existing email/password account.
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } }
      });

      if (existing) {
        user = await prisma.user.update({
          where: { id: existing.id },
          data: { googleId: payload.sub }
        });
      } else {
        isNewUser = true;
        const avatarUrl = await importGoogleProfilePicture(payload.picture);
        user = await prisma.user.create({
          data: {
            email,
            fullName: payload.name?.trim() || email.split('@')[0],
            googleId: payload.sub,
            avatarUrl
          }
        });
      }
    }

    if (!user.isActive) {
      res.status(401).json({ message: 'Account is inactive' });
      return;
    }

    if (isNewUser) {
      void sendWelcomeEmail({ to: user.email, fullName: user.fullName });
    }

    const token = generateToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        adminPanelPermissions: user.role === 'ADMIN' ? user.adminPanelPermissions : undefined
      },
      token,
      isNewUser
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
        adminPanelPermissions: true
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
      adminPanelPermissions: user.role === 'ADMIN' ? user.adminPanelPermissions : undefined
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

export { authRouter };
