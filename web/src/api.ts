export type Me = {
  username: string
  name: string
  role: string | null
  sections: string[]
  permissions: string[]
}

export type WorkOrder = {
  id: string
  rcId: string | null
  rcType: string | null
  location: string | null
  start: string
  finish: string
}
export type Cell = { wo: WorkOrder[]; standby: boolean; maintenance: string | null }
export type ScheduleUnit = { unitId: string; unitType: string | null; active: boolean; cells: Cell[] }
export type Schedule = { from: string; to: string; days: string[]; units: ScheduleUnit[] }

export type FormOptions = {
  rcTypes: string[]
  defaults: { unitType: string; rcType: string; time: number | null; volume: number | null; pipe: number | null }[]
  operators: { employeeId: string; name: string }[]
  units: { unitId: string; unitType: string | null }[]
  contracts: { rcId: string; rcType: string | null; location: string | null; status: string | null }[]
}
export type WorkOrderInput = {
  operatorId: string
  unitId: string
  rcType: string
  location: string
  startDate: string
  finishDate?: string
  qty?: number
  time?: number
  volume?: number
  pipe?: string
  remarks?: string
  rcId?: string
}
export type DayRecordInput = { unitId: string; startDate: string; finishDate?: string; remarks?: string }
export type WorkOrderCreated = { id: string; unitId: string; startDate: string; finishDate: string; warnings: string[] }
export type WorkOrderRow = {
  id: string
  timestamp: string | null
  createdByName: string | null
  operatorId: string | null
  operatorName: string | null
  unitId: string | null
  unitType: string | null
  rcType: string | null
  rcId: string | null
  location: string | null
  startDate: string | null
  finishDate: string | null
  qty: number | null
  time: number | null
  volume: number | null
  pipe: string | null
  remarks: string | null
}
export type WorkOrderList = { items: WorkOrderRow[]; total: number; page: number; pageSize: number }
export type WorkOrderFilter = { q?: string; unitId?: string; operator?: string; rcType?: string; date?: string; page?: number; pageSize?: number }
export type DayRecordRow = { id: number; unitId: string; unitType: string | null; date: string; createdAt: string | null; createdByName: string | null; note: string | null }
export type DayRecordList = { items: DayRecordRow[]; total: number; page: number; pageSize: number }
export type DayRecordFilter = { q?: string; unitId?: string; date?: string; page?: number; pageSize?: number }
export type StandbyRange = { unitId: string; unitType: string | null; startDate: string; finishDate: string; days: number; createdAt: string | null; createdByName: string | null }
export type StandbyRangeList = { items: StandbyRange[]; total: number; page: number; pageSize: number }
export type DayRecordCreated = { unitId: string; startDate: string; finishDate: string; count: number }

export type ApprovalRow = {
  id: string; createdAt: string | null; tsNo: string | null; unitId: string | null; unitType: string | null; date: string | null; customer: string | null
  location: string | null; operator: string | null; volume: string | null; confidence: number | null; doubtfulFields: string | null; hasImage: boolean
}
export type ApprovalList = { items: ApprovalRow[]; total: number; page: number; pageSize: number }
export type Person = { employeeId: string; name: string }
export type ApprovalWorkOrder = { id: string; location: string | null; rcType: string | null; operatorId: string | null; start: string; finish: string; hasTimesheetThatDay: boolean }
export type ApprovalDetail = {
  id: string; status: string; createdAt: string | null; confidence: number | null; doubtfulFields: string | null; hasImage: boolean
  fields: Record<'tsNo' | 'date' | 'unitId' | 'unitType' | 'customer' | 'company' | 'location' | 'dispatch' | 'arrive' | 'start' | 'finish' | 'returnTime' | 'totalHours' | 'volume' | 'pipe' | 'operator' | 'notes' | 'phone' | 'pic' | 'batchingPlant', string | null> & { crew: string[] }
  resolved: { unitId: string | null; date: string | null }
  prefill: { date: string; dispatch: string; arrive: string; start: string; finish: string; returnTime: string; volume: string }
  workOrders: ApprovalWorkOrder[]
  operators: Person[]
  crew: (Person & { nik: string | null })[]
  units: { unitId: string; unitType: string | null }[]
  statuses: string[]
  suggested: { operatorId: string | null; crewIds: string[] }
}
export type ApprovalFilter = { q?: string; page?: number; pageSize?: number }
export type ApproveInput = {
  woId: string; tsNo: string; operatorId: string; unitId: string; date: string; status: string; volume: number; pipe: string
  dispatch: string; arrive: string; start: string; finish: string; returnTime: string; distanceKm: number | null
  customer: string; location: string; batchingPlant: string; notes: string; crewIds: string[]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    credentials: 'same-origin',
  })
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const body = isJson ? await res.json().catch(() => null) : null
  if (!res.ok) throw new ApiError(res.status, body?.error ?? 'Terjadi kesalahan')
  if (body === null) throw new ApiError(res.status, 'Respons server tidak valid')
  return body as T
}

