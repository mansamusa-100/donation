import { Router } from 'express';
import fs from 'node:fs';
import path from 'path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, AuthRequest } from '../lib/auth.js';

const uploadsRoot = path.join(process.cwd(), 'uploads');

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(uploadsRoot, 'campaign-covers');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`);
  }
});

const coverUpload = multer({
  storage: coverStorage,
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
  destination: (_req, _file, cb) => {
    const dir = path.join(uploadsRoot, 'verification-ids');
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
    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }
    res.json({ url: `/uploads/campaign-covers/${req.file.filename}` });
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
    res.json({ url: `/uploads/verification-ids/${req.file.filename}` });
  })
);
