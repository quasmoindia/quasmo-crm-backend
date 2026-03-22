import mongoose, { Document, Model, Schema } from 'mongoose';
import { TAX_DOCUMENT_KINDS, type TaxDocumentKind } from './taxDocumentKinds.js';

export type { TaxDocumentKind };

export interface ITaxInvoiceLineItem {
  description: string;
  hsnSac: string;
  qty: number;
  unit: string;
  price: number;
  /** Line total; if omitted, qty * price is used when saving / rendering */
  amount?: number;
}

export interface ITaxInvoice extends Document {
  _id: mongoose.Types.ObjectId;
  /** Optional link to CRM lead */
  leadId?: mongoose.Types.ObjectId;

  /** Same layout; title on PDF changes (Tax invoice / Proforma / Quotation) */
  documentKind?: TaxDocumentKind;

  /** Bank picked from master list (optional; details also stored on invoice for the PDF) */
  bankAccountId?: mongoose.Types.ObjectId;

  /** Saved stamp/signature set (optional; URLs also stored on invoice for the PDF) */
  signaturePresetId?: mongoose.Types.ObjectId;

  sellerGstin: string;
  sellerName: string;
  sellerAddress: string;
  sellerPhones: string[];
  sellerEmails: string[];

  copyLabel: string;

  invoiceNo: string;
  invoiceDate: Date;
  placeOfSupply: string;
  reverseCharge: string;
  transport: string;

  vehicleNo: string;
  /** Shown on PDF (e.g. Net 30, Advance) */
  paymentTerms: string;
  ewayBillNo: string;
  dateOfRemoval: string;
  freight: string;

  billedToName: string;
  billedToAddress: string;
  billedToGstin: string;

  shippedToName: string;
  shippedToAddress: string;
  shippedToContact: string;
  shippedToGstin: string;

  contractNo: string;
  remarks: string;

  items: ITaxInvoiceLineItem[];

  /** GST % on taxable value (e.g. 18) */
  gstRate: number;

  /** @deprecated use gstRate — kept for older records */
  igstRate?: number;

  /** GST amount on taxable total */
  gstAmount: number;

  /** @deprecated use gstAmount */
  igstAmount?: number;

  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  bankBranch: string;
  bankUpiId: string;
  /** HTTPS URL to UPI QR image for PDF */
  bankQrUrl: string;

  termsAndConditions: string;

  /** Override auto-generated amount in words */
  amountInWords?: string;

  /** ImageKit (or HTTPS) URLs printed on PDF — authorised signatory block */
  issuerSignatureUrl?: string;
  issuerStampUrl?: string;
  issuerDigitalSignatureUrl?: string;

  /** Cached totals for list display */
  taxableTotal: number;
  grandTotal: number;
  quantityTotal: number;

  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

interface ITaxInvoiceModel extends Model<ITaxInvoice> {}

const lineItemSchema = new Schema<ITaxInvoiceLineItem>(
  {
    description: { type: String, required: true, trim: true },
    hsnSac: { type: String, trim: true, default: '' },
    qty: { type: Number, required: true, min: 0 },
    unit: { type: String, trim: true, default: 'Pcs.' },
    price: { type: Number, required: true, min: 0 },
    amount: { type: Number, min: 0 },
  },
  { _id: false }
);

const taxInvoiceSchema = new Schema<ITaxInvoice>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },

    documentKind: {
      type: String,
      enum: { values: TAX_DOCUMENT_KINDS, message: 'Invalid document kind' },
      default: 'tax_invoice',
      index: true,
    },

    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount', index: true },

    signaturePresetId: { type: Schema.Types.ObjectId, ref: 'SignaturePreset', index: true },

    sellerGstin: { type: String, trim: true, default: '06AAAFQ0374K1ZA' },
    sellerName: {
      type: String,
      trim: true,
      default: 'QUALITY SCIENTIFIC & MECHANICAL WORKS',
    },
    sellerAddress: {
      type: String,
      trim: true,
      default: 'PLOT NO. 84 HSIDC INDUSTRIAL AREA AMBALA',
    },
    sellerPhones: { type: [String], default: ['9215617707', '8926666632'] },
    sellerEmails: {
      type: [String],
      default: ['quasmo.mechanical@gmail.com', 'qualitynd@yahoo.com'],
    },

    copyLabel: { type: String, trim: true, default: 'Original Copy' },

    invoiceNo: { type: String, required: true, trim: true, index: true },
    invoiceDate: { type: Date, required: true },
    placeOfSupply: { type: String, trim: true, default: '' },
    reverseCharge: { type: String, trim: true, default: 'N' },
    transport: { type: String, trim: true, default: '' },

    vehicleNo: { type: String, trim: true, default: '' },
    paymentTerms: { type: String, trim: true, default: '' },
    ewayBillNo: { type: String, trim: true, default: '' },
    dateOfRemoval: { type: String, trim: true, default: '' },
    freight: { type: String, trim: true, default: '' },

    billedToName: { type: String, trim: true, default: '' },
    billedToAddress: { type: String, trim: true, default: '' },
    billedToGstin: { type: String, trim: true, default: '' },

    shippedToName: { type: String, trim: true, default: '' },
    shippedToAddress: { type: String, trim: true, default: '' },
    shippedToContact: { type: String, trim: true, default: '' },
    shippedToGstin: { type: String, trim: true, default: '' },

    contractNo: { type: String, trim: true, default: '' },
    remarks: { type: String, trim: true, default: '' },

    items: { type: [lineItemSchema], default: [] },

    gstRate: { type: Number, default: 18, min: 0, max: 100 },
    igstRate: { type: Number, min: 0, max: 100 },
    gstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number },

    bankName: { type: String, trim: true, default: '' },
    bankAccountNo: { type: String, trim: true, default: '' },
    bankIfsc: { type: String, trim: true, default: '' },
    bankBranch: { type: String, trim: true, default: '' },
    bankUpiId: { type: String, trim: true, default: '' },
    bankQrUrl: { type: String, trim: true, default: '' },

    termsAndConditions: {
      type: String,
      trim: true,
      default:
        'E. & O.E.\nGoods once sold will not be taken back.\nInterest @18% p.a. will be charged if the payment is not made within due date.\nSubject to Ambala jurisdiction.',
    },

    amountInWords: { type: String, trim: true },

    issuerSignatureUrl: { type: String, trim: true, default: '' },
    issuerStampUrl: { type: String, trim: true, default: '' },
    issuerDigitalSignatureUrl: { type: String, trim: true, default: '' },

    taxableTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    quantityTotal: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

taxInvoiceSchema.index({ createdAt: -1 });
taxInvoiceSchema.index({ invoiceNo: 1, invoiceDate: -1 });

taxInvoiceSchema.pre('save', function (next) {
  if (!this.documentKind) this.set('documentKind', 'tax_invoice');
  next();
});

export const TaxInvoice = mongoose.model<ITaxInvoice, ITaxInvoiceModel>('TaxInvoice', taxInvoiceSchema);

export type TaxInvoicePlain = Omit<ITaxInvoice, keyof Document> & {
  _id: mongoose.Types.ObjectId;
  invoiceDate: Date;
};
