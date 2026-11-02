---
version: "2.0"
name: "Apple-inspired Clear Web Layout"
language: "lo"
source: "Adapted from the user-provided apple-enriched.md"
description: "A reusable, content-first web design guide for clear page structure, responsive layouts, readable Lao typography, and useful interactions."
status: "Project design defaults; not an official Apple specification or a WCAG conformance report."
priority:
  - "User task and actual content"
  - "Readability and accessibility"
  - "Clear information hierarchy"
  - "Consistent visual style"
colors:
  primary: "#0066cc"
  on-primary: "#ffffff"
  primary-hover: "#0055aa"
  primary-soft: "#eaf3ff"
  ink: "#1d1d1f"
  body: "#515157"
  mute: "#64646b"
  canvas: "#ffffff"
  canvas-soft: "#f5f5f7"
  surface: "#ffffff"
  surface-dark: "#1d1d1f"
  on-dark: "#ffffff"
  hairline: "#d2d2d7"
  control-border: "#76767e"
  link: "#0066cc"
  link-hover: "#0055aa"
  focus: "#0066cc"
  success: "#176b3a"
  success-soft: "#eaf6ef"
  error: "#b42318"
  error-soft: "#fff1f0"
  warning: "#854d0e"
  warning-soft: "#fff8e6"
  overlay: "rgba(17, 24, 39, 0.48)"
typography:
  fontFamily: '"Noto Sans Lao", "Phetsarath OT", system-ui, -apple-system, "Segoe UI", sans-serif'
  display:
    fontSize: "clamp(2rem, 1.25rem + 3vw, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.4
  h1:
    fontSize: "clamp(1.75rem, 1.25rem + 2vw, 2.75rem)"
    fontWeight: 600
    lineHeight: 1.45
  h2:
    fontSize: "clamp(1.5rem, 1.15rem + 1.4vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.5
  h3:
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.8
  lead:
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.8
  small:
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.6
  letterSpacing: "normal"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  4xl: "96px"
  section: "clamp(3rem, 6vw, 6rem)"
rounded:
  none: "0px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  card: "16px"
  button: "12px"
  pill: "9999px"
  circle: "50%"
layout:
  container: "1200px"
  container-wide: "1440px"
  reading: "720px"
  form: "640px"
  auth: "440px"
  sidebar: "240px"
  aside: "320px"
  gutter-mobile: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "32px"
  gap-mobile: "16px"
  gap-desktop: "24px"
  breakpoints:
    tablet: "768px"
    desktop: "1024px"
    wide: "1280px"
  columns:
    mobile: 4
    tablet: 8
    desktop: 12
elevation:
  card: "none"
  raised: "0 4px 16px rgba(17, 24, 39, 0.08)"
  overlay: "0 16px 48px rgba(17, 24, 39, 0.16)"
motion:
  fast: "120ms"
  normal: "180ms"
  easing: "ease-out"
  reduced-motion: "Remove nonessential movement and smooth scrolling."
components:
  header:
    minHeight: "64px"
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  button-primary:
    minHeight: "44px"
    minWidth: "44px"
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.button}"
    padding: "{spacing.sm} {spacing.lg}"
  button-secondary:
    minHeight: "44px"
    minWidth: "44px"
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.control-border}"
    rounded: "{rounded.button}"
    padding: "{spacing.sm} {spacing.lg}"
  input:
    minHeight: "48px"
    fontSize: "1rem"
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.control-border}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.lg}"
    shadow: "{elevation.card}"
  modal:
    maxWidth: "560px"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
    shadow: "{elevation.overlay}"
  badge:
    rounded: "{rounded.pill}"
    padding: "{spacing.xxs} {spacing.sm}"
  table:
    cellPadding: "{spacing.sm} {spacing.md}"
    headerBackground: "{colors.canvas-soft}"
    dividerColor: "{colors.hairline}"
---

# ຄູ່ມືອອກແບບເວັບ: ສວຍງາມ, ຊັດເຈນ ແລະ ໃຊ້ງານງ່າຍ

ສະບັບ 2.0 · ປັບປຸງ 30 ກັນຍາ 2026 · ດັດແປງຈາກ `apple-enriched.md`

ໃຊ້ຟາຍນີ້ເປັນຄູ່ມືສຳລັບນັກອອກແບບ, ນັກພັດທະນາ ຫຼື AI ເມື່ອວາງໂຄງສ້າງໜ້າເວັບ. ຮັກສາຄວາມລຽບງ່າຍ, ພື້ນທີ່ວ່າງ ແລະ ຄວາມປະນີດຈາກຟາຍເດີມ ແລ້ວເພີ່ມໂຄງສ້າງໜ້າທີ່ເລືອກໃຊ້ຕາມວຽກຈິງ.

**ເປົ້າໝາຍ:** ເມື່ອເປີດໜ້າເວັບ ຜູ້ໃຊ້ຄວນຮູ້ວ່າ “ນີ້ແມ່ນຫຍັງ”, “ຊ່ວຍຂ້ອຍໄດ້ແນວໃດ” ແລະ “ຂ້ອຍຄວນເຮັດຫຍັງຕໍ່”.

ຄ່າໃນ YAML ດ້ານເທິງເປັນ design tokens ຂອງຄູ່ມືນີ້. ຂໍ້ຄວາມເຊັ່ນ `{colors.ink}` ແມ່ນການອ້າງອີງ token; ຕ້ອງແປງເປັນຄ່າ CSS ຫຼື theme ກ່ອນນຳໄປໃຊ້ໃນເວັບ. ຟາຍນີ້ບໍ່ໄດ້ໂຫຼດຟອນ ຫຼື ສ້າງເວັບໃຫ້ເອງ.

## 1. ວິທີໃຊ້ຄູ່ມື

1. ຂຽນໃຫ້ຊັດວ່າເວັບແມ່ນຂອງໃຜ, ຜູ້ໃຊ້ແມ່ນໃຜ ແລະ ວຽກຫຼັກຂອງໜ້ານັ້ນແມ່ນຫຍັງ.
2. ເລືອກ layout ຈາກພາກ 6 ໃຫ້ກົງກັບວຽກ. ເລືອກສະເພາະສ່ວນທີ່ມີເນື້ອໃນຈິງ.
3. ຈັດລຳດັບເນື້ອໃນເທິງມືຖືກ່ອນ ແລ້ວຂະຫຍາຍເປັນຫຼາຍຖັນໃນຈໍໃຫຍ່.
4. ໃຊ້ສີ, ຕົວໜັງສື, ໄລຍະຫ່າງ ແລະ ຮູບແບບປຸ່ມຈາກ tokens ດຽວກັນ.
5. ອອກແບບສະຖານະໂຫຼດ, ຂໍ້ມູນວ່າງ, ຜິດພາດ ແລະ ສຳເລັດ ພ້ອມໜ້າປົກກະຕິ.
6. ກວດຕາມ checklist ໃນພາກ 12 ແລະ ລອງໃຫ້ຄົນທີ່ບໍ່ເຄີຍເຫັນໜ້ານີ້ເຮັດວຽກຫຼັກ.

ຖ້າໂຄງການມີສີປະຈຳແບຣນ ຫຼື ລະບົບອອກແບບຢູ່ແລ້ວ ໃຫ້ປັບ tokens ໃຫ້ເຂົ້າກັນ. ຄຳສັ່ງຂອງຜູ້ໃຊ້ ແລະ ຂໍ້ກຳນົດຂອງໂຄງການເປັນຫຼັກ; ຄ່າອອກແບບນີ້ເປັນຈຸດເລີ່ມຕົ້ນທີ່ປັບໄດ້.

## 2. ສິ່ງທີ່ປັບຈາກຟາຍເດີມ

