import mongoose, { Document, Model, Schema } from 'mongoose';
import { TAX_DOCUMENT_KINDS, type TaxDocumentKind } from './taxDocumentKinds.js';

export interface IDocumentCounter extends Document {
  _id: mongoose.Types.ObjectId;
  documentKind: TaxDocumentKind;
  /** Last issued sequence for this document type */
  lastSeq: number;
  updatedAt: Date;
}

interface IDocumentCounterModel extends Model<IDocumentCounter> {}

const documentCounterSchema = new Schema<IDocumentCounter>(
  {
    documentKind: {
      type: String,
      required: true,
      enum: { values: TAX_DOCUMENT_KINDS, message: 'Invalid document kind' },
      unique: true,
      index: true,
    },
    lastSeq: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

export const DocumentCounter = mongoose.model<IDocumentCounter, IDocumentCounterModel>(
  'DocumentCounter',
  documentCounterSchema
);
