import type {
  CustomerInput,
  CustomerList,
  CustomerQuery,
  CustomerResult,
  CustomerUpdate,
  CustomerView,
} from '../../../../../packages/contracts/src/customers';
import { api } from '../../services/api';

export const customerApi = {
  list(query: CustomerQuery): Promise<CustomerList> {
    const params = new URLSearchParams({
      search: query.search,
      status: query.status,
      limit: String(query.limit),
    });
    if (query.after) params.set('after', query.after);
    return api('/customers?' + params);
  },
  async detail(id: string): Promise<CustomerView> {
    return (await api<{ customer: CustomerView }>('/customers/' + id)).customer;
  },
  async phoneMatches(phone: string, excludeId?: string): Promise<CustomerView[]> {
    const params = new URLSearchParams({ phone });
    if (excludeId) params.set('excludeId', excludeId);
    return (await api<{ customers: CustomerView[] }>('/customers/phone-matches?' + params))
      .customers;
  },
  create(data: CustomerInput, key: string): Promise<CustomerResult> {
    return api('/customers', 'POST', data, { 'Idempotency-Key': key });
  },
  update(id: string, data: CustomerUpdate): Promise<CustomerResult> {
    return api('/customers/' + id, 'PATCH', data);
  },
};
