import type { Request, Response } from 'express';
import { User } from '../models/User.js';
import { Role } from '../models/Role.js';

export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    const data = users.map((u) => ({ ...u, role: u.role ?? '' }));
    res.json({ data });
  } catch {
    res.status(500).json({ message: 'Failed to list users' });
  }
}

export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    const { fullName, email, password, role, phone } = req.body as {
      fullName?: string;
      email?: string;
      password?: string;
      role?: string;
      phone?: string;
    };

    if (!fullName?.trim() || !email?.trim() || !password) {
      res.status(400).json({ message: 'Full name, email and password are required' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' });
      return;
    }
    let roleValue = role?.trim()?.toLowerCase() ?? 'user';
    const roleExists = await Role.exists({ name: roleValue });
    if (!roleExists) roleValue = 'user';

    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      res.status(409).json({ message: 'User with this email already exists' });
      return;
    }

    const user = await User.create({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: roleValue,
      phone: phone?.trim() || undefined,
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

export async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { fullName, role, phone } = req.body as { fullName?: string; role?: string; phone?: string };

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (fullName !== undefined && fullName.trim()) {
      user.fullName = fullName.trim();
    }
    if (phone !== undefined) {
      user.phone = phone?.trim() || undefined;
    }
    if (role !== undefined) {
      const roleValue = role?.trim()?.toLowerCase() ?? 'user';
      const roleExists = await Role.exists({ name: roleValue });
      user.role = roleExists ? roleValue : user.role ?? 'user';
    }
    await user.save();

    const safe = user.toObject() as unknown as Record<string, unknown>;
    delete safe.password;
    res.json(safe);
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Failed to update user' });
  }
}
