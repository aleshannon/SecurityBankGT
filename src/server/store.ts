import { FAIL_WINDOW_MS, IDLE_MS } from '@/domain/constants'
import { AppError } from '@/domain/errors'
import type { Database, Role, SecurityEvent, Severidad, TipoEvento } from '@/domain/types'
import { directory } from './directory'
import { randomId, sessionTag } from './hash'
import { buildSeed } from './seed'

const DB_KEY = 'sbgt.db.v1'
const TOKEN_KEY = 'sbgt.token'

let memoryToken: string | null = null
let database: Database | null = null

export const tokenStore = {
  get() {
    if (typeof sessionStorage !== 'undefined') return sessionStorage.getItem(TOKEN_KEY)
    return memoryToken
  },
  set(value: string | null) {
    memoryToken = value
    if (typeof sessionStorage === 'undefined') return
    if (value) sessionStorage.setItem(TOKEN_KEY, value)
    else sessionStorage.removeItem(TOKEN_KEY)
  },
}

function pin(stored: Database) {
  const canon = directory()
  const canonIds = new Set(canon.users.map((user) => user.id))
  const extras = (stored.users ?? []).filter((user) => !canonIds.has(user.id))
  stored.users = [...canon.users, ...extras]
  stored.userRoles = [
    ...canon.roles,
    ...extras.map((user) => ({ userId: user.id, role: 'cliente' as const })),
  ]
  stored.sessions = (stored.sessions ?? []).filter((session) => {
    return session.tag === sessionTag(session.token, session.userId, session.mfaVerified)
      && stored.users.some((user) => user.id === session.userId)
  })
}

