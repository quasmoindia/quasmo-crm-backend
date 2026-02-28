import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { Lead } from '../models/Lead.js';
import type { LeadStatus, LeadSource } from '../models/Lead.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const EXPORT_MAX = 10_000;
const BULK_UPLOAD_MAX = 500;

const VALID_STATUSES: LeadStatus[] = ['new', 'contacted', 'proposal', 'closed'];
const VALID_SOURCES: LeadSource[] = ['website', 'referral', 'cold_call', 'campaign', 'other'];

function toLeadStatus(s: unknown): LeadStatus {
  const v = String(s ?? '').trim().toLowerCase();
  return VALID_STATUSES.includes(v as LeadStatus) ? (v as LeadStatus) : 'new';
}

function toLeadSource(s: unknown): LeadSource | undefined {
  const v = String(s ?? '').trim().toLowerCase();
  return VALID_SOURCES.includes(v as LeadSource) ? (v as LeadSource) : undefined;
}

function getCell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  const lower = (key: string) => key.toLowerCase();
  for (const key of Object.keys(row)) {
    for (const k of keys) {
      if (lower(key) === lower(k)) {
        const v = row[key];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
    }
  }
  return '';
}

export async function listLeads(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || DEFAULT_PAGE);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_LIMIT));
    const status = req.query.status as LeadStatus | undefined;
    const assignedTo = req.query.assignedTo as string | undefined;
    const search = (req.query.search as string)?.trim();

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      Lead.find(filter)
        .populate('assignedTo', 'fullName email')
        .populate('createdBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Lead.countDocuments(filter),
    ]);

    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch {
    res.status(500).json({ message: 'Failed to list leads' });
  }
}

export async function createLead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!._id;
    const {
      name,
      phone,
      email,
      company,
      status,
      source,
      notes,
      assignedTo,
    } = req.body as {
      name?: string;
      phone?: string;
      email?: string;
      company?: string;
      status?: LeadStatus;
      source?: LeadSource;
      notes?: string;
      assignedTo?: string;
    };

    if (!name?.trim() || !phone?.trim()) {
      res.status(400).json({ message: 'Name and phone are required' });
      return;
    }

    const lead = await Lead.create({
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim(),
      company: company?.trim(),
      status: status ?? 'new',
      source: source?.trim() || undefined,
      notes: notes?.trim(),
      assignedTo: assignedTo || undefined,
      createdBy: userId,
    });

    await lead.populate('assignedTo', 'fullName email');
    await lead.populate('createdBy', 'fullName email');
    res.status(201).json(lead);
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Failed to create lead' });
  }
}

export async function getLeadById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const lead = await Lead.findById(id)
      .populate('assignedTo', 'fullName email')
      .populate('createdBy', 'fullName email')
      .lean();
    if (!lead) {
      res.status(404).json({ message: 'Lead not found' });
      return;
    }
    res.json(lead);
  } catch {
    res.status(500).json({ message: 'Failed to get lead' });
  }
}

export async function updateLead(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      email,
      company,
      status,
      source,
      notes,
      assignedTo,
    } = req.body as {
      name?: string;
      phone?: string;
      email?: string;
      company?: string;
      status?: LeadStatus;
      source?: LeadSource;
      notes?: string;
      assignedTo?: string | null;
    };

    const lead = await Lead.findById(id);
    if (!lead) {
      res.status(404).json({ message: 'Lead not found' });
      return;
    }

    if (name !== undefined) lead.name = name.trim();
    if (phone !== undefined) lead.phone = phone.trim();
    if (email !== undefined) lead.email = email?.trim() || undefined;
    if (company !== undefined) lead.company = company?.trim() || undefined;
    if (status !== undefined) lead.status = status;
    if (source !== undefined) lead.source = toLeadSource(source) ?? undefined;
    if (notes !== undefined) lead.notes = notes?.trim() || undefined;
    if (assignedTo !== undefined) lead.assignedTo = assignedTo ? (assignedTo as unknown as mongoose.Types.ObjectId) : undefined;

    await lead.save();
    await lead.populate('assignedTo', 'fullName email');
    await lead.populate('createdBy', 'fullName email');
    res.json(lead);
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Failed to update lead' });
  }
}

export async function listAssignableUsers(req: Request, res: Response): Promise<void> {
  try {
    const { User } = await import('../models/User.js');
    const users = await User.find()
      .select('_id fullName email')
      .sort({ fullName: 1 })
      .lean();
    res.json({ data: users });
  } catch {
    res.status(500).json({ message: 'Failed to list users' });
  }
}

