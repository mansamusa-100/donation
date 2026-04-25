import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
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
        role: true
      }
    });

    const token = generateToken(user.id);

    void sendWelcomeEmail({ to: user.email, fullName: user.fullName });

    res.status(201).json({
      user,
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
      where: { email: body.email }
    });

    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ message: 'Account is inactive' });
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
        role: user.role
      },
      token
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
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json(user);
  })
);

export { authRouter };
