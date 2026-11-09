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
export type DayRecordCreated = { unitId: string; startDate: string; finishDate: string; count: number }

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
  createMaintenance: (b: DayRecordInput) => request<DayRecordCreated>('/api/maintenance', { method: 'POST', body: JSON.stringify(b) }),
  createStandby: (b: DayRecordInput) => request<DayRecordCreated>('/api/standby', { method: 'POST', body: JSON.stringify(b) }),
  schedule: (from: string, to: string) =>
    request<Schedule>(`/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
}