| ຫົວຂໍ້ | ຟາຍເດີມ | ສະບັບນີ້ |
|---|---|---|
| ເປົ້າໝາຍ | ໜ້າໂຊວ໌ສິນຄ້າແບບ Apple | ໂຄງສ້າງໜ້າເວັບຕາມວຽກຂອງຜູ້ໃຊ້ |
| ຂອບບັດ | 980px | 16px ປົກກະຕິ; 24px ສຳລັບພື້ນທີ່ໃຫຍ່ |
| ຂອບປຸ່ມ | 50% | 12px ປົກກະຕິ; 9999px ຖ້າຕ້ອງການ pill |
| ຕົວໜັງສື | SF Pro ແລະ tracking ຕິດລົບ | ຟອນທີ່ຮອງຮັບລາວ, tracking ປົກກະຕິ, ແຖວບໍ່ເບັຽດ |
| ໄລຍະຫ່າງ | ຫຼາຍຄ່າໃກ້ຄຽງກັນ | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96px |
| ຈໍມືຖື | ຄຳແນະນຳລວມ | ລຳດັບເນື້ອໃນ ແລະ ພຶດຕິກຳຂອງແຕ່ລະ layout |
| ການໃຊ້ງານ | ເນັ້ນຮູບລັກສະນະ | ເພີ່ມການນຳທາງ, ຄຳອະທິບາຍ, ສະຖານະ ແລະ keyboard |

ສີຂາວ–ເທົາ, ຂໍ້ຄວາມສີເຂັ້ມ ແລະ ສີຟ້າສຳລັບການກະທຳ ຍັງເປັນພາສາພາບຫຼັກ. ອະນຸຍາດເງົາອ່ອນເມື່ອຕ້ອງສື່ວ່າມີຊັ້ນຊ້ອນ ເຊັ່ນ ເມນູ ຫຼື modal.

## 3. ລຳດັບຂໍ້ມູນ ແລະ ການນຳທາງ

### ແຕ່ລະໜ້າຕ້ອງມີວຽກຫຼັກ

ກ່ອນວາດໜ້າ ໃຫ້ຕື່ມ brief ສັ້ນໆ:

| ຄຳຖາມ | ຕົວຢ່າງຄຳຕອບ |
|---|---|
| ໃຜຈະໃຊ້? | ລູກຄ້າທີ່ກຳລັງເລືອກບໍລິການ |
| ເຂົາຕ້ອງການຮູ້ຫຍັງກ່ອນ? | ບໍລິການຊ່ວຍຫຍັງ, ລາຄາ, ວິທີຈອງ |
| ການກະທຳຫຼັກແມ່ນຫຍັງ? | ເລືອກວັນ ແລະ ຈອງຄິວ |
| ຕ້ອງມີຫຍັງຈຶ່ງຕັດສິນໃຈໄດ້? | ລາຍລະອຽດ, ລາຄາລວມ, ເງື່ອນໄຂ |
| ສຳເລັດແລ້ວຈະເຫັນຫຍັງ? | ເລກຈອງ, ວັນເວລາ ແລະ ຂັ້ນຕອນຕໍ່ໄປ |

### ຫຼັກການຈັດໜ້າ

- ໃຫ້ມີຈຸດເດັ່ນຫຼັກໜຶ່ງຈຸດໃນແຕ່ລະສ່ວນ: ຫົວຂໍ້, ຕົວເລກສຳຄັນ ຫຼື ການກະທຳທີ່ຜູ້ໃຊ້ຕ້ອງເຮັດ.
- ໃຊ້ປຸ່ມ primary ໜຶ່ງປຸ່ມຕໍ່ກຸ່ມການຕັດສິນໃຈ. ປຸ່ມອື່ນໃຊ້ secondary ຫຼື ລິ້ງ. ສາມາດຊ້ຳ CTA ດຽວກັນຢູ່ທ້າຍໜ້າຍາວໄດ້.
- ວາງຂໍ້ມູນທີ່ກ່ຽວກັນໃກ້ກັນ; ເວັ້ນຫ່າງລະຫວ່າງກຸ່ມຫຼາຍກວ່າລະຫວ່າງລາຍການພາຍໃນກຸ່ມ.
- ໃຊ້ຫົວຂໍ້ທີ່ບອກເນື້ອໃນ ເຊັ່ນ “ລາຄາ ແລະ ສິ່ງທີ່ໄດ້ຮັບ” ຫຼື “ລາຍການທີ່ຕ້ອງດຳເນີນການ”.
- ໃຫ້ຄວາມສຳຄັນກັບຄວາມໝາຍກ່ອນຄວາມສົມມາດ. ບໍ່ຈຳເປັນຕ້ອງມີ 3 ບັດເພາະ layout ມີ 3 ຖັນ.
- ການເປີດລາຍລະອຽດເພີ່ມເໝາະກັບ FAQ ຫຼື ຕົວເລືອກຂັ້ນສູງ. ລາຄາ, ເງື່ອນໄຂສຳຄັນ ແລະ ຂໍ້ຜິດພາດຄວນເຫັນຊັດ.

### ເມນູ ແລະ ຕຳແໜ່ງ

- ເວັບທົ່ວໄປເລີ່ມຈາກເມນູຫຼັກປະມານ 4–6 ລາຍການ; ປັບຕາມເນື້ອໃນຈິງ.
- ສະແດງໜ້າທີ່ກຳລັງເປີດດ້ວຍພື້ນຫຼັງ, ເສັ້ນ ຫຼື ນ້ຳໜັກຕົວໜັງສື ພ້ອມ `aria-current="page"` ໃນລິ້ງທີ່ກ່ຽວຂ້ອງ.
- ໃຊ້ breadcrumb ເມື່ອມີລຳດັບໝວດໝູ່; ລິ້ງກັບຄືນຄວນບອກປາຍທາງ ເຊັ່ນ “ກັບໄປລາຍການສິນຄ້າ”.
- ເມນູມືຖືໃຊ້ປຸ່ມທີ່ມີຊື່, ສະຖານະເປີດ/ປິດ ແລະ ປຸ່ມປິດທີ່ຊັດ. ຄຸມໄດ້ດ້ວຍ keyboard.
- ໃຊ້ tabs ສຳລັບມຸມມອງທີ່ກ່ຽວກັນ; ບໍ່ໃຊ້ tabs ແທນລຳດັບຂັ້ນຕອນທີ່ຕ້ອງເຮັດຕໍ່ກັນ.

## 4. ລະບົບພາບ: ສີ, ຕົວໜັງສື ແລະ ພື້ນທີ່ວ່າງ

### ສີ ແລະ ພື້ນຜິວ

| ບົດບາດ | Token | ການໃຊ້ |
|---|---|---|
| ຫົວຂໍ້ | `colors.ink` | ຂໍ້ຄວາມທີ່ສຳຄັນສຸດ |
| ເນື້ອໃນ | `colors.body` | ຄຳອະທິບາຍ ແລະ ຂໍ້ຄວາມທົ່ວໄປ |
| ຂໍ້ມູນຮອງ | `colors.mute` | ວັນທີ ແລະ ຂໍ້ມູນປະກອບທີ່ຍັງອ່ານໄດ້ຊັດ |
| ການກະທຳ | `colors.primary` | ປຸ່ມຫຼັກ; ລິ້ງໃຊ້ `colors.link` |
| ພື້ນທີ່ເຮັດວຽກ | `colors.canvas-soft` | ພື້ນຫຼັງ dashboard ຫຼື ສ່ວນທີ່ຕ້ອງແຍກອອກ |
| ພື້ນທີ່ອ່ານ | `colors.canvas` | ບົດຄວາມ, ແບບຟອມ ແລະ ພື້ນໜ້າທົ່ວໄປ |
| ເສັ້ນແບ່ງ | `colors.hairline` | ການແບ່ງກຸ່ມທີ່ມີຕົວຊ່ວຍອື່ນຢູ່ແລ້ວ |
| ຂອບຊ່ອງກອກ | `colors.control-border` | ຂອບທີ່ຈຳເປັນໃຫ້ເຫັນວ່າກອກ ຫຼື ກົດໄດ້ |

