import type { SettlementView } from '../../../../../packages/contracts/src/settlement';
export type SettlementActions = {
  view: SettlementView;
  disabled: boolean;
  onChanged: () => void;
  onFreeze: (frozen: boolean) => void;
};
export function base(view: SettlementView, reason: string) {
  return {
    requestId: crypto.randomUUID(),
    expectedVersion: view.version,
    orderRevision: view.revision,
    reason,
  };
}
export function lak(value: string) {
  return new Intl.NumberFormat('en-US').format(BigInt(value)) + ' LAK';
}
export function localNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Vientiane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}
export function shopInstant(value: string) {
  return new Date(value + '+07:00').toISOString();
}
export function shopDate(value: string) {
  return new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Vientiane', hour12: false });
}
export function CommandResult({
  command,
}: {
  command: { busy: boolean; error: string; pending: unknown; retry: () => unknown };
}) {
  return (
    <>
      {command.error && (
        <p className="alert error" role="alert">
          {command.error}
        </p>
      )}
      {!!command.pending && (
        <button type="button" disabled={command.busy} onClick={command.retry}>
          ລອງຄຳຂໍເດີມ / Retry
        </button>
      )}
    </>
  );
}
