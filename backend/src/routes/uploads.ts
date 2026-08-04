import { Router } from 'express';
import fs from 'node:fs';
import path from 'path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, AuthRequest } from '../lib/auth.js';
import {
  convertVerificationImageFileToWebp,
  writeCampaignCoverWebp,
  writeProfileAvatarWebp
} from '../lib/processRasterUpload.js';
import { getUploadsRoot } from '../lib/uploadPaths.js';

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, or WebP images are allowed'));
    }
  }
});

const verificationStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const userId = (req as AuthRequest).userId;
    if (!userId) {
      cb(new Error('Authentication required'), '');
      return;
    }
    const dir = path.join(getUploadsRoot(), 'verification-ids', userId);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`);
  }
});

const verificationUpload = multer({
  storage: verificationStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(
      file.mimetype
    );
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, or PDF files are allowed'));
    }
  }
});

export const uploadsRouter = Router();

uploadsRouter.post(
  '/campaign-cover',
  authenticate,
  coverUpload.single('file'),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.file?.buffer) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }
    try {
      const { relativeUrl } = await writeCampaignCoverWebp(req.file.buffer);
      res.json({ url: relativeUrl });
    } catch (err) {
      console.error('Campaign cover image processing failed:', err);
      res.status(400).json({
        message: 'Could not process that image. Try another JPEG, PNG, or WebP file.'
      });
    }
  })
);

uploadsRouter.post(
  '/profile-picture',
  authenticate,
  coverUpload.single('file'),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.file?.buffer) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }
    try {
      const { relativeUrl } = await writeProfileAvatarWebp(req.file.buffer);
      res.json({ url: relativeUrl });
    } catch (err) {
      console.error('Profile picture processing failed:', err);
      res.status(400).json({
        message: 'Could not process that image. Try another JPEG, PNG, or WebP file.'
      });
    }
  })
);

uploadsRouter.post(
  '/verification-id',
  authenticate,
  verificationUpload.single('file'),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    try {
      let url: string;
      if (req.file.mimetype.startsWith('image/')) {
        const { relativeUrl } = await convertVerificationImageFileToWebp(req.file.path, userId);
        url = relativeUrl;
      } else {
        url = `/uploads/verification-ids/${userId}/${req.file.filename}`;
      }
      res.json({ url });
    } catch (err) {
      console.error('Verification document processing failed:', err);
      res.status(400).json({
        message: 'Could not process that file. Try another image or PDF.'
      });
    }
  })
);