ລິ້ງໃນວັກຂໍ້ຄວາມໃຫ້ຂີດກ້ອງ. ສີ success/error/warning ໃຊ້ຄູ່ກັບຂໍ້ຄວາມສະຖານະ ຫຼື ສັນຍາລັກທີ່ມີຊື່. ຢ່າໃຊ້ສີຢ່າງດຽວເພື່ອບອກຄວາມໝາຍ.

ໜ້າສີເຂັ້ມໃຊ້ `on-dark` ສຳລັບຂໍ້ຄວາມ. ສີລິ້ງຟ້າໃນຊຸດນີ້ອອກແບບມາສຳລັບພື້ນອ່ອນ; ຖ້າສ້າງ dark mode ຕ້ອງກຳນົດຄູ່ສີໃໝ່ ແລະ ກວດ contrast ແຕ່ລະສະຖານະ.

### ຕົວໜັງສືລາວ

- ເລີ່ມຈາກ body 16px (`1rem`) ແລະ line-height 1.8; ປັບຕາມຟອນແລະການອ່ານຈິງ. ຂໍ້ມູນຮອງໃຊ້ 14px ໄດ້ ແຕ່ບໍ່ຄວນຫຍໍ້ຂໍ້ມູນສຳຄັນເພື່ອໃຫ້ພໍດີພື້ນທີ່.
- ໃຊ້ `Noto Sans Lao` ຫຼື ຟອນທີ່ທົດສອບແລ້ວວ່າຮອງຮັບພາສາລາວ. ການລະບຸຊື່ໃນ `font-family` ບໍ່ໄດ້ດາວໂຫຼດຟອນ: ໃຫ້ຈັດການ font asset ແລະ fallback ໃນໂຄງການ.
- ໃຊ້ `lang="lo"` ສຳລັບເນື້ອໃນລາວ ແລະ letter-spacing ປົກກະຕິ. ກວດສະຫຼະ, ວັນນະຍຸດ ແລະ ການຕັດແຖວໃນບຣາວເຊີທີ່ໃຊ້ຈິງ.
- ຫົວຂໍ້ໃຊ້ນ້ຳໜັກ 600 ເປັນຫຼັກ; 700 ໃຊ້ໄດ້ຖ້າຟອນ ແລະ ລຳດັບຂໍ້ມູນຕ້ອງການ.
- ຂໍ້ຄວາມຍາວຈັດຊ້າຍ. ຈັດກາງສຳລັບ hero ສັ້ນ ຫຼື ຂໍ້ຄວາມສຳເລັດສັ້ນໆ.
- ຢ່າບັງຄັບຄວາມສູງຂອງກ່ອງຂໍ້ຄວາມ. ປຸ່ມແລະຫົວຂໍ້ຕ້ອງຂະຫຍາຍເມື່ອຂໍ້ຄວາມຍາວ ຫຼື ຜູ້ໃຊ້ຂະຫຍາຍຕົວໜັງສື.

### ໄລຍະຫ່າງ ແລະ ຮູບຮ່າງ

| ຄວາມສຳພັນ | ໄລຍະເລີ່ມຕົ້ນ |
|---|---|
| Icon ກັບຊື່ / label ກັບຊ່ອງກອກ | 8px |
| ຫົວຂໍ້ກັບຄຳອະທິບາຍ | 12–16px |
| ລາຍການພາຍໃນກຸ່ມ | 16px |
| ລະຫວ່າງບັດ / ກຸ່ມຟອມ | 24–32px |
| Padding ບັດ | 16px ໃນມືຖື; 24px ໃນຈໍໃຫຍ່ |
| ລະຫວ່າງສ່ວນໃຫຍ່ | 48–96px |

ບັດໃຊ້ຂອບມົນ 16px, ປຸ່ມ/ຊ່ອງກອກ 12px. ໃຊ້ pill 9999px ສຳລັບ badge ຫຼື ປຸ່ມທີ່ຕັ້ງໃຈໃຫ້ເປັນ pill. `border-radius: 50%` ສ້າງວົງມົນໃນກ່ອງສີ່ຫຼ່ຽມຈັດຕຸລັດ ແລະ ອາດເປັນວົງຣີໃນກ່ອງຍາວ; ຈຶ່ງບໍ່ໃຊ້ເປັນຄ່າ pill ທົ່ວໄປ. [ອ້າງອີງ MDN: border-radius](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/border-radius)

## 5. Grid ແລະ responsive layout

### ກອບເນື້ອໃນ

| ຈຸດປະສົງ | ຄວາມກວ້າງສູງສຸດ | ໝາຍເຫດ |
|---|---|---|
| ເວັບທົ່ວໄປ / ໜ້າສິນຄ້າ | 1200px | ຈັດກາງ; ຂອບນອກເພີ່ມຕາມຈໍ |
| Dashboard / ຕາຕະລາງ | 1440px | ອາດກວ້າງກວ່ານີ້ຖ້າວຽກຕ້ອງການ |
| ບົດຄວາມ | 720px | ທົດສອບຄວາມຍາວແຖວກັບພາສາຈິງ |
| ແບບຟອມ | 640px | ກອກຈາກເທິງລົງລຸ່ມ |
| ເຂົ້າລະບົບ | 440px | ເນັ້ນວຽກດຽວ |

ຄ່າເຫຼົ່ານີ້ແມ່ນ `max-width`, ບໍ່ແມ່ນຄວາມກວ້າງຄົງທີ່. ທຸກກອບຕ້ອງຫຍໍ້ໄດ້ຕາມພື້ນທີ່.

### ພຶດຕິກຳຕາມຂະໜາດ

| ຄວາມກວ້າງຈໍ | Grid ອ້າງອີງ | ຂອບຂ້າງ | ຮູບແບບຫຼັກ |
|---|---|---|---|
| ຕ່ຳກວ່າ 768px | 4 ຖັນ | 16px | ເນື້ອໃນຫຼັກ 1 ຖັນ |
| 768–1023px | 8 ຖັນ | 24px | 1–2 ຖັນຕາມພື້ນທີ່ຈິງ |
| 1024px ຂຶ້ນໄປ | 12 ຖັນ | 32px | ແບ່ງ 6/6, 8/4 ຫຼື 3/9 ຕາມວຽກ |

Grid ເປັນເສັ້ນຈັດແນວ; ບໍ່ໄດ້ໝາຍຄວາມວ່າຕ້ອງມີ 4 ຫຼື 12 ບັດຕໍ່ແຖວ. ການແບ່ງຖັນຕ້ອງພິຈາລະນາພື້ນທີ່ທີ່ເຫຼືອຫຼັງຈາກ sidebar ດ້ວຍ.

- ຖ້າເມນູ ຫຼື ຂໍ້ຄວາມເລີ່ມຊົນກັນ ໃຫ້ປ່ຽນ layout ໄວຂຶ້ນ. Breakpoints ຂ້າງເທິງເປັນຄ່າເລີ່ມຕົ້ນ.
- ໃຫ້ລຳດັບໃນ HTML ກົງກັບລຳດັບອ່ານ; ຫຼີກລ້ຽງການຍ້າຍດ້ວຍ CSS ຈົນ keyboard ເດີນຄົນລະທາງກັບສາຍຕາ.
- ຮູບໃຊ້ຂະໜາດທີ່ຫຍໍ້ໄດ້ ແລະ ຈອງອັດຕາສ່ວນໄວ້. `object-fit: contain` ເໝາະກັບຮູບສິນຄ້າທີ່ຕ້ອງເຫັນຄົບ; `cover` ເໝາະເມື່ອຕັດຮູບໄດ້.
- ສິ່ງທີ່ຕິດຂອບຈໍ (sticky) ຕ້ອງບໍ່ບັງເນື້ອໃນ ຫຼື focus. ທົດສອບເມື່ອແປ້ນພິມມືຖືເປີດ ແລະ ເມື່ອຈໍເຕ້ຍ.
- ຢ່າແກ້ layout ລົ້ນດ້ວຍການປິດ `overflow-x` ຂອງທັງໜ້າ; ແກ້ທີ່ສ່ວນທີ່ລົ້ນ ຫຼື ໃຫ້ຕາຕະລາງເລື່ອນພາຍໃນກອບຂອງມັນ.

