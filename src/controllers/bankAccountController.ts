import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { BankAccount } from '../models/BankAccount.js';

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
    const { label, bankName, accountNo, ifsc, branch, sortOrder, isActive } = req.body as Record<string, unknown>;
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
    if (body.sortOrder !== undefined) doc.sortOrder = Number(body.sortOrder) || 0;
    if (body.isActive !== undefined) doc.isActive = Boolean(body.isActive);
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('updateBankAccount', err);
    res.status(500).json({ message: 'Failed to update bank account' });
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