export function persist() {
  if (!database || typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(DB_KEY, JSON.stringify(database))
}

export function getDb(): Database {
  if (database) return database
  if (typeof sessionStorage !== 'undefined') {
    const raw = sessionStorage.getItem(DB_KEY)
    if (raw) {
      try {
        const stored = JSON.parse(raw) as Database
        if (stored.clientes?.length && stored.cuentas?.length) {
          pin(stored)
          database = stored
          persist()
          return database
        }
      } catch {
        sessionStorage.removeItem(DB_KEY)
      }
    }
  }
  database = buildSeed()
  persist()
  return database
}

export function resetDb() {
  database = buildSeed()
  tokenStore.set(null)
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(DB_KEY)
  persist()
}

export function hasRole(userId: string, role: Role) {
  return getDb().userRoles.some((row) => row.userId === userId && row.role === role)
}

export function roleDe(userId: string): Role {
  const row = getDb().userRoles.find((item) => item.userId === userId)
  if (!row) throw new AppError('No tiene permiso para esta operación.')
  return row.role
}

export interface Ctx {
  token: string
  userId: string
  email: string
  nombre: string
  role: Role
  clienteId: string | null
  ip: string
  device: string
  pais: string
}

export function currentSession() {
  const token = tokenStore.get()
  if (!token) return null
  const session = getDb().sessions.find((item) => item.token === token)
  if (!session) return null
  if (session.tag !== sessionTag(session.token, session.userId, session.mfaVerified)) return null
  return session
}

export function requireSession(needMfa: boolean): Ctx {
  const session = currentSession()
  if (!session) throw new AppError('Debe iniciar sesión.', 'auth')
  if (Date.now() - session.lastActivity > IDLE_MS) {
    getDb().sessions = getDb().sessions.filter((item) => item.token !== session.token)
    tokenStore.set(null)
    persist()
    throw new AppError('Su sesión expiró por inactividad.', 'session_expired')
  }
  if (needMfa && !session.mfaVerified) throw new AppError('Debe confirmar el código de acceso.', 'mfa')
  const user = getDb().users.find((item) => item.id === session.userId)
  if (!user) throw new AppError('Debe iniciar sesión.', 'auth')
  const cliente = getDb().clientes.find((item) => item.userId === user.id)
  return {
    token: session.token,
    userId: user.id,
    email: user.email,
    nombre: user.nombre,
    role: roleDe(user.id),
    clienteId: cliente?.id ?? null,
    ip: session.ip,
    device: session.device,
    pais: session.pais,
  }
}

export function touchSession() {
  const session = currentSession()
  if (!session) return
  if (Date.now() - session.lastActivity > IDLE_MS) {
    getDb().sessions = getDb().sessions.filter((item) => item.token !== session.token)
    tokenStore.set(null)
    persist()
    return
  }
  session.lastActivity = Date.now()
  persist()
}

export function audit(entry: {
  userId: string | null
  accion: string
  entidad: string
  entidadId: string | null
  ip: string
  dispositivo: string
  resultado: 'exito' | 'fallo'
  detalle?: string | null
}) {
  getDb().auditLogs.unshift({
    id: randomId('aud'),
    userId: entry.userId,
    accion: entry.accion,
    entidad: entry.entidad,
    entidadId: entry.entidadId,
    ip: entry.ip,
    dispositivo: entry.dispositivo,
    resultado: entry.resultado,
    detalle: entry.detalle ?? null,
    fecha: new Date().toISOString(),
  })
}

export function securityEvent(entry: {
  tipo: TipoEvento
  severidad: Severidad
  descripcion: string
  userId: string | null
  ip: string
  pais: string
  dispositivo: string
}) {
  const event: SecurityEvent = {
    id: randomId('evt'),
    ...entry,
    fecha: new Date().toISOString(),
  }
  getDb().securityEvents.unshift(event)
  return event
}

export function notify(userId: string, tipo: string, titulo: string, mensaje: string, severidad: Severidad | 'info') {
  getDb().notificaciones.unshift({
    id: randomId('ntf'),
    userId,
    tipo,
    titulo,
    mensaje,
    severidad,
    leida: false,
    fecha: new Date().toISOString(),
  })
}

export function notifyRoles(roles: Role[], tipo: string, titulo: string, mensaje: string, severidad: Severidad | 'info') {
  const ids = getDb().userRoles.filter((row) => roles.includes(row.role)).map((row) => row.userId)
  ids.forEach((userId) => notify(userId, tipo, titulo, mensaje, severidad))
}

export function allow(ctx: Ctx, roles: Role[], accion: string) {
  if (roles.includes(ctx.role)) return
  securityEvent({
    tipo: 'acceso_no_autorizado',
    severidad: 'alta',
    descripcion: `Intento de ${accion} fuera del rol autorizado.`,
    userId: ctx.userId,
    ip: ctx.ip,
    pais: ctx.pais,
    dispositivo: ctx.device,
  })
  audit({
    userId: ctx.userId,
    accion,
    entidad: 'autorizacion',
    entidadId: null,
    ip: ctx.ip,
    dispositivo: ctx.device,
    resultado: 'fallo',
    detalle: 'Rol no autorizado',
  })
  persist()
  throw new AppError('No tiene permiso para esta operación.')
}

export function idsDe(ctx: Ctx): string[] | 'all' {
  if (ctx.role === 'admin' || ctx.role === 'auditor_seguridad') return 'all'
  if (ctx.role === 'ejecutivo') {
    return getDb().asignaciones.filter((item) => item.ejecutivoUserId === ctx.userId).map((item) => item.clienteId)
  }
  return ctx.clienteId ? [ctx.clienteId] : []
}

export function puedeCliente(ctx: Ctx, clienteId: string) {
  const ids = idsDe(ctx)
  return ids === 'all' || ids.includes(clienteId)
}

export function assertCliente(ctx: Ctx, clienteId: string, accion: string) {
  if (puedeCliente(ctx, clienteId)) return
  securityEvent({
    tipo: 'acceso_no_autorizado',
    severidad: 'alta',
    descripcion: `Intento de ${accion} sobre un cliente fuera de su alcance.`,
    userId: ctx.userId,
    ip: ctx.ip,
    pais: ctx.pais,
    dispositivo: ctx.device,
  })
  audit({
    userId: ctx.userId,
    accion,
    entidad: 'clientes',
    entidadId: clienteId,
    ip: ctx.ip,
    dispositivo: ctx.device,
    resultado: 'fallo',
    detalle: 'Acceso a un registro ajeno',
  })
  persist()
  throw new AppError('No tiene permiso para ver este registro.')
}

export function puedeRevelar(ctx: Ctx) {
  return ctx.role === 'admin' || ctx.role === 'ejecutivo'
}

export function assignIp(pais: string) {
  const block = Math.floor(Math.random() * 80) + 20
  const host = Math.floor(Math.random() * 180) + 20
  return pais === 'GT' ? `190.56.${block}.${host}` : `104.28.${block}.${host}`
}

export function failsRecientes(email: string) {
  const since = Date.now() - FAIL_WINDOW_MS
  return getDb().loginAttempts.filter((attempt) => attempt.email === email && !attempt.exito && new Date(attempt.fecha).getTime() >= since)
}

export function nextCodigo(prefix: string, codes: string[], width = 4) {
  const max = codes.reduce((current, code) => {
    const value = Number(code.replace(/\D/g, ''))
    return Number.isFinite(value) ? Math.max(current, value) : current
  }, 0)
  return `${prefix}-${String(max + 1).padStart(width, '0')}`
}
