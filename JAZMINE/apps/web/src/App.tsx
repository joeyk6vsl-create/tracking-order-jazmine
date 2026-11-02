import { useState, lazy, Suspense } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleUserRound,
  ContactRound,
  House,
  Layers3,
  LogOut,
  Menu,
  ShieldCheck,
  Shirt,
  Users,
} from 'lucide-react';
import { useSession } from './features/auth/SessionProvider';
import { LoginPage } from './features/auth/LoginPage';
import { ChangePasswordPage } from './features/auth/ChangePasswordPage';
import { UserManagementPage } from './features/users/UserManagementPage';
import { CustomerListPage } from './features/customers/CustomerListPage';
import { CatalogPage } from './features/catalog/CatalogPage';
import { PricingPage } from './features/pricing/PricingPage';
import { OrderDraftsPage } from './features/orders/OrderDraftsPage';
import { GraphicAssetsPage } from './features/assets/GraphicAssetsPage';
import { ConfirmedOrdersPage } from './features/orders/ConfirmedOrdersPage';
import { ProductionPage } from './features/production/ProductionPage';
import { ProductionWorkPage } from './features/production/ProductionWorkPage';
import { WORK_STAGES } from '../../../packages/contracts/src/production-work';
const PaymentQrSettingsPage = lazy(() =>
  import('./features/payment-qr/PaymentQrSettingsPage').then((m) => ({
    default: m.PaymentQrSettingsPage,
  })),
);
const ProductionPrintPage = lazy(() =>
  import('./features/production/ProductionPrintPage').then((m) => ({
    default: m.ProductionPrintPage,
  })),
);
const SettlementsPage = lazy(() =>
  import('./features/settlements/SettlementsPage').then((m) => ({ default: m.SettlementsPage })),
);
import { errorMessage } from './services/api';
const PublicTrackingPage = lazy(() =>
  import('./features/tracking/PublicTrackingPage').then((m) => ({ default: m.PublicTrackingPage })),
);
const CustomerRequestsPage = lazy(() =>
  import('./features/tracking/CustomerRequestsPage').then((m) => ({
    default: m.CustomerRequestsPage,
  })),
);
const ReportsPage = lazy(() =>
  import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const SearchPage = lazy(() =>
  import('./features/search/SearchPage').then((m) => ({ default: m.SearchPage })),
);
const BackupsPage = lazy(() =>
  import('./features/backups/BackupsPage').then((m) => ({ default: m.BackupsPage })),
);
const QuotationsPage = lazy(() =>
  import('./features/quotations/QuotationsPage').then((m) => ({ default: m.QuotationsPage })),
);

function Dashboard({
  openUsers,
  openCustomers,
}: {
  openUsers: () => void;
  openCustomers: () => void;
}) {
  const { session } = useSession();
  const user = session!.user!;
  const owner = session!.permissions.includes('users.manage');
  const manageCustomers = session!.permissions.includes('customers.manage');
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-label">YOUR WORKSPACE</span>
          <h1>ສະບາຍດີ, {user.displayName}</h1>
          <p className="muted">พื้นที่ทำงานของคุณ · {user.department}</p>
        </div>
        <span className="badge positive">
          <span className="status-dot" />
          เชื่อมต่อระบบแล้ว
        </span>
      </div>
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">JAZMINE · WORKSPACE</span>
          <h2>
            ພ້ອມສຳລັບ
            <br />
            ກ້າວຕໍ່ໄປ.
          </h2>
          <p>
            บัญชีและสิทธิ์พร้อมใช้งาน
            <br />
            {manageCustomers
              ? 'จัดการรายชื่อลูกค้าประจำได้แล้ว'
              : 'ดูข้อมูลบัญชีและแผนกของคุณได้ที่นี่'}
            <br />
            {manageCustomers
              ? 'ອໍເດີ · ຜະລິດ · ຮັບເງິນ · ສົ່ງສິນຄ້າ'
              : 'ເປີດ Work queue ເພື່ອເຮັດວຽກຂອງແຜນກ'}
          </p>
          {owner && (
            <button className="on-blue" onClick={openUsers}>
              จัดการทีมงาน
              <ArrowUpRight size={18} />
            </button>
          )}
          {manageCustomers && (
            <button className="on-blue" onClick={openCustomers}>
              ລູກຄ້າປະຈຳ
              <ArrowUpRight size={18} />
            </button>
          )}
        </div>
        <div className="welcome-mark" aria-hidden="true">
          <Shirt size={106} strokeWidth={1} />
          <span>
            JAZMINE
            <br />
            SPORTSWEAR
          </span>
        </div>
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <ShieldCheck size={20} />
              ข้อมูลการเข้าถึง
            </h2>
            <span className="section-label">LIVE</span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>ระดับผู้ใช้</dt>
              <dd>{user.role === 'ADMIN_PROMAX' ? 'เจ้าของ · ADMIN_PROMAX' : 'พนักงาน · STAFF'}</dd>
            </div>
            <div>
              <dt>แผนก</dt>
              <dd>{user.department}</dd>
            </div>
            <div>
              <dt>ชื่อผู้ใช้</dt>
              <dd>{user.username}</dd>
            </div>
            <div>
              <dt>สถานะบัญชี</dt>
              <dd>ใช้งาน</dd>
            </div>
          </dl>
          <p className="panel-footnote">ตรวจสิทธิ์จากระบบหลังบ้านทุกครั้งที่ทำรายการ</p>
        </section>
        <section className="panel">
          <h2>
            <Layers3 size={20} />
            ลำดับการพัฒนา
          </h2>
          <ol className="roadmap">
            <li className="ready">
              <span>
                <Check size={15} />
              </span>
              <div>
                <strong>บัญชีและสิทธิ์</strong>
                <p>เริ่มใช้งานได้ในรุ่นนี้</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>ลูกค้าประจำ</strong>
                <p>เพิ่ม ค้นหา และแก้ไขได้แล้ว</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>ราคาและออเดอร์</strong>
                <p>ເລືອກດ້ວຍຮູບ · ຢືນຢັນ ແລະ ເກັບປະຫວັດໄດ້</p>
              </div>
            </li>
          </ol>
        </section>
      </div>
      {owner && (
        <section className="notice">
          <ShieldCheck size={20} />
          <div>
            <strong>กำไรยังคำนวณไม่ครบ</strong>
            <p>
              จะเปิดรายงานเมื่อมีข้อมูลต้นทุนผ้า ค่าแรง และหมึกครบ
              รุ่นนี้ยังไม่แสดงตัวเลขยอดขายหรือกำไรสมมติ
            </p>
          </div>
        </section>
      )}
    </>
  );
}
export function App() {
  const { session, loading, error, refresh, logout } = useSession();
  const [view, setView] = useState(() =>
    new URLSearchParams(location.search).has('productionWork')
      ? 'work'
      : new URLSearchParams(location.search).has('prepareSheet')
        ? 'production'
        : new URLSearchParams(location.search).has('settlementOrder')
          ? 'settlements'
          : new URLSearchParams(location.search).has('confirmedOrder')
            ? 'orders'
            : new URLSearchParams(location.search).has('customerId')
              ? 'customers'
              : new URLSearchParams(location.search).has('quotation')
                ? 'quotations'
                : 'home',
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  if (loading)
    return (
      <main className="center-state" role="status">
        กำลังเชื่อมต่อ JAZMINE…
      </main>
    );
  if (error)
    return (
      <main className="center-state">
        <div className="panel">
          <h1>เชื่อมต่อไม่ได้</h1>
          <p role="alert">{error}</p>
          <button className="primary" onClick={() => void refresh()}>
            ลองเชื่อมต่อใหม่
          </button>
        </div>
      </main>
    );
  if (location.hash.startsWith('#track='))
    return (
      <Suspense fallback={<main className="center-state">Loading…</main>}>
        <PublicTrackingPage key={location.hash} token={location.hash.slice(7)} />
      </Suspense>
    );
  if (!session?.user) return <LoginPage />;
  const user = session.user;
  const manageUsers = session.permissions.includes('users.manage');
  const viewReports = session.permissions.includes('reports.view');
  const manageBackups = session.permissions.includes('backups.manage');
  const managePaymentQr = session.permissions.includes('payment-qr.manage');
  const managePayments = session.permissions.includes('payments.record');
  const manageCustomers = session.permissions.includes('customers.manage');
  const manageAssets =
    session.permissions.includes('graphic.approve') ||
    session.permissions.includes('orders.manage');
  const forced = user.mustChangePassword;
  const viewWork =
    session.permissions.includes('production.resolve') ||
    (session.permissions.includes('production.own') &&
      (WORK_STAGES as readonly string[]).includes(user.department));
  if (!forced && new URLSearchParams(location.search).has('productionSheet'))
    return (
      <Suspense fallback={<main className="center-state">ກຳລັງໂຫຼດ / Loading…</main>}>
        <ProductionPrintPage />
      </Suspense>
    );
  const activeView = forced
    ? 'account'
    : (view === 'users' && !manageUsers) ||
        (['customers', 'catalog', 'pricing', 'drafts', 'orders', 'quotations'].includes(view) &&
          !manageCustomers) ||
        (['assets', 'production'].includes(view) && !manageAssets) ||
        (view === 'work' && !viewWork) ||
        (view === 'settlements' && !managePayments) ||
        (view === 'requests' && !manageCustomers) ||
        (view === 'reports' && !viewReports) ||
        (view === 'backups' && !manageBackups) ||
        (view === 'payment-qr' && !managePaymentQr)
      ? 'home'
      : view;
  function navigate(target: string) {
    setView(target);
    setMenuOpen(false);
  }
  async function signOut() {
    setLoggingOut(true);
    setActionError('');
    try {
      await logout();
      setView('home');
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setLoggingOut(false);
    }
  }
  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (menuOpen ? 'is-open' : '')}>
        <div className="brand">
          <span className="brand-symbol">
            <Shirt size={23} />
          </span>
          JAZMINE
        </div>
        <p className="sidebar-caption">SPORTSWEAR WORKSPACE</p>
        <span className="nav-label">ພື້ນທີ່ເຮັດວຽກ</span>
        <nav aria-label="เมนูหลัก">
          {managePaymentQr && (
            <button
              disabled={forced}
              aria-current={activeView === 'payment-qr' ? 'page' : undefined}
              onClick={() => navigate('payment-qr')}
            >
              QR ຮັບເງິນ / Shop payment QR
            </button>
          )}
          {manageCustomers && (
            <button
              disabled={forced}
              aria-current={activeView === 'quotations' ? 'page' : undefined}
              onClick={() => navigate('quotations')}
            >
              ໃບສະເໜີລາຄາ / Quotations
            </button>
          )}
          {manageBackups && (
            <button
              disabled={forced}
              aria-current={activeView === 'backups' ? 'page' : undefined}
              onClick={() => navigate('backups')}
            >
              ສຳຮອງ/ກູ້ຄືນ / Backup & recovery
            </button>
          )}
          <button
            disabled={forced}
            aria-current={activeView === 'search' ? 'page' : undefined}
            onClick={() => navigate('search')}
          >
            ຄົ້ນຫາ / Search
          </button>
          {viewReports && (
            <button
              disabled={forced}
              aria-current={activeView === 'reports' ? 'page' : undefined}
              onClick={() => navigate('reports')}
            >
              ລາຍງານເຈົ້າຂອງ / Reports
            </button>
          )}
          {manageCustomers && (
            <button
              disabled={forced}
              aria-current={activeView === 'requests' ? 'page' : undefined}
              onClick={() => navigate('requests')}
            >
              ຄຳຂໍລູກຄ້າ / Customer requests
            </button>
          )}
          {managePayments && (
            <button
              disabled={forced}
              aria-current={activeView === 'settlements' ? 'page' : undefined}
              onClick={() => navigate('settlements')}
            >
              ຮັບເງິນ/ສົ່ງສິນຄ້າ / Payments & delivery
            </button>
          )}
          {viewWork && (
            <button
              disabled={forced}
              aria-current={activeView === 'work' ? 'page' : undefined}
              onClick={() => navigate('work')}
            >
              ວຽກຜະລິດ / Work queue
            </button>
          )}
          {manageAssets && (
            <button
              disabled={forced}
              aria-current={activeView === 'production' ? 'page' : undefined}
              onClick={() => navigate('production')}
            >
              เตรียมใบผลิต
            </button>
          )}
          {manageCustomers && (
            <button
              disabled={forced}
              aria-current={activeView === 'orders' ? 'page' : undefined}
              onClick={() => navigate('orders')}
            >
              ออเดอร์ที่ยืนยันแล้ว
            </button>
          )}
          {manageAssets && (
            <button
              disabled={forced}
              aria-current={activeView === 'assets' ? 'page' : undefined}
              onClick={() => navigate('assets')}
            >
              ไฟล์และงานกราฟิก
            </button>
          )}
          {manageCustomers && (
            <button
              disabled={forced}
              aria-current={activeView === 'drafts' ? 'page' : undefined}
              onClick={() => navigate('drafts')}
            >
              ร่างออเดอร์
            </button>
          )}
          {manageCustomers && (
            <button
              disabled={forced}
              aria-current={activeView === 'pricing' ? 'page' : undefined}
              onClick={() => navigate('pricing')}
            >
              ราคาและส่วนลด
            </button>
          )}
          {manageCustomers && (
            <button
              disabled={forced}
              aria-current={activeView === 'catalog' ? 'page' : undefined}
              onClick={() => navigate('catalog')}
            >
              <Shirt size={19} />
              สินค้าและชนิดผ้า
            </button>
          )}
          <button
            disabled={forced}
            aria-current={activeView === 'home' ? 'page' : undefined}
            onClick={() => navigate('home')}
          >
            <House size={19} />
            ໜ້າຫຼັກ
          </button>
          {manageUsers && (
            <button
              aria-current={activeView === 'users' ? 'page' : undefined}
              onClick={() => navigate('users')}
            >
              <Users size={19} />
              ພະນັກງານ
            </button>
          )}
          {manageCustomers && (
            <button
              aria-current={activeView === 'customers' ? 'page' : undefined}
              onClick={() => navigate('customers')}
            >
              <ContactRound size={19} />
              ລູກຄ້າປະຈຳ
            </button>
          )}
          <button
            aria-current={activeView === 'account' ? 'page' : undefined}
            onClick={() => navigate('account')}
          >
            <CircleUserRound size={19} />
            ບັນຊີຂອງຂ້ອຍ
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="badge">LOCAL WORKSPACE</span>
          <p>
            ເປີດເມນູຕາມສິດຂອງທ່ານ
            <br />
            ຄູ່ມືຢູ່ໃນໂຟນເດີ docs
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="mobile-menu"
              aria-label="เปิดหรือปิดเมนู"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Menu size={20} />
            </button>
            <span>JAZMINE</span>
            <ChevronRight size={14} />
            <strong>
              {activeView === 'customers'
                ? 'Customers'
                : activeView === 'users'
                  ? 'Team & access'
                  : activeView === 'account'
                    ? 'My account'
                    : 'Workspace'}
            </strong>
          </div>
          <div className="account-summary">
            <span className="avatar small">{user.displayName.slice(0, 1)}</span>
            <span>
              <strong>{user.displayName}</strong>
              <small>{user.role === 'ADMIN_PROMAX' ? 'OWNER' : user.department}</small>
            </span>
            <button aria-label="ออกจากระบบ" disabled={loggingOut} onClick={() => void signOut()}>
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="page-content">
          {session.recoveryMode && (
            <p className="alert warning" role="status">
              ພື້ນທີ່ກູ້ຄືນ / Recovery workspace · ແຍກຈາກຂໍ້ມູນເດີມ
            </p>
          )}
          {actionError && (
            <p className="alert error" role="alert">
              {actionError}
            </p>
          )}
          {forced && (
            <p className="alert warning" role="status">
              ต้องเปลี่ยนรหัสผ่านชั่วคราวก่อนใช้งาน
            </p>
          )}
          {activeView === 'account' ? (
            <ChangePasswordPage />
          ) : activeView === 'users' ? (
            <UserManagementPage />
          ) : activeView === 'backups' ? (
            <Suspense fallback={<p role="status">Loading…</p>}>
              <BackupsPage />
            </Suspense>
          ) : ['search', 'reports', 'requests'].includes(activeView) ? (
            <Suspense fallback={<p role="status">Loading…</p>}>
              {activeView === 'search' ? (
                <SearchPage />
              ) : activeView === 'reports' ? (
                <ReportsPage />
              ) : (
                <CustomerRequestsPage />
              )}
            </Suspense>
          ) : activeView === 'settlements' ? (
            <Suspense fallback={<p role="status">ກຳລັງໂຫຼດ / Loading…</p>}>
              <SettlementsPage />
            </Suspense>
          ) : activeView === 'work' ? (
            <ProductionWorkPage />
          ) : activeView === 'production' ? (
            <ProductionPage />
          ) : activeView === 'payment-qr' ? (
            <Suspense fallback={<p role="status">Loading…</p>}>
              <PaymentQrSettingsPage />
            </Suspense>
          ) : activeView === 'quotations' ? (
            <Suspense fallback={<p role="status">Loading…</p>}>
              <QuotationsPage />
            </Suspense>
          ) : activeView === 'orders' ? (
            <ConfirmedOrdersPage />
          ) : activeView === 'assets' ? (
            <GraphicAssetsPage />
          ) : activeView === 'drafts' ? (
            <OrderDraftsPage />
          ) : activeView === 'pricing' ? (
            <PricingPage />
          ) : activeView === 'catalog' ? (
            <CatalogPage />
          ) : activeView === 'customers' ? (
            <CustomerListPage />
          ) : (
            <Dashboard
              openUsers={() => navigate('users')}
              openCustomers={() => navigate('customers')}
            />
          )}
        </main>
        <footer className="workspace-footer">
          JAZMINE SPORTSWEAR<span>ອອກແບບເພື່ອວຽກຂອງທີມ</span>
        </footer>
      </div>
    </div>
  );
}
