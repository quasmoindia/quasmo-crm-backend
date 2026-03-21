import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { Lead } from '../models/Lead.js';
import type { LeadStatus, LeadSource, LeadDocumentSentType } from '../models/Lead.js';
import { imagekit, isImageKitConfigured } from '../lib/imagekit.js';
import { validateAttachmentFile, MAX_ATTACHMENT_BYTES } from '../lib/uploadAttachment.js';
import {
  isValidGstinFormat,
  mapGstLookupResponse,
  suggestedCompanyName,
} from '../lib/gstinLookup.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const EXPORT_MAX = 10_000;
const BULK_UPLOAD_MAX = 500;

const VALID_STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'quotation_sent',
  'negotiation',
  'invoice_sent',
  'closed',
  'lost',
];
const VALID_SOURCES: LeadSource[] = ['website', 'referral', 'cold_call', 'campaign', 'other'];
const VALID_DOC_TYPES: LeadDocumentSentType[] = ['quotation', 'invoice', 'proforma', 'other'];

function normalizeLeadStatusKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Accept CSV/XLSX variants and common labels */
function toLeadStatus(s: unknown): LeadStatus {
  const raw = String(s ?? '').trim();
  if (!raw) return 'new';
  let v = normalizeLeadStatusKey(raw);
  const aliases: Record<string, LeadStatus> = {
    quote_sent: 'quotation_sent',
    invoiced: 'invoice_sent',
    won: 'closed',
  };
  if (aliases[v]) v = aliases[v]!;
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

/** Optional: set GSTIN_CHECK_API_KEY (e.g. from gstincheck.co.in). See .env.example */
export async function lookupGstin(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.query.gstin ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s/g, '');
    if (!raw) {
      res.status(400).json({ message: 'Query parameter gstin is required' });
      return;
    }
    if (!isValidGstinFormat(raw)) {
      res.status(400).json({
        message: 'GSTIN format looks invalid (expected 15-character Indian GSTIN)',
      });
      return;
    }

    const apiKey = process.env.GSTIN_CHECK_API_KEY?.trim();
    const baseUrl = (process.env.GSTIN_CHECK_BASE_URL || 'https://sheet.gstincheck.co.in/check').replace(
      /\/$/,
      ''
    );

    if (!apiKey) {
      res.status(503).json({
        message:
          'GST lookup is not configured on the server. Add GSTIN_CHECK_API_KEY to the backend .env (free key from gstincheck.co.in or your provider).',
        configured: false,
      });
      return;
    }

    const url = `${baseUrl}/${encodeURIComponent(apiKey)}/${encodeURIComponent(raw)}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);

    let providerRes: globalThis.Response;
    try {
      providerRes = await fetch(url, {
        signal: ac.signal,
        headers: { Accept: 'application/json' },
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e instanceof Error && e.name === 'AbortError';
      res.status(502).json({
        message: aborted ? 'GST lookup request timed out' : 'Could not reach GST lookup service',
      });
      return;
    }
    clearTimeout(timer);

    const body: unknown = await providerRes.json().catch(() => ({}));
    const bodyObj = body as Record<string, unknown>;

    if (!providerRes.ok) {
      const msg =
        typeof bodyObj.message === 'string'
          ? bodyObj.message
          : typeof bodyObj.error === 'string'
            ? bodyObj.error
            : 'GST lookup provider returned an error';
      res.status(
        providerRes.status >= 400 && providerRes.status < 600 ? providerRes.status : 502
      ).json({
        message: msg,
        configured: true,
      });
      return;
    }

    const mapped = mapGstLookupResponse(body);
    const company = suggestedCompanyName(mapped);

    res.json({
      configured: true,
      gstin: raw,
      legalName: mapped.legalName,
      tradeName: mapped.tradeName,
      company: company ?? mapped.tradeName ?? mapped.legalName,
      address: mapped.address,
      status: mapped.status,
      warning:
        !company && !mapped.address
          ? 'Lookup succeeded but business name/address could not be read. Your provider may use a different JSON format — contact support or paste details manually.'
          : undefined,
    });
  } catch (err) {
    console.error('lookupGstin', err);
    res.status(500).json({ message: 'GST lookup failed' });
  }
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
        { address: { $regex: search, $options: 'i' } },
        { gstNumber: { $regex: search, $options: 'i' } },
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
      address,
      gstNumber,
      status,
      source,
      notes,
      assignedTo,
    } = req.body as {
      name?: string;
      phone?: string;
      email?: string;
      company?: string;
      address?: string;
      gstNumber?: string;
      status?: LeadStatus;
      source?: LeadSource;
      notes?: string;
      assignedTo?: string;
    };

    if (!name?.trim() || !phone?.trim()) {
      res.status(400).json({ message: 'Name and phone are required' });
      return;
    }

    const st = toLeadStatus(status ?? 'new');

    const lead = await Lead.create({
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim(),
      company: company?.trim(),
      address: address?.trim() || undefined,
      gstNumber: gstNumber?.trim() || undefined,
      status: st,
      source: source?.trim() || undefined,
      notes: notes?.trim(),
      assignedTo: assignedTo || undefined,
      createdBy: userId,
    });

    await lead.populate('assignedTo', 'fullName email');
    await lead.populate('createdBy', 'fullName email');
    await lead.populate('documentsSent.sentBy', 'fullName email');
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
      .populate('documentsSent.sentBy', 'fullName email')
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
      address,
      gstNumber,
      status,
      source,
      notes,
      assignedTo,
    } = req.body as {
      name?: string;
      phone?: string;
      email?: string;
      company?: string;
      address?: string;
      gstNumber?: string;
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
    if (address !== undefined) lead.address = String(address).trim() || undefined;
    if (gstNumber !== undefined) lead.gstNumber = gstNumber?.trim() || undefined;
    if (status !== undefined) lead.status = toLeadStatus(status);
    if (source !== undefined) lead.source = toLeadSource(source) ?? undefined;
    if (notes !== undefined) lead.notes = notes?.trim() || undefined;
    if (assignedTo !== undefined) lead.assignedTo = assignedTo ? (assignedTo as unknown as mongoose.Types.ObjectId) : undefined;

    await lead.save();
    await lead.populate('assignedTo', 'fullName email');
    await lead.populate('createdBy', 'fullName email');
    await lead.populate('documentsSent.sentBy', 'fullName email');
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

export async function addLeadDocument(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { type, reference, amount, notes } = req.body as {
      type?: string;
      reference?: string;
      amount?: string;
      notes?: string;
    };

    const t = String(type ?? '').trim().toLowerCase() as LeadDocumentSentType;
    if (!VALID_DOC_TYPES.includes(t)) {
      res.status(400).json({ message: 'Invalid type. Use quotation, invoice, proforma, or other.' });
      return;
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      res.status(404).json({ message: 'Lead not found' });
      return;
    }

    if (!lead.documentsSent) lead.documentsSent = [];
    lead.documentsSent.push({
      type: t,
      reference: reference?.trim() || undefined,
      amount: amount?.trim() || undefined,
      notes: notes?.trim() || undefined,
      sentAt: new Date(),
      sentBy: req.user!._id,
    });

    await lead.save();
    await lead.populate('assignedTo', 'fullName email');
    await lead.populate('createdBy', 'fullName email');
    await lead.populate('documentsSent.sentBy', 'fullName email');
    res.status(201).json(lead);
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    console.error('addLeadDocument error:', err);
    res.status(500).json({ message: 'Failed to log document' });
  }
}

const MAX_LEAD_FILES_PER_UPLOAD = 10;

export async function uploadLeadAttachments(req: Request, res: Response): Promise<void> {
  try {
    if (!isImageKitConfigured()) {
      res.status(503).json({ message: 'File upload is not configured' });
      return;
    }

    const { id } = req.params;
    const lead = await Lead.findById(id);
    if (!lead) {
      res.status(404).json({ message: 'Lead not found' });
      return;
    }

    const files = (req as Request & { files?: Express.Multer.File[] }).files;
    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ message: 'No files uploaded. Use field name "files".' });
      return;
    }
    if (files.length > MAX_LEAD_FILES_PER_UPLOAD) {
      res.status(400).json({ message: `Maximum ${MAX_LEAD_FILES_PER_UPLOAD} files per upload` });
      return;
    }

    const urls: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!file.buffer) {
        errors.push(`${file.originalname}: no file data`);
        continue;
      }
      const blocked = validateAttachmentFile(file);
      if (blocked) {
        errors.push(blocked);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        errors.push(`${file.originalname}: file too large (max ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB)`);
        continue;
      }

      const base = file.originalname?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
      const extFromName = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
      const mime = file.mimetype || '';
      const fallbackExt =
        extFromName ||
        (mime === 'application/pdf'
          ? '.pdf'
          : mime.startsWith('image/')
            ? '.jpg'
            : '');
      const fileName = `leads/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}${fallbackExt}`;

      try {
        const result = await imagekit.upload({
          file: file.buffer,
          fileName,
          folder: '/crm/leads',
          useUniqueFileName: true,
        });
        const data = result as { url?: string };
        if (data?.url) urls.push(data.url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        errors.push(`${file.originalname}: ${msg}`);
      }
    }

    if (urls.length > 0) {
      lead.attachments = lead.attachments ?? [];
      lead.attachments.push(...urls);
      await lead.save();
    }

    res.status(201).json({
      uploaded: urls.length,
      failed: errors.length,
      urls,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error('Upload lead attachments error:', err);
    res.status(500).json({ message: 'Failed to upload files' });
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
      const address = getCell(row, 'address', 'Address', 'registered_address') || undefined;
      const gstNumber = getCell(row, 'gstNumber', 'gst', 'GST', 'GSTIN', 'gst_number') || undefined;
      const status = toLeadStatus(row.status ?? row.Status);
      const source = toLeadSource(row.source ?? row.Source);
      const notes = getCell(row, 'notes', 'Notes') || undefined;

      try {
        await Lead.create({
          name,
          phone,
          email,
          company,
          address,
          gstNumber,
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
        { address: { $regex: search, $options: 'i' } },
        { gstNumber: { $regex: search, $options: 'i' } },
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
      address: String(l.address ?? ''),
      gstNumber: String(l.gstNumber ?? ''),
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

    const header = [
      'name',
      'phone',
      'email',
      'company',
      'address',
      'gstNumber',
      'status',
      'source',
      'notes',
      'assignedTo',
      'createdAt',
    ];
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
