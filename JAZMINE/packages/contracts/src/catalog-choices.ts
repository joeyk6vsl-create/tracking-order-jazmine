import { z } from 'zod';
export const choicesSchema = z
  .object({
    rowVersion: z.number().int().positive(),
    sizes: z
      .array(z.string().trim().min(1).max(20))
      .max(40)
      .refine((a) => new Set(a.map((s) => s.toUpperCase())).size === a.length, 'ไซซ์ซ้ำกัน'),
    fabricIds: z
      .array(z.uuid())
      .max(200)
      .refine((a) => new Set(a).size === a.length, 'ผ้าซ้ำกัน'),
  })
  .strict();
export type CatalogChoicesInput = z.infer<typeof choicesSchema>;
export type CatalogChoices = CatalogChoicesInput & {
  fabrics: { id: string; name: string; active: boolean }[];
};
