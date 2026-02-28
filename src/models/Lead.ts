import mongoose, { Document, Model, Schema } from 'mongoose';

/** 4-stage pipeline for microscope sales: New → Contacted → Proposal → Closed */
export type LeadStatus = 'new' | 'contacted' | 'proposal' | 'closed';
export type LeadSource = 'website' | 'referral' | 'cold_call' | 'campaign' | 'other';

export interface ILead extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  status: LeadStatus;
  source?: LeadSource;
  notes?: string;
  /** User assigned to follow up (calling person) */
  assignedTo?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

interface ILeadModel extends Model<ILead> {}

const statusEnum = ['new', 'contacted', 'proposal', 'closed'] as const;
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
