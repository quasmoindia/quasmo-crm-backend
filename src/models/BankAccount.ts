import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IBankAccount extends Document {
  _id: mongoose.Types.ObjectId;
  /** Short label shown in dropdown, e.g. "HDFC – Current" */
  label: string;
  bankName: string;
  accountNo: string;
  ifsc: string;
  branch: string;
  isActive: boolean;
  sortOrder: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

interface IBankAccountModel extends Model<IBankAccount> {}

const bankAccountSchema = new Schema<IBankAccount>(
  {
    label: { type: String, required: true, trim: true },
    bankName: { type: String, required: true, trim: true },
    accountNo: { type: String, required: true, trim: true },
    ifsc: { type: String, required: true, trim: true, uppercase: true },
    branch: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

bankAccountSchema.index({ sortOrder: 1, label: 1 });

export const BankAccount = mongoose.model<IBankAccount, IBankAccountModel>('BankAccount', bankAccountSchema);