## 6. ແບບໂຄງສ້າງໜ້າເວັບ — Layout recipes

ແຜນຜັງຕໍ່ໄປນີ້ສະແດງລຳດັບແລະຄວາມສຳພັນ, ບໍ່ແມ່ນຂະໜາດຄົງທີ່. ຂໍ້ຄວາມໃນວົງເລັບເຫຼ່ຽມແມ່ນຊື່ສ່ວນທີ່ຕ້ອງແທນດ້ວຍເນື້ອໃນຈິງ.

### A. ໜ້າແນະນຳທຸລະກິດ ຫຼື ບໍລິການ — Landing page

**ວຽກຫຼັກ:** ເຂົ້າໃຈສິ່ງທີ່ສະເໜີ ແລະ ເລີ່ມການກະທຳທີ່ຊັດເຈນ.

```text
[Logo]                  [Main navigation] [Contact / Start]
---------------------------------------------------------
[Clear headline + short explanation] | [Relevant visual]
[Primary action] [Secondary link]    | [Real product/demo]
---------------------------------------------------------
[Relevant proof, only when available]
[Benefits / services: 2–3 meaningful groups]
[How it works: ordered steps, when needed]
[Price / key conditions, when applicable]
[Common questions, when useful]
[Final action]                         [Footer]
```

- Desktop: hero 6/6 ຫຼື ຈັດກາງແບບໜຶ່ງຖັນຖ້າຂໍ້ຄວາມສັ້ນ. ຮູບຕ້ອງຊ່ວຍອະທິບາຍສິ່ງທີ່ສະເໜີ.
- Mobile: ຫົວຂໍ້ → ຄຳອະທິບາຍ → ປຸ່ມ → ຮູບ → ສ່ວນຕໍ່ໄປ. ປຸ່ມອາດເຕັມຄວາມກວ້າງ; ບໍ່ບັງຄັບ hero ເຕັມຄວາມສູງຈໍ.
- ຫົວຂໍ້ບອກຜົນປະໂຫຍດທີ່ຈິງ. ປຸ່ມບອກການກະທຳ ເຊັ່ນ “ເບິ່ງບໍລິການ” ຫຼື “ຈອງຄິວ”.
- ໃສ່ຄຳຮັບຮອງ, ໂລໂກ້ລູກຄ້າ ແລະ ສະຖິຕິສະເພາະທີ່ມີຂໍ້ມູນຈິງ. ຕັດສ່ວນທີ່ບໍ່ຊ່ວຍການຕັດສິນໃຈອອກ.

### B. ໜ້າລາຍການ ແລະ ຄົ້ນຫາ — Catalog / Search

**ວຽກຫຼັກ:** ຫາ, ກັ່ນຕອງ ແລະ ປຽບທຽບລາຍການ.

```text
[Header]
[Page title + short context]
[Search]                         [Sort]
[Applied filters + clear]        [Result count]
---------------------------------------------------------
[Filters] | [Item] [Item] [Item]
          | [Item] [Item] [Item]
          | [Pagination / Load more]
```

- Desktop: sidebar ປະມານ 240px ແລະ ພື້ນທີ່ຜົນລັບທີ່ຂະຫຍາຍໄດ້; ຈຳນວນບັດຕໍ່ແຖວຂຶ້ນກັບຄວາມກວ້າງທີ່ເຫຼືອ.
- Mobile: search → ປຸ່ມ “ຕົວກອງ” ແລະ sort → ຈຳນວນຜົນລັບ → ລາຍການ. ຕົວກອງເປີດໃນ panel ທີ່ປິດໄດ້ ແລະ ຮັກສາຄ່າທີ່ເລືອກ.
- ບັດມີຮູບ, ຊື່, ຂໍ້ມູນທີ່ໃຊ້ປຽບທຽບ, ລາຄາຖ້າມີ ແລະ ລິ້ງລາຍລະອຽດ. ລຳດັບຂໍ້ມູນເໝືອນກັນທຸກບັດ.
- ລາຍການທີ່ເນັ້ນຂໍ້ຄວາມ ຫຼື ການປຽບທຽບຕົວເລກໃຊ້ list/table ໄດ້; ບໍ່ຈຳເປັນເປັນບັດທັງໝົດ.
- ສະແດງຕົວກອງທີ່ໃຊ້ຢູ່ ແລະ ວິທີລ້າງ. ເມື່ອກັບຈາກລາຍລະອຽດ ໃຫ້ຮັກສາຄຳຄົ້ນ, ຕົວກອງ ແລະ ຕຳແໜ່ງອ່ານຖ້າເຮັດໄດ້.
- ບໍ່ພົບຜົນລັບ: ບອກວ່າບໍ່ພົບຫຍັງ ພ້ອມ “ລ້າງຕົວກອງ” ຫຼື ຄຳແນະນຳປ່ຽນຄຳຄົ້ນ.

### C. ໜ້າລາຍລະອຽດ — Product / Service detail

**ວຽກຫຼັກ:** ຕັດສິນໃຈໄດ້ຈາກຂໍ້ມູນທີ່ຄົບ ແລະ ເລືອກຂັ້ນຕອນຕໍ່ໄປ.

```text
[Header] > [Category] > [Current item]
[Title + concise summary]
---------------------------------------------------------
[Image / gallery] | [Price / key information]
[Image / gallery] | [Options / availability]
                  | [Primary action]
                  | [Delivery / booking / key conditions]
---------------------------------------------------------
[Details] [Specifications / inclusions] [FAQ if needed]
[Related items, when useful]
```

- Desktop: gallery ແລະ ຂໍ້ມູນຕັດສິນໃຈແບ່ງ 6/6; ປັບໄດ້ຕາມຮູບແລະຂໍ້ມູນ.
- Mobile: ຊື່ → ຮູບຫຼັກ → ລາຄາ/ຂໍ້ມູນຫຼັກ → ຕົວເລືອກ → ປຸ່ມ → ລາຍລະອຽດ. ຮູບເສີມຄວນບໍ່ຍູ້ການຕັດສິນໃຈໄປໄກ.
- ສະແດງລາຄາ, ຄ່າໃຊ້ຈ່າຍທີ່ຮູ້ ແລະ ເງື່ອນໄຂສຳຄັນໃກ້ປຸ່ມ. ຖ້າຍັງຄຳນວນບໍ່ໄດ້ ໃຫ້ບອກວ່າຈະຄຳນວນຕອນໃດ.
- ຕົວເລືອກທີ່ໃຊ້ບໍ່ໄດ້ຕ້ອງບອກເຫດຜົນ. ເມື່ອເພີ່ມສິນຄ້າ ຫຼື ຈອງແລ້ວ ໃຫ້ຢືນຢັນຜົນແລະທາງໄປຕໍ່.

### D. ໜ້າສະຫຼຸບ ແລະ ຈັດການ — Dashboard

**ວຽກຫຼັກ:** ເຫັນສະຖານະ, ຮູ້ສິ່ງທີ່ຕ້ອງເຮັດ ແລະ ເປີດລາຍລະອຽດໄດ້.

```text
[Sidebar] | [Page title + date range] [Primary action]
          | [Important notice / work requiring attention]
          | [Key metric] [Key metric] [Key metric]
          | [Main chart / overview] | [Next actions]
          | [Search + filters]
          | [Recent / actionable records table]
```

