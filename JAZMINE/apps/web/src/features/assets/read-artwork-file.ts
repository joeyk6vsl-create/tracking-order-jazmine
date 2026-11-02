export type ArtworkFile = { id: string; filename: string; base64: string; preview: string };
export async function readArtworkFile(file: File): Promise<ArtworkFile> {
  if (file.size > 2 * 1024 * 1024)
    throw new Error('ໄຟລ໌ຕ້ອງບໍ່ເກີນ 2 MB / File must be at most 2 MB');
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type))
    throw new Error('ໃຊ້ PNG / JPEG / WebP / PDF');
  if (file.name.length > 120) throw new Error('File name must be at most 120 characters');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Cannot read file'));
    reader.readAsDataURL(file);
  });
  return {
    id: crypto.randomUUID(),
    filename: file.name,
    base64: data.split(',')[1],
    preview: file.type.startsWith('image/') ? data : '',
  };
}
