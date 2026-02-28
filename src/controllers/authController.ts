import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { getRoleModuleIds } from '../services/roleCache.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export async function signup(req: Request, res: Response): Promise<void> {
  try {
    const { fullName, email, password } = req.body as {
      fullName?: string;
      email?: string;
      password?: string;
    };
    if (!fullName?.trim() || !email || !password) {
      res.status(400).json({ message: 'Full name, email and password are required' });
      return;
    }
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ message: 'User with this email already exists' });
      return;
    }
    const user = await User.create({ fullName: fullName.trim(), email, password });
    const roleModules = getRoleModuleIds(user.role ?? '') ?? ['*'];
    const token = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );
    res.status(201).json({
      message: 'User created successfully',
      user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role ?? '', roleModules },
      token,
    });
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Sign up failed' });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }
    const valid = await user.comparePassword(password);
    if (!valid) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }
    const roleModules = getRoleModuleIds(user.role ?? '') ?? ['*'];
    const token = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );
    res.json({
      message: 'Login successful',
      user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role ?? '', roleModules },
      token,
    });
  } catch {
    res.status(500).json({ message: 'Login failed' });
  }
}
