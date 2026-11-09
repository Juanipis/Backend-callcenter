import { config } from '../config';

export function toE164(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/[^\d]/g, '')}`;
  }

  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return trimmed;

  // If user provided country calling code via env, prepend it.
  if (config.defaultCountryCallingCode) {
    const cc = config.defaultCountryCallingCode.startsWith('+')
      ? config.defaultCountryCallingCode
      : `+${config.defaultCountryCallingCode}`;
    return `${cc}${digits}`;
  }

  // As-is (Twilio may reject if not E.164).
  return digits;
}

