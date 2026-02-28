import mongoose, { Document, Model, Schema } from 'mongoose';

export type MessageDirection = 'outbound' | 'inbound';

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  /** User who sent (for outbound) or system */
  fromUser: mongoose.Types.ObjectId;
  /** Recipient user when messaging a CRM user */
  toUserId?: mongoose.Types.ObjectId;
  /** Recipient phone (always set for SMS) */
  toPhone: string;
  direction: MessageDirection;
  body: string;
  /** Twilio SID or similar for status lookup */
  externalId?: string;
  createdAt: Date;
}

interface IMessageModel extends Model<IMessage> {}

const messageSchema = new Schema<IMessage>(
  {
    fromUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    toUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    toPhone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    direction: {
      type: String,
      enum: { values: ['outbound', 'inbound'], message: 'Invalid direction' },
      default: 'outbound',
      index: true,
    },
    body: { type: String, required: true, trim: true },
    externalId: { type: String, trim: true },
  },
  { timestamps: true }
);

messageSchema.index({ toUserId: 1, createdAt: -1 });
messageSchema.index({ toPhone: 1, createdAt: -1 });

export const Message = mongoose.model<IMessage, IMessageModel>('Message', messageSchema);
