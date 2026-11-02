import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import type { DocumentCurrentStatus } from '../../../../packages/contracts/src/documents';
export async function statusCopy(bytes: Uint8Array, status: DocumentCurrentStatus) {
  const pdf = await PDFDocument.load(bytes),
    font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mark =
    status.primary === 'CURRENT'
      ? status.flags.includes('PAYMENT_DETAILS_CHANGED')
        ? 'PAYMENT DETAILS CHANGED'
        : status.flags.includes('ORDER_REVISION_CHANGED')
          ? 'OLDER ORDER REVISION'
          : status.flags.includes('EXPIRED')
            ? 'EXPIRED QUOTATION'
            : 'CURRENT STATUS COPY'
      : status.primary.replaceAll('_', ' ');
  const flagLine = status.flags.map((f) => f.replaceAll('_', ' ')).join(' / ');
  const checked = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Vientiane',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(status.checkedAt));
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(mark, { x: 12, y: height - 14, font, size: 10, color: rgb(0.65, 0.1, 0.1) });
    page.drawText('Checked ' + checked + ' Lao time | Issued content preserved', {
      x: 12,
      y: height - 27,
      font,
      size: 10,
      color: rgb(0.35, 0.15, 0.15),
    });
    if (flagLine)
      page.drawText(flagLine, {
        x: width - 12 - font.widthOfTextAtSize(flagLine, 10),
        y: height - 14,
        font,
        size: 10,
        color: rgb(0.35, 0.15, 0.15),
      });
    if (status.primary !== 'CURRENT' || status.flags.some((f) => f !== 'ARCHIVED')) {
      const size = Math.min(56, (width * 0.8) / font.widthOfTextAtSize(mark, 1));
      page.drawText(mark, {
        x: width * 0.12,
        y: height * 0.38,
        font,
        size,
        rotate: degrees(30),
        opacity: 0.13,
        color: rgb(0.7, 0.05, 0.05),
      });
    }
  }
  pdf.setTitle(mark + ' - status checked ' + status.checkedAt);
  return pdf.save();
}
