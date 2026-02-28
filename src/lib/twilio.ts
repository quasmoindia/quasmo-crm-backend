import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

let client: ReturnType<typeof twilio> | null = null;

if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
}

export function isTwilioConfigured(): boolean {
  return Boolean(client && fromNumber);
}

export interface SendSmsResult {
  ok: boolean;
  sid?: string;
  error?: string;
}

export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  if (!client || !fromNumber) {
    return { ok: false, error: 'SMS is not configured (Twilio credentials missing)' };
  }
  const normalized = to.replace(/\D/g, '');
  if (normalized.length < 10) {
    return { ok: false, error: 'Invalid phone number' };
  }
  const toE164 = normalized.length === 10 ? `+1${normalized}` : `+${normalized}`;
  try {
    const message = await client.messages.create({
      body,
      from: fromNumber,
      to: toE164,
    });
    return { ok: true, sid: message.sid };
  } catch (err) {
    const error = err as Error & { message?: string; code?: number };
    return { ok: false, error: error.message || 'Failed to send SMS' };
  }
}
