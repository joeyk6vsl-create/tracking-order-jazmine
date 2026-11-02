import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../services/api';
import { useSession } from './SessionProvider';

export function ChangePasswordPage() {
  const { session, refresh } = useSession();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('currentPassword'));
    const newPassword = String(data.get('newPassword'));
    if (newPassword !== data.get('confirmation')) {
      setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/auth/change-password', 'POST', { currentPassword, newPassword });
      form.reset();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel narrow">
      <span className="section-label">ACCOUNT SECURITY</span>
      <h2>ປ່ຽນລະຫັດຜ່ານ</h2>
      <p className="muted">
        {session?.user?.mustChangePassword
          ? 'กรุณาเปลี่ยนรหัสชั่วคราวก่อนเริ่มทำงาน'
          : 'หลังเปลี่ยนรหัสผ่าน ต้องเข้าสู่ระบบใหม่ทุกอุปกรณ์'}
      </p>
      <form className="form-stack" onSubmit={submit}>
        <label>
          รหัสผ่านปัจจุบัน
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <label>
          รหัสผ่านใหม่
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <label>
          ยืนยันรหัสผ่านใหม่
          <input
            type="password"
            name="confirmation"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}
        </button>
      </form>
    </section>
  );
}
