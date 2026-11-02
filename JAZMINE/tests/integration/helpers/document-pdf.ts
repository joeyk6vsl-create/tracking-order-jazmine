import { PDFDocument } from 'pdf-lib';
import type { PdfRenderer } from '../../../apps/server/src/documents/pdf-renderer';
export const syntheticPdf: PdfRenderer = async (input) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([595.28, 841.89]);
  pdf.setTitle(input.source.kind + ' / ' + input.templateVersion);
  return pdf.save();
};
