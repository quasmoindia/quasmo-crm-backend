import type { Express, Request, Response } from 'express';
import mongoose from 'mongoose';
import { SignaturePreset } from '../models/SignaturePreset.js';
import { imagekit, isImageKitConfigured } from '../lib/imagekit.js';
import { validateAttachmentFile, MAX_ATTACHMENT_BYTES } from '../lib/uploadAttachment.js';

const SLOT_MAP = {
  stamp: 'issuerStampUrl',
  signature: 'issuerSignatureUrl',
  digitalSignature: 'issuerDigitalSignatureUrl',
} as const;

type UploadSlot = keyof typeof SLOT_MAP;

const IMG_MIME = /^image\/(png|jpeg|pjpeg|jpg|webp|gif)$/i;

export async function listSignaturePresets(req: Request, res: Response): Promise<void> {
  try {
    const activeOnly = req.query.active !== 'false';
    const filter: Record<string, unknown> = {};
    if (activeOnly) filter.isActive = true;
    const rows = await SignaturePreset.find(filter).sort({ sortOrder: 1, label: 1 }).lean();
    res.json({ data: rows });
  } catch (err) {
    console.error('listSignaturePresets', err);
    res.status(500).json({ message: 'Failed to list signature presets' });
  }
}

export async function createSignaturePreset(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!._id;
    const body = req.body as Record<string, unknown>;
    const label = String(body.label ?? '').trim();
    if (!label) {
      res.status(400).json({ message: 'label is required' });
      return;
    }
    const doc = await SignaturePreset.create({
      label,
      issuerStampUrl: String(body.issuerStampUrl ?? '').trim(),
      issuerSignatureUrl: String(body.issuerSignatureUrl ?? '').trim(),
      issuerDigitalSignatureUrl: String(body.issuerDigitalSignatureUrl ?? '').trim(),
      sortOrder: Number(body.sortOrder) || 0,
      isActive: body.isActive !== false,
      createdBy: userId,
    });
    res.status(201).json(doc);
  } catch (err) {
    const e = err as Error & { name?: string };
    if (e.name === 'ValidationError') {
      res.status(400).json({ message: e.message });
      return;
    }
    console.error('createSignaturePreset', err);
    res.status(500).json({ message: 'Failed to create signature preset' });
  }
}

export async function updateSignaturePreset(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const doc = await SignaturePreset.findById(id);
    if (!doc) {
      res.status(404).json({ message: 'Signature preset not found' });
      return;
    }
    if (body.label !== undefined) doc.label = String(body.label).trim();
    if (body.issuerStampUrl !== undefined) doc.issuerStampUrl = String(body.issuerStampUrl ?? '').trim();
    if (body.issuerSignatureUrl !== undefined) doc.issuerSignatureUrl = String(body.issuerSignatureUrl ?? '').trim();
    if (body.issuerDigitalSignatureUrl !== undefined)
      doc.issuerDigitalSignatureUrl = String(body.issuerDigitalSignatureUrl ?? '').trim();
    if (body.sortOrder !== undefined) doc.sortOrder = Number(body.sortOrder) || 0;
    if (body.isActive !== undefined) doc.isActive = Boolean(body.isActive);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('updateSignaturePreset', err);
    res.status(500).json({ message: 'Failed to update signature preset' });
  }
}

export async function deleteSignaturePreset(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid id' });
      return;
    }
    const r = await SignaturePreset.findByIdAndDelete(id);
    if (!r) {
      res.status(404).json({ message: 'Signature preset not found' });
      return;
    }
    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ message: 'Failed to delete signature preset' });
  }
}

/** Multipart: field `image` + body `slot` = stamp | signature | digitalSignature */
export async function uploadSignaturePresetImage(req: Request, res: Response): Promise<void> {
  try {
    if (!isImageKitConfigured()) {
      res.status(503).json({ message: 'File upload is not configured' });
      return;
    }
    const file = (req as Request & { file?: Express.Multer.File }).file;
    const slot = String((req.body as { slot?: string }).slot ?? '').trim() as UploadSlot;
    if (!file?.buffer) {
      res.status(400).json({ message: 'No file uploaded. Use field name: image, and form field slot.' });
      return;
    }
    if (!SLOT_MAP[slot]) {
      res.status(400).json({ message: 'slot must be stamp, signature, or digitalSignature' });
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
    if (!IMG_MIME.test(file.mimetype || '')) {
      res.status(400).json({ message: 'Only image files (PNG, JPG, WebP, GIF) are allowed' });
      return;
    }

    const base = file.originalname?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'sig';
    const extFromName = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
    const mime = file.mimetype || '';
    const fallbackExt =
      extFromName ||
      (mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : '.jpg');
    const fileName = `preset-${slot}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${fallbackExt}`;

    const result = await imagekit.upload({
      file: file.buffer,
      fileName,
      folder: '/crm/signature-presets',
      useUniqueFileName: true,
    });
    const data = result as { url?: string };
    if (!data?.url) {
      res.status(500).json({ message: 'Upload failed: no URL returned' });
      return;
    }
    res.json({ url: data.url, slot });
  } catch (err) {
    console.error('uploadSignaturePresetImage', err);
    res.status(500).json({ message: 'Failed to upload image' });
  }
}
