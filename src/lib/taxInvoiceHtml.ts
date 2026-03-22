import type { ITaxInvoice } from '../models/TaxInvoice.js';
import { lineAmount, computeTotals, defaultAmountInWords } from './taxInvoiceTotals.js';
import { effectiveGstRate } from './taxInvoiceGst.js';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return '';
  const day = String(x.getDate()).padStart(2, '0');
  const month = String(x.getMonth() + 1).padStart(2, '0');
  const year = x.getFullYear();
  return `${day}-${month}-${year}`;
}

/** Date of removal: support YYYY-MM-DD or DD-MM-YYYY / DD/MM/YYYY text for PDF */
function formatRemovalDateDisplay(s: unknown): string {
  const raw = String(s ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, mo, d] = raw.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    if (!Number.isNaN(dt.getTime())) return formatDate(dt);
  }
  const m = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    if (!Number.isNaN(dt.getTime())) return formatDate(dt);
  }
  return raw;
}

function formatNum(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Safe for HTML attribute src (must be http(s)); escape & and quotes so query strings (e.g. ImageKit) are not broken */
function safeImgSrc(url: unknown): string {
  const u = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(u)) return '';
  return u.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** UPI ID text only in the bank-details row (QR is shown in the footer UPI column). */
function bankUpiIdLine(upi: unknown): string {
  const upiStr = String(upi ?? '').trim();
  if (!upiStr) return '';
  return `<div style="margin-top:4px;font-size:9px;"><strong>UPI ID:</strong> ${esc(upiStr)}</div>`;
}

/** Center column: UPI payment QR (not e-invoice). */
function footerUpiQrColumn(upi: unknown, qrUrl: unknown): string {
  const src = safeImgSrc(qrUrl);
  const upiStr = String(upi ?? '').trim();
  let inner = `<strong style="font-size:10px;display:block;margin-bottom:6px;">UPI QR Code</strong>`;
  if (src) {
    inner += `<img src="${src}" alt="" style="max-width:130px;max-height:130px;object-fit:contain;border:1px solid #ccc;padding:4px;background:#fff;display:block;margin:4px auto 0;"/>`;
  } else {
    inner += `<div style="margin-top:16px;min-height:88px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#999;">—</div>`;
  }
  if (upiStr) {
    inner += `<div style="margin-top:6px;font-size:8px;"><strong>UPI:</strong> ${esc(upiStr)}</div>`;
  }
  return `<td class="upi-qr-col c" style="width:34%;vertical-align:top;">${inner}</td>`;
}

type InvoiceLike = Pick<
  ITaxInvoice,
  | 'documentKind'
  | 'sellerGstin'
  | 'sellerName'
  | 'sellerAddress'
  | 'sellerPhones'
  | 'sellerEmails'
  | 'copyLabel'
  | 'invoiceNo'
  | 'invoiceDate'
  | 'placeOfSupply'
  | 'transport'
  | 'vehicleNo'
  | 'paymentTerms'
  | 'ewayBillNo'
  | 'dateOfRemoval'
  | 'freight'
  | 'billedToName'
  | 'billedToAddress'
  | 'billedToGstin'
  | 'shippedToName'
  | 'shippedToAddress'
  | 'shippedToContact'
  | 'shippedToGstin'
  | 'contractNo'
  | 'remarks'
  | 'items'
  | 'gstRate'
  | 'igstRate'
  | 'bankName'
  | 'bankAccountNo'
  | 'bankIfsc'
  | 'bankBranch'
  | 'bankUpiId'
  | 'bankQrUrl'
  | 'termsAndConditions'
  | 'amountInWords'
  | 'taxableTotal'
  | 'grandTotal'
  | 'quantityTotal'
  | 'issuerSignatureUrl'
  | 'issuerStampUrl'
  | 'issuerDigitalSignatureUrl'
>;

/** Issuer images only (no captions) for signatory block */
function issuerSigImg(url: unknown): string {
  const src = safeImgSrc(url);
  if (!src) return '';
  return `<img src="${src}" alt="" style="max-height:56px;max-width:140px;object-fit:contain;display:inline-block;vertical-align:bottom;"/>`;
}

function issuerSignatureRow(inv: InvoiceLike): string {
  const parts = [
    issuerSigImg(inv.issuerStampUrl),
    issuerSigImg(inv.issuerSignatureUrl),
    issuerSigImg(inv.issuerDigitalSignatureUrl),
  ].filter(Boolean);
  if (!parts.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:center;gap:12px;margin-top:4px;">${parts.join('')}</div>`;
}

function documentKindTitle(kind: string | undefined): string {
  switch (kind) {
    case 'proforma':
      return 'PROFORMA INVOICE';
    case 'quotation':
      return 'QUOTATION';
    default:
      return 'TAX INVOICE';
  }
}

export function buildTaxInvoiceHtml(inv: InvoiceLike): string {
  const items = inv.items ?? [];
  const rate = effectiveGstRate(inv);
  const { taxableTotal, gstAmount, grandTotal, quantityTotal } = computeTotals(items, rate);
  const words = defaultAmountInWords(grandTotal, inv.amountInWords);
  const docTitle = documentKindTitle(inv.documentKind ?? 'tax_invoice');

  const phones = (inv.sellerPhones ?? []).filter(Boolean).join(', ');
  const emails = (inv.sellerEmails ?? []).filter(Boolean).join(', ');

  const rows = items
    .map((it, i) => {
      const amt = lineAmount(it);
      return `<tr>
        <td class="c sn">${i + 1}</td>
        <td class="c desc">${esc(it.description)}</td>
        <td class="c hsn">${esc(it.hsnSac)}</td>
        <td class="r qty">${formatNum(it.qty)}</td>
        <td class="c unit">${esc(it.unit)}</td>
        <td class="r price">${formatNum(it.price)}</td>
        <td class="r amt">${formatNum(amt)}</td>
      </tr>`;
    })
    .join('');

  const gstPct = rate.toFixed(2);

  const terms = esc(inv.termsAndConditions ?? '')
    .split('\n')
    .map((line) => (line ? `<div>${line}</div>` : '<br/>'))
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(docTitle)} ${esc(inv.invoiceNo)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10px;
      color: #000;
      margin: 0;
      padding: 8px;
      line-height: 1.35;
    }
    .page { max-width: 190mm; margin: 0 auto; }
    table { width: 100%; border-collapse: collapse; }
    td, th {
      border: 1px solid #000;
      padding: 4px 6px;
      vertical-align: top;
    }
    .nb { border: none !important; }
    .bb { border-bottom: 1px solid #000; }
    .header-top td { border: none; vertical-align: top; }
    .title { text-align: center; font-size: 14px; font-weight: bold; letter-spacing: 0.05em; }
    .company { text-align: center; font-size: 13px; font-weight: bold; margin: 4px 0 2px; }
    .sub { text-align: center; font-size: 10px; }
    .gstin-top { font-size: 10px; font-weight: bold; }
    .copy { text-align: right; font-size: 10px; }
    .meta-label { font-weight: bold; width: 38%; }
    .small { font-size: 9px; }
    th {
      background: #f5f5f5;
      font-weight: bold;
      text-align: center;
      font-size: 9px;
    }
    .c { text-align: center; }
    .r { text-align: right; }
    .sn { width: 28px; }
    .hsn { width: 72px; }
    .qty { width: 48px; }
    .unit { width: 44px; }
    .price { width: 72px; }
    .amt { width: 80px; }
    .desc { text-align: left; }
    .totals td { border: 1px solid #000; }
    .tot-strong { font-weight: bold; font-size: 11px; }
    .words { font-weight: bold; padding: 6px; }
    .bank { font-size: 9px; }
    .footer-three td { width: 33.33%; vertical-align: top; }
    .terms { font-size: 8px; line-height: 1.4; }
    .sign { text-align: center; font-size: 10px; padding-top: 6px; }
    .upi-qr-col { font-size: 9px; }
  </style>
</head>
<body>
  <div class="page">
    <table class="header-top">
      <tr>
        <td class="nb gstin-top" style="width:28%">GSTIN: ${esc(inv.sellerGstin)}</td>
        <td class="nb title" style="width:44%">${esc(docTitle)}</td>
        <td class="nb copy" style="width:28%">${esc(inv.copyLabel)}</td>
      </tr>
    </table>
    <div class="company">${esc(inv.sellerName)}</div>
    <div class="sub">${esc(inv.sellerAddress)}</div>
    <div class="sub">Tel.: ${esc(phones)} ${emails ? `&nbsp;|&nbsp; ${esc(emails)}` : ''}</div>

    <table style="margin-top:8px">
      <tr>
        <td style="width:50%">
          <table>
            <tr><td class="meta-label nb">Invoice No.:</td><td class="nb">${esc(inv.invoiceNo)}</td></tr>
            <tr><td class="meta-label nb">Dated:</td><td class="nb">${esc(formatDate(inv.invoiceDate))}</td></tr>
            <tr><td class="meta-label nb">Place of Supply:</td><td class="nb">${esc(inv.placeOfSupply)}</td></tr>
            <tr><td class="meta-label nb">Transport:</td><td class="nb">${esc(inv.transport)}</td></tr>
            <tr><td class="meta-label nb">Vehicle No.:</td><td class="nb">${esc(inv.vehicleNo)}</td></tr>
          </table>
        </td>
        <td style="width:50%">
          <table>
            <tr><td class="meta-label nb">Payment terms:</td><td class="nb">${esc(inv.paymentTerms)}</td></tr>
            <tr><td class="meta-label nb">E-Way Bill No.:</td><td class="nb">${esc(inv.ewayBillNo)}</td></tr>
            <tr><td class="meta-label nb">Date of Removal:</td><td class="nb">${esc(formatRemovalDateDisplay(inv.dateOfRemoval))}</td></tr>
            <tr><td class="meta-label nb">Freight:</td><td class="nb">${esc(inv.freight)}</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <table style="margin-top:0">
      <tr>
        <td style="width:50%">
          <strong>Billed to:</strong><br/>
          <strong>${esc(inv.billedToName)}</strong><br/>
          <span class="small">${esc(inv.billedToAddress).replace(/\n/g, '<br/>')}</span><br/>
          <span class="small">GSTIN / UIN: ${esc(inv.billedToGstin)}</span>
        </td>
        <td style="width:50%">
          <strong>Shipped to:</strong><br/>
          <strong>${esc(inv.shippedToName)}</strong><br/>
          <span class="small">${esc(inv.shippedToAddress).replace(/\n/g, '<br/>')}</span><br/>
          <span class="small">Contact: ${esc(inv.shippedToContact)}</span><br/>
          <span class="small">GSTIN / UIN: ${esc(inv.shippedToGstin)}</span>
        </td>
      </tr>
    </table>

    <table>
      <tr><td><strong>Reference / Contract No.:</strong> ${esc(inv.contractNo)}</td></tr>
      <tr><td><strong>Remarks:</strong> ${esc(inv.remarks)}</td></tr>
    </table>

    <table>
      <thead>
        <tr>
          <th class="sn">S.N</th>
          <th>Description of Goods</th>
          <th class="hsn">HSN/SAC</th>
          <th class="qty">Qty.</th>
          <th class="unit">Unit</th>
          <th class="price">Price</th>
          <th class="amt">Amount(₹)</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="7" class="c">—</td></tr>'}
      </tbody>
    </table>

    <table class="totals">
      <tr>
        <td colspan="4" class="r"><strong>Subtotal</strong></td>
        <td colspan="3" class="r">${formatNum(taxableTotal)}</td>
      </tr>
      <tr>
        <td colspan="4" class="r">Add : GST @ ${gstPct} %</td>
        <td colspan="3" class="r">${formatNum(gstAmount)}</td>
      </tr>
      <tr>
        <td colspan="4" class="r tot-strong">Grand Total</td>
        <td colspan="3" class="r tot-strong">${formatNum(grandTotal)}</td>
      </tr>
      <tr>
        <td colspan="7" class="small">Quantity Total: ${esc(String(quantityTotal))}</td>
      </tr>
    </table>

    <table>
      <thead>
        <tr>
          <th>Tax Rate</th>
          <th>Taxable Amt.</th>
          <th>GST Amt.</th>
          <th>Total Tax</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="c">${gstPct}%</td>
          <td class="r">${formatNum(taxableTotal)}</td>
          <td class="r">${formatNum(gstAmount)}</td>
          <td class="r">${formatNum(gstAmount)}</td>
        </tr>
      </tbody>
    </table>

    <table>
      <tr><td class="words">${esc(words)}</td></tr>
    </table>

    <table>
      <tr><td class="bank">
        <strong>Bank Details:</strong>
        Bank: ${esc(inv.bankName)} &nbsp;|&nbsp;
        A/c: ${esc(inv.bankAccountNo)} &nbsp;|&nbsp;
        IFSC: ${esc(inv.bankIfsc)} &nbsp;|&nbsp;
        Branch: ${esc(inv.bankBranch)}
        ${bankUpiIdLine(inv.bankUpiId)}
      </td></tr>
    </table>

    <table class="footer-three">
      <tr>
        <td class="terms" style="width:33%">
          <strong>Terms &amp; Conditions</strong>
          <div style="margin-top:4px">${terms}</div>
        </td>
        ${footerUpiQrColumn(inv.bankUpiId, inv.bankQrUrl)}
        <td class="sign" style="width:33%">
          <div style="margin-top:4px;text-align:center;font-size:10px;">for <strong>${esc(inv.sellerName)}</strong></div>
          ${issuerSignatureRow(inv)}
          <div style="margin-top:10px;text-align:center;font-size:10px;font-weight:bold;">Authorised Signatory</div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}