export async function deleteLead(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const lead = await Lead.findByIdAndDelete(id);
    if (!lead) {
      res.status(404).json({ message: 'Lead not found' });
      return;
    }
    res.json({ message: 'Lead deleted' });
  } catch {
    res.status(500).json({ message: 'Failed to delete lead' });
  }
}

type BulkRow = Record<string, unknown>;

function rowsFromCsv(buffer: Buffer): BulkRow[] {
  const text = buffer.toString('utf-8');
  const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  return Array.isArray(rows) ? (rows as BulkRow[]) : [];
}

function rowsFromXlsx(buffer: Buffer): BulkRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const sheet = wb.Sheets[first];
  return (XLSX.utils.sheet_to_json(sheet, { defval: '' }) as BulkRow[]) || [];
}

export async function bulkUploadLeads(req: Request, res: Response): Promise<void> {
  try {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file?.buffer) {
      res.status(400).json({ message: 'No file uploaded. Use field name "file" and upload a CSV or XLSX file.' });
      return;
    }

    const ext = (file.originalname || '').toLowerCase().split('.').pop();
    let rows: BulkRow[];
    if (ext === 'csv') {
      rows = rowsFromCsv(file.buffer);
    } else if (ext === 'xlsx' || ext === 'xls') {
      rows = rowsFromXlsx(file.buffer);
    } else {
      res.status(400).json({ message: 'Unsupported format. Use .csv or .xlsx' });
      return;
    }

    if (rows.length === 0) {
      res.status(400).json({ message: 'File has no data rows.' });
      return;
    }
    if (rows.length > BULK_UPLOAD_MAX) {
      res.status(400).json({ message: `Maximum ${BULK_UPLOAD_MAX} rows per file.` });
      return;
    }

    const userId = req.user!._id;
    let createdCount = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 2; // 1-based + header
      const name = getCell(row, 'name', 'Name');
      const phone = getCell(row, 'phone', 'Phone');
      if (!name || !phone) {
        errors.push({ row: rowNum, message: 'Name and phone are required' });
        continue;
      }
      const email = getCell(row, 'email', 'Email') || undefined;
      const company = getCell(row, 'company', 'Company') || undefined;
      const status = toLeadStatus(row.status ?? row.Status);
      const source = toLeadSource(row.source ?? row.Source);
      const notes = getCell(row, 'notes', 'Notes') || undefined;

      try {
        await Lead.create({
          name,
          phone,
          email,
          company,
          status,
          source,
          notes,
          createdBy: userId,
        });
        createdCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Validation failed';
        errors.push({ row: rowNum, message: msg });
      }
    }

    res.status(201).json({
      created: createdCount,
      failed: errors.length,
      errors: errors.slice(0, 50),
    });
  } catch (err) {
    console.error('Bulk upload error:', err);
    res.status(500).json({ message: 'Bulk upload failed' });
  }
}

export async function exportLeads(req: Request, res: Response): Promise<void> {
  try {
    const format = (req.query.format as string)?.toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
    const status = req.query.status as LeadStatus | undefined;
    const assignedTo = req.query.assignedTo as string | undefined;
    const search = (req.query.search as string)?.trim();

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
      ];
    }

    const leads = await Lead.find(filter)
      .populate('assignedTo', 'fullName')
      .sort({ createdAt: -1 })
      .limit(EXPORT_MAX)
      .lean();

    const rows: Record<string, string>[] = leads.map((l: Record<string, unknown>) => ({
      name: String(l.name ?? ''),
      phone: String(l.phone ?? ''),
      email: String(l.email ?? ''),
      company: String(l.company ?? ''),
      status: String(l.status ?? ''),
      source: String(l.source ?? ''),
      notes: String(l.notes ?? ''),
      assignedTo: (l.assignedTo as { fullName?: string } | null)?.fullName ?? '',
      createdAt: l.createdAt ? new Date(l.createdAt as Date).toISOString() : '',
    }));

    const filename = `leads_export_${Date.now()}.${format}`;

    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leads');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buf);
      return;
    }

    const header = ['name', 'phone', 'email', 'company', 'status', 'source', 'notes', 'assignedTo', 'createdAt'];
    const escape = (v: string) => {
      const s = String(v ?? '');
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csvLines = [header.join(','), ...rows.map((r) => header.map((h) => escape(r[h])).join(','))];
    const csv = csvLines.join('\r\n');

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ message: 'Export failed' });
  }
}
