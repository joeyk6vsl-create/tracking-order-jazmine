import { useEffect, useState } from 'react';
import type { BackupStatus, RecoveryReport } from '../../../../../packages/contracts/src/backups';
import { api, errorMessage } from '../../services/api';
import { shopDate } from '../settlements/CommandResult';
import { BackupDownloadForm, RecoveryForm } from './BackupForms';
import './backups.css';
function RecoverySummary({ report }: { report: RecoveryReport }) {
  const [message, setMessage] = useState('');
  const categories = [
    ['users', 'ບັນຊີ / Accounts'],
    ['orders', 'ອໍເດີ / Orders'],
    ['payment_entries', 'ລາຍການເງິນ / Money entries'],
    ['production_sheets', 'ໃບຜະລິດ / Production sheets'],
    ['graphic_assets', 'ໄຟລ໌ກຣາຟິກ / Graphic files'],
    ['production_part_files', 'ໄຟລ໌ຊິ້ນງານ / Production files'],
  ];
  return (
    <section className="panel pricing-panel" aria-label="Recovery result">
      <h2>ກວດສຳເນົາຜ່ານແລ້ວ / Recovery copy verified</h2>
      <p>ຈາກໄຟລ໌ວັນທີ / Backup: {shopDate(report.backupCreatedAt)} · Lao time</p>
      <div className="backup-counts">
        {categories.map(([table, label]) => (
          <div key={table}>
            <span>{label}</span>
            <strong>{report.verifiedTables.find((t) => t.table === table)?.rows ?? '0'}</strong>
          </div>
        ))}
      </div>
      <p>ກວດຂໍ້ມູນ ແລະ ໄຟລ໌ກົງກັບສຳຮອງ · ຂໍ້ມູນເດີມບໍ່ຖືກທັບ</p>
      <p>ສຳເນົານີ້ຕ້ອງເຂົ້າລະບົບໃໝ່ ແລະ ອອກລິງລູກຄ້າໃໝ່ · ບໍ່ເປີດສິດເກົ່າກັບມາເອງ</p>
      <label>
        ໂຟນເດີສຳເນົາ / Recovered copy folder
        <input aria-label="Recovery folder" readOnly value={report.folder} />
      </label>
      <button
        onClick={() =>
          void navigator.clipboard
            .writeText(report.folder)
            .then(() => setMessage('ຄັດລອກແລ້ວ / Copied'))
            .catch(() => setMessage('ເລືອກທີ່ຢູ່ແລະຄັດລອກເອງ / Select and copy the folder'))
        }
      >
        Copy folder path
      </button>
      {message && <p role="status">{message}</p>}
      <ol>
        <li>ເປີດໂຟນເດີນີ້ໃນ Windows</li>
        <li>ເປີດ START_RECOVERED_JAZMINE.cmd</li>
        <li>ເຂົ້າ http://localhost:5176 ແລະ ກວດຍອດ/ໄຟລ໌ກ່ອນໃຊ້ງານຕໍ່</li>
      </ol>
      <p className="muted">ສຳເນົາແຍກໃຊ້ບັນຊີ ແລະ ລະຫັດເຂົ້າລະບົບທີ່ມີໃນວັນສຳຮອງ</p>
    </section>
  );
}
export function BackupsPage() {
  const [status, setStatus] = useState<BackupStatus | null>(null),
    [report, setReport] = useState<RecoveryReport | null>(null),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void api<BackupStatus>('/backups/status')
      .then((s) => {
        if (active) {
          setStatus(s);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tick]);
  async function open(id: string) {
    setLoading(true);
    try {
      setReport(await api<RecoveryReport>(`/backups/recoveries/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  const disabled = working || loading || !status?.available || !!status?.busy;
  return (
    <div className="backups-page">
      <div className="page-heading">
        <div>
          <span className="section-label">OWNER · DATA RECOVERY</span>
          <h1>ສຳຮອງ ແລະ ກູ້ຄືນ / Backup & recovery</h1>
        </div>
        <button disabled={working || loading} onClick={refresh}>
          Refresh backup status
        </button>
      </div>
      <p>ໄຟລ໌ສຳຮອງມີລະຫັດປ້ອງກັນ · ກູ້ຄືນເປັນສຳເນົາກ່ອນ · ໃຊ້ໄດ້ໃນຮຸ່ນທົດລອງໃນເຄື່ອງ</p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading…</p>}
      {status && !status.available && (
        <p className="alert warning">
          ຖານຂໍ້ມູນພາຍນອກຕ້ອງໃຊ້ແຜນສຳຮອງຂອງຜູ້ໃຫ້ບໍລິການ / External database backup is separate
        </p>
      )}
      {status?.busy && <p role="status">ມີການສຳຮອງ/ກູ້ຄືນກຳລັງເຮັດ ກະລຸນາລໍຖ້າ</p>}
      <BackupDownloadForm disabled={disabled} onWorking={setWorking} onChanged={refresh} />
      <RecoveryForm
        disabled={disabled}
        onWorking={setWorking}
        onChanged={refresh}
        onRestored={setReport}
      />
      {report && <RecoverySummary key={report.id} report={report} />}
      <section className="panel pricing-panel">
        <h2>ປະຫວັດ 20 ລາຍການຫຼ້າສຸດ / Recent history</h2>
        {status && !status.history.length && <p>No backup history</p>}
        {status?.history.map((entry, i) => (
          <article className="backup-history" key={entry.at + ':' + i}>
            <h3>
              {entry.action === 'BACKUP_CREATED'
                ? 'ສ້າງໄຟລ໌ສຳຮອງ / Backup created'
                : 'ກວດສຳເນົາກູ້ຄືນ / Recovery verified'}
            </h3>
            <p>{shopDate(entry.at)} · Lao time</p>
            <p className="work-notes">{entry.reason}</p>
            {entry.detail.filename && <p>{entry.detail.filename}</p>}
            {entry.detail.recoveryId && (
              <button
                disabled={working || loading}
                onClick={() => void open(entry.detail.recoveryId!)}
              >
                ເປີດຜົນກູ້ຄືນ / View recovery
              </button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
