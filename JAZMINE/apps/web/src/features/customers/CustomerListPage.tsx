import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ContactRound,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import type {
  CustomerList,
  CustomerQuery,
  CustomerResult,
  CustomerView,
} from '../../../../../packages/contracts/src/customers';
import { ApiError, errorMessage } from '../../services/api';
import { useSession } from '../auth/SessionProvider';
import { customerApi } from './customer-api';
import { CustomerForm } from './CustomerForm';
import { CustomerDetail } from './CustomerDetail';

export function CustomerListPage() {
  const { session, refresh } = useSession();
  const [query, setQuery] = useState<CustomerQuery>({ search: '', status: 'ACTIVE', limit: 25 });
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerQuery['status']>('ACTIVE');
  const [list, setList] = useState<CustomerList>({ customers: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<CustomerView | null>(null);
  const [mode, setMode] = useState<'list' | 'new' | 'detail' | 'edit'>('list');
  const [matches, setMatches] = useState<CustomerView[]>([]);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('customerId');
    if (!id) return;
    let active = true;
    void customerApi
      .detail(id)
      .then((customer) => {
        if (active) {
          setSelected(customer);
          setMode('detail');
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    customerApi
      .list(query)
      .then((result) => {
        if (!cancelled) setList(result);
      })
      .catch(async (e) => {
        if (cancelled) return;
        setError(errorMessage(e));
        if (e instanceof ApiError && [401, 403].includes(e.status)) await refresh();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, revision, refresh]);
  async function open(id: string) {
    setError('');
    try {
      setSelected(await customerApi.detail(id));
      setMode('detail');
      setMatches([]);
      setMessage('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function saved(result: CustomerResult) {
    setSelected(result.customer);
    setMatches(result.phoneMatches);
    setMessage('ບັນທຶກຂໍ້ມູນລູກຄ້າແລ້ວ');
    setMode('detail');
    setRevision((old) => old + 1);
  }
  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setHistory([]);
    setQuery({ search: search.trim(), status, limit: 25 });
  }
  function back() {
    setMode('list');
    setSelected(null);
    setMessage('');
    setMatches([]);
  }
  return (
    <>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button
            onClick={() => {
              setRevision((old) => old + 1);
              back();
            }}
          >
            ໂຫຼດຂໍ້ມູນຫຼ້າສຸດ
          </button>
        </div>
      )}
      {message && (
        <p className="alert success" role="status">
          {message}
        </p>
      )}
      {matches.length > 0 && (
        <p className="alert warning" role="status">
          เบอร์เดียวกับรายชื่ออื่น: {matches.map((match) => match.name).join(', ')} ·
          เก็บแยกเป็นคนละราย ไม่มีการรวมอัตโนมัติ
        </p>
      )}
      {mode === 'new' || mode === 'edit' ? (
        <CustomerForm
          key={selected?.id ?? 'new'}
          customer={mode === 'edit' ? selected : null}
          canChangeStatus={session?.user?.role === 'ADMIN_PROMAX'}
          onSaved={saved}
          onCancel={() => (selected ? setMode('detail') : back())}
        />
      ) : mode === 'detail' && selected ? (
        <CustomerDetail customer={selected} onBack={back} onEdit={() => setMode('edit')} />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <span className="section-label">CUSTOMER WORKSPACE</span>
              <h1>ລູກຄ້າປະຈຳ</h1>
              <p className="muted">รายชื่อที่เลือกบันทึกไว้สำหรับใช้ซ้ำ</p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setSelected(null);
                setMode('new');
                setMessage('');
                setMatches([]);
              }}
            >
              <Plus size={18} />
              ເພີ່ມລູກຄ້າປະຈຳ
            </button>
          </div>
          <div className="customer-intro">
            <ContactRound size={22} />
            <div>
              <strong>เก็บเฉพาะรายชื่อที่ต้องการใช้ซ้ำ</strong>
              <p>ลูกค้าขาจรจะกรอกชื่อและเบอร์เฉพาะออเดอร์ โดยไม่เข้ารายชื่อนี้อัตโนมัติ</p>
            </div>
          </div>
          <section className="panel">
            <form onSubmit={applyFilters} className="customer-filter">
              <label className="customer-search">
                ຄົ້ນຫາ
                <input
                  aria-label="ค้นหาลูกค้าประจำ"
                  placeholder="ขึ้นต้นชื่อหรือเบอร์โทร"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label>
                ສະຖານະ
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CustomerQuery['status'])}
                >
                  <option value="ACTIVE">ໃຊ້ງານ</option>
                  <option value="INACTIVE">ປິດການໃຊ້ງານ</option>
                  <option value="ALL">ທັງໝົດ</option>
                </select>
              </label>
              <button type="submit" disabled={loading}>
                <Search size={17} />
                ຄົ້ນຫາ
              </button>
              <button
                type="button"
                aria-label="โหลดรายชื่อลูกค้าใหม่"
                disabled={loading}
                onClick={() => setRevision((old) => old + 1)}
              >
                <RefreshCw size={17} />
              </button>
            </form>
            {loading ? (
              <p className="loading" role="status">
                ກຳລັງໂຫຼດລູກຄ້າ…
              </p>
            ) : list.customers.length === 0 ? (
              <div className="customer-empty">
                <ContactRound size={32} />
                <h2>{query.search ? 'ບໍ່ພົບລູກຄ້າ' : 'ຍັງບໍ່ມີລູກຄ້າໃນລາຍການນີ້'}</h2>
                <p className="muted">
                  {query.search
                    ? 'ลองเปลี่ยนคำค้นหรือตัวกรอง'
                    : 'เพิ่มเฉพาะลูกค้าประจำที่ต้องการเลือกใช้ครั้งต่อไป'}
                </p>
              </div>
            ) : (
              <div className="customer-list">
                {list.customers.map((customer) => (
                  <article key={customer.id} className="customer-row">
                    <span className="avatar">{customer.name.slice(0, 1)}</span>
                    <div className="customer-row-name">
                      <strong>{customer.name}</strong>
                      <span className="muted">{customer.phone}</span>
                    </div>
                    <span className="customer-row-group">{customer.group}</span>
                    <span className={'badge ' + (customer.status === 'ACTIVE' ? 'positive' : '')}>
                      {customer.status === 'ACTIVE' ? 'ໃຊ້ງານ' : 'ປິດໃຊ້ງານ'}
                    </span>
                    <button
                      onClick={() => void open(customer.id)}
                      aria-label={'เปิดลูกค้า ' + customer.name}
                    >
                      <ArrowRight size={18} />
                    </button>
                  </article>
                ))}
              </div>
            )}
            <div className="customer-pagination">
              <span className="muted">
                ໜ້າ {history.length + 1} · {loading ? '…' : list.customers.length} ລາຍການ
              </span>
              <div>
                <button
                  disabled={loading || history.length === 0}
                  aria-label="หน้าลูกค้าก่อนหน้า"
                  onClick={() => {
                    const previous = history[history.length - 1];
                    setHistory((old) => old.slice(0, -1));
                    setQuery((old) => ({ ...old, after: previous }));
                  }}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  disabled={loading || !list.nextCursor}
                  aria-label="หน้าลูกค้าถัดไป"
                  onClick={() => {
                    if (!list.nextCursor) return;
                    setHistory((old) => [...old, query.after]);
                    setQuery((old) => ({ ...old, after: list.nextCursor! }));
                  }}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
