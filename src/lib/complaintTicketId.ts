import { SequenceCounter } from '../models/SequenceCounter.js';

/** Public-facing complaint / ticket reference (Quasmo CRM). */
export const COMPLAINT_TICKET_PREFIX = 'QUASMO-CMP-';
const COUNTER_ID = 'complaint_ticket';
const PAD_LENGTH = 6;

/**
 * Atomically allocates the next ticket id, e.g. QUASMO-CMP-000042.
 */
export async function allocateNextComplaintTicketId(): Promise<string> {
  const doc = await SequenceCounter.findOneAndUpdate(
    { _id: COUNTER_ID },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = doc && typeof doc === 'object' && 'seq' in doc ? (doc as { seq: number }).seq : undefined;
  if (typeof seq !== 'number') {
    throw new Error('Failed to allocate complaint ticket id');
  }
  return `${COMPLAINT_TICKET_PREFIX}${String(seq).padStart(PAD_LENGTH, '0')}`;
}