- Desktop: sidebar 240px; ເນື້ອໃນຫຼັກປັບຕາມພື້ນທີ່. ໃຊ້ 8/4 ສຳລັບ chart ແລະ ລາຍການວຽກເມື່ອມີພື້ນທີ່ພໍ.
- Mobile: sidebar ເປັນເມນູເປີດ/ປິດ; ຫົວຂໍ້ → ວຽກດ່ວນ → ຕົວເລກ → ກາຟ → ລາຍການ. ບັດຕົວເລກໃຊ້ 1 ຫຼື 2 ຖັນຖ້າອ່ານໄດ້ຄົບ.
- ເລືອກຕົວເລກປະມານ 3–4 ຕົວທີ່ຊ່ວຍຕັດສິນໃຈ. ສະແດງຊື່, ໜ່ວຍ, ຊ່ວງເວລາ ແລະ ຖານທີ່ໃຊ້ປຽບທຽບ.
- ກາຟຕ້ອງຕອບຄຳຖາມໄດ້. ມີຄຳສະຫຼຸບ ຫຼື ຕາຕະລາງຂໍ້ມູນສຳລັບຄົນທີ່ອ່ານກາຟບໍ່ສະດວກ.
- ຂໍ້ມູນເກົ່າ ຫຼື ໂຫຼດບໍ່ໄດ້ຕ້ອງມີປ້າຍບອກ; ບໍ່ປ່ຽນຄ່າທີ່ຍັງບໍ່ຮູ້ເປັນ 0.

### E. ໜ້າລາຍການວຽກ ແລະ ລາຍລະອຽດ — List / Detail workspace

**ວຽກຫຼັກ:** ເລືອກລາຍການແລ້ວເຮັດວຽກກັບມັນ ເຊັ່ນ ອໍເດີ, ລູກຄ້າ ຫຼື ເອກະສານ.

```text
[App navigation]
[Page title]                            [Create item]
[Search / filters]
---------------------------------------------------------
[List of records] | [Selected record title + status]
[Selected record] | [Relevant details]
[More records]    | [Available actions / activity]
```

- Desktop: ລາຍການປະມານ 320–400px ແລະ ລາຍລະອຽດທີ່ຂະຫຍາຍໄດ້. ໃຫ້ລາຍການທີ່ເລືອກມີຕົວບອກຊັດ.
- Mobile: ສະແດງລາຍການກ່ອນ; ເປີດລາຍລະອຽດເປັນໜ້າທີ່ມີທາງກັບຄືນ. ຮັກສາຕົວກອງ ແລະ ລາຍການທີ່ເລືອກ.
- ປຸ່ມຂອງລາຍການໃຫ້ຢູ່ໃກ້ຫົວຂໍ້ລາຍການ; ປຸ່ມສ້າງໃໝ່ໃຫ້ຢູ່ລະດັບໜ້າ.
- ຢ່າຊ່ອນວຽກທີ່ໃຊ້ເລື້ອຍໃນເມນູຈຸດສາມຈຸດທັງໝົດ. ການລຶບໃຫ້ແຍກຈາກປຸ່ມປົກກະຕິ.

### F. ແບບຟອມ, ການຈອງ ແລະ ການສັ່ງຊື້ — Form / Checkout

**ວຽກຫຼັກ:** ກອກຂໍ້ມູນທີ່ຈຳເປັນ ແລະ ຮູ້ວ່າຈະເກີດຫຍັງເມື່ອຢືນຢັນ.

```text
[Page title + what this form does]
[Progress, only for a multi-step process]
---------------------------------------------------------
[Labels + fields in logical groups] | [Summary, if needed]
[Help / validation beside fields]   | [Costs / conditions]
---------------------------------------------------------
[Back / Cancel]                     [Explicit submit action]
```

- ແບບຟອມທົ່ວໄປໃຊ້ໜຶ່ງຖັນ max-width 640px. ສອງຖັນໃຊ້ກັບຂໍ້ມູນສັ້ນທີ່ກ່ຽວກັນຈິງ ແລະ ກັບເປັນໜຶ່ງຖັນໃນມືຖື.
- Checkout ທີ່ມີ summary ໃຊ້ກອບ 1200px ແບ່ງ 8/4 ໃນ desktop. Mobile ໃຫ້ສະຫຼຸບຄ່າໃຊ້ຈ່າຍຢູ່ກ່ອນປຸ່ມຢືນຢັນ.
- ວາງ label ເທິງ input; placeholder ໃຊ້ເປັນຕົວຢ່າງໄດ້ ແຕ່ບໍ່ແທນ label. ບອກຊ່ອງທີ່ບໍ່ຈຳເປັນດ້ວຍ “ບໍ່ບັງຄັບ”.
- ເລືອກຊະນິດ input, autocomplete ແລະ ແປ້ນພິມໃຫ້ກົງຂໍ້ມູນ. ເບີໂທ, ລະຫັດໄປສະນີ ແລະ ເລກອ້າງອີງບໍ່ແມ່ນຈຳນວນສຳລັບຄິດໄລ່.
- ເມື່ອຜິດພາດ ໃຫ້ບອກຊ່ອງ ແລະ ວິທີແກ້. ຮັກສາຄ່າທີ່ກອກແລ້ວ. ຟອມຍາວມີສະຫຼຸບຂໍ້ຜິດພາດທີ່ໄປຫາຊ່ອງນັ້ນໄດ້.
- ປຸ່ມໃຊ້ຄຳທີ່ບອກຜົນ ເຊັ່ນ “ບັນທຶກຂໍ້ມູນ”, “ຢືນຢັນການຈອງ” ຫຼື “ຊຳລະ [ຍອດລວມ]”.
- ໃນລະຫວ່າງສົ່ງຂໍ້ມູນ ສະແດງ “ກຳລັງບັນທຶກ…” ແລະ ປ້ອງກັນການສົ່ງຊ້ຳ. ສຳເລັດແລ້ວຕ້ອງບອກຜົນ ແລະ ຂັ້ນຕອນຕໍ່ໄປ.

### G. ບົດຄວາມ ແລະ ຄູ່ມື — Article / Documentation

**ວຽກຫຼັກ:** ອ່ານ, ຊອກຫາຄຳຕອບ ແລະ ໄປຫາຫົວຂໍ້ທີ່ຕ້ອງການ.

```text
[Header + search when needed]
[Breadcrumb]
[Title + short summary + relevant date/author]
---------------------------------------------------------
[Article sections, max 720px] | [On this page, if long]
[Examples / illustrations]  |
[Related next step / related content]
```

- Desktop: ຄໍລຳອ່ານ 720px ຫຼື ແຄບກວ່າຕາມຟອນ; ສາລະບານຂ້າງໆສຳລັບບົດຍາວ. ເວັບຄູ່ມືຂະໜາດໃຫຍ່ອາດມີເມນູໝວດໝູ່ເພີ່ມ.
- Mobile: ສາລະບານຢູ່ກ່ອນເນື້ອໃນ ແລະ ພັບໄດ້ຖ້າຍາວ. ບົດຄວາມເປັນໜຶ່ງຖັນ.
- ແຕ່ລະພາກຕອບຄຳຖາມໜຶ່ງຢ່າງ; ໃຊ້ວັກສັ້ນ, ລາຍການຂັ້ນຕອນ ແລະ ຕາຕະລາງເມື່ອຊ່ວຍອ່ານ.
- ບໍ່ໃສ່ບັດອ້ອມທຸກວັກ. ຮູບປະກອບມີຄຳອະທິບາຍ ແລະ alt text ຕາມຄວາມໝາຍ.

### H. ໜ້າລາຄາ ແລະ ປຽບທຽບ — Pricing / Comparison

**ວຽກຫຼັກ:** ເຫັນຄວາມແຕກຕ່າງ ແລະ ເລືອກແຜນທີ່ເໝາະສົມ.

```text
[Title + who these plans are for]
[Billing period selector, if applicable]
[Plan A]        [Plan B]        [Plan C, if offered]
[Price]         [Price]         [Price]
[Key limits]    [Key limits]    [Key limits]
[Choose]        [Choose]        [Choose]
---------------------------------------------------------
[Detailed comparison] [Conditions] [Questions / help]
```

