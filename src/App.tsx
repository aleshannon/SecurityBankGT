import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Shell } from '@/components/shell'
import { Logo } from '@/components/ui'
import { LoginPage } from '@/features/auth/LoginPage'
import { MfaPage } from '@/features/auth/MfaPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { BeneficiariosPage } from '@/features/beneficiarios/BeneficiariosPage'
import { ClienteDetallePage } from '@/features/clientes/ClienteDetallePage'
import { ClientesPage } from '@/features/clientes/ClientesPage'
import { CuentasPage } from '@/features/cuentas/CuentasPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { HallazgosPage } from '@/features/hallazgos/HallazgosPage'
import { NotificacionesPage } from '@/features/notificaciones/NotificacionesPage'
import { PerfilPage } from '@/features/perfil/PerfilPage'
import { ReportesPage } from '@/features/reportes/ReportesPage'
import { RiesgosPage } from '@/features/riesgos/RiesgosPage'
import { SeguridadPage } from '@/features/seguridad/SeguridadPage'
import { TarjetasPage } from '@/features/tarjetas/TarjetasPage'
import { MovimientosPage } from '@/features/transacciones/MovimientosPage'
import { TransferirPage } from '@/features/transacciones/TransferirPage'

function Splash() {
  return <div className="grid min-h-screen place-items-center"><Logo /></div>
}

function Protected() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (session.status === 'anonymous') return <Navigate to="/login" replace />
  if (session.status === 'mfa') return <Navigate to="/mfa" replace />
  return <Shell />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route path="/mfa" element={<MfaPage />} />
      <Route element={<Protected />}>
        <Route index element={<Navigate to="/panel" replace />} />
        <Route path="/panel" element={<DashboardPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/clientes/:id" element={<ClienteDetallePage />} />
        <Route path="/cuentas" element={<CuentasPage />} />
        <Route path="/movimientos" element={<MovimientosPage />} />
        <Route path="/transferir" element={<TransferirPage />} />
        <Route path="/beneficiarios" element={<BeneficiariosPage />} />
        <Route path="/tarjetas" element={<TarjetasPage />} />
        <Route path="/seguridad" element={<SeguridadPage />} />
        <Route path="/riesgos" element={<RiesgosPage />} />
        <Route path="/hallazgos" element={<HallazgosPage />} />
        <Route path="/reportes" element={<ReportesPage />} />
        <Route path="/notificaciones" element={<NotificacionesPage />} />
        <Route path="/perfil" element={<PerfilPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/panel" replace />} />
    </Routes>
  )
}
