import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { TaxInvoice } from '../models/TaxInvoice.js';
import type { ITaxInvoiceLineItem } from '../models/TaxInvoice.js';
import { TAX_DOCUMENT_KINDS, type TaxDocumentKind } from '../models/taxDocumentKinds.js';
import { buildTaxInvoiceHtml } from '../lib/taxInvoiceHtml.js';
import { computeTotals, defaultAmountInWords } from '../lib/taxInvoiceTotals.js';
import { effectiveGstRate } from '../lib/taxInvoiceGst.js';
import { renderInvoicePdf } from '../lib/renderInvoicePdf.js';
import { imagekit, isImageKitConfigured } from '../lib/imagekit.js';
import { validateAttachmentFile, MAX_ATTACHMENT_BYTES } from '../lib/uploadAttachment.js';

function toDocumentKind(v: unknown): TaxDocumentKind {
  const s = String(v ?? 'tax_invoice').trim().toLowerCase().replace(/-/g, '_');
  if ((TAX_DOCUMENT_KINDS as readonly string[]).includes(s)) return s as TaxDocumentKind;
  return 'tax_invoice';
}

function normUrl(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  return s || undefined;
}

function pdfFilename(kind: string | undefined, invoiceNo: string): string {
  const safe = String(invoiceNo).replace(/[^\w.-]+/g, '_');
  switch (kind) {
    case 'proforma':
      return `Proforma_${safe}.pdf`;
    case 'quotation':
      return `Quotation_${safe}.pdf`;
    default:
      return `Tax_Invoice_${safe}.pdf`;
  }
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function normalizeItems(raw: unknown): ITaxInvoiceLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const qty = Number(r.qty) || 0;
    const price = Number(r.price) || 0;
    const amountRaw = r.amount;
    const amount =
      amountRaw !== undefined && amountRaw !== null && amountRaw !== ''
        ? Number(amountRaw)
        : undefined;
    return {
      description: String(r.description ?? '').trim(),
      hsnSac: String(r.hsnSac ?? '').trim(),
      qty,
      unit: String(r.unit ?? 'Pcs.').trim() || 'Pcs.',
      price,
      amount: Number.isFinite(amount!) ? amount : undefined,
    };
  });
}

function applyComputedFields(body: Record<string, unknown>) {
  const items = normalizeItems(body.items);
  const gstRate = Math.min(100, Math.max(0, Number(body.gstRate ?? body.igstRate) || 0));
  const totals = computeTotals(items, gstRate);
  const amountInWords =
    typeof body.amountInWords === 'string' && body.amountInWords.trim()
      ? String(body.amountInWords).trim()
      : defaultAmountInWords(totals.grandTotal);

  return {
    items,
    gstRate,
    gstAmount: totals.gstAmount,
    igstRate: gstRate,
    igstAmount: totals.gstAmount,
    taxableTotal: totals.taxableTotal,
    grandTotal: totals.grandTotal,
    quantityTotal: totals.quantityTotal,
    amountInWords,
  };
}

export async function listTaxInvoices(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || DEFAULT_PAGE);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_LIMIT));
    const search = (req.query.search as string)?.trim();
    const leadIdQ = (req.query.leadId as string)?.trim();

    const filter: Record<string, unknown> = {};
    if (leadIdQ) {
      if (!mongoose.Types.ObjectId.isValid(leadIdQ)) {
        res.status(400).json({ message: 'Invalid leadId' });
        return;
      }
      filter.leadId = new mongoose.Types.ObjectId(leadIdQ);
    }
    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: 'i' } },
        { billedToName: { $regex: search, $options: 'i' } },
        { contractNo: { $regex: search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      TaxInvoice.find(filter)
        .populate('createdBy', 'fullName email')
        .populate('leadId', 'name phone company address')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TaxInvoice.countDocuments(filter),
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
  } catch (err) {
    console.error('listTaxInvoices', err);
    res.status(500).json({ message: 'Failed to list invoices' });
  }
}

export async function getTaxInvoiceById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await TaxInvoice.findById(id)
      .populate('createdBy', 'fullName email')
      .populate('leadId', 'name phone company address gstNumber email')
      .lean();
    if (!doc) {
      res.status(404).json({ message: 'Invoice not found' });
      return;
    }
    res.json(doc);
  } catch {
    res.status(500).json({ message: 'Failed to get invoice' });
  }
}

