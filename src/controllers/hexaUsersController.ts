import type { Request, Response } from 'express';
import mongoose from 'mongoose';
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

export async function updateHexaUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid user id' });
      return;
    }

    const { fullName, email, password } = req.body as {
      fullName?: string;
      email?: string;
      password?: string;
    };

    if (!fullName?.trim() || !email?.trim()) {
      res.status(400).json({ message: 'Full name and email are required' });
      return;
    }

    const user = await HexaUser.findById(id);
    if (!user) {
      res.status(404).json({ message: 'Hexa user not found' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== user.email) {
      const existing = await HexaUser.findOne({ email: normalizedEmail });
      if (existing && String(existing._id) !== String(user._id)) {
        res.status(409).json({ message: 'A Hexa user with this email already exists' });
        return;
      }
    }

    user.fullName = fullName.trim();
    user.email = normalizedEmail;

    if (password !== undefined && String(password).length > 0) {
      if (password.length < 6) {
        res.status(400).json({ message: 'Password must be at least 6 characters' });
        return;
      }
      user.password = password;
    }

    await user.save();

    res.json({
      _id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (err) {
    const error = err as Error & { name?: string; code?: number };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    if (error.code === 11000) {
      res.status(409).json({ message: 'A Hexa user with this email already exists' });
      return;
    }
    res.status(500).json({ message: 'Failed to update Hexa user' });
  }
}

export async function deleteHexaUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid user id' });
      return;
    }

    const user = await HexaUser.findByIdAndDelete(id);
    if (!user) {
      res.status(404).json({ message: 'Hexa user not found' });
      return;
    }

    res.status(204).send();
  } catch {
    res.status(500).json({ message: 'Failed to delete Hexa user' });
  }
}
