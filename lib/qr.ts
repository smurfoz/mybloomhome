// APP-2 / APP-3: opaque QR codes and label rendering.
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import type { Client } from './db.ts';

// No 0/o, 1/l/i: codes are occasionally read out or typed by hand.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const QR_CODE_LENGTH = 12;
export const QR_OPTIONS = { errorCorrectionLevel: 'M', margin: 4 } as const;

export function newQrCode(): string {
  const bytes = randomBytes(QR_CODE_LENGTH);
  // 31 symbols: rejection-free modulo bias is tiny (256 % 31 = 8); acceptable
  // for an identifier that is not a secret.
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export async function createQr(c: Client, companyId: number, entityType: 'item' | 'location' | 'document', entityId: number) {
  const code = newQrCode();
  await c.query('INSERT INTO qr_codes (code, company_id, entity_type, entity_id) VALUES ($1, $2, $3, $4)',
    [code, companyId, entityType, entityId]);
  return code;
}

export const qrUrl = (baseUrl: string, code: string) => `${baseUrl.replace(/\/$/, '')}/q/${code}`;

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: 'svg' });
}

// Pull a QR code out of whatever a scanner produced: full URL, path, or bare code.
export function extractQrCode(input: string): string | null {
  const s = input.trim();
  const m = /\/q\/([a-z0-9]{10,})\/?$/i.exec(s) ?? /^([a-z0-9]{12})$/i.exec(s);
  return m ? m[1].toLowerCase() : null;
}
