import { TaxInvoice } from '../models/TaxInvoice.js';
import { DocumentCounter } from '../models/DocumentCounter.js';
import type { TaxDocumentKind } from '../models/taxDocumentKinds.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getDocumentNumberPrefix(): string {
  return String(process.env.DOCUMENT_NUMBER_PREFIX ?? 'QSMW')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** Minimum digit width for sequence (e.g. 2 → 01, 5 → 00001) */
export function getDocumentNumberMinDigits(): number {
  const n = parseInt(String(process.env.DOCUMENT_NUMBER_MIN_DIGITS ?? '2'), 10);
  if (Number.isNaN(n) || n < 1) return 2;
  if (n > 12) return 12;
  return n;
}

export function documentKindCode(kind: TaxDocumentKind): string {
  switch (kind) {
    case 'tax_invoice':
      return 'TI';
    case 'proforma':
      return 'PF';
    case 'quotation':
      return 'QT';
    default:
      return 'TI';
  }
}

export function formatDocumentNumber(kind: TaxDocumentKind, seq: number): string {
  const prefix = getDocumentNumberPrefix();
  const code = documentKindCode(kind);
  const w = getDocumentNumberMinDigits();
  return `${prefix}/${code}/${String(seq).padStart(w, '0')}`;
}

/**
 * Max sequence already used for this kind matching PREFIX/CODE/NNN…
 * (so we can seed the counter when migrating from manual numbers).
 */
export async function computeMaxSeqFromExistingInvoices(
  kind: TaxDocumentKind,
  prefix: string,
  code: string
): Promise<number> {
  const re = new RegExp(`^${escapeRegex(prefix)}/${escapeRegex(code)}/(\\d+)$`, 'i');
  const rows = await TaxInvoice.find({ documentKind: kind }).select('invoiceNo').lean();
  let max = 0;
  for (const r of rows) {
    const m = String((r as { invoiceNo?: string }).invoiceNo ?? '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

async function ensureCounterInitialized(kind: TaxDocumentKind, prefix: string, code: string): Promise<void> {
  const existing = await DocumentCounter.findOne({ documentKind: kind });
  if (existing) return;
  const maxSeq = await computeMaxSeqFromExistingInvoices(kind, prefix, code);
  try {
    await DocumentCounter.create({ documentKind: kind, lastSeq: maxSeq });
  } catch {
    // race: another request created it
  }
}

/** Allocate next number (atomic). */
export async function allocateNextDocumentNumber(kind: TaxDocumentKind): Promise<string> {
  const prefix = getDocumentNumberPrefix();
  const code = documentKindCode(kind);

  for (let attempt = 0; attempt < 8; attempt++) {
    await ensureCounterInitialized(kind, prefix, code);
    const updated = await DocumentCounter.findOneAndUpdate(
      { documentKind: kind },
      { $inc: { lastSeq: 1 } },
      { new: true }
    ).lean();
    if (!updated?.lastSeq) continue;
    return formatDocumentNumber(kind, updated.lastSeq);
  }
  throw new Error('Could not allocate document number');
}

/** Next number that would be issued (no increment) — for UI preview. */
export async function peekNextDocumentNumber(kind: TaxDocumentKind): Promise<string> {
  const prefix = getDocumentNumberPrefix();
  const code = documentKindCode(kind);
  const minDigits = getDocumentNumberMinDigits();
  const counter = await DocumentCounter.findOne({ documentKind: kind }).lean();
  let nextSeq = 1;
  if (counter && counter.lastSeq >= 0) {
    nextSeq = counter.lastSeq + 1;
  } else {
    const maxSeq = await computeMaxSeqFromExistingInvoices(kind, prefix, code);
    nextSeq = maxSeq + 1;
  }
  return `${prefix}/${code}/${String(nextSeq).padStart(minDigits, '0')}`;
}
