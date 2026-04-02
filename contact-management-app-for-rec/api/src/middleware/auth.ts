import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { tokenBlacklist } from '../services/auth.service';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ data: null, error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);

  if (tokenBlacklist.has(token)) {
    res.status(401).json({ data: null, error: 'Token has been revoked' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as { id: string; email: string; name: string };
    req.user = { id: payload.id, email: payload.email, name: payload.name, created_at: new Date() };
    req.token = token;
    next();
  } catch {
    res.status(401).json({ data: null, error: 'Invalid or expired token' });
  }
}
