// Pure TLV decoding shared by the outer payment envelope and nested profiles.
// Returns no partial data for duplicate, truncated or malformed fields.
export function readQrFields(text: string): Map<string, string> | null {
  const chars = Array.from(text),
    fields = new Map<string, string>();
  let offset = 0;
  while (offset < chars.length) {
    const id = chars.slice(offset, offset + 2).join('');
    const lengthText = chars.slice(offset + 2, offset + 4).join('');
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthText) || fields.has(id)) return null;
    const length = Number(lengthText);
    if (!length || offset + 4 + length > chars.length) return null;
    fields.set(id, chars.slice(offset + 4, offset + 4 + length).join(''));
    offset += 4 + length;
  }
  return fields;
}
