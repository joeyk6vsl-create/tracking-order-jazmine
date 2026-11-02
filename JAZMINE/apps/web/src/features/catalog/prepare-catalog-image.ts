/** Catalog thumbnails only. Bank QR images must use the separate bank validation flow. */
export async function prepareCatalogImage(file: File): Promise<string> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error('ເລືອກ PNG/JPEG/WebP ບໍ່ເກີນ 10 MB / Choose an image up to 10 MB');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 16000000)
      throw new Error('Image is too large (16 MP maximum)');
    const canvas = document.createElement('canvas');
    let edge = 900;
    while (edge >= 180) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Cannot prepare image');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL('image/jpeg', 0.82);
      if (atob(image.split(',')[1]).length <= 128 * 1024) return image;
      edge = Math.floor(edge * 0.75);
    }
    throw new Error('Cannot prepare this image; choose a smaller image');
  } finally {
    bitmap.close();
  }
}
