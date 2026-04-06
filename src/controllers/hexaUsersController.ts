import type { Request, Response } from 'express';
import { HexaUser } from '../models/HexaUser.js';

export async function listHexaUsers(_req: Request, res: Response): Promise<void> {
  try {
    const users = await HexaUser.find()
      .select('fullName email createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean();

    const data = users.map((u) => ({
      _id: String(u._id),
      fullName: u.fullName,
      email: u.email,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    res.json({ data });
  } catch {
    res.status(500).json({ message: 'Failed to list Hexa users' });
  }
}

export async function createHexaUser(req: Request, res: Response): Promise<void> {
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

    const existing = await HexaUser.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      res.status(409).json({ message: 'A Hexa user with this email already exists' });
      return;
    }

    const user = await HexaUser.create({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password,
    });

    res.status(201).json({
      _id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Failed to create Hexa user' });
  }
}
