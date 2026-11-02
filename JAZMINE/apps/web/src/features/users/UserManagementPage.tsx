import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import {
  DEPARTMENTS,
  ROLES,
  STATUSES,
  type UserView,
} from '../../../../../packages/contracts/src/identity';
import { api, ApiError, errorMessage } from '../../services/api';
import { useSession } from '../auth/SessionProvider';

const statusLabel = { ACTIVE: 'ใช้งาน', PENDING: 'รอเปิดใช้', DISABLED: 'ปิดบัญชี' };
export function UserManagementPage() {
  const { refresh } = useSession();
  const [users, setUsers] = useState<UserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<UserView | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ users: UserView[] }>('/users');
      setUsers(result.users);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && [401, 403].includes(e.status)) await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const item = selected;
    if (!item) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (item === 'new')
        await api('/users', 'POST', {
          username: String(data.get('username')),
          displayName: String(data.get('displayName')),
          password: String(data.get('password')),
          role: String(data.get('role')),
          department: String(data.get('department')),
        });
      else
        await api('/users/' + item.id, 'PATCH', {
          displayName: String(data.get('displayName')),
          role: String(data.get('role')),
          department: String(data.get('department')),
          status: String(data.get('status')),
          rowVersion: item.rowVersion,
          reason: String(data.get('reason')),
        });
      form.reset();
      setSelected(null);
      setMessage(
        item === 'new'
          ? 'สร้างบัญชีแล้ว พนักงานต้องเปลี่ยนรหัสผ่านครั้งแรก'
          : 'บันทึกแล้ว หากสิทธิ์เปลี่ยน บัญชีเดิมจะต้องเข้าสู่ระบบใหม่',
      );
      await load();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || selected === 'new') return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await api('/users/' + selected.id + '/reset-password', 'POST', {
        rowVersion: selected.rowVersion,
        temporaryPassword: String(data.get('temporaryPassword')),
        reason: String(data.get('resetReason')),
      });
      form.reset();
      setSelected(null);
      setMessage('ตั้งรหัสชั่วคราวแล้ว ยกเลิกการเข้าสู่ระบบเดิมทุกอุปกรณ์');
      await load();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-label">TEAM & ACCESS</span>
          <h1>ພະນັກງານ</h1>
          <p className="muted">จัดการบัญชี แผนก และสิทธิ์จากจุดเดียว</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setSelected('new');
            setError('');
            setMessage('');
          }}
        >
          <Plus size={18} />
          เพิ่มพนักงาน
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button
            disabled={busy}
            onClick={() => {
              setSelected(null);
              void load();
            }}
          >
            โหลดข้อมูลล่าสุด
          </button>
        </div>
      )}
      {message && (
        <p className="alert success" role="status">
          {message}
        </p>
      )}
      {selected && (
        <section className="panel editor">
          <div className="panel-heading">
            <h2>{selected === 'new' ? 'เพิ่มบัญชี' : 'แก้บัญชี · ' + selected.username}</h2>
            <button onClick={() => setSelected(null)} disabled={busy}>
              ปิดแบบฟอร์ม
            </button>
          </div>
          <form
            key={selected === 'new' ? 'new' : selected.id + selected.rowVersion}
            onSubmit={submit}
          >
            <div className="form-grid">
              {selected === 'new' && (
                <label>
                  ชื่อผู้ใช้
                  <input
                    name="username"
                    required
                    minLength={3}
                    maxLength={40}
                    autoComplete="off"
                    pattern="[a-zA-Z0-9._-]+"
                  />
                </label>
              )}
              <label>
                ชื่อที่แสดง
                <input
                  name="displayName"
                  defaultValue={selected === 'new' ? '' : selected.displayName}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                ระดับผู้ใช้
                <select name="role" defaultValue={selected === 'new' ? 'STAFF' : selected.role}>
                  {ROLES.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
              <label>
                แผนก
                <select
                  name="department"
                  defaultValue={selected === 'new' ? 'ADMIN' : selected.department}
                >
                  {DEPARTMENTS.map((department) => (
                    <option key={department}>{department}</option>
                  ))}
                </select>
              </label>
              {selected === 'new' ? (
                <label>
                  รหัสผ่านชั่วคราว
                  <input
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
              ) : (
                <>
                  <label>
                    สถานะ
                    <select name="status" defaultValue={selected.status}>
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {statusLabel[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    เหตุผลการแก้ไข
                    <textarea name="reason" required maxLength={500} />
                  </label>
                </>
              )}
            </div>
            <div className="actions">
              <button className="primary" disabled={busy}>
                {busy ? 'กำลังบันทึก…' : 'บันทึกบัญชี'}
              </button>
              <span className="field-help">เจ้าของ = ADMIN_PROMAX · พนักงาน = STAFF</span>
            </div>
          </form>
          {selected !== 'new' && (
            <form className="password-reset" onSubmit={resetPassword}>
              <h3>ตั้งรหัสผ่านชั่วคราวใหม่</h3>
              <div className="form-grid">
                <label>
                  รหัสชั่วคราวใหม่
                  <input
                    name="temporaryPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
                <label>
                  เหตุผลรีเซ็ต
                  <input name="resetReason" required maxLength={500} />
                </label>
              </div>
              <button disabled={busy}>รีเซ็ตรหัสผ่าน</button>
            </form>
          )}
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>
            <Users size={19} />
            บัญชีในระบบ <span className="count">{users.length}</span>
          </h2>
          <button aria-label="โหลดข้อมูลใหม่" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={17} />
          </button>
        </div>
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="ค้นหาพนักงาน"
            placeholder="ค้นหาชื่อ ชื่อผู้ใช้ หรือแผนก"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {loading ? (
          <p className="loading" role="status">
            กำลังโหลดพนักงาน…
          </p>
        ) : (
          <div className="user-list">
            {users
              .filter((user) =>
                (user.displayName + user.username + user.department)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((user) => (
                <article className="user-row" key={user.id}>
                  <span className="avatar">{user.displayName.slice(0, 1)}</span>
                  <div className="user-name">
                    <strong>{user.displayName}</strong>
                    <span className="muted">{user.username}</span>
                  </div>
                  <div className="user-department">
                    <strong>{user.department}</strong>
                    <span className="field-help">
                      {user.role === 'ADMIN_PROMAX' ? 'เจ้าของ' : 'พนักงาน'}
                    </span>
                  </div>
                  <span className={'badge ' + (user.status === 'ACTIVE' ? 'positive' : '')}>
                    {statusLabel[user.status]}
                  </span>
                  <button
                    onClick={() => {
                      setSelected(user);
                      setError('');
                      setMessage('');
                    }}
                  >
                    จัดการ
                  </button>
                </article>
              ))}
            {!users.some((user) =>
              (user.displayName + user.username + user.department)
                .toLowerCase()
                .includes(search.toLowerCase()),
            ) && <p className="empty">ไม่พบพนักงานตามคำค้น</p>}
          </div>
        )}
        <p className="panel-footnote">
          <ShieldCheck size={16} />
          รหัสผ่านเดิมไม่สามารถเปิดดูได้ · แสดงสูงสุด 200 บัญชี
        </p>
      </section>
    </>
  );
}
