import type { SessionView } from '../../../../packages/contracts/src/identity';

let csrfToken = '';
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  data?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...extraHeaders,
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrfToken }),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new ApiError(
      'เชื่อมต่อระบบไม่ได้ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง',
      'NETWORK_ERROR',
      0,
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      payload.message ?? 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่',
      payload.code ?? 'REQUEST_FAILED',
      response.status,
    );
  return payload as T;
}
export async function getSession(): Promise<SessionView> {
  const session = await api<SessionView>('/auth/session');
  csrfToken = session.csrfToken;
  return session;
}
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่';

// ช่องทางไฟล์ยังตรวจสิทธิ์และ CSRF เช่นเดียวกับการบันทึกข้อมูลทั่วไป
export async function fileRequest(
  path: string,
  body: BodyInit,
  headers: Record<string, string> = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { ...headers, 'X-CSRF-Token': csrfToken },
      body,
    });
  } catch {
    throw new ApiError('เชื่อมต่อระบบไม่ได้ กรุณาลองคำขอเดิมอีกครั้ง', 'NETWORK_ERROR', 0);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(
      payload.message ?? 'ดำเนินการไม่สำเร็จ',
      payload.code ?? 'REQUEST_FAILED',
      response.status,
    );
  }
  return response;
}
