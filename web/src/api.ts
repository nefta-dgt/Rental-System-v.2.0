export type Me = {
  username: string
  name: string
  role: string | null
  sections: string[]
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
  schedule: (from: string, to: string) =>
    request<Schedule>(`/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
}
