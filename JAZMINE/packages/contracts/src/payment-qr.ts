import { z } from 'zod';
export const paymentQrCurrency = z.enum(['LAK', 'THB']);
export type PaymentQrCurrency = z.infer<typeof paymentQrCurrency>;
export const paymentQrSaveSchema = z
  .object({
    requestId: z.uuid(),
    version: z.number().int().min(0),
    bankName: z.string().trim().min(1).max(100),
    receiverName: z.string().trim().min(1).max(120),
    accountReference: z.string().trim().min(1).max(100),
    filename: z.string().trim().min(1).max(160).optional(),
    imageBase64: z.string().min(16).max(1400000).optional(),
    enabled: z.boolean(),
    verifiedInBankApp: z.boolean(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine((v) => !v.enabled || v.verifiedInBankApp, {
    message:
      'ກວດຜູ້ຮັບ ສະກຸນເງິນ ແລະ QR ໃນແອັບທະນາຄານກ່ອນ / Verify the recipient, currency and reusable QR in the bank app before enabling',
  });
export const paymentQrCheckSchema = z
  .object({
    versions: z
      .array(
        z.object({ currency: paymentQrCurrency, version: z.number().int().positive() }).strict(),
      )
      .min(1)
      .max(2)
      .refine((v) => new Set(v.map((s) => s.currency)).size === v.length),
  })
  .strict();
export type PaymentQrReference = {
  id: string;
  currency: PaymentQrCurrency;
  version: number;
  bankName: string;
  receiverName: string;
  accountReference: string;
  imageSha256: string;
};
export type PaymentQrView = {
  currency: PaymentQrCurrency;
  version: number;
  enabled: boolean;
  reference: PaymentQrReference | null;
  filename: string;
  verifiedInBankApp: boolean;
  actorName: string;
  createdAt: string | null;
  reason: string;
};
export type PaymentQrAttachment = PaymentQrReference & { image: string };
