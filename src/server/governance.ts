import { PAGE_SIZE } from '@/domain/constants'
import { AppError } from '@/domain/errors'
import { dayKey, paginate } from '@/domain/format'
import { criticidadDe, nivelDread, promedioDread } from '@/domain/posture'
import {
  activoSchema,
  amenazaSchema,
  casoSchema,
  hallazgoSchema,
  incidenteSchema,
  notaSchema,
  parseInput,
  riesgoSchema,
} from '@/domain/schemas'
import type { EstadoIncidente } from '@/domain/types'
import { randomId } from './hash'
import { allow, assertCliente, audit, getDb, notifyRoles, persist, puedeCliente, requireSession } from './store'

function pageOf<T>(items: T[], page = 1) {
  return paginate(items, page, PAGE_SIZE)
}

export function listAuditoria(filters: { q?: string; desde?: string; hasta?: string; page?: number }) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad'], 'consulta de auditoría')
  const q = (filters.q ?? '').trim().toLowerCase()
  const items = getDb().auditLogs
    .filter((log) => !q || `${log.accion} ${log.entidad} ${log.detalle ?? ''}`.toLowerCase().includes(q))
    .filter((log) => !filters.desde || dayKey(log.fecha) >= filters.desde)
    .filter((log) => !filters.hasta || dayKey(log.fecha) <= filters.hasta)
    .map((log) => structuredClone(log))
  return pageOf(items, filters.page ?? 1)
}

export function listEventos(filters: { severidad?: string; tipo?: string; page?: number }) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad'], 'consulta de eventos')
  const items = getDb().securityEvents
    .filter((event) => !filters.severidad || event.severidad === filters.severidad)
    .filter((event) => !filters.tipo || event.tipo === filters.tipo)
    .map((event) => structuredClone(event))
  return pageOf(items, filters.page ?? 1)
}

export function listIncidentes() {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad'], 'consulta de incidentes')
  const users = getDb().users
  return getDb().incidentes.map((incidente) => ({
    ...structuredClone(incidente),
    asignadoNombre: users.find((user) => user.id === incidente.asignadoA)?.nombre ?? 'Sin asignar',
    notas: getDb().notas.filter((nota) => nota.incidenteId === incidente.id).map((nota) => ({
      ...structuredClone(nota),
      autor: users.find((user) => user.id === nota.userId)?.nombre ?? 'Usuario',
    })),
  }))
}

