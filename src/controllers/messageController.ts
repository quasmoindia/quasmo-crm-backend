import type { Request, Response } from 'express';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { sendSms } from '../lib/twilio.js';

/** GET /api/messages?toUserId=... - thread for a user (inbox) */
export async function getThread(req: Request, res: Response): Promise<void> {
  try {
    const toUserId = req.query.toUserId as string | undefined;
    if (!toUserId) {
      res.status(400).json({ message: 'toUserId is required' });
      return;
    }
    const messages = await Message.find({
      $or: [{ toUserId: toUserId }, { fromUser: toUserId }],
    })
      .sort({ createdAt: 1 })
      .populate('fromUser', 'fullName email')
      .lean();
    res.json({ data: messages });
  } catch {
    res.status(500).json({ message: 'Failed to load messages' });
  }
}

/** POST /api/messages/send - send SMS to a user */
export async function sendMessage(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    const { toUserId, body } = req.body as { toUserId?: string; toPhone?: string; body?: string };
    if (!body?.trim()) {
      res.status(400).json({ message: 'Message body is required' });
      return;
    }
    let toPhone: string;
    let targetUserId: string | undefined;
    if (toUserId) {
      const user = await User.findById(toUserId).select('phone').lean();
      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }
      toPhone = (user as { phone?: string }).phone?.trim() || '';
      targetUserId = toUserId;
      if (!toPhone) {
        res.status(400).json({ message: 'User has no phone number. Add phone in user edit.' });
        return;
      }
    } else {
      const toPhoneParam = (req.body as { toPhone?: string }).toPhone?.trim();
      if (!toPhoneParam) {
        res.status(400).json({ message: 'toUserId or toPhone is required' });
        return;
      }
      toPhone = toPhoneParam;
    }
    const result = await sendSms(toPhone, body.trim());
    if (!result.ok) {
      res.status(400).json({ message: result.error || 'Failed to send SMS' });
      return;
    }
    const doc = await Message.create({
      fromUser: userId,
      toUserId: targetUserId,
      toPhone,
      direction: 'outbound',
      body: body.trim(),
      externalId: result.sid,
    });
    const populated = await Message.findById(doc._id)
      .populate('fromUser', 'fullName email')
      .lean();
    res.status(201).json(populated);
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Failed to send message' });
  }
}
