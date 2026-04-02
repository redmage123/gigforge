import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { loginUser, logoutUser, registerUser, RegistrationError } from '../services/auth.service';

const registerSchema = z.object({
  email:    z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name:     z.string().min(1, 'Name is required').max(255),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, name } = registerSchema.parse(req.body);
    const result = await registerUser(email, password, name);
    res.status(201).json({ data: { token: result.token, user: result.user }, error: null });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) {
        fields[issue.path.join('.')] = issue.message;
      }
      res.status(422).json({ data: null, error: 'Validation failed', fields });
      return;
    }
    if (err instanceof RegistrationError) {
      const status = err.code === 'MAX_USERS_REACHED' ? 403 : 409;
      res.status(status).json({ data: null, error: err.message });
      return;
    }
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await loginUser(email, password);

    if (!result) {
      res.status(401).json({ data: null, error: 'Invalid credentials' });
      return;
    }

    res.json({ data: { token: result.token, user: result.user }, error: null });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) {
        fields[issue.path.join('.')] = issue.message;
      }
      res.status(422).json({ data: null, error: 'Validation failed', fields });
      return;
    }
    next(err);
  }
}

export function logout(req: Request, res: Response): void {
  if (req.token) {
    logoutUser(req.token);
  }
  res.json({ data: { message: 'Logged out' } });
}
