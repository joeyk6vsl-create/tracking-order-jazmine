import { z } from 'zod';

export const catalogInput = z
  .object({
    kind: z.enum(['PRODUCT', 'FABRIC', 'COMPONENT']),
    name: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(1000).default(''),
    active: z.boolean().default(true),
    image: z.string().max(180000).nullable().optional(),
  })
  .strict();
export const catalogUpdate = catalogInput.extend({ rowVersion: z.number().int().positive() });
export type CatalogInput = z.infer<typeof catalogInput>;
export type CatalogItem = Omit<CatalogInput, 'image'> & {
  id: string;
  rowVersion: number;
  hasImage: boolean;
  section: string;
  displayGroup: number;
  displayOrder: number;
  sourceKey: string | null;
  availability: 'UNKNOWN' | 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK';
};
