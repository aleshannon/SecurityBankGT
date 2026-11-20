import { AppError } from '@/domain/errors'
import { dayKey, formatDate, formatDateTime, formatMoney, maskDpi, round2 } from '@/domain/format'
import {
  ACTIVO_TIPO,
  CANAL_LABEL,
  CAPA_LABEL,
  ESTADO_TX,
  HALLAZGO_ESTADO,
  INCIDENTE_ESTADO,
  KYC_LABEL,
  ORIGEN_LABEL,
  OWASP_LABEL,
  RIESGO_NIVEL,
  SEVERIDAD,
  TIPO_TX,
  TRATAMIENTO_LABEL,
  UBICACION,
} from '@/domain/labels'
import type { ExportFormat, ReportDocument, ReportFilters, ReportId, ReportMeta, Role } from '@/domain/types'
import { presentarCliente } from './present'
import { allow, assertCliente, audit, getDb, idsDe, persist, puedeCliente, puedeRevelar, requireSession, type Ctx } from './store'

const ACCESO: Record<ReportId, Role[]> = {
  ejecutivo_negocio: ['admin', 'ejecutivo'],
  estado_cuenta: ['admin', 'ejecutivo', 'cliente'],
  transacciones_periodo: ['admin', 'ejecutivo', 'cliente', 'auditor_seguridad'],
  transacciones_marcadas: ['admin', 'auditor_seguridad'],
  auditoria: ['admin', 'auditor_seguridad'],
  eventos_incidentes: ['admin', 'auditor_seguridad'],
  activos_iso: ['admin', 'auditor_seguridad'],
  riesgos: ['admin', 'auditor_seguridad'],
  hallazgos: ['admin', 'auditor_seguridad'],
  kyc: ['admin', 'ejecutivo', 'auditor_seguridad'],
}

const METAS: ReportMeta[] = [
  { id: 'ejecutivo_negocio', titulo: 'Reporte ejecutivo de negocio', descripcion: 'Clientes, cuentas, saldos y volumen transaccional.' },
  { id: 'estado_cuenta', titulo: 'Estado de cuenta', descripcion: 'Saldos y movimientos de un cliente.' },
  { id: 'transacciones_periodo', titulo: 'Transacciones por período', descripcion: 'Movimientos filtrados por fecha, tipo y estado.' },
  { id: 'transacciones_marcadas', titulo: 'Transacciones marcadas', descripcion: 'Operaciones apartadas para revisión.' },
  { id: 'auditoria', titulo: 'Bitácora de auditoría', descripcion: 'Acciones registradas sobre las entidades críticas.' },
  { id: 'eventos_incidentes', titulo: 'Eventos e incidentes', descripcion: 'Señales de seguridad y su seguimiento.' },
  { id: 'activos_iso', titulo: 'Inventario de activos', descripcion: 'Activos con valoración de confidencialidad, integridad y disponibilidad.' },
  { id: 'riesgos', titulo: 'Registro de riesgos', descripcion: 'Riesgo inherente, controles, residual y tratamiento.' },
  { id: 'hallazgos', titulo: 'Hallazgos de vulnerabilidades', descripcion: 'Hallazgos, severidad y estado de mitigación.' },
  { id: 'kyc', titulo: 'Cumplimiento KYC', descripcion: 'Estado de verificación de los clientes.' },
]

function dentro(fecha: string, filters: ReportFilters) {
  const key = dayKey(fecha)
  if (filters.desde && key < filters.desde) return false
  if (filters.hasta && key > filters.hasta) return false
  return true
}

function clientesDe(ctx: Ctx, filters: ReportFilters) {
  const ids = idsDe(ctx)
  return getDb().clientes.filter((cliente) => {
    if (ctx.role === 'cliente') return cliente.id === ctx.clienteId
    if (ids !== 'all' && !ids.includes(cliente.id)) return false
    if (filters.clienteId && cliente.id !== filters.clienteId) return false
    return true
  })
}

function documento(ctx: Ctx, id: ReportId, titulo: string, subtitulo: string, body: Omit<ReportDocument, 'id' | 'titulo' | 'subtitulo' | 'generadoPor' | 'fechaGeneracion'>): ReportDocument {
  return {
    id,
    titulo,
    subtitulo,
    generadoPor: `${ctx.nombre} · ${ctx.email}`,
    fechaGeneracion: formatDateTime(new Date().toISOString()),
    ...body,
  }
}

