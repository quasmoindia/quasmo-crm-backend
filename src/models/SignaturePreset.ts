import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ISignaturePreset extends Document {
  _id: mongoose.Types.ObjectId;
  /** Shown in invoice editor dropdown, e.g. "Default signatory" */
  label: string;
  issuerStampUrl: string;
  issuerSignatureUrl: string;
  issuerDigitalSignatureUrl: string;
  isActive: boolean;
  sortOrder: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

interface ISignaturePresetModel extends Model<ISignaturePreset> {}

const signaturePresetSchema = new Schema<ISignaturePreset>(
  {
    label: { type: String, required: true, trim: true },
    issuerStampUrl: { type: String, trim: true, default: '' },
    issuerSignatureUrl: { type: String, trim: true, default: '' },
    issuerDigitalSignatureUrl: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

signaturePresetSchema.index({ sortOrder: 1, label: 1 });

export const SignaturePreset = mongoose.model<ISignaturePreset, ISignaturePresetModel>(
  'SignaturePreset',
  signaturePresetSchema
);
