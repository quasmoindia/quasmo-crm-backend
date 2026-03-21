import mongoose, { Schema } from 'mongoose';

/** Atomic counters for human-readable IDs (e.g. complaint ticket numbers). */
const sequenceCounterSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: 'sequencecounters' }
);

export const SequenceCounter =
  mongoose.models.SequenceCounter ?? mongoose.model('SequenceCounter', sequenceCounterSchema);
