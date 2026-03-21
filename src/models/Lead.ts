import mongoose, { Document, Model, Schema } from 'mongoose';

/** Sales pipeline including quotations & invoices */
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'quotation_sent'
  | 'negotiation'
  | 'invoice_sent'
  | 'closed'
  | 'lost';

export type LeadSource = 'website' | 'referral' | 'cold_call' | 'campaign' | 'other';

export type LeadDocumentSentType = 'quotation' | 'invoice' | 'proforma' | 'other';

export interface ILeadDocumentSent {
  _id?: mongoose.Types.ObjectId;
  type: LeadDocumentSentType;
  reference?: string;
  amount?: string;
  notes?: string;
  sentAt: Date;
  sentBy?: mongoose.Types.ObjectId;
}

export interface ILead extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  /** Registered / business address (e.g. from GST lookup) */
  address?: string;
  /** GSTIN (India) or tax ID */
  gstNumber?: string;
  status: LeadStatus;
  source?: LeadSource;
  notes?: string;
  /** Log of quotations / invoices / proformas sent to the lead */
  documentsSent?: ILeadDocumentSent[];
  /** ImageKit URLs – quotes, PDFs, etc. */
  attachments?: string[];
  /** User assigned to follow up (calling person) */
  assignedTo?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

interface ILeadModel extends Model<ILead> {}

const statusEnum = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'quotation_sent',
  'negotiation',
  'invoice_sent',
  'closed',
  'lost',
] as const;

const leadDocumentTypeEnum = ['quotation', 'invoice', 'proforma', 'other'] as const;
const sourceEnum = ['website', 'referral', 'cold_call', 'campaign', 'other'] as const;

const leadSchema = new Schema<ILead>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
      index: true,
    },
    email: { type: String, trim: true, lowercase: true },
    company: { type: String, trim: true },
    address: { type: String, trim: true },
    gstNumber: { type: String, trim: true, index: true },
    status: {
      type: String,
      enum: { values: statusEnum, message: 'Invalid status' },
      default: 'new',
      index: true,
    },
    source: {
      type: String,
      enum: { values: sourceEnum, message: 'Invalid source' },
      trim: true,
    },
    notes: { type: String, trim: true },
    documentsSent: {
      type: [
        {
          type: {
            type: String,
            enum: { values: leadDocumentTypeEnum, message: 'Invalid document type' },
            required: true,
          },
          reference: { type: String, trim: true },
          amount: { type: String, trim: true },
          notes: { type: String, trim: true },
          sentAt: { type: Date, default: Date.now },
          sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
        },
      ],
      default: [],
    },
    attachments: { type: [String], default: [] },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

leadSchema.index({ createdAt: -1 });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ assignedTo: 1, status: 1 });

export const Lead = mongoose.model<ILead, ILeadModel>('Lead', leadSchema);