export function saveIncidente(input: unknown) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad'], 'gestión de incidentes')
  const parsed = parseInput(incidenteSchema, input)
  const body = input as { id?: string }
  if (body.id) {
    const current = getDb().incidentes.find((item) => item.id === body.id)
    if (!current) throw new AppError('No se encontró el incidente.')
    Object.assign(current, parsed)
    audit({ userId: ctx.userId, accion: 'EDITAR_INCIDENTE', entidad: 'incidentes', entidadId: current.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
    persist()
    return structuredClone(current)
  }
  const created = {
    ...parsed,
    id: randomId('inc'),
    codigo: `INC-${String(getDb().incidentes.length + 1).padStart(2, '0')}`,
    fecha: new Date().toISOString(),
  }
  getDb().incidentes.unshift(created)
  if (created.severidad === 'critica' || created.severidad === 'alta') {
    notifyRoles(['admin', 'auditor_seguridad'], 'incidente', 'Incidente de seguridad', created.titulo, created.severidad)
  }
  audit({ userId: ctx.userId, accion: 'CREAR_INCIDENTE', entidad: 'incidentes', entidadId: created.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return created
}

export function setIncidenteEstado(id: string, estado: EstadoIncidente, asignadoA: string | null) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad'], 'estado de incidente')
  const incidente = getDb().incidentes.find((item) => item.id === id)
  if (!incidente) throw new AppError('No se encontró el incidente.')
  incidente.estado = estado
  incidente.asignadoA = asignadoA
  audit({ userId: ctx.userId, accion: 'ESTADO_INCIDENTE', entidad: 'incidentes', entidadId: id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito', detalle: estado })
  persist()
  return structuredClone(incidente)
}

export function addNota(id: string, texto: string) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad'], 'nota de incidente')
  const parsed = parseInput(notaSchema, { texto })
  if (!getDb().incidentes.some((item) => item.id === id)) throw new AppError('No se encontró el incidente.')
  const nota = { id: randomId('nota'), incidenteId: id, userId: ctx.userId, texto: parsed.texto, fecha: new Date().toISOString() }
  getDb().notas.push(nota)
  audit({ userId: ctx.userId, accion: 'NOTA_INCIDENTE', entidad: 'incidentes', entidadId: id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return nota
}

export function listDispositivos() {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad', 'ejecutivo', 'cliente'], 'consulta de dispositivos')
  return getDb().dispositivos.filter((item) => {
    if (ctx.role === 'admin' || ctx.role === 'auditor_seguridad') return true
    if (ctx.role === 'cliente') return item.userId === ctx.userId
    return item.clienteId ? puedeCliente(ctx, item.clienteId) : false
  }).map((item) => {
    const user = getDb().users.find((person) => person.id === item.userId)
    return { ...structuredClone(item), usuario: user?.nombre ?? '—' }
  })
}

export function setConfianza(id: string, confianza: boolean) {
  const ctx = requireSession(true)
  const device = getDb().dispositivos.find((item) => item.id === id)
  if (!device) throw new AppError('No se encontró el dispositivo.')
  if (ctx.role === 'cliente' && device.userId !== ctx.userId) {
    assertCliente(ctx, device.clienteId ?? '', 'dispositivo')
  }
  if (ctx.role === 'ejecutivo') {
    if (!device.clienteId) throw new AppError('No tiene permiso para esta operación.')
    assertCliente(ctx, device.clienteId, 'dispositivo')
  }
  if (ctx.role === 'auditor_seguridad') throw new AppError('No tiene permiso para esta operación.')
  device.confianza = confianza
  audit({ userId: ctx.userId, accion: 'CONFIANZA_DISPOSITIVO', entidad: 'dispositivos', entidadId: id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito', detalle: String(confianza) })
  persist()
  return structuredClone(device)
}

export function listActivos() {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad'], 'consulta de activos')
  return getDb().activos.map((item) => structuredClone(item))
}

export function saveActivo(input: unknown) {
  const ctx = requireSession(true)
  allow(ctx, ['admin'], 'mantenimiento de activos')
  const parsed = parseInput(activoSchema, input)
  const criticidad = criticidadDe(parsed.confidencialidad, parsed.integridad, parsed.disponibilidad)
  const body = input as { id?: string }
  if (body.id) {
    const current = getDb().activos.find((item) => item.id === body.id)
    if (!current) throw new AppError('No se encontró el activo.')
    Object.assign(current, parsed, { criticidad })
    audit({ userId: ctx.userId, accion: 'EDITAR_ACTIVO', entidad: 'activos', entidadId: current.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
    persist()
    return structuredClone(current)
  }
  const created = { ...parsed, criticidad, id: randomId('ast'), codigo: `AST-${String(getDb().activos.length + 1).padStart(2, '0')}` }
  getDb().activos.push(created)
  audit({ userId: ctx.userId, accion: 'CREAR_ACTIVO', entidad: 'activos', entidadId: created.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return created
}

export function listAmenazas() {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad'], 'consulta de amenazas')
  return getDb().amenazas.map((item) => structuredClone(item))
}

export function saveAmenaza(input: unknown) {
  const ctx = requireSession(true)
  allow(ctx, ['admin'], 'mantenimiento de amenazas')
  const parsed = parseInput(amenazaSchema, input)
  const promedio = promedioDread([parsed.damage, parsed.reproducibility, parsed.exploitability, parsed.affectedUsers, parsed.discoverability])
  const nivel = nivelDread(promedio)
  const body = input as { id?: string }
  if (body.id) {
    const current = getDb().amenazas.find((item) => item.id === body.id)
    if (!current) throw new AppError('No se encontró la amenaza.')
    Object.assign(current, parsed, { promedio, nivel })
    persist()
    return structuredClone(current)
  }
  const created = { ...parsed, promedio, nivel, id: randomId('amn'), codigo: `AMN-${String(getDb().amenazas.length + 1).padStart(2, '0')}` }
  getDb().amenazas.push(created)
  audit({ userId: ctx.userId, accion: 'CREAR_AMENAZA', entidad: 'amenazas', entidadId: created.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return created
}

export function listRiesgos() {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad'], 'consulta de riesgos')
  return getDb().riesgos.map((item) => structuredClone(item))
}

export function saveRiesgo(input: unknown) {
  const ctx = requireSession(true)
  allow(ctx, ['admin'], 'mantenimiento de riesgos')
  const parsed = parseInput(riesgoSchema, input)
  const extra = { riesgoInherente: parsed.probabilidad * parsed.impacto, riesgoResidual: parsed.probabilidadResidual * parsed.impactoResidual }
  const body = input as { id?: string }
  if (body.id) {
    const current = getDb().riesgos.find((item) => item.id === body.id)
    if (!current) throw new AppError('No se encontró el riesgo.')
    Object.assign(current, parsed, extra)
    audit({ userId: ctx.userId, accion: 'EDITAR_RIESGO', entidad: 'riesgos', entidadId: current.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
    persist()
    return structuredClone(current)
  }
  const created = { ...parsed, ...extra, id: randomId('rsk'), codigo: `RSK-${String(getDb().riesgos.length + 1).padStart(2, '0')}` }
  getDb().riesgos.push(created)
  audit({ userId: ctx.userId, accion: 'CREAR_RIESGO', entidad: 'riesgos', entidadId: created.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return created
}

export function listHallazgos() {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad'], 'consulta de hallazgos')
  return getDb().hallazgos.map((item) => {
    const activo = getDb().activos.find((asset) => asset.id === item.activoId)
    return { ...structuredClone(item), activoNombre: activo?.nombre ?? '—' }
  })
}

export function saveHallazgo(input: unknown) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad'], 'gestión de hallazgos')
  const parsed = parseInput(hallazgoSchema, input)
  const body = input as { id?: string }
  if (ctx.role === 'auditor_seguridad') {
    if (!body.id) throw new AppError('No tiene permiso para esta operación.')
    const current = getDb().hallazgos.find((item) => item.id === body.id)
    if (!current) throw new AppError('No se encontró el hallazgo.')
    current.estado = parsed.estado
    audit({ userId: ctx.userId, accion: 'ESTADO_HALLAZGO', entidad: 'hallazgos', entidadId: current.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito', detalle: parsed.estado })
    persist()
    return structuredClone(current)
  }
  if (body.id) {
    const current = getDb().hallazgos.find((item) => item.id === body.id)
    if (!current) throw new AppError('No se encontró el hallazgo.')
    Object.assign(current, parsed)
    audit({ userId: ctx.userId, accion: 'EDITAR_HALLAZGO', entidad: 'hallazgos', entidadId: current.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
    persist()
    return structuredClone(current)
  }
  const created = { ...parsed, id: randomId('hal'), codigo: `HAL-${String(getDb().hallazgos.length + 1).padStart(2, '0')}` }
  getDb().hallazgos.unshift(created)
  audit({ userId: ctx.userId, accion: 'CREAR_HALLAZGO', entidad: 'hallazgos', entidadId: created.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return created
}

export function listCasos() {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'auditor_seguridad'], 'consulta de casos de abuso')
  return getDb().casos.map((item) => structuredClone(item))
}

export function saveCaso(input: unknown) {
  const ctx = requireSession(true)
  allow(ctx, ['admin'], 'registro de caso de abuso')
  const parsed = parseInput(casoSchema, input)
  const created = { ...parsed, id: randomId('cab'), codigo: `CAB-${String(getDb().casos.length + 1).padStart(2, '0')}` }
  getDb().casos.push(created)
  audit({ userId: ctx.userId, accion: 'CREAR_CASO', entidad: 'casos_abuso', entidadId: created.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return created
}

export function listNotificaciones() {
  const ctx = requireSession(true)
  return getDb().notificaciones.filter((item) => item.userId === ctx.userId).map((item) => structuredClone(item))
}

export function marcarNotificacion(id: string) {
  const ctx = requireSession(true)
  const item = getDb().notificaciones.find((notice) => notice.id === id && notice.userId === ctx.userId)
  if (!item) throw new AppError('No se encontró la notificación.')
  item.leida = true
  persist()
  return structuredClone(item)
}

export function marcarTodas() {
  const ctx = requireSession(true)
  getDb().notificaciones.forEach((item) => {
    if (item.userId === ctx.userId) item.leida = true
  })
  persist()
  return { ok: true }
}
