import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { canAccessModule } from '../services/roleCache.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

interface JwtPayload {
  userId: string;
}

export async function protect(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await User.findById(decoded.userId);
    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }
    res.status(500).json({ message: 'Authorization failed' });
  }
}

/** Restrict route to users whose role can access the given module */
export function requireModule(moduleId: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    if (!canAccessModule(req.user.role, moduleId)) {
      res.status(403).json({ message: 'You do not have access to this module' });
      return;
    }
    next();
  };
}

/** Restrict route to admin only (e.g. delete actions) */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ message: 'Only admin can perform this action' });
    return;
  }
  next();
}
