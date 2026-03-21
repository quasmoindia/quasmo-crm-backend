import type { ITaxInvoiceLineItem } from '../models/TaxInvoice.js';
import { grandTotalToInvoiceWords } from './inrAmountWords.js';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function lineAmount(item: ITaxInvoiceLineItem): number {
  if (item.amount != null && Number.isFinite(item.amount)) return round2(item.amount);
  return round2(item.qty * item.price);
}

export function computeTotals(items: ITaxInvoiceLineItem[], gstRate: number) {
  let taxableTotal = 0;
  let quantityTotal = 0;
  for (const it of items) {
    taxableTotal += lineAmount(it);
    quantityTotal += it.qty;
  }
  taxableTotal = round2(taxableTotal);
  const gstAmount = round2((taxableTotal * gstRate) / 100);
  const grandTotal = round2(taxableTotal + gstAmount);
  return {
    taxableTotal,
    gstAmount,
    grandTotal,
    quantityTotal: round2(quantityTotal),
  };
}

export function defaultAmountInWords(grandTotal: number, override?: string): string {
  if (override?.trim()) return override.trim();
  return grandTotalToInvoiceWords(grandTotal);
}
