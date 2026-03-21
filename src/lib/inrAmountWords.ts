/**
 * Convert a non-negative integer rupee amount to words (Indian English),
 * e.g. 44650 -> "Forty Four Thousand Six Hundred Fifty"
 */
const ones = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ones[n]!;
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${tens[t]!} ${ones[o]!}` : tens[t]!;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ones[h]!} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

/** 0..999999999 */
export function inrAmountToWords(num: number): string {
  if (!Number.isFinite(num) || num < 0) return 'Zero';
  const n = Math.floor(num);
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundreds = n % 1000;

  const chunks: string[] = [];
  if (crore) chunks.push(`${threeDigits(crore)} Crore`.trim());
  if (lakh) chunks.push(`${threeDigits(lakh)} Lakh`.trim());
  if (thousand) chunks.push(`${threeDigits(thousand)} Thousand`.trim());
  if (hundreds) chunks.push(threeDigits(hundreds));

  return chunks.join(' ').replace(/\s+/g, ' ').trim();
}

export function grandTotalToInvoiceWords(grandTotal: number): string {
  const whole = Math.floor(grandTotal + 1e-6);
  const words = inrAmountToWords(whole);
  return `Rupees ${words} Only`;
}
