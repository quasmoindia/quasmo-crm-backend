import mongoose, { Document, Model, Schema } from 'mongoose';

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type ComplaintPriority = 'low' | 'medium' | 'high';

export interface IComplaint extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  subject: string;
  description: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  /** Microscope / product model name */
  productModel?: string;
  /** Serial number of the product for warranty/support */
  serialNumber?: string;
  /** Order or invoice reference */
  orderReference?: string;
  /** Internal notes (e.g. by support staff) */
  internalNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface IComplaintModel extends Model<IComplaint> {}

const statusEnum = ['open', 'in_progress', 'resolved', 'closed'] as const;
const priorityEnum = ['low', 'medium', 'high'] as const;

const complaintSchema = new Schema<IComplaint>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: { values: statusEnum, message: 'Invalid status' },
      default: 'open',
      index: true,
    },
    priority: {
      type: String,
      enum: { values: priorityEnum, message: 'Invalid priority' },
      default: 'medium',
      index: true,
    },
    productModel: { type: String, trim: true },
    serialNumber: { type: String, trim: true },
    orderReference: { type: String, trim: true },
    internalNotes: { type: String, trim: true },
  },
  { timestamps: true }
);

complaintSchema.index({ createdAt: -1 });
complaintSchema.index({ user: 1, createdAt: -1 });

export const Complaint = mongoose.model<IComplaint, IComplaintModel>(
  'Complaint',
  complaintSchema
);
