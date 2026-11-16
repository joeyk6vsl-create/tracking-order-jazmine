import type { ButtonHTMLAttributes, ReactNode } from 'react';
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FolderOpen,
  ImagePlus,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';

const icons = {
  add: Plus,
  approve: BadgeCheck,
  cancel: X,
  check: ClipboardCheck,
  edit: Pencil,
  new: Plus,
  next: ChevronRight,
  open: FolderOpen,
  previous: ChevronLeft,
  print: Printer,
  quote: FileText,
  refresh: RefreshCcw,
  reject: X,
  remove: Trash2,
  retry: RotateCcw,
  save: Save,
  search: Search,
  upload: ImagePlus,
} satisfies Record<string, LucideIcon>;

type Action = keyof typeof icons;
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  action: Action;
  children: ReactNode;
};

export function ActionButton({ action, children, type = 'button', className, ...props }: Props) {
  const Icon = icons[action];
  return (
    <button
      type={type}
      className={['action-button', className].filter(Boolean).join(' ')}
      {...props}
    >
      <Icon size={18} aria-hidden="true" focusable="false" />
      <span>{children}</span>
    </button>
  );
}
