import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { getRoleModuleIds } from '../services/roleCache.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/** Normalize Indian phone for lookup: +91/91/0 prefix stripped, digits only (10-digit Indian mobile). */
function normalizePhone(phone: string): string {
  let s = (phone || '').trim().replace(/[\s\-]/g, '');
  s = s.replace(/^\+91/, '').replace(/^91(?=\d{10})/, '').replace(/^0/, '');
  return s.replace(/\D/g, '');
}

const INDIAN_MOBILE_LENGTH = 10;

function isValidIndianPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return normalized.length === INDIAN_MOBILE_LENGTH && /^\d+$/.test(normalized);
}

export async function signup(req: Request, res: Response): Promise<void> {
  try {
    const { fullName, email, password, phone } = req.body as {
      fullName?: string;
      email?: string;
      password?: string;
      phone?: string;
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
    const user = await User.create({
      fullName: fullName.trim(),
      email,
      password,
      phone: phone?.trim() || undefined,
    });
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

/** Static OTP for development; no SMS service. */
const STATIC_OTP = '0000';

async function findUserByPhone(phone: string): Promise<InstanceType<typeof User> | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const users = await User.find({ phone: { $exists: true, $ne: '' } }).lean();
  const match = users.find((u) => u.phone && normalizePhone(u.phone) === normalized);
  return match ? User.findById(match._id) : null;
}

export async function requestOtp(req: Request, res: Response): Promise<void> {
  try {
    const { phone } = req.body as { phone?: string };
    const raw = (phone ?? '').trim();
    if (!raw) {
      res.status(400).json({ message: 'Phone number is required' });
      return;
    }
    if (!isValidIndianPhone(raw)) {
      res.status(400).json({ message: 'Enter a valid 10-digit Indian mobile number' });
      return;
    }
    const user = await findUserByPhone(raw);
    if (!user) {
      res.status(404).json({ message: 'No account found with this phone number' });
      return;
    }
    res.json({ message: 'OTP sent. For testing use OTP: 0000' });
  } catch {
    res.status(500).json({ message: 'Failed to send OTP' });
  }
}

export async function loginWithOtp(req: Request, res: Response): Promise<void> {
  try {
    const { phone, otp } = req.body as { phone?: string; otp?: string };
    const raw = (phone ?? '').trim();
    if (!raw) {
      res.status(400).json({ message: 'Phone number is required' });
      return;
    }
    if (!isValidIndianPhone(raw)) {
      res.status(400).json({ message: 'Enter a valid 10-digit Indian mobile number' });
      return;
    }
    if (!otp || otp.trim() !== STATIC_OTP) {
      res.status(401).json({ message: 'Invalid OTP' });
      return;
    }
    const user = await findUserByPhone(raw);
    if (!user) {
      res.status(401).json({ message: 'No account found with this phone number' });
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
