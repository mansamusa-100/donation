import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { env } from '../config/env.js';
import { hasAdminPanelAccess, hasAnyAdminPanelAccess, type AdminPanelKey } from '../config/adminPermissions.js';
import { readAuthToken } from './authCookies.js';
import { prisma } from './prisma.js';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: 'ADMIN' | 'USER';
  /** Filled on `/api/admin` routes for ADMIN users after `attachAdminPanelContext`. */
  adminPanelPermissions?: string[];
}

export const JWT_SECRET = env.JWT_SECRET;

interface JwtPayload {
  userId: string;
  tv: number;
}

export function generateToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ userId, tv: tokenVersion }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<JwtPayload>;
    if (typeof decoded.userId !== 'string' || typeof decoded.tv !== 'number') {
      return null;
    }
    return { userId: decoded.userId, tv: decoded.tv };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, 10);
}

export async function comparePassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcryptjs.compare(password, hashedPassword);
}

async function loadAuthenticatedUser(decoded: JwtPayload): Promise<{
  id: string;
  role: 'ADMIN' | 'USER';
  adminPanelPermissions: string[];
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      tokenVersion: true,
      adminPanelPermissions: true
    }
  });

  if (!user || !user.isActive || user.tokenVersion !== decoded.tv) {
    return null;
  }

  return {
    id: user.id,
    role: user.role,
    adminPanelPermissions: user.adminPanelPermissions
  };
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = readAuthToken(req);

  if (!token) {
    res.status(401).json({ message: 'Missing authentication token' });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }

  const user = await loadAuthenticatedUser(decoded);
  if (!user) {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }

  req.userId = user.id;
  req.userRole = user.role;
  next();
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  if (req.userRole !== 'ADMIN') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }

  next();
}

/** After `requireAdmin` on admin router: loads `adminPanelPermissions` for permission checks. */
export async function attachAdminPanelContext(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (req.userRole !== 'ADMIN' || !req.userId) {
    next();
    return;
  }
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { adminPanelPermissions: true }
    });
    req.adminPanelPermissions = u?.adminPanelPermissions ?? [];
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdminPanel(permission: AdminPanelKey) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.userRole !== 'ADMIN') {
      res.status(403).json({ message: 'Admin access required' });
      return;
    }
    if (!hasAdminPanelAccess(req.userRole, req.adminPanelPermissions, permission)) {
      res.status(403).json({ message: 'You do not have permission for this area' });
      return;
    }
    next();
  };
}

export function requireAnyAdminPanel(permissions: AdminPanelKey[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.userRole !== 'ADMIN') {
      res.status(403).json({ message: 'Admin access required' });
      return;
    }
    if (!hasAnyAdminPanelAccess(req.userRole, req.adminPanelPermissions, permissions)) {
      res.status(403).json({ message: 'You do not have permission for this area' });
      return;
    }
    next();
  };
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  authenticate(req, res, () => {
    next();
  });
}

/** Sets `userId` / `userRole` when a valid Bearer token is present; otherwise continues without error. */
export async function optionalAuthenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = readAuthToken(req);

  if (!token) {
    next();
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    next();
    return;
  }

  const user = await loadAuthenticatedUser(decoded);
  if (user) {
    req.userId = user.id;
    req.userRole = user.role;
  }

  next();
}
