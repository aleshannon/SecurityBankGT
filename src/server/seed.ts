import { isoDate, round2 } from '@/domain/format'
import type {
  AuditLog,
  Beneficiario,
  Canal,
  Cliente,
  Cuenta,
  Database,
  Dispositivo,
  EstadoTx,
  Notificacion,
  SecurityEvent,
  Tarjeta,
  Transaccion,
} from '@/domain/types'
import { ACTIVOS, AMENAZAS, CASOS, HALLAZGOS, INCIDENTES, NOTAS, RIESGOS } from './catalog'
import { directory } from './directory'

const PERSONAS: [string, string][] = [
  ['María José', 'García Morales'],
  ['Juan Carlos', 'López Hernández'],
  ['Ana Lucía', 'Pérez Ramírez'],
  ['Carlos Eduardo', 'González Cruz'],
  ['Sofía Alejandra', 'Rodríguez Flores'],
  ['Diego Andrés', 'Hernández Reyes'],
  ['Andrea Paola', 'Morales Gómez'],
  ['Luis Fernando', 'Ramírez Díaz'],
  ['Gabriela Isabel', 'Cruz Vásquez'],
  ['Pedro Antonio', 'Flores Castillo'],
  ['Valeria Nicole', 'Reyes Ortiz'],
  ['Jorge Alberto', 'Gómez Méndez'],
  ['Camila Fernanda', 'Díaz Ramos'],
  ['Ricardo Estuardo', 'Vásquez Chávez'],
  ['Daniela Beatriz', 'Castillo Ruiz'],
  ['Miguel Ángel', 'Ortiz Herrera'],
  ['Paola Alejandra', 'Méndez Aguilar'],
  ['Roberto Carlos', 'Ramos Salazar'],
  ['Elena Rocío', 'Chávez Pineda'],
  ['Héctor Manuel', 'Ruiz Estrada'],
  ['Isabel Cristina', 'Herrera García'],
  ['Óscar René', 'Aguilar López'],
  ['Lucía Verónica', 'Salazar Pérez'],
  ['Fernando José', 'Pineda González'],
  ['Carmen Alicia', 'Estrada Morales'],
]

const LUGARES = [
  '12 calle 3-45, Zona 1, Ciudad de Guatemala',
  'Avenida Reforma 10-00, Zona 10, Ciudad de Guatemala',
  'Calzada Roosevelt 22-80, Mixco',
  '4a avenida 6-12, Zona 1, Quetzaltenango',
  '5a calle poniente 8, Antigua Guatemala',
  'Boulevard Principal 4-20, Escuintla',
  '1a calle 3-15, Zona 1, Cobán',
  '7a avenida 9-30, Huehuetenango',
  'Diagonal 6 12-55, Zona 10, Ciudad de Guatemala',
  'Calle Real 2-18, Villa Nueva',
  '8a calle 5-40, Zona 1, Chimaltenango',
  'Avenida Las Américas 14-09, Zona 13',
]

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function daysAgo(days: number, hour = 10, minute = 15) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')
}