export async function getTaxInvoicePreview(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await TaxInvoice.findById(id).lean();
    if (!doc) {
      res.status(404).json({ message: 'Invoice not found' });
      return;
    }
    const html = buildTaxInvoiceHtml(doc as Parameters<typeof buildTaxInvoiceHtml>[0]);
    res.json({ html });
  } catch (err) {
    console.error('getTaxInvoicePreview', err);
    res.status(500).json({ message: 'Failed to build preview' });
  }
}

export async function getTaxInvoicePdf(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await TaxInvoice.findById(id).lean();
    if (!doc) {
      res.status(404).json({ message: 'Invoice not found' });
      return;
    }
    const html = buildTaxInvoiceHtml(doc as Parameters<typeof buildTaxInvoiceHtml>[0]);
    let pdf: Buffer;
    try {
      pdf = await renderInvoicePdf(html);
    } catch (e) {
      console.error('PDF render error', e);
      res.status(503).json({
        message:
          'PDF engine unavailable. Ensure Chromium is installed (npm install puppeteer) or set PUPPETEER_EXECUTABLE_PATH.',
      });
      return;
    }

    const filename = pdfFilename(doc.documentKind as string | undefined, String(doc.invoiceNo));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    console.error('getTaxInvoicePdf', err);
    res.status(500).json({ message: 'Failed to generate PDF' });
  }
}

export async function createTaxInvoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!._id;
    const body = req.body as Record<string, unknown>;

    const invoiceNo = String(body.invoiceNo ?? '').trim();
    if (!invoiceNo) {
      res.status(400).json({ message: 'invoiceNo is required' });
      return;
    }

    const invoiceDate = body.invoiceDate ? new Date(String(body.invoiceDate)) : new Date();
    if (Number.isNaN(invoiceDate.getTime())) {
      res.status(400).json({ message: 'Invalid invoiceDate' });
      return;
    }

    const computed = applyComputedFields({
      ...body,
      items: body.items,
      gstRate: body.gstRate ?? body.igstRate,
    });

    const dup = await TaxInvoice.findOne({ invoiceNo }).lean();
    if (dup) {
      res.status(409).json({ message: 'An invoice with this number already exists' });
      return;
    }

    const leadIdRaw = body.leadId;
    const leadId =
      leadIdRaw && String(leadIdRaw).trim()
        ? new mongoose.Types.ObjectId(String(leadIdRaw).trim())
        : undefined;

    let bankAccountId: mongoose.Types.ObjectId | undefined;
    const bankRaw = body.bankAccountId;
    if (bankRaw && String(bankRaw).trim()) {
      bankAccountId = new mongoose.Types.ObjectId(String(bankRaw).trim());
    }

    const doc = await TaxInvoice.create({
      leadId,
      documentKind: toDocumentKind(body.documentKind),
      bankAccountId,
      sellerGstin: body.sellerGstin,
      sellerName: body.sellerName,
      sellerAddress: body.sellerAddress,
      sellerPhones: Array.isArray(body.sellerPhones) ? body.sellerPhones : undefined,
      sellerEmails: Array.isArray(body.sellerEmails) ? body.sellerEmails : undefined,
      copyLabel: body.copyLabel,
      invoiceNo,
      invoiceDate,
      placeOfSupply: body.placeOfSupply,
      reverseCharge: body.reverseCharge,
      transport: body.transport,
      vehicleNo: body.vehicleNo,
      station: body.station,
      ewayBillNo: body.ewayBillNo,
      dateOfRemoval: body.dateOfRemoval,
      freight: body.freight,
      billedToName: body.billedToName,
      billedToAddress: body.billedToAddress,
      billedToGstin: body.billedToGstin,
      shippedToName: body.shippedToName,
      shippedToAddress: body.shippedToAddress,
      shippedToContact: body.shippedToContact,
      shippedToGstin: body.shippedToGstin,
      contractNo: body.contractNo,
      items: computed.items.filter((i) => i.description || i.qty > 0 || i.price > 0),
      gstRate: computed.gstRate,
      gstAmount: computed.gstAmount,
      igstRate: computed.igstRate,
      igstAmount: computed.igstAmount,
      bankName: body.bankName,
      bankAccountNo: body.bankAccountNo,
      bankIfsc: body.bankIfsc,
      bankBranch: body.bankBranch,
      termsAndConditions: body.termsAndConditions,
      amountInWords: computed.amountInWords,
      taxableTotal: computed.taxableTotal,
      grandTotal: computed.grandTotal,
      quantityTotal: computed.quantityTotal,
      issuerSignatureUrl: normUrl(body.issuerSignatureUrl),
      issuerStampUrl: normUrl(body.issuerStampUrl),
      issuerDigitalSignatureUrl: normUrl(body.issuerDigitalSignatureUrl),
      createdBy: userId,
    });

    await doc.populate('createdBy', 'fullName email');
    await doc.populate('leadId', 'name phone company address');
    res.status(201).json(doc);
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    console.error('createTaxInvoice', err);
    res.status(500).json({ message: 'Failed to create invoice' });
  }
}

