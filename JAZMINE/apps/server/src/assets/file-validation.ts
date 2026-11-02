import { AppError } from '../errors';
export function validateAsset(base64: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0)
    throw new AppError('INVALID_FILE', 'อ่านไฟล์ไม่ได้ กรุณาเลือกไฟล์ใหม่', 400);
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 2 * 1024 * 1024 || bytes.length < 12)
    throw new AppError('FILE_SIZE', 'ไฟล์ต้องมีขนาดไม่เกิน 2 MB และไม่เป็นไฟล์ว่าง', 400);
  let mime = '';
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    if (bytes.length < 24) throw new AppError('INVALID_FILE', 'ไฟล์ PNG ไม่ครบ', 400);
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (!width || !height || width > 12000 || height > 12000 || width * height > 40000000)
      throw new AppError('IMAGE_SIZE', 'รูปมีขนาดพิกเซลใหญ่เกินไป กรุณาลดขนาดก่อน', 400);
    mime = 'image/png';
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
  else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    mime = 'image/webp';
  else if (bytes.toString('ascii', 0, 5) === '%PDF-') mime = 'application/pdf';
  if (!mime) throw new AppError('FILE_TYPE', 'รองรับ PNG, JPEG, WebP หรือ PDF เท่านั้น', 400);
  return { bytes, mime };
}