- Desktop: 2–3 ຖັນຕາມຈຳນວນແຜນຈິງ; ຈັດຕຳແໜ່ງລາຄາ ແລະ ປຸ່ມໃຫ້ປຽບທຽບງ່າຍ.
- Mobile: ແຜນລຽງເປັນໜຶ່ງຖັນ. ຕາຕະລາງລະອຽດອາດເລື່ອນໃນກອບ ຫຼື ປ່ຽນເປັນລາຍການປຽບທຽບທີ່ມີ label ຄົບ.
- ລະບຸສະກຸນເງິນ, ໄລຍະເວລາຮຽກເກັບ, ຂໍ້ຈຳກັດ ແລະ ຍອດທີ່ຈ່າຍຈິງ. ຖ້າສະແດງລາຄາສະເລ່ຍຕໍ່ເດືອນແຕ່ເກັບລາຍປີ ໃຫ້ບອກຍອດລາຍປີໃກ້ກັນ.
- ແຜນທີ່ແນະນຳຕ້ອງບອກວ່າເໝາະກັບໃຜ. ບໍ່ສ້າງປ້າຍ “ຍອດນິຍົມ” ຖ້າບໍ່ມີຂໍ້ມູນຮອງຮັບ.

## 7. ຂໍ້ກຳນົດຂອງສ່ວນປະກອບ

| ສ່ວນປະກອບ | ຮູບແບບເລີ່ມຕົ້ນ | ພຶດຕິກຳທີ່ຕ້ອງມີ |
|---|---|---|
| Header | ພື້ນຂາວ, min-height 64px, ຂອບໃນຕາມ gutter | ຂະຫຍາຍໄດ້ເມື່ອຂໍ້ຄວາມໃຫຍ່; ເມນູປັບກ່ອນທີ່ຈະຊົນ |
| Primary button | ຟ້າ, ຂໍ້ຄວາມຂາວ, min-height/min-width 44px | ຊື່ບອກການກະທຳ; hover, focus, loading, disabled |
| Secondary button | ຂາວ, ຂອບ control-border | ບົດບາດຮອງທີ່ຍັງຊອກເຫັນງ່າຍ |
| Icon button | ພື້ນທີ່ກົດ 44 × 44px ຫຼື ໃຫຍ່ກວ່າ | accessible name; ການກະທຳທີ່ບໍ່ຄຸ້ນເຄີຍມີຊື່ທີ່ເຫັນໄດ້ |
| Input | ຂອບຊັດ, ຂໍ້ຄວາມ 1rem, min-height 48px | label, helper, focus, error; ສະຖານະບໍ່ອາໄສສີຢ່າງດຽວ |
| Card | radius 16px, padding 16/24px | ຫົວຂໍ້ຊັດ, ຂໍ້ມູນເປັນກຸ່ມ; ລິ້ງ/ປຸ່ມບໍ່ຊ້ອນກັນ |
| Table | ຫົວຖັນຊັດ, ແຖວບໍ່ເບັຽດ | ມີ caption ຫຼື ຊື່; sort ບອກທິດ; ຕົວເລກຈັດແນວດຽວກັນ |
| Modal | max-width 560px, radius 24px, ເລື່ອນພາຍໃນໄດ້ | ມີຫົວຂໍ້/ປຸ່ມປິດ; ຈັດການ focus; ອອກແລ້ວກັບໄປປຸ່ມເດີມ |
| Toast / status | ຂໍ້ຄວາມສັ້ນ ແລະ ສະຖານະຊັດ | ແຈ້ງໃຫ້ screen reader; ບໍ່ໃຊ້ toast ທີ່ຫາຍເອງເປັນທາງດຽວຂອງຂໍ້ຜິດພາດ |
| Footer | ລິ້ງທີ່ກ່ຽວຂ້ອງ, ຂໍ້ຄວາມອ່ານໄດ້ | ຊ່ອງທາງຕິດຕໍ່ ແລະ ນະໂຍບາຍຕາມທີ່ໂຄງການມີຈິງ |

ຂໍ້ມູນໃນບັດຈະເປັນລິ້ງທັງບັດໄດ້ຖ້າມີປາຍທາງດຽວ. ຖ້າມີຫຼາຍປຸ່ມ ໃຫ້ແຕ່ລະການກະທຳເປັນ control ແຍກ ແລະ ບໍ່ຊ້ອນປຸ່ມຢູ່ໃນລິ້ງ.

## 8. ສະຖານະທີ່ຕ້ອງອອກແບບ

| ສະຖານະ | ສິ່ງທີ່ຜູ້ໃຊ້ຄວນເຫັນ | ທາງໄປຕໍ່ |
|---|---|---|
| Loading | ຂໍ້ຄວາມໂຫຼດ ຫຼື skeleton ທີ່ມີຂະໜາດໃກ້ກັບເນື້ອໃນ | ບໍ່ໃຫ້ສົ່ງຄຳຂໍຊ້ຳ; ສະແດງການລອງໃໝ່ຖ້າລົ້ມເຫຼວ |
| Empty | ເຫດຜົນທີ່ຍັງບໍ່ມີຂໍ້ມູນ | ສ້າງລາຍການທຳອິດ ຫຼື ຄຳແນະນຳຂັ້ນຕໍ່ໄປ |
| No results | ຄຳຄົ້ນ ແລະ ຕົວກອງທີ່ກຳລັງໃຊ້ | ລ້າງຕົວກອງ ຫຼື ປ່ຽນຄຳຄົ້ນ |
| Error | ບອກວ່າເກີດຫຍັງ ແລະ ຂໍ້ມູນຖືກບັນທຶກຫຼືຍັງ | ລອງໃໝ່, ແກ້ຊ່ອງຂໍ້ມູນ ຫຼື ຕິດຕໍ່ຊ່ວຍເຫຼືອ |
| Success | ຜົນທີ່ສຳເລັດ ແລະ ຂໍ້ມູນຢືນຢັນທີ່ຈຳເປັນ | ເບິ່ງລາຍການ, ດາວໂຫຼດ ຫຼື ດຳເນີນຂັ້ນຕໍ່ໄປ |
| Disabled | control ທີ່ໃຊ້ບໍ່ໄດ້ ແລະ ເຫດຜົນຢູ່ໃກ້ໆ | ອະທິບາຍສິ່ງທີ່ຕ້ອງເຮັດໃຫ້ໃຊ້ໄດ້ |
| Permission denied | ອະທິບາຍວ່າບັນຊີນີ້ເຂົ້າເຖິງບໍ່ໄດ້ | ກັບໄປໜ້າທີ່ໃຊ້ໄດ້ ຫຼື ຂໍສິດຖ້າລະບົບຮອງຮັບ |

ການລຶບທີ່ຄືນບໍ່ໄດ້ຄວນບອກຊື່ສິ່ງທີ່ຈະລຶບ ແລະ ຜົນທີ່ຕາມມາ. ວຽກທີ່ຄືນໄດ້ອາດໃຊ້ “ຍົກເລີກການປ່ຽນແປງ” ຫຼັງເຮັດ ເພື່ອຫຼຸດການຖາມຊ້ຳ.

## 9. ການເຂົ້າເຖິງ ແລະ ຄວາມອ່ານງ່າຍ

