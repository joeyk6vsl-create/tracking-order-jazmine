import type { SheetSnapshot } from '../../../../../packages/contracts/src/production';
export type PrintMedia = {
  images: Record<string, string>;
  attachments: { filename: string; label: string; pages: string[] }[];
};
// โหลดผ่านสิทธิ์ของผู้ใช้ ไม่ส่งไฟล์ไปบริการภายนอก และไม่เปิดลิงก์/สคริปต์ภายใน PDF
export async function preparePrintMedia(
  snapshot: SheetSnapshot,
  signal: AbortSignal,
  urls: string[],
  loadAsset?: (id: string) => Promise<ArrayBuffer>,
): Promise<PrintMedia> {
  const images: Record<string, string> = {},
    attachments: PrintMedia['attachments'] = [];
  let totalPages = 0;
  // ข้อมูลกราฟิกอยู่ในออเดอร์ฉบับที่ยืนยันแล้ว
  const items = [
    ...snapshot.context.assets.map((a) => ({
      ...a,
      url: `/api/v1/graphic-assets/${a.id}/content`,
      label: a.kind,
    })),
    ...snapshot.files.map((f) => ({
      ...f,
      url: `/api/v1/production/files/${f.id}/content`,
      label: f.part,
    })),
  ];
  for (const item of items) {
    if (signal.aborted) throw new DOMException('ยกเลิก', 'AbortError');
    let bytes: ArrayBuffer;
    if (loadAsset) bytes = await loadAsset(item.id);
    else {
      const response = await fetch(item.url, { credentials: 'same-origin', signal });
      if (!response.ok)
        throw new Error(`เปิดไฟล์ ${item.filename} ไม่ได้ กรุณาเข้าสู่ระบบและลองใหม่`);
      bytes = await response.arrayBuffer();
    }
    if (item.mime === 'application/pdf') {
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const task = pdfjs.getDocument({
        data: bytes,
        useSystemFonts: true,
        stopAtErrors: true,
        cMapUrl: '/pdfjs-assets/cmaps/',
        standardFontDataUrl: '/pdfjs-assets/standard_fonts/',
        wasmUrl: '/pdfjs-assets/wasm/',
        iccUrl: '/pdfjs-assets/iccs/',
      });
      const abort = () => {
        void task.destroy();
      };
      signal.addEventListener('abort', abort, { once: true });
      try {
        const pdf = await task.promise;
        totalPages += pdf.numPages;
        if (pdf.numPages > 20 || totalPages > 60)
          throw new Error(
            'PDF มีหน้ามากเกินสำหรับชุดพิมพ์นี้ (ต่อไฟล์ไม่เกิน 20 หน้า รวมไม่เกิน 60 หน้า) กรุณาแยกไฟล์ชิ้นงาน',
          );
        const pages: string[] = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          if (signal.aborted) throw new DOMException('ยกเลิก', 'AbortError');
          const page = await pdf.getPage(n),
            original = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: Math.min(2, 1600 / Math.max(original.width, original.height)),
          });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('เตรียมรูปจาก PDF ไม่สำเร็จ'))),
              'image/png',
            ),
          );
          const url = URL.createObjectURL(blob);
          urls.push(url);
          pages.push(url);
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
        }
        images[item.id] = pages[0];
        attachments.push({ filename: item.filename, label: item.label, pages });
      } finally {
        signal.removeEventListener('abort', abort);
        await task.destroy();
      }
    } else {
      const url = URL.createObjectURL(new Blob([bytes], { type: item.mime }));
      urls.push(url);
      const image = new Image();
      image.src = url;
      await image.decode();
      images[item.id] = url;
    }
  }
  return { images, attachments };
}
