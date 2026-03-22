import type { Express, Request, Response } from 'express';
import mongoose from 'mongoose';
import { BankAccount } from '../models/BankAccount.js';
import { imagekit, isImageKitConfigured } from '../lib/imagekit.js';
import { validateAttachmentFile, MAX_ATTACHMENT_BYTES } from '../lib/uploadAttachment.js';

const QR_IMAGE_MIME = /^image\/(png|jpeg|pjpeg|jpg|webp|gif)$/i;

export async function listBankAccounts(req: Request, res: Response): Promise<void> {
  try {
    const activeOnly = req.query.active !== 'false';
    const filter: Record<string, unknown> = {};
    if (activeOnly) filter.isActive = true;
    const rows = await BankAccount.find(filter).sort({ sortOrder: 1, label: 1 }).lean();
    res.json({ data: rows });
  } catch (err) {
    console.error('listBankAccounts', err);
    res.status(500).json({ message: 'Failed to list bank accounts' });
  }
}

export async function createBankAccount(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!._id;
    const { label, bankName, accountNo, ifsc, branch, upiId, qrUrl, sortOrder, isActive } = req.body as Record<string, unknown>;
    if (!String(label ?? '').trim() || !String(bankName ?? '').trim() || !String(accountNo ?? '').trim() || !String(ifsc ?? '').trim()) {
      res.status(400).json({ message: 'label, bankName, accountNo, and ifsc are required' });
      return;
    }
    const doc = await BankAccount.create({
      label: String(label).trim(),
      bankName: String(bankName).trim(),
      accountNo: String(accountNo).trim(),
      ifsc: String(ifsc).trim().toUpperCase(),
      branch: String(branch ?? '').trim(),
      upiId: String(upiId ?? '').trim(),
      qrUrl: String(qrUrl ?? '').trim(),
      sortOrder: Number(sortOrder) || 0,
      isActive: isActive !== false,
      createdBy: userId,
    });
    res.status(201).json(doc);
  } catch (err) {
    const e = err as Error & { name?: string };
    if (e.name === 'ValidationError') {
      res.status(400).json({ message: e.message });
      return;
    }
    console.error('createBankAccount', err);
    res.status(500).json({ message: 'Failed to create bank account' });
  }
}

export async function updateBankAccount(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const doc = await BankAccount.findById(id);
    if (!doc) {
      res.status(404).json({ message: 'Bank account not found' });
      return;
    }
    if (body.label !== undefined) doc.label = String(body.label).trim();
    if (body.bankName !== undefined) doc.bankName = String(body.bankName).trim();
    if (body.accountNo !== undefined) doc.accountNo = String(body.accountNo).trim();
    if (body.ifsc !== undefined) doc.ifsc = String(body.ifsc).trim().toUpperCase();
    if (body.branch !== undefined) doc.branch = String(body.branch ?? '').trim();
    if (body.upiId !== undefined) doc.upiId = String(body.upiId ?? '').trim();
    if (body.qrUrl !== undefined) doc.qrUrl = String(body.qrUrl ?? '').trim();
    if (body.sortOrder !== undefined) doc.sortOrder = Number(body.sortOrder) || 0;
    if (body.isActive !== undefined) doc.isActive = Boolean(body.isActive);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('updateBankAccount', err);
    res.status(500).json({ message: 'Failed to update bank account' });
  }
}

/** Upload QR image to ImageKit; returns HTTPS URL for `qrUrl` / `bankQrUrl`. */
export async function uploadBankQrImage(req: Request, res: Response): Promise<void> {
  try {
    if (!isImageKitConfigured()) {
      res.status(503).json({ message: 'File upload is not configured' });
      return;
    }
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file?.buffer) {
      res.status(400).json({ message: 'No file uploaded. Use field name: qr.' });
      return;
    }
    const blocked = validateAttachmentFile(file);
    if (blocked) {
      res.status(400).json({ message: blocked });
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      res.status(400).json({ message: 'File too large' });
      return;
    }
    if (!QR_IMAGE_MIME.test(file.mimetype || '')) {
      res.status(400).json({ message: 'Only image files (PNG, JPG, WebP, GIF) are allowed for QR' });
      return;
    }

    const base = file.originalname?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'qr';
    const extFromName = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
    const mime = file.mimetype || '';
    const fallbackExt =
      extFromName ||
      (mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : '.jpg');
    const fileName = `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${fallbackExt}`;

    const result = await imagekit.upload({
      file: file.buffer,
      fileName,
      folder: '/crm/bank-accounts',
      useUniqueFileName: true,
    });
    const data = result as { url?: string };
    if (!data?.url) {
      res.status(500).json({ message: 'Upload failed: no URL returned' });
      return;
    }
    res.json({ url: data.url });
  } catch (err) {
    console.error('uploadBankQrImage', err);
    res.status(500).json({ message: 'Failed to upload QR image' });
  }
}

export async function deleteBankAccount(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid id' });
      return;
    }
    const r = await BankAccount.findByIdAndDelete(id);
    if (!r) {
      res.status(404).json({ message: 'Bank account not found' });
      return;
    }
    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ message: 'Failed to delete bank account' });
  }
}