export const api = {
  me: () => request<Me>('/api/me'),
  login: (username: string, password: string) =>
    request<Omit<Me, 'sections'>>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/logout', { method: 'POST' }),
  formOptions: () => request<FormOptions>('/api/form-options'),
  createWorkOrder: (b: WorkOrderInput) => request<WorkOrderCreated>('/api/work-orders', { method: 'POST', body: JSON.stringify(b) }),
  listWorkOrders: (f: WorkOrderFilter) => {
    const qs = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)))
    return request<WorkOrderList>(`/api/work-orders?${qs}`)
  },
  getWorkOrder: (id: string) => request<WorkOrderRow>(`/api/work-orders/${encodeURIComponent(id)}`),
  updateWorkOrder: (id: string, b: WorkOrderInput) =>
    request<WorkOrderCreated>(`/api/work-orders/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(b) }),
  deleteWorkOrder: (id: string) => request<{ ok: boolean; id: string }>(`/api/work-orders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listDayRecords: (kind: 'maintenance' | 'standby', f: DayRecordFilter) => {
    const qs = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)))
    return request<DayRecordList>(`/api/${kind}?${qs}`)
  },
  listStandbyRanges: (f: DayRecordFilter) => {
    const qs = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)))
    return request<StandbyRangeList>(`/api/standby/ranges?${qs}`)
  },
  createMaintenance: (b: DayRecordInput) => request<DayRecordCreated>('/api/maintenance', { method: 'POST', body: JSON.stringify(b) }),
  createStandby: (b: DayRecordInput) => request<DayRecordCreated>('/api/standby', { method: 'POST', body: JSON.stringify(b) }),
  listApprovals: (f: ApprovalFilter) => {
    const qs = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)))
    return request<ApprovalList>(`/api/timesheet-approvals?${qs}`)
  },
  listApprovalWorkOrders: (unitId: string, date: string) =>
    request<{ items: ApprovalWorkOrder[] }>(`/api/timesheet-approvals/work-orders?unitId=${encodeURIComponent(unitId)}&date=${encodeURIComponent(date)}`),
  getApproval: (id: string) => request<ApprovalDetail>(`/api/timesheet-approvals/${encodeURIComponent(id)}`),
  approveTimesheet: (id: string, b: ApproveInput) =>
    request<{ id: string; status: string; tsId: string; workOrderId: string; unitId: string; date: string }>(`/api/timesheet-approvals/${encodeURIComponent(id)}/approve`, { method: 'POST', body: JSON.stringify(b) }),
  declineTimesheet: (id: string) => request<{ id: string; status: string }>(`/api/timesheet-approvals/${encodeURIComponent(id)}/decline`, { method: 'POST', body: '{}' }),
  schedule: (from: string, to: string) =>
    request<Schedule>(`/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
}
