import { readQrFields } from './payment-qr-fields';

// Compatibility profile observed in the owner's Lao QR example, not a claim
// that every Lao bank uses this layout. No customer identifiers are hardcoded.
export function isSupportedLaoPersonalQr(fields: Map<string, string>): boolean {
  const allowed = new Set(['00', '01', '38', '53', '58', '63']);
  if (
    [...fields.keys()].some((id) => !allowed.has(id)) ||
    fields.get('01') !== '11' ||
    fields.get('53') !== '418' ||
    fields.get('58') !== 'LA'
  )
    return false;
  const account = readQrFields(fields.get('38') ?? '');
  return (
    account !== null &&
    account.size === 4 &&
    account.get('00') === 'A005266284662577' &&
    /^\d{8}$/.test(account.get('01') ?? '') &&
    /^\d{3}$/.test(account.get('02') ?? '') &&
    /^[A-Z0-9]{24}$/.test(account.get('03') ?? '')
  );
}