export function listadoReportes(): ReportMeta[] {
  const ctx = requireSession(true)
  return METAS.filter((item) => ACCESO[item.id].includes(ctx.role))
}

export function generarReporte(id: ReportId, filters: ReportFilters): ReportDocument {
  const ctx = requireSession(true)
  allow(ctx, ACCESO[id], `reporte ${id}`)
  if (filters.clienteId) assertCliente(ctx, filters.clienteId, 'reporte')
  const db = getDb()
  const clientes = clientesDe(ctx, filters)
  const clienteIds = new Set(clientes.map((cliente) => cliente.id))
  const cuentas = db.cuentas.filter((cuenta) => clienteIds.has(cuenta.clienteId))
  const cuentaIds = new Set(cuentas.map((cuenta) => cuenta.id))
  const txs = db.transacciones.filter((tx) => {
    const origen = tx.cuentaOrigenId ? db.cuentas.find((cuenta) => cuenta.id === tx.cuentaOrigenId) : undefined
    const destino = tx.cuentaDestinoId ? db.cuentas.find((cuenta) => cuenta.id === tx.cuentaDestinoId) : undefined
    const visible = (origen && clienteIds.has(origen.clienteId)) || (destino && clienteIds.has(destino.clienteId)) || cuentaIds.has(tx.cuentaOrigenId ?? '') || cuentaIds.has(tx.cuentaDestinoId ?? '')
    if (!visible && ctx.role !== 'admin' && ctx.role !== 'auditor_seguridad') return false
    if ((ctx.role === 'admin' || ctx.role === 'auditor_seguridad') && filters.clienteId && !visible) return false
    if ((ctx.role === 'ejecutivo' || ctx.role === 'cliente') && !visible) return false
    if (!dentro(tx.fecha, filters)) return false
    if (filters.tipo && tx.tipo !== filters.tipo) return false
    if (filters.estado && tx.estado !== filters.estado) return false
    return true
  })

  if (id === 'ejecutivo_negocio') {
    const volumen = round2(txs.filter((tx) => tx.estado === 'completada' || tx.estado === 'marcada').reduce((sum, tx) => sum + tx.monto, 0))
    const saldo = round2(cuentas.reduce((sum, cuenta) => sum + cuenta.saldo, 0))
    return documento(ctx, id, 'Reporte ejecutivo de negocio', 'Cartera, saldos y volumen del período seleccionado.', {
      kpis: [
        { label: 'Clientes', value: String(clientes.length), tone: 'ok' },
        { label: 'Cuentas', value: String(cuentas.length) },
        { label: 'Saldo total', value: formatMoney(saldo), tone: 'ok' },
        { label: 'Volumen del período', value: formatMoney(volumen) },
      ],
      columnas: ['Código', 'Cliente', 'Cuentas', 'Saldo', 'KYC', 'Estado', 'Riesgo'],
      filas: clientes.map((cliente) => {
        const propias = cuentas.filter((cuenta) => cuenta.clienteId === cliente.id)
        return [cliente.codigo, `${cliente.nombres} ${cliente.apellidos}`, String(propias.length), formatMoney(propias.reduce((sum, cuenta) => sum + cuenta.saldo, 0)), KYC_LABEL[cliente.estadoKyc], cliente.estado, cliente.nivelRiesgo]
      }),
      detalleTitulo: 'Cuentas',
      detalleColumnas: ['Número', 'Cliente', 'Tipo', 'Saldo', 'Límite diario', 'Estado'],
      detalleFilas: cuentas.map((cuenta) => {
        const cliente = clientes.find((item) => item.id === cuenta.clienteId)
        return [cuenta.numero, cliente?.codigo ?? '', cuenta.tipo, formatMoney(cuenta.saldo), formatMoney(cuenta.limiteDiario), cuenta.estado]
      }),
      notas: ['Cifras en quetzales (GTQ).', 'Los saldos corresponden al momento de generar el reporte.'],
    })
  }

  if (id === 'estado_cuenta') {
    const cliente = filters.clienteId ? clientes[0] : ctx.role === 'cliente' ? clientes[0] : null
    if (!cliente && ctx.role !== 'cliente') {
      if (!filters.clienteId) throw new AppError('Seleccione un cliente para el estado de cuenta.')
    }
    const elegido = filters.clienteId ? db.clientes.find((item) => item.id === filters.clienteId) : clientes[0]
    if (!elegido || !puedeCliente(ctx, elegido.id)) throw new AppError('Seleccione un cliente para el estado de cuenta.')
    const present = presentarCliente(ctx, elegido)
    const propias = db.cuentas.filter((cuenta) => cuenta.clienteId === elegido.id)
    const movimientos = db.transacciones.filter((tx) => propias.some((cuenta) => cuenta.id === tx.cuentaOrigenId || cuenta.id === tx.cuentaDestinoId) && dentro(tx.fecha, filters))
    return documento(ctx, id, 'Estado de cuenta', `${present.nombres} ${present.apellidos} · ${present.codigo}`, {
      kpis: [
        { label: 'Saldo', value: formatMoney(propias.reduce((sum, cuenta) => sum + cuenta.saldo, 0)), tone: 'ok' },
        { label: 'Cuentas', value: String(propias.length) },
        { label: 'Movimientos', value: String(movimientos.length) },
        { label: 'KYC', value: KYC_LABEL[elegido.estadoKyc], tone: elegido.estadoKyc === 'verificado' ? 'ok' : 'warn' },
      ],
      columnas: ['Fecha', 'Referencia', 'Tipo', 'Monto', 'Origen', 'Destino', 'Estado', 'Canal'],
      filas: movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha)).map((tx) => [
        formatDateTime(tx.fecha), tx.referencia, TIPO_TX[tx.tipo], formatMoney(tx.monto),
        propias.find((cuenta) => cuenta.id === tx.cuentaOrigenId)?.numero ?? '—',
        propias.find((cuenta) => cuenta.id === tx.cuentaDestinoId)?.numero ?? '—',
        ESTADO_TX[tx.estado], CANAL_LABEL[tx.canal],
      ]),
      detalleTitulo: 'Cuentas del cliente',
      detalleColumnas: ['Número', 'Tipo', 'Saldo', 'Estado', 'Apertura'],
      detalleFilas: propias.map((cuenta) => [cuenta.numero, cuenta.tipo, formatMoney(cuenta.saldo), cuenta.estado, formatDate(cuenta.fechaApertura)]),
      notas: [`DPI ${present.dpi}.`, 'Este estado no modifica los movimientos originales.'],
    })
  }

  if (id === 'transacciones_periodo' || id === 'transacciones_marcadas') {
    const fuente = id === 'transacciones_marcadas' ? txs.filter((tx) => tx.estado === 'marcada') : txs
    const volumen = round2(fuente.filter((tx) => tx.estado !== 'rechazada').reduce((sum, tx) => sum + tx.monto, 0))
    return documento(ctx, id, id === 'transacciones_marcadas' ? 'Transacciones marcadas' : 'Transacciones por período', 'Detalle de movimientos según los filtros aplicados.', {
      kpis: [
        { label: 'Operaciones', value: String(fuente.length) },
        { label: 'Monto', value: formatMoney(volumen) },
        { label: 'Marcadas', value: String(fuente.filter((tx) => tx.estado === 'marcada').length), tone: 'warn' },
        { label: 'Rechazadas', value: String(fuente.filter((tx) => tx.estado === 'rechazada').length), tone: 'danger' },
      ],
      columnas: ['Fecha', 'Referencia', 'Tipo', 'Monto', 'Estado', 'Canal', 'IP', 'Dispositivo'],
      filas: fuente.sort((a, b) => b.fecha.localeCompare(a.fecha)).map((tx) => [formatDateTime(tx.fecha), tx.referencia, TIPO_TX[tx.tipo], formatMoney(tx.monto), ESTADO_TX[tx.estado], CANAL_LABEL[tx.canal], tx.ip, tx.dispositivo]),
      detalleTitulo: 'Motivos de rechazo o marca',
      detalleColumnas: ['Referencia', 'Estado', 'Motivo'],
      detalleFilas: fuente.filter((tx) => tx.motivo).map((tx) => [tx.referencia, ESTADO_TX[tx.estado], tx.motivo ?? '']),
      notas: ['Las transacciones no se editan. Una corrección se registra como reversión.'],
    })
  }

  if (id === 'auditoria') {
    const logs = db.auditLogs.filter((log) => dentro(log.fecha, filters))
    return documento(ctx, id, 'Bitácora de auditoría', 'Registro inmutable de acciones.', {
      kpis: [
        { label: 'Eventos de bitácora', value: String(logs.length) },
        { label: 'Fallos', value: String(logs.filter((log) => log.resultado === 'fallo').length), tone: 'danger' },
        { label: 'Éxitos', value: String(logs.filter((log) => log.resultado === 'exito').length), tone: 'ok' },
      ],
      columnas: ['Fecha', 'Acción', 'Entidad', 'Resultado', 'IP', 'Dispositivo', 'Detalle'],
      filas: logs.map((log) => [formatDateTime(log.fecha), log.accion, log.entidad, log.resultado, log.ip, log.dispositivo, log.detalle ?? '']),
      detalleTitulo: 'Resumen por acción',
      detalleColumnas: ['Acción', 'Cantidad'],
      detalleFilas: Object.entries(logs.reduce<Record<string, number>>((acc, log) => ({ ...acc, [log.accion]: (acc[log.accion] ?? 0) + 1 }), {})).map(([accion, total]) => [accion, String(total)]),
      notas: ['Esta bitácora no admite modificaciones ni borrados.'],
    })
  }

  if (id === 'eventos_incidentes') {
    const events = db.securityEvents.filter((event) => dentro(event.fecha, filters))
    return documento(ctx, id, 'Eventos e incidentes de seguridad', 'Monitoreo y seguimiento.', {
      kpis: [
        { label: 'Eventos', value: String(events.length) },
        { label: 'Críticos', value: String(events.filter((event) => event.severidad === 'critica').length), tone: 'danger' },
        { label: 'Incidentes abiertos', value: String(db.incidentes.filter((item) => item.estado === 'abierto' || item.estado === 'investigando').length), tone: 'warn' },
      ],
      columnas: ['Fecha', 'Tipo', 'Severidad', 'País', 'Descripción'],
      filas: events.map((event) => [formatDateTime(event.fecha), event.tipo, SEVERIDAD[event.severidad], event.pais, event.descripcion]),
      detalleTitulo: 'Incidentes',
      detalleColumnas: ['Código', 'Título', 'Severidad', 'Estado', 'Fecha'],
      detalleFilas: db.incidentes.map((item) => [item.codigo, item.titulo, SEVERIDAD[item.severidad], INCIDENTE_ESTADO[item.estado], formatDateTime(item.fecha)]),
      notas: ['Las reglas cubren fallos de acceso, ráfagas, montos sobre el umbral y país distinto al habitual.'],
    })
  }

  if (id === 'activos_iso') {
    return documento(ctx, id, 'Inventario de activos ISO 27001', 'Valoración CIA y criticidad calculada.', {
      kpis: [
        { label: 'Activos', value: String(db.activos.length) },
        { label: 'Criticidad alta', value: String(db.activos.filter((item) => item.criticidad === 'Alta').length), tone: 'danger' },
        { label: 'Criticidad media', value: String(db.activos.filter((item) => item.criticidad === 'Media').length), tone: 'warn' },
      ],
      columnas: ['ID', 'Nombre', 'Proceso', 'Tipo', 'Ubicación', 'C', 'I', 'A', 'Criticidad', 'Propietario', 'Custodio'],
      filas: db.activos.map((item) => [item.codigo, item.nombre, item.proceso, ACTIVO_TIPO[item.tipo], UBICACION[item.ubicacion], item.confidencialidad, item.integridad, item.disponibilidad, item.criticidad, item.propietario, item.custodio]),
      detalleTitulo: 'Distribución por tipo',
      detalleColumnas: ['Tipo', 'Cantidad'],
      detalleFilas: Object.entries(db.activos.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.tipo]: (acc[item.tipo] ?? 0) + 1 }), {})).map(([tipo, total]) => [ACTIVO_TIPO[tipo] ?? tipo, String(total)]),
      notas: ['La criticidad toma el nivel más alto entre confidencialidad, integridad y disponibilidad.'],
    })
  }

  if (id === 'riesgos') {
    return documento(ctx, id, 'Registro de riesgos y tratamiento', 'Comparación antes y después de controles.', {
      kpis: [
        { label: 'Riesgos', value: String(db.riesgos.length) },
        { label: 'Inherente ≥ 15', value: String(db.riesgos.filter((item) => item.riesgoInherente >= 15).length), tone: 'danger' },
        { label: 'Residual ≥ 15', value: String(db.riesgos.filter((item) => item.riesgoResidual >= 15).length), tone: 'warn' },
      ],
      columnas: ['ID', 'Título', 'P', 'I', 'Inherente', 'Controles', 'P residual', 'I residual', 'Residual', 'Tratamiento', 'Tipo', 'Impacto'],
      filas: db.riesgos.map((item) => [item.codigo, item.titulo, String(item.probabilidad), String(item.impacto), String(item.riesgoInherente), item.controles, String(item.probabilidadResidual), String(item.impactoResidual), String(item.riesgoResidual), TRATAMIENTO_LABEL[item.tratamiento], item.tipo, item.tipoImpacto]),
      detalleTitulo: 'Amenazas STRIDE / DREAD',
      detalleColumnas: ['ID', 'Amenaza', 'STRIDE', 'Promedio', 'Nivel'],
      detalleFilas: db.amenazas.map((item) => [item.codigo, item.nombre, item.categoria, String(item.promedio), RIESGO_NIVEL[item.nivel]]),
      notas: ['El riesgo inherente es probabilidad por impacto. El residual usa los valores después de controles.'],
    })
  }

  if (id === 'hallazgos') {
    const abiertos = db.hallazgos.filter((item) => item.estado === 'abierto' || item.estado === 'en_progreso')
    return documento(ctx, id, 'Hallazgos de vulnerabilidades', 'OWASP API Security Top 10 2023 y casos de abuso.', {
      kpis: [
        { label: 'Hallazgos', value: String(db.hallazgos.length) },
        { label: 'Abiertos', value: String(abiertos.length), tone: 'warn' },
        { label: 'Críticos abiertos', value: String(abiertos.filter((item) => item.severidad === 'critica').length), tone: 'danger' },
      ],
      columnas: ['ID', 'Título', 'Origen', 'OWASP', 'Severidad', 'CVSS', 'Capa', 'Estado', 'Fecha límite', 'Responsable'],
      filas: db.hallazgos.map((item) => [item.codigo, item.titulo, ORIGEN_LABEL[item.origen], OWASP_LABEL[item.owasp], SEVERIDAD[item.severidad], item.cvss.toFixed(1), CAPA_LABEL[item.capa], HALLAZGO_ESTADO[item.estado], formatDate(item.fechaLimite), item.responsable]),
      detalleTitulo: 'Casos de abuso y control compensatorio',
      detalleColumnas: ['ID', 'Caso', 'Control'],
      detalleFilas: db.casos.map((item) => [item.codigo, item.titulo, item.control]),
      notas: ['La evidencia describe el hallazgo sin incluir un procedimiento de ataque.'],
    })
  }

  const reveal = puedeRevelar(ctx)
  return documento(ctx, id, 'Cumplimiento KYC', 'Estado de verificación de la cartera visible para su rol.', {
    kpis: [
      { label: 'Verificados', value: String(clientes.filter((item) => item.estadoKyc === 'verificado').length), tone: 'ok' },
      { label: 'Pendientes', value: String(clientes.filter((item) => item.estadoKyc === 'pendiente').length), tone: 'warn' },
      { label: 'Rechazados', value: String(clientes.filter((item) => item.estadoKyc === 'rechazado').length), tone: 'danger' },
    ],
    columnas: ['Código', 'Cliente', 'DPI', 'Correo', 'KYC', 'Riesgo', 'Estado', 'Alta'],
    filas: clientes.map((cliente) => [cliente.codigo, `${cliente.nombres} ${cliente.apellidos}`, reveal ? cliente.dpi : maskDpi(cliente.dpi), cliente.correo, KYC_LABEL[cliente.estadoKyc], cliente.nivelRiesgo, cliente.estado, formatDate(cliente.fechaAlta)]),
    detalleTitulo: 'Pendientes de verificación',
    detalleColumnas: ['Código', 'Cliente', 'Fecha de alta'],
    detalleFilas: clientes.filter((cliente) => cliente.estadoKyc === 'pendiente').map((cliente) => [cliente.codigo, `${cliente.nombres} ${cliente.apellidos}`, formatDate(cliente.fechaAlta)]),
    notas: ['El DPI se muestra completo solo a administración y ejecutivos de servicio.'],
  })
}

export function registrarExportacion(id: ReportId, formato: ExportFormat) {
  const ctx = requireSession(true)
  allow(ctx, ACCESO[id], `exportación ${formato}`)
  audit({
    userId: ctx.userId,
    accion: 'EXPORTAR_REPORTE',
    entidad: 'reportes',
    entidadId: id,
    ip: ctx.ip,
    dispositivo: ctx.device,
    resultado: 'exito',
    detalle: formato,
  })
  persist()
  return { ok: true }
}
