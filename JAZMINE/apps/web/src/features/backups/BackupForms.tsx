import { useState } from 'react';
import {
  MAX_BACKUP_BYTES,
  type RecoveryReport,
} from '../../../../../packages/contracts/src/backups';
import { ApiError, errorMessage, fileRequest } from '../../services/api';
type Actions = { disabled: boolean; onWorking: (working: boolean) => void; onChanged: () => void };
export function BackupDownloadForm({ disabled, onWorking, onChanged }: Actions) {
  const [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function download() {
    if (password !== confirm) {
      setError('ລະຫັດສອງຊ່ອງບໍ່ກົງກັນ / Passwords do not match');
      return;
    }
    setBusy(true);
    onWorking(true);
    setError('');
    setMessage('');
    try {
      const response = await fileRequest('/backups/create', JSON.stringify({ password, reason }), {
          'Content-Type': 'application/json',
        }),
        blob = await response.blob();
      const filename =
        response.headers.get('Content-Disposition')?.match(/filename="([A-Za-z0-9_.-]+)"/)?.[1] ??
        'JAZMINE_BACKUP.jazbackup';
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPassword('');
      setConfirm('');
      setMessage('ສ້າງໄຟລ໌ແລ້ວ ກະລຸນາກວດ Downloads / Check your downloaded backup');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      onWorking(false);
      onChanged();
    }
  }
  return (
    <form
      className="panel pricing-panel"
      aria-label="Create backup"
      onSubmit={(e) => {
        e.preventDefault();
        void download();
      }}
    >
      <h2>1 · ສຳຮອງຂໍ້ມູນ / Create backup</h2>
      <p>ລວມບັນຊີ ອໍເດີ ລາຄາ ເງິນ ການຜະລິດ ແລະ ໄຟລ໌ທີ່ເກັບໃນລະບົບ</p>
      <fieldset className="draft-fields" disabled={disabled || busy}>
        <label>
          ຕັ້ງລະຫັດໄຟລ໌ສຳຮອງ / Backup password
          <input
            aria-label="Backup password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          ພິມລະຫັດອີກຄັ້ງ / Confirm password
          <input
            aria-label="Confirm backup password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <label>
          ເຫດຜົນ / Reason
          <input
            aria-label="Backup reason"
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="primary" disabled={!reason.trim()}>
          ດາວໂຫຼດໄຟລ໌ສຳຮອງ / Download backup
        </button>
      </fieldset>
      <p className="muted">
        ຈື່ລະຫັດນີ້ໄວ້ ຖ້າລືມຈະເປີດໄຟລ໌ສຳຮອງບໍ່ໄດ້ · ເກັບສຳເນົາໃນອີກອຸປະກອນໜຶ່ງ
      </p>
      {busy && <p role="status">ກຳລັງກວດ ແລະ ສ້າງໄຟລ໌ / Preparing backup…</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
const encode = (value: string) => btoa(String.fromCharCode(...new TextEncoder().encode(value)));
type Pending = { id: string; file: File; password: string; reason: string };
export function RecoveryForm({
  disabled,
  onWorking,
  onChanged,
  onRestored,
}: Actions & { onRestored: (report: RecoveryReport) => void }) {
  const [file, setFile] = useState<File | null>(null),
    [password, setPassword] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState<Pending | null>(null);
  async function restore(input: Pending) {
    setBusy(true);
    onWorking(true);
    setError('');
    let waiting = false;
    try {
      if (input.file.size > MAX_BACKUP_BYTES)
        throw new Error('ໄຟລ໌ເກີນ 64 MB / File exceeds 64 MB');
      const response = await fileRequest('/backups/restore', input.file, {
        'Content-Type': 'application/octet-stream',
        'X-Backup-Password': encode(input.password),
        'X-Recovery-Reason': encode(input.reason),
        'X-Recovery-Request': input.id,
      });
      const report = (await response.json()) as RecoveryReport;
      setPending(null);
      setPassword('');
      onRestored(report);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && (!e.status || e.status >= 500)) {
        setPending(input);
        waiting = true;
      } else setPending(null);
    } finally {
      setBusy(false);
      if (!waiting) {
        onWorking(false);
        onChanged();
      }
    }
  }
  return (
    <form
      className="panel pricing-panel"
      aria-label="Restore backup"
      onSubmit={(e) => {
        e.preventDefault();
        if (file) void restore({ id: crypto.randomUUID(), file, password, reason });
      }}
    >
      <h2>2 · ທົດລອງກູ້ຄືນ / Restore a separate copy</h2>
      <p>ກວດໄຟລ໌ ແລະ ສ້າງເປັນສຳເນົາໃໝ່ · ບໍ່ຂຽນທັບຂໍ້ມູນທີ່ໃຊ້ຢູ່</p>
      <fieldset className="draft-fields" disabled={disabled || busy || !!pending}>
        <label>
          ໄຟລ໌ສຳຮອງ / Backup file
          <input
            aria-label="Backup file"
            type="file"
            accept=".jazbackup"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          ລະຫັດຂອງໄຟລ໌ນີ້ / Backup password
          <input
            aria-label="Recovery password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          ເຫດຜົນ / Reason
          <input
            aria-label="Recovery reason"
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="primary" disabled={!file || !reason.trim()}>
          ກວດ ແລະ ສ້າງສຳເນົາ / Verify and restore copy
        </button>
      </fieldset>
      {busy && <p role="status">ກຳລັງກວດ ແລະ ກູ້ຄືນ / Verifying recovery…</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <button type="button" disabled={busy} onClick={() => void restore(pending)}>
          ກວດຄຳຂໍເດີມ / Retry recovery
        </button>
      )}
    </form>
  );
}
