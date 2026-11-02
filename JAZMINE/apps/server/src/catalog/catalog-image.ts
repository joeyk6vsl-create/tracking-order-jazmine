import sharp from 'sharp';
import { AppError } from '../errors';

/** Both catalog writes use the same bounded image validation. */
export async function validateCatalogImage(image: string | null | undefined) {
  if (image == null) return;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  const bytes = match ? Buffer.from(match[2], 'base64') : Buffer.alloc(0);
  try {
    if (!match || !bytes.length || bytes.length > 128 * 1024) throw new Error();
    const decoded = sharp(bytes, { limitInputPixels: 16000000, failOn: 'error' });
    const meta = await decoded.metadata();
    if (meta.format !== match[1] || (meta.pages ?? 1) !== 1) throw new Error();
    await decoded.raw().toBuffer();
  } catch {
    throw new AppError('INVALID_IMAGE', 'Use a static PNG, JPEG or WebP image up to 128 KB', 400);
  }
}