export function buildSeed(): Database {
  const rand = mulberry32(20261015)
  const { users, roles } = directory()
  const clientes: Cliente[] = PERSONAS.map(([nombres, apellidos], index) => {
    const id = `cli-${String(index + 1).padStart(4, '0')}`
    let estadoKyc: Cliente['estadoKyc'] = 'verificado'
    if (index !== 0 && index % 7 === 0) estadoKyc = 'pendiente'
    if (index !== 0 && index % 11 === 0) estadoKyc = 'rechazado'
    let nivelRiesgo: Cliente['nivelRiesgo'] = 'bajo'
    if (index % 9 === 0 && index !== 0) nivelRiesgo = 'alto'
    else if (index % 4 === 0 && index !== 0) nivelRiesgo = 'medio'
    let estado: Cliente['estado'] = 'activo'
    if (index === 24) estado = 'bloqueado'
    else if (index === 22 || index === 23) estado = 'inactivo'
    const dpi = String(2400000000100 + index * 137)
    return {
      id,
      codigo: `CLI-${String(index + 1).padStart(4, '0')}`,
      userId: index === 0 ? 'user-cliente' : null,
      nombres,
      apellidos,
      dpi,
      nit: `${1000000 + index * 97}-${index % 9}`,
      correo: index === 0 ? 'cliente@securitybankgt.com' : `${slug(nombres.split(' ')[0])}.${slug(apellidos.split(' ')[0])}${index}@correo.gt`,
      telefono: `+502 ${String(5500 + index).padStart(4, '0')} ${String(1000 + index * 17).padStart(4, '0')}`,
      direccion: LUGARES[index % LUGARES.length],
      fechaNacimiento: `${1968 + (index % 30)}-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
      nivelRiesgo,
      estadoKyc,
      estado,
      fechaAlta: isoDate(-40 - index * 12),
    }
  })

  const cuentas: Cuenta[] = []
  const extras = new Map<number, number>([[0, 2]])
  for (let index = 1; index <= 13; index += 1) extras.set(index, (extras.get(index) ?? 0) + 1)
  clientes.forEach((cliente, index) => {
    const total = 1 + (extras.get(index) ?? 0)
    for (let slot = 0; slot < total; slot += 1) {
      const seq = cuentas.length + 1
      const tipo = slot === 0 ? 'monetaria' : slot === 1 ? 'ahorro' : 'inversion'
      const limite = tipo === 'inversion' ? 50000 : tipo === 'monetaria' ? 20000 : 10000
      cuentas.push({
        id: `cta-${String(seq).padStart(4, '0')}`,
        numero: `01-${String((index % 5) + 1).padStart(3, '0')}-${String(100000 + seq).padStart(6, '0')}`,
        clienteId: cliente.id,
        tipo,
        moneda: 'GTQ',
        saldo: 0,
        limiteDiario: index === 0 && slot === 0 ? 80000 : limite,
        estado: cliente.estado === 'bloqueado' ? 'bloqueada' : 'activa',
        fechaApertura: isoDate(-30 - index * 10 - slot),
      })
    }
  })

  const saldo = new Map<string, number>(cuentas.map((cuenta) => [cuenta.id, 0]))
  const transacciones: Transaccion[] = []
  let sequence = 1
  const pushTx = (partial: Omit<Transaccion, 'id' | 'referencia' | 'idempotencyKey' | 'usuarioId' | 'referenciaOrigen' | 'motivo'> & { motivo?: string | null }) => {
    const tx: Transaccion = {
      ...partial,
      id: `tx-${String(sequence).padStart(4, '0')}`,
      referencia: `TX-${String(sequence).padStart(6, '0')}`,
      idempotencyKey: `seed-${sequence}`,
      usuarioId: 'user-admin',
      referenciaOrigen: null,
      motivo: partial.motivo ?? null,
    }
    sequence += 1
    transacciones.push(tx)
    return tx
  }

  for (const cuenta of cuentas) {
    const opening = cuenta.id === 'cta-0001' ? 90000 : round2(8000 + rand() * 42000)
    saldo.set(cuenta.id, opening)
    pushTx({
      tipo: 'deposito',
      monto: opening,
      cuentaOrigenId: null,
      cuentaDestinoId: cuenta.id,
      beneficiarioId: null,
      estado: 'completada',
      canal: 'cajero',
      ip: `190.56.10.${(cuentas.indexOf(cuenta) % 200) + 10}`,
      dispositivo: 'Cajero Agencia Zona 10',
      fecha: daysAgo(80 + Math.floor(rand() * 9), 9, Math.floor(rand() * 50)),
    })
  }

  const canales: Canal[] = ['web', 'web', 'movil', 'movil', 'cajero']
  const devices: Record<Canal, string[]> = {
    web: ['Chrome / Windows', 'Chrome / macOS', 'Edge / Windows'],
    movil: ['App iOS', 'App Android', 'Safari / iPhone'],
    cajero: ['Cajero Agencia Zona 10', 'Cajero Agencia Mixco', 'Cajero Xela Centro'],
  }

  while (transacciones.length < 292) {
    const origen = cuentas[Math.floor(rand() * cuentas.length)]
    const canal = canales[Math.floor(rand() * canales.length)]
    const dispositivo = devices[canal][Math.floor(rand() * devices[canal].length)]
    const fecha = daysAgo(Math.floor(rand() * 78), 8 + Math.floor(rand() * 12), Math.floor(rand() * 59))
    const roll = rand()
    const disponible = saldo.get(origen.id) ?? 0
    if (roll < 0.34) {
      const monto = round2(80 + rand() * 4500)
      saldo.set(origen.id, round2(disponible + monto))
      pushTx({ tipo: 'deposito', monto, cuentaOrigenId: null, cuentaDestinoId: origen.id, beneficiarioId: null, estado: 'completada', canal, ip: `190.56.${Math.floor(rand() * 80) + 20}.${Math.floor(rand() * 180) + 20}`, dispositivo, fecha })
      continue
    }
    if (disponible < 80) continue
    if (roll < 0.52) {
      const monto = round2(Math.min(disponible * 0.18, 60 + rand() * 1800))
      if (monto <= 0 || monto > disponible) continue
      saldo.set(origen.id, round2(disponible - monto))
      pushTx({ tipo: 'retiro', monto, cuentaOrigenId: origen.id, cuentaDestinoId: null, beneficiarioId: null, estado: 'completada', canal, ip: `181.209.${Math.floor(rand() * 40) + 10}.${Math.floor(rand() * 180) + 15}`, dispositivo, fecha })
      continue
    }
    const destino = cuentas[Math.floor(rand() * cuentas.length)]
    if (destino.id === origen.id) continue
    let monto = round2(Math.min(disponible * 0.22, 100 + rand() * 3500))
    if (rand() < 0.07 && disponible > 15000) monto = round2(Math.min(disponible * 0.45, 10000 + rand() * 12000))
    if (monto <= 0 || monto > disponible) continue
    saldo.set(origen.id, round2(disponible - monto))
    saldo.set(destino.id, round2((saldo.get(destino.id) ?? 0) + monto))
    const propia = origen.clienteId === destino.clienteId
    pushTx({
      tipo: propia ? 'transferencia_propia' : 'transferencia_tercero',
      monto,
      cuentaOrigenId: origen.id,
      cuentaDestinoId: destino.id,
      beneficiarioId: null,
      estado: 'completada',
      canal,
      ip: `190.56.${Math.floor(rand() * 90) + 15}.${Math.floor(rand() * 200) + 10}`,
      dispositivo,
      fecha,
    })
  }

  const first = saldo.get('cta-0001') ?? 0
  if (first < 45000) {
    const gap = round2(45000 - first)
    const opening = transacciones.find((tx) => tx.cuentaDestinoId === 'cta-0001' && tx.tipo === 'deposito')
    if (opening) opening.monto = round2(opening.monto + gap)
    saldo.set('cta-0001', round2(first + gap))
  }

  const transferencias = transacciones
    .filter((tx) => tx.tipo === 'transferencia_propia' || tx.tipo === 'transferencia_tercero')
    .sort((a, b) => b.monto - a.monto)
  for (const tx of transferencias.slice(0, 10)) tx.estado = 'marcada'

  for (let index = 0; index < 8; index += 1) {
    const origen = cuentas[index + 1]
    pushTx({
      tipo: 'transferencia_tercero',
      monto: round2(origen.limiteDiario + 500 + index * 100),
      cuentaOrigenId: origen.id,
      cuentaDestinoId: cuentas[0].id,
      beneficiarioId: null,
      estado: 'rechazada' as EstadoTx,
      canal: 'web',
      ip: `190.56.40.${20 + index}`,
      dispositivo: 'Chrome / Windows',
      fecha: daysAgo(3 + index, 16, 10 + index),
      motivo: 'Supera el límite diario de transferencia.',
    })
  }

  const burst = transacciones.filter((tx) => tx.cuentaOrigenId === 'cta-0001' && tx.tipo.startsWith('transferencia')).slice(0, 3)
  burst.forEach((tx, index) => {
    const date = new Date(Date.now() - 86400000)
    date.setMinutes(date.getMinutes() - index * 0.4)
    tx.fecha = date.toISOString()
  })

  cuentas.forEach((cuenta) => {
    cuenta.saldo = round2(saldo.get(cuenta.id) ?? 0)
  })

  const beneficiarios: Beneficiario[] = []
  const bancos = ['SecurityBankGT', 'Banco Industrial', 'Banrural', 'G&T Continental', 'BAC Credomatic', 'Promerica']
  for (let index = 0; index < 15; index += 1) {
    const cliente = clientes[index % 10]
    const interna = index < 4 ? cuentas.find((cuenta) => cuenta.clienteId === clientes[(index % 8) + 1]?.id) : undefined
    beneficiarios.push({
      id: `ben-${String(index + 1).padStart(4, '0')}`,
      clienteId: cliente.id,
      nombre: PERSONAS[(index + 3) % PERSONAS.length].join(' '),
      numeroCuenta: interna?.numero ?? `44-${String(200000 + index * 53)}`,
      banco: interna ? 'SecurityBankGT' : bancos[(index % (bancos.length - 1)) + 1],
      alias: ['Ahorro familiar', 'Proveedor', 'Universidad', 'Alquiler', 'Mamá'][index % 5],
      creadoEn: daysAgo(20 + index, 11, 0),
    })
  }

  const tarjetas: Tarjeta[] = []
  for (let index = 0; index < 30; index += 1) {
    const cuenta = cuentas[index % cuentas.length]
    let estado: Tarjeta['estado'] = 'activa'
    if (index % 10 === 0) estado = 'bloqueada'
    if (index % 17 === 0) estado = 'reportada'
    tarjetas.push({
      id: `tjt-${String(index + 1).padStart(4, '0')}`,
      clienteId: cuenta.clienteId,
      cuentaId: cuenta.id,
      tipo: index % 3 === 0 ? 'credito' : 'debito',
      marca: index % 2 === 0 ? 'Visa' : 'Mastercard',
      ultimos4: String(1000 + ((index * 97) % 9000)).padStart(4, '0'),
      vencimiento: `${String((index % 12) + 1).padStart(2, '0')}/${27 + (index % 4)}`,
      estado,
      limiteDiario: index % 3 === 0 ? 8000 : 4000,
      limiteMensual: index % 3 === 0 ? 25000 : 12000,
    })
  }

  const auditLogs: AuditLog[] = []
  const acciones = ['LOGIN', 'CONSULTA_CLIENTE', 'ACTUALIZAR_KYC', 'CREAR_CUENTA', 'TRANSFERENCIA', 'EXPORTAR_REPORTE', 'BLOQUEO_TARJETA', 'CONSULTA_AUDITORIA']
  const actores = ['user-admin', 'user-auditor', 'user-ejecutivo', 'user-cliente']
  for (let index = 0; index < 60; index += 1) {
    auditLogs.push({
      id: `aud-${String(index + 1).padStart(4, '0')}`,
      userId: actores[index % actores.length],
      accion: acciones[index % acciones.length],
      entidad: ['clientes', 'cuentas', 'transacciones', 'tarjetas', 'reportes'][index % 5],
      entidadId: index % 2 === 0 ? clientes[index % clientes.length].id : cuentas[index % cuentas.length].id,
      ip: `190.56.${20 + (index % 40)}.${30 + (index % 80)}`,
      dispositivo: ['Chrome / Windows', 'App Android', 'Navegador / macOS'][index % 3],
      resultado: index % 9 === 0 ? 'fallo' : 'exito',
      detalle: index % 9 === 0 ? 'Intento no autorizado' : 'Operación de demostración',
      fecha: daysAgo(index % 60, 8 + (index % 10), index % 50),
    })
  }

  const tiposEvento: SecurityEvent['tipo'][] = ['login_fallido', 'dispositivo_nuevo', 'transferencia_inusual', 'acceso_no_autorizado', 'pais_diferente', 'rafaga_transferencias', 'umbral_monto']
  const severidades: SecurityEvent['severidad'][] = ['baja', 'media', 'alta', 'critica']
  const securityEvents: SecurityEvent[] = Array.from({ length: 30 }, (_, index) => ({
    id: `evt-${String(index + 1).padStart(4, '0')}`,
    tipo: tiposEvento[index % tiposEvento.length],
    severidad: index % 11 === 0 ? 'critica' : severidades[index % 3],
    descripcion: descripcionEvento(tiposEvento[index % tiposEvento.length]),
    userId: actores[index % actores.length],
    ip: index % 6 === 0 ? `104.28.10.${index + 5}` : `190.56.12.${index + 8}`,
    pais: index % 6 === 0 ? 'US' : index % 13 === 0 ? 'MX' : 'GT',
    dispositivo: ['App iOS', 'Chrome / Windows', 'App Android'][index % 3],
    fecha: daysAgo(index % 28, 9 + (index % 8), index % 40),
  }))

  const dispositivos: Dispositivo[] = [
    { id: 'dev-01', userId: 'user-admin', clienteId: null, nombre: 'Chrome / macOS', pais: 'GT', ip: '190.56.20.11', confianza: true, ultimoAcceso: daysAgo(1, 8, 12) },
    { id: 'dev-02', userId: 'user-auditor', clienteId: null, nombre: 'Edge / Windows', pais: 'GT', ip: '190.56.21.18', confianza: true, ultimoAcceso: daysAgo(1, 9, 5) },
    { id: 'dev-03', userId: 'user-ejecutivo', clienteId: null, nombre: 'Chrome / Windows', pais: 'GT', ip: '190.56.22.40', confianza: true, ultimoAcceso: daysAgo(0, 8, 40) },
    { id: 'dev-04', userId: 'user-cliente', clienteId: 'cli-0001', nombre: 'App iOS', pais: 'GT', ip: '190.56.30.15', confianza: true, ultimoAcceso: daysAgo(0, 7, 20) },
    { id: 'dev-05', userId: 'user-cliente', clienteId: 'cli-0001', nombre: 'Safari / iPhone', pais: 'US', ip: '104.28.14.22', confianza: false, ultimoAcceso: daysAgo(6, 21, 4) },
  ]

  const notificaciones: Notificacion[] = [
    { id: 'ntf-01', userId: 'user-admin', tipo: 'incidente', titulo: 'Incidente crítico abierto', mensaje: 'La ráfaga de intentos de acceso sigue en estado abierto.', severidad: 'critica', leida: false, fecha: daysAgo(1, 9, 0) },
    { id: 'ntf-02', userId: 'user-admin', tipo: 'hallazgo', titulo: 'Hallazgo fuera de plazo', mensaje: 'HAL-05, paginación sin tamaño máximo, venció y sigue abierto.', severidad: 'alta', leida: false, fecha: daysAgo(2, 10, 0) },
    { id: 'ntf-03', userId: 'user-auditor', tipo: 'incidente', titulo: 'Incidente asignado', mensaje: 'INC-02 está en investigación y figura a su nombre.', severidad: 'alta', leida: false, fecha: daysAgo(3, 11, 0) },
    { id: 'ntf-04', userId: 'user-auditor', tipo: 'hallazgo', titulo: 'Hallazgo crítico en curso', mensaje: 'HAL-01 sigue en progreso y ya pasó la fecha límite.', severidad: 'critica', leida: false, fecha: daysAgo(2, 12, 0) },
    { id: 'ntf-05', userId: 'user-ejecutivo', tipo: 'kyc', titulo: 'KYC pendiente', mensaje: 'Hay clientes asignados con verificación pendiente.', severidad: 'media', leida: false, fecha: daysAgo(1, 8, 30) },
    { id: 'ntf-06', userId: 'user-ejecutivo', tipo: 'tarjeta', titulo: 'Tarjeta bloqueada', mensaje: 'Una tarjeta de su cartera está bloqueada.', severidad: 'alta', leida: false, fecha: daysAgo(4, 15, 0) },
    { id: 'ntf-07', userId: 'user-cliente', tipo: 'tarjeta', titulo: 'Tarjeta bloqueada', mensaje: 'Su tarjeta terminada en los dígitos registrados está bloqueada.', severidad: 'alta', leida: false, fecha: daysAgo(2, 18, 0) },
    { id: 'ntf-08', userId: 'user-cliente', tipo: 'dispositivo', titulo: 'Acceso desde otro país', mensaje: 'Se registró un equipo en un país distinto al habitual.', severidad: 'media', leida: false, fecha: daysAgo(6, 21, 10) },
    { id: 'ntf-09', userId: 'user-admin', tipo: 'transferencia', titulo: 'Transferencias marcadas', mensaje: 'Hay operaciones de alto valor pendientes de revisión.', severidad: 'alta', leida: true, fecha: daysAgo(5, 13, 0) },
  ]

  const profiles = users.map((user) => ({
    userId: user.id,
    nombre: user.nombre,
    email: user.email,
    telefono: user.id === 'user-cliente' ? clientes[0].telefono : '+502 2300 1000',
    creadoEn: daysAgo(120, 9, 0),
  }))

  return {
    users,
    userRoles: roles,
    profiles,
    clientes,
    cuentas,
    transacciones,
    beneficiarios,
    tarjetas,
    auditLogs,
    securityEvents,
    incidentes: INCIDENTES,
    notas: NOTAS,
    dispositivos,
    activos: ACTIVOS,
    amenazas: AMENAZAS,
    riesgos: RIESGOS,
    hallazgos: HALLAZGOS,
    casos: CASOS,
    notificaciones,
    loginAttempts: [],
    locks: [],
    otps: [],
    sessions: [],
    drafts: [],
    asignaciones: clientes.slice(0, 10).map((cliente) => ({ ejecutivoUserId: 'user-ejecutivo', clienteId: cliente.id })),
  }
}

function descripcionEvento(tipo: SecurityEvent['tipo']): string {
  const textos: Record<SecurityEvent['tipo'], string> = {
    login_fallido: 'Se acumuló una serie de intentos de acceso fallidos.',
    dispositivo_nuevo: 'El acceso provino de un dispositivo que no estaba marcado como de confianza.',
    transferencia_inusual: 'El patrón de la transferencia se apartó del uso habitual de la cuenta.',
    acceso_no_autorizado: 'Se intentó consultar un registro fuera del alcance del rol.',
    pais_diferente: 'El acceso se observó desde un país distinto al habitual.',
    rafaga_transferencias: 'Se registraron tres o más transferencias en menos de dos minutos.',
    umbral_monto: 'El monto superó el umbral de revisión de Q10,000.',
  }
  return textos[tipo]
}