export async function updateTaxInvoice(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    const doc = await TaxInvoice.findById(id);
    if (!doc) {
      res.status(404).json({ message: 'Invoice not found' });
      return;
    }

    if (body.invoiceNo !== undefined) {
      const nextNo = String(body.invoiceNo).trim();
      if (!nextNo) {
        res.status(400).json({ message: 'invoiceNo cannot be empty' });
        return;
      }
      const dup = await TaxInvoice.findOne({ invoiceNo: nextNo, _id: { $ne: doc._id } }).lean();
      if (dup) {
        res.status(409).json({ message: 'Another invoice already uses this number' });
        return;
      }
      doc.invoiceNo = nextNo;
    }

    if (body.invoiceDate !== undefined) {
      const d = new Date(String(body.invoiceDate));
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ message: 'Invalid invoiceDate' });
        return;
      }
      doc.invoiceDate = d;
    }

    const mergeItems =
      body.items !== undefined ? normalizeItems(body.items) : (doc.items as ITaxInvoiceLineItem[]);
    const mergeRate =
      body.gstRate !== undefined || body.igstRate !== undefined
        ? Number(body.gstRate ?? body.igstRate)
        : effectiveGstRate(doc);
    const computed = applyComputedFields({
      items: mergeItems,
      gstRate: mergeRate,
      amountInWords: body.amountInWords !== undefined ? body.amountInWords : doc.amountInWords,
    });

    const stringFields = [
      'sellerGstin',
      'sellerName',
      'sellerAddress',
      'copyLabel',
      'placeOfSupply',
      'reverseCharge',
      'transport',
      'vehicleNo',
      'station',
      'ewayBillNo',
      'dateOfRemoval',
      'freight',
      'billedToName',
      'billedToAddress',
      'billedToGstin',
      'shippedToName',
      'shippedToAddress',
      'shippedToContact',
      'shippedToGstin',
      'contractNo',
      'bankName',
      'bankAccountNo',
      'bankIfsc',
      'bankBranch',
      'termsAndConditions',
      'issuerSignatureUrl',
      'issuerStampUrl',
      'issuerDigitalSignatureUrl',
    ] as const;

    for (const k of stringFields) {
      if (body[k] !== undefined) (doc as unknown as Record<string, unknown>)[k] = body[k];
    }
    if (body.sellerPhones !== undefined) doc.sellerPhones = body.sellerPhones as string[];
    if (body.sellerEmails !== undefined) doc.sellerEmails = body.sellerEmails as string[];
    if (body.leadId !== undefined) {
      const v = body.leadId;
      if (v === null || v === '') {
        doc.set('leadId', null);
      } else if (v) {
        doc.leadId = new mongoose.Types.ObjectId(String(v).trim()) as never;
      }
    }

    if (body.documentKind !== undefined) {
      doc.documentKind = toDocumentKind(body.documentKind);
    }

    if (body.bankAccountId !== undefined) {
      const b = body.bankAccountId;
      if (b === null || b === '') {
        doc.set('bankAccountId', null);
      } else if (b) {
        doc.bankAccountId = new mongoose.Types.ObjectId(String(b).trim()) as never;
      }
    }

    doc.items = computed.items.filter((i) => i.description || i.qty > 0 || i.price > 0);
    doc.gstRate = computed.gstRate;
    doc.gstAmount = computed.gstAmount;
    doc.igstRate = computed.igstRate;
    doc.igstAmount = computed.igstAmount;
    doc.taxableTotal = computed.taxableTotal;
    doc.grandTotal = computed.grandTotal;
    doc.quantityTotal = computed.quantityTotal;
    doc.amountInWords = computed.amountInWords;

    await doc.save();
    await doc.populate('createdBy', 'fullName email');
    await doc.populate('leadId', 'name phone company address');
    res.json(doc);
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
      return;
    }
    console.error('updateTaxInvoice', err);
    res.status(500).json({ message: 'Failed to update invoice' });
  }
}

