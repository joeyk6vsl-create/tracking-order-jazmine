import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck, Shirt } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { useSession } from './SessionProvider';

export function LoginPage() {
  const { session, refresh } = useSession();
  const setup = session?.bootstrapRequired;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = event.currentTarget;
    const data = new FormData(form);
    const username = String(data.get('username'));
    const password = String(data.get('password'));
    try {
      if (setup)
        await api('/auth/setup', 'POST', {
          username,
          password,
          displayName: String(data.get('displayName')),
        });
      await api('/auth/login', 'POST', { username, password });
      form.reset();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-layout">
      <section className="brand-story">
        <div className="brand">
          <span className="brand-symbol">
            <Shirt size={24} />
          </span>
          JAZMINE<span className="brand-caption">SPORTSWEAR WORKSPACE</span>
        </div>
        <div className="story-content">
          <span className="eyebrow">ທຸກຂັ້ນຕອນ ໃນບ່ອນດຽວ</span>
          <h1>
            ວຽກທີ່ຊັດເຈນ.
            <br />
            ທີມທີ່ກ້າວໄປພ້ອມກັນ.
          </h1>
          <p>
            ພື້ນທີ່ເຮັດວຽກຂອງທີມ JAZMINE
            <br />
            ສຳລັບອໍເດີ ແລະ ການຜະລິດ.
          </p>
          <div className="story-line">
            <span>01</span>ຮັບອໍເດີ
            <i />
            <span>02</span>ຜະລິດ
            <i />
            <span>03</span>ສົ່ງມອບ
          </div>
        </div>
        <p className="brand-footer">JAZMINE · ORGANIZED TO CREATE</p>
      </section>
      <main className="login-main">
        <div className="login-card">
          <span className="section-label">
            <LockKeyhole size={16} /> ພື້ນທີ່ສຳລັບທີມງານ
          </span>
          <h2>{setup ? 'ສ້າງບັນຊີເຈົ້າຂອງ' : 'ຍິນດີຕ້ອນຮັບ'}</h2>
          <p className="muted">
            {setup
              ? 'ตั้งค่าครั้งแรกในเครื่องนี้ กรอกบัญชีเจ้าของที่คุณต้องการใช้'
              : 'ເຂົ້າສູ່ລະບົບ ເພື່ອເລີ່ມວຽກຂອງທ່ານ'}
          </p>
          <form onSubmit={submit} className="form-stack">
            {setup && (
              <label>
                ຊື່ທີ່ສະແດງ
                <input name="displayName" maxLength={100} required autoComplete="name" />
              </label>
            )}
            <label>
              ຊື່ຜູ້ໃຊ້
              <input
                name="username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={40}
                pattern="[a-zA-Z0-9._-]+"
                placeholder="username"
              />
            </label>
            <label>
              ລະຫັດຜ່ານ
              <input
                type="password"
                name="password"
                autoComplete={setup ? 'new-password' : 'current-password'}
                required
                minLength={setup ? 12 : 1}
                maxLength={128}
              />
            </label>
            {setup && (
              <p className="field-help">รหัสผ่านอย่างน้อย 12 ตัวอักษร ไม่มีรหัสเริ่มต้นร่วมกัน</p>
            )}
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <button className="primary wide" disabled={busy}>
              {busy ? 'ກຳລັງດຳເນີນການ…' : setup ? 'ສ້າງ ແລະ ເຂົ້າສູ່ລະບົບ' : 'ເຂົ້າສູ່ລະບົບ'}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="login-help">
            <ShieldCheck size={18} /> สิทธิ์การเข้าถึงขึ้นอยู่กับบัญชีและแผนก
          </p>
        </div>
        <p className="local-label">JAZMINE v0.2 · LOCAL DEVELOPMENT</p>
      </main>
    </div>
  );
}
