import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { RequireAuth, RequirePermission } from './auth'
import Layout from './Layout'
import Home from './pages/Home'
import Login from './pages/Login'
import DayRecordForm from './pages/records/DayRecordForm'
import WorkOrderForm from './pages/records/WorkOrderForm'
import WorkOrderList from './pages/records/WorkOrderList'

const queryClient = new QueryClient()

// Alamat lama /schedule (termasuk ?from=&to=) dialihkan ke Beranda yang kini menampilkan jadwal.
function ScheduleToHome() {
  const { search } = useLocation()
  return <Navigate to={`/${search}`} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/schedule" element={<ScheduleToHome />} />
              <Route element={<RequirePermission permission="work_order:view" />}>
                <Route path="/schedule/work-order" element={<WorkOrderList />} />
              </Route>
              <Route path="/schedule/work-order/list" element={<Navigate to="/schedule/work-order" replace />} />
              <Route element={<RequirePermission permission="work_order:create" />}>
                <Route path="/schedule/work-order/new" element={<WorkOrderForm />} />
              </Route>
              <Route element={<RequirePermission permission="work_order:edit" />}>
                <Route path="/schedule/work-order/:id/edit" element={<WorkOrderForm />} />
              </Route>
              <Route element={<RequirePermission permission="maintenance:create" />}>
                <Route path="/schedule/maintenance" element={<DayRecordForm kind="maintenance" />} />
              </Route>
              <Route element={<RequirePermission permission="standby:create" />}>
                <Route path="/schedule/standby" element={<DayRecordForm kind="standby" />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