ຄ່າອອກແບບ 44px ຂອງປຸ່ມໃນຄູ່ມືນີ້ເປັນເປົ້າໝາຍສຳລັບການກົດທີ່ສະດວກ. WCAG 2.2 AA ຂໍ້ 2.5.8 ກຳນົດຂະໜາດເປົ້າໝາຍຢ່າງນ້ອຍ 24 × 24 CSS pixels ໂດຍມີຂໍ້ຍົກເວັ້ນ ເຊັ່ນ ໄລຍະຫ່າງ ແລະ ລິ້ງໃນປະໂຫຍກ. [W3C: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

ຂໍ້ຄວາມທົ່ວໄປຕ້ອງມີ contrast ຢ່າງນ້ອຍ 4.5:1; ຂໍ້ຄວາມຂະໜາດໃຫຍ່ຕາມນິຍາມ WCAG ໃຊ້ 3:1. ຄູ່ມືນີ້ຕັ້ງເປົ້າ 4.5:1 ສຳລັບຂໍ້ຄວາມທີ່ສື່ສານຂໍ້ມູນທັງໝົດເພື່ອໃຫ້ກວດງ່າຍ. ກວດຄູ່ສີຈິງ ລວມທັງ hover, ຂໍ້ຄວາມເທິງຮູບ ແລະ ຄວາມໂປ່ງໃສ. [W3C: Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

ເນື້ອໃນທີ່ອ່ານຕາມແນວຕັ້ງຄວນປັບແຖວໄດ້ທີ່ຄວາມກວ້າງ 320 CSS pixels ໂດຍບໍ່ເສຍຂໍ້ມູນ ຫຼື ຕ້ອງເລື່ອນສອງທິດທາງ. ມີຂໍ້ຍົກເວັ້ນສຳລັບສ່ວນທີ່ຈຳເປັນຕ້ອງເປັນສອງມິຕິ ເຊັ່ນ ຕາຕະລາງຂໍ້ມູນ ຫຼື ແຜນທີ່. [W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

ທຸກຈຸດທີ່ຮັບ keyboard focus ຕ້ອງມີຕົວບອກທີ່ເຫັນໄດ້. ຮັກສາ focus ໃຫ້ຢູ່ໃນຈໍ ແລະ ບໍ່ຖືກແຖບ sticky ບັງ. [W3C: Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)

ຂໍ້ແນະນຳໃນການນຳໄປສ້າງ:

- ໃຊ້ `header`, `nav`, `main`, `footer`, ຫົວຂໍ້ຕາມລຳດັບ ແລະ skip link ໄປຫາເນື້ອໃນຫຼັກ.
- ໃຊ້ `<a>` ສຳລັບປ່ຽນປາຍທາງ ແລະ `<button>` ສຳລັບການກະທຳ. ໃຊ້ native controls ເມື່ອເໝາະສົມ.
- ຮູບທີ່ສື່ຄວາມໝາຍມີ alt text; ຮູບຕົກແຕ່ງໃຊ້ alt ວ່າງ. Icon ທີ່ມີຊື່ຂ້າງໆແລ້ວບໍ່ຄວນຖືກອ່ານຊ້ຳ.
- ຂໍ້ຜິດພາດເຊື່ອມກັບ input; ຂໍ້ຄວາມຜົນລັບແຈ້ງຜ່ານ status/live region ຕາມຄວາມເໝາະສົມ.
- ສຳລັບ modal: ຍ້າຍ focus ເຂົ້າຢ່າງເໝາະສົມ, ຮັກສາ focus ຢູ່ພາຍໃນໃນລະຫວ່າງເປີດ, ມີວິທີປິດດ້ວຍ keyboard ແລະ ສົ່ງ focus ກັບບ່ອນເດີມ.
- ການເຄື່ອນໄຫວໃຊ້ສັ້ນໆ 120–180ms ເມື່ອຊ່ວຍອະທິບາຍການປ່ຽນສະຖານະ; ຮອງຮັບ `prefers-reduced-motion` ແລະ ຫຼີກລ້ຽງການເຄື່ອນໄຫວຕົກແຕ່ງອັດຕະໂນມັດ.

ລາຍການນີ້ເປັນຈຸດກວດສຳລັບການອອກແບບ. ການຢືນຢັນວ່າເວັບຜ່ານ WCAG ຕ້ອງກວດເວັບທີ່ສ້າງແລ້ວຕາມເກນທີ່ກ່ຽວຂ້ອງທັງໝົດ.

## 10. ຕົວຢ່າງ CSS ສຳລັບໂຄງສ້າງ

ໃຊ້ snippet ນີ້ເປັນຖານສຳລັບກອບ, ຄໍລຳອ່ານ, ບັດ ແລະ split layout. ມັນຍັງບໍ່ແມ່ນ component library ທີ່ຄົບທຸກພຶດຕິກຳ. ຕົວຢ່າງ card grid ໃຊ້ `auto-fit` ແລະ `minmax()` ເພື່ອປັບຈຳນວນຖັນຕາມພື້ນທີ່. [MDN: grid-template-columns](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/grid-template-columns)

```css
:root {
  --color-ink: #1d1d1f;
  --color-body: #515157;
  --color-canvas: #ffffff;
  --color-soft: #f5f5f7;
  --color-primary: #0066cc;
  --color-primary-hover: #0055aa;
  --color-control-border: #76767e;
  --gutter: 1rem;
  --layout-gap: 1rem;
  --radius-card: 1rem;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  color: var(--color-ink);
  background: var(--color-canvas);
  font-family: "Noto Sans Lao", "Phetsarath OT", system-ui,
               -apple-system, "Segoe UI", sans-serif;
  font-size: 1rem;
  line-height: 1.8;
  letter-spacing: normal;
}

img, video { display: block; max-inline-size: 100%; block-size: auto; }
button, input, select, textarea { font: inherit; }
button, a, p, h1, h2, h3 { overflow-wrap: anywhere; }
h1, h2, h3 { font-weight: 600; }
h1 { font-size: clamp(1.75rem, 1.25rem + 2vw, 2.75rem); line-height: 1.45; }
h2 { font-size: clamp(1.5rem, 1.15rem + 1.4vw, 2rem); line-height: 1.5; }
h3 { font-size: 1.25rem; line-height: 1.5; }
p { color: var(--color-body); }
a { color: var(--color-primary); text-underline-offset: 0.2em; }

.container {
  inline-size: calc(100% - var(--gutter) - var(--gutter));
  max-inline-size: 75rem;
  margin-inline: auto;
}

.container--wide { max-inline-size: 90rem; }
.reading { inline-size: 100%; max-inline-size: 45rem; margin-inline: auto; }
.form-layout { inline-size: 100%; max-inline-size: 40rem; margin-inline: auto; }
.section { padding-block: clamp(3rem, 6vw, 6rem); }
.stack { display: grid; gap: 1rem; }

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: var(--layout-gap);
}

.card {
  min-inline-size: 0;
  padding: 1rem;
  border-radius: var(--radius-card);
  background: var(--color-soft);
}

/* White cards on a soft page; soft cards on a white page. */
.surface-soft { background: var(--color-soft); }
.surface-soft .card { background: var(--color-canvas); }

.split, .with-aside { display: grid; gap: var(--layout-gap); }
.split > *, .with-aside > * { min-inline-size: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-block-size: 2.75rem;
  min-inline-size: 2.75rem;
  max-inline-size: 100%;
  padding: 0.75rem 1.5rem;
  border: 1px solid transparent;
  border-radius: 0.75rem;
  color: #ffffff;
  background: var(--color-primary);
  font-weight: 600;
  line-height: 1.6;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 180ms ease-out;
}

.button:enabled:hover, a.button[href]:hover {
  background: var(--color-primary-hover);
}

button:disabled { cursor: not-allowed; opacity: 0.65; }

/* Two-color ring works across the light and dark surfaces in this guide. */
:focus-visible {
  outline: 3px solid var(--color-primary);
  outline-offset: 3px;
  box-shadow: 0 0 0 3px #ffffff;
}

@media (min-width: 48rem) {
  :root { --gutter: 1.5rem; --layout-gap: 1.5rem; }
  .card { padding: 1.5rem; }
}

@media (min-width: 64rem) {
  :root { --gutter: 2rem; }
  .split { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .with-aside { grid-template-columns: minmax(0, 1fr) 20rem; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .button { transition: none; }
}
```

ໃຊ້ `.reading`, `.form-layout`, `.cards`, `.split` ຫຼື `.with-aside` ພາຍໃນ `.container`. ຢ່າຕື່ມ `.container` ຊ້ອນກັນຫຼາຍຊັ້ນເພາະຈະເກີດຂອບຊ້ຳ. `.with-aside` ເໝາະກັບພື້ນທີ່ເຕັມຂອງ container; ຖ້າຢູ່ໃນ app ທີ່ມີ sidebar ຢູ່ແລ້ວ ໃຫ້ປັບ breakpoint ຫຼື ໃຊ້ container query ຕາມພື້ນທີ່ຈິງ.

## 11. ຄຳສັ່ງຕົວຢ່າງສຳລັບນຳໄປໃຊ້ກັບ AI

ຄັດລອກຂໍ້ຄວາມຕໍ່ໄປນີ້ ແລ້ວແທນສ່ວນໃນ `[ ]` ດ້ວຍຂໍ້ມູນຂອງເຈົ້າ:

```text
ໃຊ້ apple-layout-guide.md ເປັນແນວທາງອອກແບບເວັບ [ຊື່/ປະເພດເວັບ].
ຜູ້ໃຊ້ຫຼັກ: [ໃຜ].
ວຽກທີ່ຕ້ອງເຮັດໄດ້: [ວຽກຫຼັກ].
ໜ້າທີ່ຕ້ອງການ: [ລາຍຊື່ໜ້າ].
ເນື້ອໃນ ແລະ ຮູບທີ່ມີ: [ລາຍລະອຽດ].
ພາສາ/ສີແບຣນ/ຂໍ້ຈຳກັດ: [ລາຍລະອຽດ].

ເລືອກ layout ຕາມວຽກຂອງແຕ່ລະໜ້າ.
ຈັດເນື້ອໃນໃຫ້ເຂົ້າໃຈວ່າໜ້ານີ້ເຮັດຫຍັງ ແລະ ຄວນກົດຫຍັງຕໍ່.
ອອກແບບ mobile ແລະ desktop ພ້ອມ loading, empty, error ແລະ success.
ໃຊ້ເນື້ອໃນຈິງ; ຖ້າຂາດ ໃຫ້ລະບຸສ່ວນທີ່ຕ້ອງຕື່ມຢ່າງຊັດເຈນ.
ອະທິບາຍສັ້ນໆວ່າແຕ່ລະ layout ຊ່ວຍວຽກຂອງຜູ້ໃຊ້ແນວໃດ.
ກວດຄວາມອ່ານງ່າຍ, keyboard, ຕົວໜັງສືລາວ ແລະ ການປັບໜ້າຕາມຈໍ.
```

## 12. Checklist ກ່ອນສົ່ງມອບໜ້າເວັບ

### ໂຄງສ້າງ ແລະ ຄວາມເຂົ້າໃຈ

- [ ] ຫົວຂໍ້ແລະສ່ວນທຳອິດບອກຈຸດປະສົງຂອງໜ້າໄດ້.
- [ ] ມີການກະທຳຫຼັກທີ່ຊັດໃນແຕ່ລະກຸ່ມການຕັດສິນໃຈ.
- [ ] ຊື່ເມນູ, ປຸ່ມ ແລະ ຫົວຂໍ້ໃຊ້ຄຳທີ່ຜູ້ໃຊ້ເຂົ້າໃຈ.
- [ ] ຂໍ້ມູນທີ່ຕ້ອງໃຊ້ຕັດສິນໃຈຢູ່ກ່ອນຈຸດຢືນຢັນ.
- [ ] ລິ້ງ ແລະ ປຸ່ມທຸກອັນເຮັດວຽກຕາມຊື່; ການກັບຄືນບໍ່ເຮັດໃຫ້ຜູ້ໃຊ້ຫຼົງ.
- [ ] ລາຄາ, ຄຳຮັບຮອງ ແລະ ສະຖິຕິມາຈາກຂໍ້ມູນຈິງ ຫຼື ຖືກໝາຍເປັນຕົວຢ່າງຊັດເຈນ.

### ຮູບລັກສະນະ ແລະ ຂະໜາດຈໍ

- [ ] ສີ, ຂອບມົນ, ໄລຍະຫ່າງ ແລະ ຕົວໜັງສືສອດຄ່ອງກັນທຸກໜ້າ.
- [ ] ທົດສອບທີ່ 320, 390, 768, 1024 ແລະ 1440 CSS pixels ພ້ອມຂະໜາດລະຫວ່າງນັ້ນ.
- [ ] ຂໍ້ຄວາມລາວຍາວ, ຊື່ຍາວ ແລະ ຕົວເລກໃຫຍ່ບໍ່ຖືກຕັດ ຫຼື ຊ້ອນກັນ.
- [ ] ຂະຫຍາຍຕົວໜັງສື/zoom 200% ແລ້ວຍັງໃຊ້ວຽກຫຼັກໄດ້; ກວດ reflow ທີ່ 320 CSS pixels ດ້ວຍ.
- [ ] ຮູບໂຫຼດແລ້ວ layout ບໍ່ກະໂດດຫຼາຍ; ຮູບຫຼັກບໍ່ຖືກຕັດສ່ວນສຳຄັນ.
- [ ] Sticky header/action ບໍ່ບັງຂໍ້ມູນ ຫຼື ປຸ່ມເມື່ອແປ້ນພິມມືຖືເປີດ.

### ການໃຊ້ງານ ແລະ ສະຖານະ

- [ ] ເຮັດວຽກຫຼັກໄດ້ດ້ວຍ keyboard; focus ເຫັນຊັດ ແລະ ລຳດັບສົມເຫດສົມຜົນ.
- [ ] ປຸ່ມ, ຊ່ອງກອກ, ຮູບ ແລະ ຂໍ້ຜິດພາດມີຊື່/ຄຳອະທິບາຍທີ່ເໝາະສົມ.
- [ ] ກວດ contrast ຂອງຄູ່ສີທີ່ໃຊ້ຈິງ; ສະຖານະບໍ່ໃຊ້ສີຢ່າງດຽວ.
- [ ] ມີ loading, empty/no results, error, success ແລະ disabled ຕາມວຽກທີ່ມີ.
- [ ] ເມື່ອຜິດພາດ ຄ່າທີ່ກອກແລ້ວຍັງຢູ່ ແລະ ມີວິທີແກ້ ຫຼື ລອງໃໝ່.
- [ ] ໂໝດຫຼຸດການເຄື່ອນໄຫວບໍ່ມີ animation ທີ່ບໍ່ຈຳເປັນ.

### ລອງກັບຜູ້ໃຊ້

ໃຫ້ຄົນທີ່ບໍ່ເຄີຍເຫັນໜ້ານີ້ເບິ່ງປະມານ 5 ວິນາທີ ແລ້ວຖາມວ່າ “ໜ້ານີ້ເຮັດຫຍັງ?” ແລະ “ຈະກົດຫຍັງຕໍ່?”. ຕໍ່ຈາກນັ້ນໃຫ້ເຮັດວຽກຈິງໜຶ່ງຢ່າງໂດຍບໍ່ບອກທາງ. ບັນທຶກຈຸດທີ່ລັງເລ, ກົດຜິດ ຫຼື ຕ້ອງຖາມ ແລ້ວປັບປຸງ. ນີ້ແມ່ນວິທີກວດເບື້ອງຕົ້ນ, ບໍ່ແມ່ນການຮັບປະກັນວ່າທຸກຄົນຈະເຂົ້າໃຈໃນ 5 ວິນາທີ.

## 13. ບັນທຶກສຳລັບການນຳໄປໃຊ້

ຄູ່ມືນີ້ມີ 8 layout recipes ແລະ ຄ່າເລີ່ມຕົ້ນຮ່ວມກັນ. ເລືອກໃຊ້ຕາມເນື້ອໃນ ແລະ ວຽກຂອງໜ້າ; ບໍ່ຈຳເປັນລວມທຸກ layout ໄວ້ໃນເວັບດຽວ. ເມື່ອປ່ຽນ tokens ໃຫ້ອັບເດດ CSS ແລະ ກວດຄູ່ສີ/ຂະໜາດໃໝ່ຄຽງກັນ.

ເອກະສານນີ້ເປັນຄູ່ມືທີ່ດັດແປງໃຫ້ໂຄງການຂອງຜູ້ໃຊ້. ຄ່າອອກແບບແມ່ນຂໍ້ສະເໜີຂອງສະບັບນີ້; ລິ້ງ W3C ແລະ MDN ໃນພາກທີ່ກ່ຽວຂ້ອງໃຊ້ອ້າງອີງເກນແລະພຶດຕິກຳ CSS. ບໍ່ໄດ້ອ້າງວ່າເປັນມາດຕະຖານທາງການຂອງ Apple.
