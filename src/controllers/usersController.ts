import type { Request, Response } from 'express';
import { User } from '../models/User.js';

export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ data: users });
  } catch {
    res.status(500).json({ message: 'Failed to list users' });
  }
}

export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    const { fullName, email, password } = req.body as {
      fullName?: string;
      email?: string;
      password?: string;
    };

    if (!fullName?.trim() || !email?.trim() || !password) {
      res.status(400).json({ message: 'Full name, email and password are required' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' });
      return;
    }

    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      res.status(409).json({ message: 'User with this email already exists' });
      return;
    }

    const user = await User.create({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password,
    });

    const safe = user.toObject() as unknown as Record<string, unknown>;
    delete safe.password;
    res.status(201).json(safe);
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Failed to create user' });
  }
}
