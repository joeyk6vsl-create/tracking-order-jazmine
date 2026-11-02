import { uuidv7 } from 'uuidv7';
import { CUSTOMER_GROUPS } from '../../../../packages/contracts/src/customers';
import {
  SIZES,
  pricingConfigSchema,
  type PricingConfig,
} from '../../../../packages/contracts/src/pricing';
import type { Database } from '../database';
import { recordAudit } from '../shared/audit';
const rows = {
  RETAIL: [110000, 120000, 130000, 140000],
  AGENT_LEVEL_1: [70000, 85000, 85000, 85000],
  AGENT_LEVEL_2: [75000, 90000, 90000, 95000],
  AGENT_LEVEL_3: [85000, 100000, 100000, 105000],
  AGENT_LEVEL_4: [80000, 95000, 95000, 100000],
  AGENT_LEVEL_5: [90000, 105000, 105000, 110000],
};
const collars = {
  A: [
    'ຄໍມົນ',
    'ຄໍວີ',
    'ຄໍວີໄຂ່ວ',
    'ຄໍຄາງໝູໄຂ່ວ',
    'ຄໍມົນຕໍ່',
    'ຄໍຄາງໝູປາຍແຫຼມ',
    'ຄໍວີຊ້ອນ',
    'ຄໍຄາງໝູ',
  ],
  B: ['ຄໍ5ຫຼ່ຽມ', 'ຄໍ5ຫຼ່ຽມມີລີ້ນ', 'ຄໍຄາງໝູສາບ', 'ຄໍວາຍ'],
  C: ['ຄໍວີປົກ', 'ຄໍຄາງໝູປົກ'],
  D: ['ຄໍໂປໂລ', 'ຄໍຈີນ'],
} as const;
export async function seedPricing(db: Database) {
  return db.transaction(async (sql) => {
    await sql.query('LOCK TABLE pricing_versions IN EXCLUSIVE MODE');
    if ((await sql.query('SELECT id FROM pricing_versions LIMIT 1')).length) return false;
    const owner = (
      await sql.query(
        "SELECT id FROM users WHERE role='ADMIN_PROMAX' AND status='ACTIVE' ORDER BY id LIMIT 1",
      )
    )[0];
    if (!owner) return false;
    const size: PricingConfig['size'] = {} as PricingConfig['size'];
    for (const group of CUSTOMER_GROUPS) {
      size[group] = Object.fromEntries(
        SIZES.map((s) => {
          const n = Number(s.replace('XL', ''));
          const extra =
            /^\d+XL$/.test(s) && n >= 2 ? (n <= 3 ? 1 : n <= 5 ? 2 : n <= 7 ? 3 : 4) : 0;
          return [
            s,
            extra === 0
              ? 0
              : group === 'RETAIL'
                ? [0, 10000, 15000, 20000, 25000][extra]
                : extra * 5000,
          ];
        }),
      ) as PricingConfig['size'][typeof group];
    }
    const collar: PricingConfig['collar'] = {};
    for (const item of await sql.query(
      "SELECT source_key FROM catalog_items WHERE section='COLLAR'",
    ))
      for (const [group, names] of Object.entries(collars))
        if (names.some((name) => String(item.source_key).endsWith('/' + name + '.png')))
          collar[String(item.source_key)] = group as 'A' | 'B' | 'C' | 'D';
    const config = pricingConfigSchema.parse({ base: rows, size, collar, adjustments: {} });
    const id = uuidv7();
    await sql.query(
      'INSERT INTO pricing_versions(id,revision,config,source,reason,created_by) VALUES($1,1,$2,$3,$4,$5)',
      [
        id,
        JSON.stringify(config),
        'JAZMINE_PHASE_3_FULL_UPDATED.md §3.3–3.5',
        'นำเข้าราคาที่ระบุจริงในเอกสาร เจ้าของอนุญาต',
        owner.id,
      ],
    );
    await recordAudit(sql, String(owner.id), 'PRICING_IMPORTED', id, undefined, { revision: 1 });
    return true;
  });
}
