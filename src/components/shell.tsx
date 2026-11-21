import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  Bug,
  Contact,
  CreditCard,
  FileBarChart,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Shield,
  Sun,
  Users,
  X,
} from 'lucide-react'
import { api, modoDatos } from '@/api'
import { ROLE_LABEL, toneFor } from '@/domain/labels'
import type { Role } from '@/domain/types'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Logo } from './ui'

const NAV: { to: string; label: string; icon: typeof Users; roles: Role[] }[] = [
  { to: '/panel', label: 'Panel', icon: LayoutDashboard, roles: ['admin', 'auditor_seguridad', 'ejecutivo', 'cliente'] },
  { to: '/clientes', label: 'Clientes', icon: Users, roles: ['admin', 'ejecutivo', 'auditor_seguridad'] },
  { to: '/cuentas', label: 'Cuentas', icon: Landmark, roles: ['admin', 'ejecutivo', 'cliente', 'auditor_seguridad'] },
  { to: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight, roles: ['admin', 'ejecutivo', 'cliente', 'auditor_seguridad'] },
  { to: '/transferir', label: 'Transferir', icon: ArrowUpRight, roles: ['admin', 'ejecutivo', 'cliente'] },
  { to: '/beneficiarios', label: 'Beneficiarios', icon: Contact, roles: ['admin', 'ejecutivo', 'cliente'] },
  { to: '/tarjetas', label: 'Tarjetas', icon: CreditCard, roles: ['admin', 'ejecutivo', 'cliente'] },
  { to: '/seguridad', label: 'Seguridad', icon: Shield, roles: ['admin', 'auditor_seguridad'] },
  { to: '/riesgos', label: 'Riesgos', icon: AlertTriangle, roles: ['admin', 'auditor_seguridad'] },
  { to: '/hallazgos', label: 'Hallazgos', icon: Bug, roles: ['admin', 'auditor_seguridad'] },
  { to: '/reportes', label: 'Reportes', icon: FileBarChart, roles: ['admin', 'auditor_seguridad', 'ejecutivo', 'cliente'] },
]

function themeIsDark() {
  return document.documentElement.classList.contains('dark')
}

export function Shell() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [dark, setDark] = useState(themeIsDark)
  const [bell, setBell] = useState(false)
  const notes = useQuery({ queryKey: ['notificaciones'], queryFn: () => api.listNotificaciones() })
  const unread = (notes.data ?? []).filter((item) => !item.leida)
  const role = session.role ?? 'cliente'
  const items = NAV.filter((item) => item.roles.includes(role))

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('sbgt.theme', next ? 'dark' : 'light')
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Saltar al contenido</a>
      {open ? <button className="fixed inset-0 z-30 bg-navy/40 lg:hidden" aria-label="Cerrar menú" onClick={() => setOpen(false)} /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-navy text-white transition-all ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 ${collapsed ? 'w-20' : 'w-72'}`}>
        <div className="flex items-center justify-between px-4 py-5">
          {collapsed ? <span className="mx-auto text-lg font-semibold text-accent">S</span> : <Logo light />}
          <button type="button" className="rounded-lg p-1 text-white/70 lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar navegación"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Principal">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to} title={item.label} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${isActive ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/5 hover:text-white'}`}>
                <Icon className="h-5 w-5 shrink-0 text-accent" />
                {collapsed ? null : <span>{item.label}</span>}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <button type="button" className="hidden w-full rounded-xl px-3 py-2 text-left text-xs text-white/70 hover:bg-white/5 lg:block" onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? '»' : 'Contraer menú'}
          </button>
        </div>
      </aside>
      <div className={collapsed ? 'lg:pl-20' : 'lg:pl-72'}>
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu className="h-5 w-5" /></button>
            <p className="hidden text-sm text-muted sm:block">{modoDatos === 'supabase' ? 'Conectado a Supabase' : 'Entorno de demostración · motor local'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-lg p-2" onClick={toggleTheme} aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'}>
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="relative">
              <button type="button" className="relative rounded-lg p-2" onClick={() => setBell((value) => !value)} aria-label="Notificaciones" aria-expanded={bell}>
                <Bell className="h-5 w-5" />
                {unread.length ? <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] text-white">{unread.length}</span> : null}
              </button>
              {bell ? (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-line bg-surface p-3 shadow-card">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">Alertas</p>
                    <button type="button" className="text-xs text-accentink" onClick={() => { setBell(false); navigate('/notificaciones') }}>Ver todas</button>
                  </div>
                  <div className="space-y-2">
                    {unread.slice(0, 5).map((item) => (
                      <button key={item.id} type="button" className="block w-full rounded-xl bg-canvas px-3 py-2 text-left" onClick={() => { setBell(false); navigate('/notificaciones') }}>
                        <Badge tone={toneFor(item.severidad)}>{item.severidad}</Badge>
                        <p className="mt-1 text-sm font-medium">{item.titulo}</p>
                      </button>
                    ))}
                    {unread.length === 0 ? <p className="text-sm text-muted">No hay alertas pendientes.</p> : null}
                  </div>
                </div>
              ) : null}
            </div>
            <button type="button" className="hidden text-right sm:block" onClick={() => navigate('/perfil')}>
              <p className="text-sm font-medium">{session.nombre}</p>
              <p className="text-xs text-muted">{session.role ? ROLE_LABEL[session.role] : ''}</p>
            </button>
            <button type="button" className="rounded-lg p-2" aria-label="Cerrar sesión" onClick={() => void signOut().then(() => navigate('/login'))}>
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main id="contenido" className="px-4 py-6 md:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