const SIG_FIELD_MAP = {
  signature: 'issuerSignatureUrl',
  stamp: 'issuerStampUrl',
  digitalSignature: 'issuerDigitalSignatureUrl',
} as const;

export async function uploadTaxInvoiceSignatures(req: Request, res: Response): Promise<void> {
  try {
    if (!isImageKitConfigured()) {
      res.status(503).json({ message: 'File upload is not configured' });
      return;
    }

    const { id } = req.params;
    const invoice = await TaxInvoice.findById(id);
    if (!invoice) {
      res.status(404).json({ message: 'Invoice not found' });
      return;
    }

    const fileMap = (req as Request & { files?: Record<string, Express.Multer.File[]> }).files ?? {};
    let updated = 0;
    const errors: string[] = [];

    for (const [multerName, docKey] of Object.entries(SIG_FIELD_MAP) as [keyof typeof SIG_FIELD_MAP, string][]) {
      const arr = fileMap[multerName];
      const file = Array.isArray(arr) ? arr[0] : undefined;
      if (!file?.buffer) continue;

      const blocked = validateAttachmentFile(file);
      if (blocked) {
        errors.push(`${multerName}: ${blocked}`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        errors.push(`${multerName}: file too large`);
        continue;
      }

      const base = file.originalname?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image';
      const extFromName = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
      const mime = file.mimetype || '';
      const fallbackExt =
        extFromName ||
        (mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : '.jpg');
      const fileName = `invoices/${id}/sig-${multerName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${fallbackExt}`;

      try {
        const result = await imagekit.upload({
          file: file.buffer,
          fileName,
          folder: '/crm/invoices',
          useUniqueFileName: true,
        });
        const data = result as { url?: string };
        if (data?.url) {
          invoice.set(docKey, data.url);
          updated++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        errors.push(`${multerName}: ${msg}`);
      }
    }

    const hadFiles = Object.values(fileMap).some((arr) => Array.isArray(arr) && arr[0]?.buffer);
    if (!hadFiles) {
      res.status(400).json({ message: 'No files uploaded. Use fields: signature, stamp, digitalSignature.' });
      return;
    }

    if (updated > 0) {
      await invoice.save();
    }

    await invoice.populate('createdBy', 'fullName email');
    await invoice.populate('leadId', 'name phone company address');

    if (updated === 0) {
      res.status(400).json({
        message: errors[0] ?? 'Upload failed',
        errors: errors.slice(0, 10),
        invoice,
      });
      return;
    }

    res.json({
      invoice,
      uploaded: updated,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    console.error('uploadTaxInvoiceSignatures', err);
    res.status(500).json({ message: 'Failed to upload signature assets' });
  }
}

export async function deleteTaxInvoice(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const r = await TaxInvoice.findByIdAndDelete(id);
    if (!r) {
      res.status(404).json({ message: 'Invoice not found' });
      return;
    }
    res.json({ message: 'Invoice deleted' });
  } catch {
    res.status(500).json({ message: 'Failed to delete invoice' });
  }
}

/** Recalculate stored totals from line items (e.g. after manual DB edits) */
export async function recalcTotalsForDoc(id: string): Promise<void> {
  const doc = await TaxInvoice.findById(id);
  if (!doc) return;
  const rate = effectiveGstRate(doc);
  const computed = computeTotals(doc.items as ITaxInvoiceLineItem[], rate);
  doc.gstRate = rate;
  doc.gstAmount = computed.gstAmount;
  doc.igstRate = rate;
  doc.igstAmount = computed.gstAmount;
  doc.taxableTotal = computed.taxableTotal;
  doc.grandTotal = computed.grandTotal;
  doc.quantityTotal = computed.quantityTotal;
  doc.amountInWords = defaultAmountInWords(computed.grandTotal, doc.amountInWords);
  await doc.save();
}
