import {
  FAIL_WINDOW_MS,
  LOCK_MS,
  MAX_LOGIN_FAILS,
  MAX_OTP_ATTEMPTS,
  MAX_OTP_SENDS,
  OTP_TTL_MS,
  PAGE_MAX,
  PAGE_SIZE,
  RAPID_WINDOW_MS,
  UMBRAL_REVISION,
} from '@/domain/constants'
import { AppError } from '@/domain/errors'
import { dayKey, formatMoney, paginate, round2 } from '@/domain/format'
import { matrizConteo } from '@/domain/matrix'
import { calcularPostura } from '@/domain/posture'
import {
  beneficiarioSchema,
  clienteSchema,
  cuentaSchema,
  loginSchema,
  montoSchema,
  otpSchema,
  parseInput,
  passwordSchema,
  registerSchema,
  tarjetaSchema,
  transferenciaSchema,
} from '@/domain/schemas'
import type {
  Canal,
  Cliente,
  Cuenta,
  CuentaVista,
  EstadoCliente,
  EstadoCuenta,
  EstadoTarjeta,
  EstadoTx,
  Page,
  Resumen,
  SessionView,
  Tarjeta,
  TipoTx,
  Transaccion,
  TransaccionVista,
} from '@/domain/types'
import { presentarCliente, presentarCuenta, presentarTx } from './present'
import {
  allow,
  assertCliente,
  assignIp,
  audit,
  currentSession,
  failsRecientes,
  getDb,
  hasRole,
  idsDe,
  nextCodigo,
  notify,
  notifyRoles,
  persist,
  requireSession,
  resetDb,
  roleDe,
  securityEvent,
  tokenStore,
  touchSession,
  type Ctx,
} from './store'
import { hashSecret, randomDigits, randomId, sessionTag, verifySecret } from './hash'

function pageOf<T>(items: T[], page = 1, pageSize = PAGE_SIZE): Page<T> {
  return paginate(items, page, Math.min(pageSize || PAGE_SIZE, PAGE_MAX))
}

function issueOtp(userId: string, purpose: 'login' | 'transfer', draftId: string | null) {
  const db = getDb()
  const since = Date.now() - FAIL_WINDOW_MS
  const sent = db.otps.filter((otp) => otp.userId === userId && otp.purpose === purpose && otp.createdAt >= since)
  if (sent.length >= MAX_OTP_SENDS) throw new AppError('Demasiados códigos solicitados. Espere unos minutos.')
  const code = randomDigits(6)
  const otp = {
    id: randomId('otp'),
    userId,
    purpose,
    codeHash: hashSecret(code, `${userId}:${purpose}`),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    used: false,
    draftId,
    createdAt: Date.now(),
  }
  db.otps.push(otp)
  return { otp, code }
}

function consumeOtp(ctx: Pick<Ctx, 'userId' | 'ip' | 'device' | 'pais'>, purpose: 'login' | 'transfer', code: string, draftId?: string | null) {
  parseInput(otpSchema, code)
  const otp = [...getDb().otps].reverse().find((item) => item.userId === ctx.userId && item.purpose === purpose && !item.used && (draftId ? item.draftId === draftId : true))
  if (!otp || otp.expiresAt < Date.now()) throw new AppError('El código no es válido o expiró.')
  if (otp.attempts >= MAX_OTP_ATTEMPTS) throw new AppError('El código ya no es válido. Vuelva a iniciar sesión.')
  if (!verifySecret(code, otp.codeHash)) {
    otp.attempts += 1
    audit({ userId: ctx.userId, accion: 'OTP_FALLO', entidad: 'otp', entidadId: otp.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'fallo' })
    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      otp.used = true
      securityEvent({ tipo: 'login_fallido', severidad: 'alta', descripcion: 'Se agotaron los intentos del código de verificación.', userId: ctx.userId, ip: ctx.ip, pais: ctx.pais, dispositivo: ctx.device })
      persist()
      throw new AppError('El código ya no es válido. Vuelva a iniciar sesión.')
    }
    persist()
    throw new AppError('El código no es válido.')
  }
  otp.used = true
  return otp
}

function recordarDispositivo(ctx: Ctx) {
  const db = getDb()
  const known = db.dispositivos.find((item) => item.userId === ctx.userId && item.nombre === ctx.device)
  if (!known) {
    db.dispositivos.unshift({
      id: randomId('dev'),
      userId: ctx.userId,
      clienteId: ctx.clienteId,
      nombre: ctx.device,
      pais: ctx.pais,
      ip: ctx.ip,
      confianza: false,
      ultimoAcceso: new Date().toISOString(),
    })
    securityEvent({ tipo: 'dispositivo_nuevo', severidad: 'media', descripcion: 'El acceso se realizó desde un dispositivo no registrado.', userId: ctx.userId, ip: ctx.ip, pais: ctx.pais, dispositivo: ctx.device })
    notify(ctx.userId, 'dispositivo', 'Dispositivo nuevo', 'Se detectó un acceso desde un equipo que no estaba registrado.', 'media')
  } else {
    known.ultimoAcceso = new Date().toISOString()
    known.ip = ctx.ip
    known.pais = ctx.pais
  }
  const user = db.users.find((item) => item.id === ctx.userId)
  if (user && ctx.pais !== user.paisHabitual) {
    securityEvent({ tipo: 'pais_diferente', severidad: 'alta', descripcion: 'El acceso proviene de un país distinto al habitual.', userId: ctx.userId, ip: ctx.ip, pais: ctx.pais, dispositivo: ctx.device })
    notify(ctx.userId, 'dispositivo', 'Acceso desde otro país', `Se registró un acceso desde ${ctx.pais}.`, 'alta')
    notifyRoles(['admin', 'auditor_seguridad'], 'dispositivo', 'Acceso desde otro país', `${ctx.email} ingresó desde ${ctx.pais}.`, 'alta')
  }
}

export function session(): SessionView {
  const row = currentSession()
  if (!row) return { status: 'anonymous' }
  if (Date.now() - row.lastActivity > 10 * 60 * 1000) {
    getDb().sessions = getDb().sessions.filter((item) => item.token !== row.token)
    tokenStore.set(null)
    persist()
    return { status: 'anonymous' }
  }
  const user = getDb().users.find((item) => item.id === row.userId)
  if (!user) return { status: 'anonymous' }
  if (!row.mfaVerified) return { status: 'mfa', email: user.email }
  const cliente = getDb().clientes.find((item) => item.userId === user.id)
  return {
    status: 'ready',
    userId: user.id,
    email: user.email,
    nombre: user.nombre,
    role: roleDe(user.id),
    clienteId: cliente?.id ?? null,
  }
}

export function signIn(input: { email: string; password: string; simulateForeign: boolean; device: string }) {
  const parsed = parseInput(loginSchema, input)
  const email = parsed.email.toLowerCase()
  const db = getDb()
  const user = db.users.find((item) => item.email === email)
  const pais = parsed.simulateForeign ? 'US' : 'GT'
  const ip = assignIp(pais)
  const device = input.device.slice(0, 180) || 'Navegador web'
  const lock = user ? db.locks.find((item) => item.userId === user.id) : undefined
  if (lock && new Date(lock.until).getTime() > Date.now()) {
    db.loginAttempts.unshift({ id: randomId('lat'), email, userId: user?.id ?? null, exito: false, ip, dispositivo: device, fecha: new Date().toISOString() })
    audit({ userId: user?.id ?? null, accion: 'LOGIN', entidad: 'auth', entidadId: user?.id ?? null, ip, dispositivo: device, resultado: 'fallo', detalle: 'Cuenta bloqueada' })
    persist()
    throw new AppError('La cuenta está bloqueada temporalmente. Inténtelo más tarde.')
  }
  if (!user || !verifySecret(parsed.password, user.passwordHash)) {
    db.loginAttempts.unshift({ id: randomId('lat'), email, userId: user?.id ?? null, exito: false, ip, dispositivo: device, fecha: new Date().toISOString() })
    audit({ userId: user?.id ?? null, accion: 'LOGIN', entidad: 'auth', entidadId: user?.id ?? null, ip, dispositivo: device, resultado: 'fallo', detalle: 'Credenciales inválidas' })
    const fails = failsRecientes(email).length
    if (fails >= MAX_LOGIN_FAILS) {
      if (user) {
        const current = db.locks.find((item) => item.userId === user.id)
        const until = new Date(Date.now() + LOCK_MS).toISOString()
        if (current) current.until = until
        else db.locks.push({ userId: user.id, until, reason: 'Cinco intentos fallidos' })
        notifyRoles(['admin', 'auditor_seguridad'], 'login', 'Cuenta bloqueada', `La cuenta ${email} se bloqueó de forma temporal.`, 'alta')
      }
      securityEvent({ tipo: 'login_fallido', severidad: 'alta', descripcion: 'Cinco o más intentos fallidos de acceso en diez minutos.', userId: user?.id ?? null, ip, pais, dispositivo: device })
      persist()
      throw new AppError('La cuenta está bloqueada temporalmente. Inténtelo más tarde.')
    }
    persist()
    throw new AppError('Credenciales inválidas.')
  }
  db.locks = db.locks.filter((item) => item.userId !== user.id)
  db.sessions = db.sessions.filter((item) => item.userId !== user.id)
  db.loginAttempts.unshift({ id: randomId('lat'), email, userId: user.id, exito: true, ip, dispositivo: device, fecha: new Date().toISOString() })
  const token = `${randomId('ses')}${randomId('tok')}`
  db.sessions.push({
    token,
    userId: user.id,
    mfaVerified: false,
    lastActivity: Date.now(),
    tag: sessionTag(token, user.id, false),
    ip,
    device,
    pais,
    createdAt: Date.now(),
  })
  tokenStore.set(token)
  const { code, otp } = issueOtp(user.id, 'login', null)
  audit({ userId: user.id, accion: 'LOGIN_PASSWORD', entidad: 'auth', entidadId: user.id, ip, dispositivo: device, resultado: 'exito', detalle: 'Pendiente de OTP' })
  persist()
  return { email: user.email, demoCode: code, expiresAt: new Date(otp.expiresAt).toISOString() }
}

export function verifyOtp(code: string): SessionView {
  const ctx = requireSession(false)
  if (getDb().sessions.find((item) => item.token === ctx.token)?.mfaVerified) return session()
  consumeOtp(ctx, 'login', code)
  const row = getDb().sessions.find((item) => item.token === ctx.token)
  if (!row) throw new AppError('Debe iniciar sesión.', 'auth')
  row.mfaVerified = true
  row.tag = sessionTag(row.token, row.userId, true)
  row.lastActivity = Date.now()
  const ready = requireSession(true)
  recordarDispositivo(ready)
  audit({ userId: ready.userId, accion: 'LOGIN_MFA', entidad: 'auth', entidadId: ready.userId, ip: ready.ip, dispositivo: ready.device, resultado: 'exito' })
  persist()
  return session()
}

export function resendOtp() {
  const ctx = requireSession(false)
  if (getDb().sessions.find((item) => item.token === ctx.token)?.mfaVerified) throw new AppError('La sesión ya está verificada.')
  getDb().otps.forEach((otp) => {
    if (otp.userId === ctx.userId && otp.purpose === 'login' && !otp.used) otp.used = true
  })
  const { code, otp } = issueOtp(ctx.userId, 'login', null)
  audit({ userId: ctx.userId, accion: 'OTP_REENVIAR', entidad: 'otp', entidadId: otp.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return { demoCode: code, expiresAt: new Date(otp.expiresAt).toISOString() }
}

export function signUp(input: unknown) {
  const parsed = parseInput(registerSchema, input)
  const email = parsed.email.toLowerCase()
  const db = getDb()
  if (db.users.some((user) => user.email === email) || db.clientes.some((cliente) => cliente.correo.toLowerCase() === email)) {
    throw new AppError('El correo ya está registrado.')
  }
  const userId = randomId('user')
  db.users.push({
    id: userId,
    email,
    nombre: `${parsed.nombre} ${parsed.apellidos}`,
    passwordHash: hashSecret(parsed.password, userId),
    paisHabitual: 'GT',
  })
  db.userRoles.push({ userId, role: 'cliente' })
  if (!hasRole(userId, 'cliente')) throw new AppError('No se pudo completar el registro.')
  db.profiles.push({ userId, nombre: `${parsed.nombre} ${parsed.apellidos}`, email, telefono: parsed.telefono, creadoEn: new Date().toISOString() })
  const clienteId = randomId('cli')
  db.clientes.push({
    id: clienteId,
    codigo: nextCodigo('CLI', db.clientes.map((item) => item.codigo)),
    userId,
    nombres: parsed.nombre,
    apellidos: parsed.apellidos,
    dpi: parsed.dpi,
    nit: '0000000-0',
    correo: email,
    telefono: parsed.telefono,
    direccion: 'Pendiente de actualizar',
    fechaNacimiento: parsed.fechaNacimiento,
    nivelRiesgo: 'medio',
    estadoKyc: 'pendiente',
    estado: 'activo',
    fechaAlta: new Date().toISOString().slice(0, 10),
  })
  db.cuentas.push({
    id: randomId('cta'),
    numero: `01-006-${String(100000 + db.cuentas.length + 1).padStart(6, '0')}`,
    clienteId,
    tipo: 'ahorro',
    moneda: 'GTQ',
    saldo: 0,
    limiteDiario: 5000,
    estado: 'activa',
    fechaApertura: new Date().toISOString().slice(0, 10),
  })
  audit({ userId, accion: 'REGISTRO', entidad: 'clientes', entidadId: clienteId, ip: '190.56.1.20', dispositivo: 'Navegador web', resultado: 'exito' })
  notifyRoles(['admin', 'ejecutivo'], 'kyc', 'KYC pendiente', `El cliente ${parsed.nombre} ${parsed.apellidos} quedó pendiente de verificación.`, 'media')
  persist()
  return { ok: true }
}

export function signOut() {
  const row = currentSession()
  if (row) {
    audit({ userId: row.userId, accion: 'LOGOUT', entidad: 'auth', entidadId: row.userId, ip: row.ip, dispositivo: row.device, resultado: 'exito' })
    getDb().sessions = getDb().sessions.filter((item) => item.token !== row.token)
  }
  tokenStore.set(null)
  persist()
}

export function touch() {
  touchSession()
  return { ok: true }
}

export function changePassword(input: { actual: string; nueva: string }) {
  const ctx = requireSession(true)
  const user = getDb().users.find((item) => item.id === ctx.userId)
  if (!user || !verifySecret(input.actual, user.passwordHash)) throw new AppError('La contraseña actual no es válida.')
  const nueva = parseInput(passwordSchema, input.nueva)
  user.passwordHash = hashSecret(nueva, user.id)
  audit({ userId: ctx.userId, accion: 'CAMBIAR_PASSWORD', entidad: 'auth', entidadId: ctx.userId, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return { ok: true }
}

function clientesVisibles(ctx: Ctx) {
  const ids = idsDe(ctx)
  return getDb().clientes.filter((cliente) => ids === 'all' || ids.includes(cliente.id))
}

export function listClientes(filters: { q?: string; estado?: string; kyc?: string; riesgo?: string; page?: number }): Page<Cliente> {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo', 'auditor_seguridad', 'cliente'], 'consulta de clientes')
  const q = (filters.q ?? '').trim().toLowerCase()
  const items = clientesVisibles(ctx)
    .filter((cliente) => !filters.estado || cliente.estado === filters.estado)
    .filter((cliente) => !filters.kyc || cliente.estadoKyc === filters.kyc)
    .filter((cliente) => !filters.riesgo || cliente.nivelRiesgo === filters.riesgo)
    .filter((cliente) => {
      if (!q) return true
      return [cliente.codigo, cliente.nombres, cliente.apellidos, cliente.correo, cliente.nit].join(' ').toLowerCase().includes(q)
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map((cliente) => presentarCliente(ctx, cliente))
  return pageOf(items, filters.page ?? 1)
}

export function getCliente(id: string) {
  const ctx = requireSession(true)
  const cliente = getDb().clientes.find((item) => item.id === id)
  if (!cliente) throw new AppError('No se encontró el registro.')
  assertCliente(ctx, cliente.id, 'consulta de cliente')
  audit({ userId: ctx.userId, accion: 'CONSULTA_CLIENTE', entidad: 'clientes', entidadId: id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  const cuentas = getDb().cuentas.filter((cuenta) => cuenta.clienteId === id).map((cuenta) => presentarCuenta(getDb(), cuenta))
  const tarjetas = getDb().tarjetas.filter((tarjeta) => tarjeta.clienteId === id).map((tarjeta) => structuredClone(tarjeta))
  return { cliente: presentarCliente(ctx, cliente), cuentas, tarjetas }
}

export function saveCliente(input: unknown) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo'], 'mantenimiento de clientes')
  const parsed = parseInput(clienteSchema, input)
  const db = getDb()
  const body = input as { id?: string }
  if (body.id) {
    const current = db.clientes.find((item) => item.id === body.id)
    if (!current) throw new AppError('No se encontró el registro.')
    assertCliente(ctx, current.id, 'edición de cliente')
    if (db.clientes.some((item) => item.id !== current.id && item.correo.toLowerCase() === parsed.correo.toLowerCase())) {
      throw new AppError('El correo ya está registrado.')
    }
    Object.assign(current, parsed)
    audit({ userId: ctx.userId, accion: 'EDITAR_CLIENTE', entidad: 'clientes', entidadId: current.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
    persist()
    return presentarCliente(ctx, current)
  }
  if (db.clientes.some((item) => item.correo.toLowerCase() === parsed.correo.toLowerCase())) throw new AppError('El correo ya está registrado.')
  const cliente: Cliente = {
    ...parsed,
    id: randomId('cli'),
    codigo: nextCodigo('CLI', db.clientes.map((item) => item.codigo)),
    userId: null,
    fechaAlta: new Date().toISOString().slice(0, 10),
  }
  db.clientes.push(cliente)
  if (ctx.role === 'ejecutivo') db.asignaciones.push({ ejecutivoUserId: ctx.userId, clienteId: cliente.id })
  audit({ userId: ctx.userId, accion: 'CREAR_CLIENTE', entidad: 'clientes', entidadId: cliente.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  if (cliente.estadoKyc === 'pendiente') notifyRoles(['admin'], 'kyc', 'KYC pendiente', `${cliente.nombres} ${cliente.apellidos} requiere verificación.`, 'media')
  persist()
  return presentarCliente(ctx, cliente)
}

export function setClienteEstado(id: string, estado: EstadoCliente) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo'], 'cambio de estado del cliente')
  const cliente = getDb().clientes.find((item) => item.id === id)
  if (!cliente) throw new AppError('No se encontró el registro.')
  assertCliente(ctx, cliente.id, 'cambio de estado del cliente')
  cliente.estado = estado
  if (estado === 'bloqueado') {
    getDb().cuentas.forEach((cuenta) => {
      if (cuenta.clienteId === id) cuenta.estado = 'bloqueada'
    })
    if (cliente.userId) notify(cliente.userId, 'cuenta', 'Cuenta bloqueada', 'Su relación comercial fue bloqueada. Comuníquese con el banco.', 'alta')
    notifyRoles(['admin'], 'cuenta', 'Cliente bloqueado', `${cliente.codigo} cambió a bloqueado.`, 'alta')
  }
  audit({ userId: ctx.userId, accion: 'ESTADO_CLIENTE', entidad: 'clientes', entidadId: id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito', detalle: estado })
  persist()
  return presentarCliente(ctx, cliente)
}

export function listCuentas(filters: { q?: string; estado?: string; tipo?: string; clienteId?: string; page?: number }): Page<CuentaVista> {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo', 'auditor_seguridad', 'cliente'], 'consulta de cuentas')
  if (filters.clienteId) assertCliente(ctx, filters.clienteId, 'consulta de cuentas')
  const ids = idsDe(ctx)
  const q = (filters.q ?? '').trim().toLowerCase()
  const items = getDb().cuentas
    .filter((cuenta) => ids === 'all' || ids.includes(cuenta.clienteId))
    .filter((cuenta) => !filters.clienteId || cuenta.clienteId === filters.clienteId)
    .filter((cuenta) => !filters.estado || cuenta.estado === filters.estado)
    .filter((cuenta) => !filters.tipo || cuenta.tipo === filters.tipo)
    .filter((cuenta) => !q || cuenta.numero.toLowerCase().includes(q))
    .map((cuenta) => presentarCuenta(getDb(), cuenta))
  return pageOf(items, filters.page ?? 1)
}

export function saveCuenta(input: unknown) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo'], 'apertura de cuenta')
  const parsed = parseInput(cuentaSchema, input)
  assertCliente(ctx, parsed.clienteId, 'apertura de cuenta')
  const db = getDb()
  const cuenta: Cuenta = {
    id: randomId('cta'),
    numero: `01-00${(db.cuentas.length % 5) + 1}-${String(100000 + db.cuentas.length + 1).padStart(6, '0')}`,
    clienteId: parsed.clienteId,
    tipo: parsed.tipo,
    moneda: 'GTQ',
    saldo: 0,
    limiteDiario: round2(parsed.limiteDiario),
    estado: 'activa',
    fechaApertura: new Date().toISOString().slice(0, 10),
  }
  db.cuentas.push(cuenta)
  audit({ userId: ctx.userId, accion: 'CREAR_CUENTA', entidad: 'cuentas', entidadId: cuenta.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return presentarCuenta(db, cuenta)
}

export function setCuentaEstado(id: string, estado: EstadoCuenta) {
  const ctx = requireSession(true)
  const cuenta = getDb().cuentas.find((item) => item.id === id)
  if (!cuenta) throw new AppError('No se encontró la cuenta.')
  assertCliente(ctx, cuenta.clienteId, 'cambio de estado de cuenta')
  if (estado === 'activa') allow(ctx, ['admin', 'ejecutivo'], 'desbloqueo de cuenta')
  else allow(ctx, ['admin', 'ejecutivo', 'cliente'], 'bloqueo de cuenta')
  cuenta.estado = estado
  audit({ userId: ctx.userId, accion: 'ESTADO_CUENTA', entidad: 'cuentas', entidadId: id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito', detalle: estado })
  if (estado === 'bloqueada') {
    const cliente = getDb().clientes.find((item) => item.id === cuenta.clienteId)
    if (cliente?.userId) notify(cliente.userId, 'cuenta', 'Cuenta bloqueada', `La cuenta ${cuenta.numero} fue bloqueada.`, 'alta')
  }
  persist()
  return presentarCuenta(getDb(), cuenta)
}

function txVisible(ctx: Ctx, tx: Transaccion) {
  if (ctx.role === 'admin' || ctx.role === 'auditor_seguridad') return true
  const ids = idsDe(ctx)
  if (ids === 'all') return true
  const origen = getDb().cuentas.find((item) => item.id === tx.cuentaOrigenId)
  const destino = getDb().cuentas.find((item) => item.id === tx.cuentaDestinoId)
  return Boolean((origen && ids.includes(origen.clienteId)) || (destino && ids.includes(destino.clienteId)))
}

export function listTransacciones(filters: { q?: string; tipo?: string; estado?: string; canal?: string; desde?: string; hasta?: string; clienteId?: string; page?: number }): Page<TransaccionVista> {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo', 'auditor_seguridad', 'cliente'], 'consulta de transacciones')
  if (filters.clienteId) assertCliente(ctx, filters.clienteId, 'consulta de transacciones')
  const q = (filters.q ?? '').trim().toLowerCase()
  const items = getDb().transacciones
    .filter((tx) => txVisible(ctx, tx))
    .filter((tx) => {
      if (!filters.clienteId) return true
      const origen = getDb().cuentas.find((item) => item.id === tx.cuentaOrigenId)
      const destino = getDb().cuentas.find((item) => item.id === tx.cuentaDestinoId)
      return origen?.clienteId === filters.clienteId || destino?.clienteId === filters.clienteId
    })
    .filter((tx) => !filters.tipo || tx.tipo === filters.tipo)
    .filter((tx) => !filters.estado || tx.estado === filters.estado)
    .filter((tx) => !filters.canal || tx.canal === filters.canal)
    .filter((tx) => !filters.desde || dayKey(tx.fecha) >= filters.desde)
    .filter((tx) => !filters.hasta || dayKey(tx.fecha) <= filters.hasta)
    .filter((tx) => !q || tx.referencia.toLowerCase().includes(q))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((tx) => presentarTx(getDb(), tx))
  return pageOf(items, filters.page ?? 1)
}

type MovimientoInput = {
  tipo: TipoTx
  monto: number
  cuentaOrigenId: string | null
  cuentaDestinoId: string | null
  beneficiarioId: string | null
  canal: Canal
  idempotencyKey: string
  motivo: string | null
  referenciaOrigen?: string | null
}

function rechazar(ctx: Ctx, partial: MovimientoInput, motivo: string): never {
  const db = getDb()
  const tx: Transaccion = {
    ...partial,
    id: randomId('tx'),
    referencia: nextCodigo('TX', db.transacciones.map((item) => item.referencia), 6),
    estado: 'rechazada',
    ip: ctx.ip,
    dispositivo: ctx.device,
    fecha: new Date().toISOString(),
    usuarioId: ctx.userId,
    referenciaOrigen: null,
    motivo,
  }
  db.transacciones.unshift(tx)
  audit({ userId: ctx.userId, accion: 'TRANSACCION_RECHAZADA', entidad: 'transacciones', entidadId: tx.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'fallo', detalle: motivo })
  persist()
  throw new AppError(motivo)
}

function reservado(cuentaId: string) {
  return round2(getDb().drafts.filter((draft) => draft.cuentaOrigenId === cuentaId && draft.expiresAt > Date.now()).reduce((sum, draft) => sum + draft.monto, 0))
}

function usadoHoy(cuentaId: string) {
  const today = dayKey(new Date().toISOString())
  const moved = getDb().transacciones
    .filter((tx) => tx.cuentaOrigenId === cuentaId && (tx.estado === 'completada' || tx.estado === 'marcada') && dayKey(tx.fecha) === today)
    .reduce((sum, tx) => sum + tx.monto, 0)
  return round2(moved + reservado(cuentaId))
}

function exigirCuenta(ctx: Ctx, id: string) {
  const cuenta = getDb().cuentas.find((item) => item.id === id)
  if (!cuenta) throw new AppError('No se encontró la cuenta.')
  assertCliente(ctx, cuenta.clienteId, 'operación sobre cuenta')
  return cuenta
}

function validarTitular(cuenta: Cuenta, requiereKyc: boolean) {
  const cliente = getDb().clientes.find((item) => item.id === cuenta.clienteId)
  if (!cliente || cliente.estado !== 'activo') return 'El cliente no está activo.'
  if (requiereKyc && cliente.estadoKyc !== 'verificado') return 'El KYC del cliente no está verificado.'
  if (cuenta.estado !== 'activa') return 'La cuenta no está activa.'
  return null
}

function aplicar(origen: Cuenta | null, destino: Cuenta | null, monto: number) {
  if (origen) origen.saldo = round2(origen.saldo - monto)
  if (destino) destino.saldo = round2(destino.saldo + monto)
}

function vigilar(ctx: Ctx, origenId: string | null, monto: number, tipo: TipoTx) {
  if (!origenId || (tipo !== 'transferencia_propia' && tipo !== 'transferencia_tercero')) return
  const since = Date.now() - RAPID_WINDOW_MS
  const recientes = getDb().transacciones.filter((tx) => tx.cuentaOrigenId === origenId && tx.tipo.startsWith('transferencia') && (tx.estado === 'completada' || tx.estado === 'marcada') && new Date(tx.fecha).getTime() >= since)
  if (recientes.length >= 3) {
    securityEvent({ tipo: 'rafaga_transferencias', severidad: 'alta', descripcion: 'Tres o más transferencias en menos de dos minutos.', userId: ctx.userId, ip: ctx.ip, pais: ctx.pais, dispositivo: ctx.device })
    notifyRoles(['admin', 'auditor_seguridad'], 'transferencia', 'Ráfaga de transferencias', 'Un origen acumuló tres transferencias en menos de dos minutos.', 'alta')
  }
  if (monto > UMBRAL_REVISION) {
    securityEvent({ tipo: 'umbral_monto', severidad: 'media', descripcion: `Transferencia de ${formatMoney(monto)} marcada para revisión.`, userId: ctx.userId, ip: ctx.ip, pais: ctx.pais, dispositivo: ctx.device })
    notifyRoles(['admin', 'auditor_seguridad'], 'transferencia', 'Transferencia de alto valor', `Se marcó una transferencia de ${formatMoney(monto)}.`, 'alta')
  }
}

function registrarMovimiento(ctx: Ctx, partial: MovimientoInput, estado: EstadoTx) {
  const db = getDb()
  const existing = db.transacciones.find((tx) => tx.idempotencyKey === partial.idempotencyKey)
  if (existing) return presentarTx(db, existing)
  const tx: Transaccion = {
    ...partial,
    id: randomId('tx'),
    referencia: nextCodigo('TX', db.transacciones.map((item) => item.referencia), 6),
    estado,
    ip: ctx.ip,
    dispositivo: ctx.device,
    fecha: new Date().toISOString(),
    usuarioId: ctx.userId,
    referenciaOrigen: partial.referenciaOrigen ?? null,
  }
  db.transacciones.unshift(tx)
  audit({ userId: ctx.userId, accion: 'TRANSACCION', entidad: 'transacciones', entidadId: tx.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito', detalle: tx.referencia })
  vigilar(ctx, tx.cuentaOrigenId, tx.monto, tx.tipo)
  persist()
  return presentarTx(db, tx)
}

function preparar(ctx: Ctx, origen: Cuenta | null, destino: Cuenta | null, monto: number, tipo: TipoTx, canal: Canal, idempotencyKey: string, beneficiarioId: string | null, controlaLimite: boolean) {
  const existing = getDb().transacciones.find((tx) => tx.idempotencyKey === idempotencyKey)
  if (existing) {
    if (existing.estado === 'rechazada') throw new AppError(existing.motivo ?? 'La operación fue rechazada.')
    return presentarTx(getDb(), existing)
  }
  const base = {
    tipo,
    monto,
    cuentaOrigenId: origen?.id ?? null,
    cuentaDestinoId: destino?.id ?? null,
    beneficiarioId,
    canal,
    idempotencyKey,
    motivo: null as string | null,
  }
  if (origen && destino && origen.id === destino.id) rechazar(ctx, base, 'No puede transferir a la misma cuenta.')
  const titular = origen ? validarTitular(origen, tipo !== 'deposito') : destino ? validarTitular(destino, false) : 'La cuenta no está activa.'
  if (titular) rechazar(ctx, base, titular)
  if (destino && destino.estado !== 'activa') rechazar(ctx, base, 'La cuenta de destino no está activa.')
  if (origen) {
    const libre = round2(origen.saldo - reservado(origen.id))
    if (libre < monto) rechazar(ctx, base, 'Saldo insuficiente.')
    if (controlaLimite && round2(usadoHoy(origen.id) + monto) > origen.limiteDiario) rechazar(ctx, base, 'Supera el límite diario de transferencia.')
  }
  return null
}

export function depositar(input: unknown) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo'], 'depósito')
  const parsed = parseInput(montoSchema, input)
  const destino = exigirCuenta(ctx, parsed.cuentaId)
  const previo = preparar(ctx, null, destino, parsed.monto, 'deposito', parsed.canal, parsed.idempotencyKey, null, false)
  if (previo) return previo
  aplicar(null, destino, parsed.monto)
  return registrarMovimiento(ctx, { tipo: 'deposito', monto: parsed.monto, cuentaOrigenId: null, cuentaDestinoId: destino.id, beneficiarioId: null, canal: parsed.canal, idempotencyKey: parsed.idempotencyKey, motivo: null }, 'completada')
}

export function retirar(input: unknown) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo'], 'retiro')
  const parsed = parseInput(montoSchema, input)
  const origen = exigirCuenta(ctx, parsed.cuentaId)
  const previo = preparar(ctx, origen, null, parsed.monto, 'retiro', parsed.canal, parsed.idempotencyKey, null, true)
  if (previo) return previo
  aplicar(origen, null, parsed.monto)
  return registrarMovimiento(ctx, { tipo: 'retiro', monto: parsed.monto, cuentaOrigenId: origen.id, cuentaDestinoId: null, beneficiarioId: null, canal: parsed.canal, idempotencyKey: parsed.idempotencyKey, motivo: null }, 'completada')
}

export function transferir(input: unknown): TransaccionVista | { tipo: 'requiere_otp'; draftId: string; demoCode: string; expiresAt: string } {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo', 'cliente'], 'transferencia')
  const parsed = parseInput(transferenciaSchema, input)
  const origen = exigirCuenta(ctx, parsed.cuentaOrigenId)
  let destino: Cuenta | null = null
  let beneficiarioId: string | null = null
  let tipo: TipoTx = 'transferencia_propia'
  if (parsed.destino === 'propia') {
    destino = exigirCuenta(ctx, parsed.cuentaDestinoId ?? '')
    if (destino.clienteId !== origen.clienteId) throw new AppError('La cuenta destino no pertenece al mismo cliente.')
  } else {
    const beneficiario = getDb().beneficiarios.find((item) => item.id === parsed.beneficiarioId)
    if (!beneficiario) throw new AppError('No se encontró el beneficiario.')
    assertCliente(ctx, beneficiario.clienteId, 'uso de beneficiario')
    if (beneficiario.clienteId !== origen.clienteId && ctx.role === 'cliente') throw new AppError('El beneficiario no pertenece a la cuenta de origen.')
    beneficiarioId = beneficiario.id
    destino = getDb().cuentas.find((cuenta) => cuenta.numero === beneficiario.numeroCuenta) ?? null
    tipo = 'transferencia_tercero'
  }
  const previo = preparar(ctx, origen, destino, parsed.monto, tipo, parsed.canal, parsed.idempotencyKey, beneficiarioId, true)
  if (previo) return previo
  if (parsed.monto > UMBRAL_REVISION) {
    const open = getDb().drafts.find((draft) => draft.idempotencyKey === parsed.idempotencyKey && draft.expiresAt > Date.now())
    if (open) throw new AppError('Ya existe una confirmación pendiente para esta operación.')
    const draftId = randomId('drf')
    const { code, otp } = issueOtp(ctx.userId, 'transfer', draftId)
    getDb().drafts.push({
      id: draftId,
      userId: ctx.userId,
      cuentaOrigenId: origen.id,
      cuentaDestinoId: destino?.id ?? null,
      beneficiarioId,
      monto: parsed.monto,
      canal: parsed.canal,
      idempotencyKey: parsed.idempotencyKey,
      otpId: otp.id,
      expiresAt: otp.expiresAt,
      createdAt: Date.now(),
    })
    audit({ userId: ctx.userId, accion: 'TRANSFERENCIA_OTP', entidad: 'drafts', entidadId: draftId, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
    persist()
    return { tipo: 'requiere_otp', draftId, demoCode: code, expiresAt: new Date(otp.expiresAt).toISOString() }
  }
  aplicar(origen, destino, parsed.monto)
  return registrarMovimiento(ctx, { tipo, monto: parsed.monto, cuentaOrigenId: origen.id, cuentaDestinoId: destino?.id ?? null, beneficiarioId, canal: parsed.canal, idempotencyKey: parsed.idempotencyKey, motivo: null }, 'completada')
}

export function confirmarTransferencia(input: { draftId: string; code: string }) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo', 'cliente'], 'confirmación de transferencia')
  const draft = getDb().drafts.find((item) => item.id === input.draftId && item.userId === ctx.userId)
  if (!draft || draft.expiresAt < Date.now()) throw new AppError('La confirmación expiró. Inicie la transferencia de nuevo.')
  consumeOtp(ctx, 'transfer', input.code, draft.id)
  const origen = getDb().cuentas.find((item) => item.id === draft.cuentaOrigenId)
  const destino = draft.cuentaDestinoId ? getDb().cuentas.find((item) => item.id === draft.cuentaDestinoId) ?? null : null
  if (!origen) throw new AppError('No se encontró la cuenta.')
  const tipo: TipoTx = draft.beneficiarioId || origen.clienteId !== destino?.clienteId ? 'transferencia_tercero' : 'transferencia_propia'
  getDb().drafts = getDb().drafts.filter((item) => item.id !== draft.id)
  const previo = preparar(ctx, origen, destino, draft.monto, tipo, draft.canal, draft.idempotencyKey, draft.beneficiarioId, true)
  if (previo) return previo
  aplicar(origen, destino, draft.monto)
  const estado: EstadoTx = draft.monto > UMBRAL_REVISION ? 'marcada' : 'completada'
  return registrarMovimiento(ctx, { tipo, monto: draft.monto, cuentaOrigenId: origen.id, cuentaDestinoId: destino?.id ?? null, beneficiarioId: draft.beneficiarioId, canal: draft.canal, idempotencyKey: draft.idempotencyKey, motivo: null }, estado)
}

export function revertir(id: string) {
  const ctx = requireSession(true)
  allow(ctx, ['admin'], 'reversión')
  const original = getDb().transacciones.find((tx) => tx.id === id)
  if (!original) throw new AppError('No se encontró la transacción.')
  if (original.tipo === 'reversion') throw new AppError('Una reversión no se puede revertir desde este flujo.')
  if (original.estado !== 'completada' && original.estado !== 'marcada') throw new AppError('Solo se revierten operaciones completadas o marcadas.')
  if (getDb().transacciones.some((tx) => tx.referenciaOrigen === original.referencia)) throw new AppError('Esta operación ya tiene una reversión.')
  const origen = original.cuentaDestinoId ? getDb().cuentas.find((item) => item.id === original.cuentaDestinoId) ?? null : null
  const destino = original.cuentaOrigenId ? getDb().cuentas.find((item) => item.id === original.cuentaOrigenId) ?? null : null
  if (origen && origen.saldo < original.monto) throw new AppError('La cuenta no tiene saldo para devolver el movimiento.')
  aplicar(origen, destino, original.monto)
  const vista = registrarMovimiento(ctx, {
    tipo: 'reversion',
    monto: original.monto,
    cuentaOrigenId: origen?.id ?? null,
    cuentaDestinoId: destino?.id ?? null,
    beneficiarioId: null,
    canal: original.canal,
    idempotencyKey: `rev-${original.referencia}`,
    motivo: `Reversión de ${original.referencia}`,
    referenciaOrigen: original.referencia,
  }, 'completada')
  return vista
}

export function intentarModificarTransaccion(id: string) {
  const ctx = requireSession(true)
  audit({ userId: ctx.userId, accion: 'UPDATE_TRANSACCION', entidad: 'transacciones', entidadId: id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'fallo', detalle: 'Registro inmutable' })
  persist()
  throw new AppError('Las transacciones son inmutables. Registre una reversión si necesita corregir una operación.')
}

export function listBeneficiarios(clienteId?: string) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo', 'cliente'], 'consulta de beneficiarios')
  if (clienteId) assertCliente(ctx, clienteId, 'consulta de beneficiarios')
  const ids = idsDe(ctx)
  return getDb().beneficiarios
    .filter((item) => ids === 'all' || ids.includes(item.clienteId))
    .filter((item) => !clienteId || item.clienteId === clienteId)
    .map((item) => structuredClone(item))
}

export function saveBeneficiario(input: unknown) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo', 'cliente'], 'mantenimiento de beneficiarios')
  const parsed = parseInput(beneficiarioSchema, input)
  assertCliente(ctx, parsed.clienteId, 'mantenimiento de beneficiarios')
  const body = input as { id?: string }
  if (body.id) {
    const current = getDb().beneficiarios.find((item) => item.id === body.id)
    if (!current) throw new AppError('No se encontró el beneficiario.')
    assertCliente(ctx, current.clienteId, 'edición de beneficiario')
    Object.assign(current, parsed)
    audit({ userId: ctx.userId, accion: 'EDITAR_BENEFICIARIO', entidad: 'beneficiarios', entidadId: current.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
    persist()
    return structuredClone(current)
  }
  const created = { ...parsed, id: randomId('ben'), creadoEn: new Date().toISOString() }
  getDb().beneficiarios.unshift(created)
  audit({ userId: ctx.userId, accion: 'CREAR_BENEFICIARIO', entidad: 'beneficiarios', entidadId: created.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return created
}

export function deleteBeneficiario(id: string) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo', 'cliente'], 'eliminación de beneficiario')
  const current = getDb().beneficiarios.find((item) => item.id === id)
  if (!current) throw new AppError('No se encontró el beneficiario.')
  assertCliente(ctx, current.clienteId, 'eliminación de beneficiario')
  getDb().beneficiarios = getDb().beneficiarios.filter((item) => item.id !== id)
  audit({ userId: ctx.userId, accion: 'ELIMINAR_BENEFICIARIO', entidad: 'beneficiarios', entidadId: id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return { ok: true }
}

export function listTarjetas(filters: { estado?: string; clienteId?: string; page?: number }) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo', 'cliente'], 'consulta de tarjetas')
  if (filters.clienteId) assertCliente(ctx, filters.clienteId, 'consulta de tarjetas')
  const ids = idsDe(ctx)
  const items = getDb().tarjetas
    .filter((tarjeta) => ids === 'all' || ids.includes(tarjeta.clienteId))
    .filter((tarjeta) => !filters.estado || tarjeta.estado === filters.estado)
    .filter((tarjeta) => !filters.clienteId || tarjeta.clienteId === filters.clienteId)
    .map((tarjeta) => {
      const cliente = getDb().clientes.find((item) => item.id === tarjeta.clienteId)
      return { ...structuredClone(tarjeta), clienteNombre: cliente ? `${cliente.nombres} ${cliente.apellidos}` : '—' }
    })
  return pageOf(items, filters.page ?? 1)
}

export function saveTarjeta(input: unknown) {
  const ctx = requireSession(true)
  allow(ctx, ['admin', 'ejecutivo'], 'emisión de tarjeta')
  const parsed = parseInput(tarjetaSchema, input)
  assertCliente(ctx, parsed.clienteId, 'emisión de tarjeta')
  const cuenta = getDb().cuentas.find((item) => item.id === parsed.cuentaId && item.clienteId === parsed.clienteId)
  if (!cuenta) throw new AppError('La cuenta no corresponde al cliente.')
  const tarjeta: Tarjeta = { ...parsed, id: randomId('tjt'), estado: 'activa' }
  getDb().tarjetas.unshift(tarjeta)
  audit({ userId: ctx.userId, accion: 'CREAR_TARJETA', entidad: 'tarjetas', entidadId: tarjeta.id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito' })
  persist()
  return tarjeta
}

export function setTarjetaEstado(id: string, estado: EstadoTarjeta) {
  const ctx = requireSession(true)
  const tarjeta = getDb().tarjetas.find((item) => item.id === id)
  if (!tarjeta) throw new AppError('No se encontró la tarjeta.')
  assertCliente(ctx, tarjeta.clienteId, 'cambio de estado de tarjeta')
  if (estado === 'activa') allow(ctx, ['admin', 'ejecutivo'], 'desbloqueo de tarjeta')
  else allow(ctx, ['admin', 'ejecutivo', 'cliente'], 'bloqueo de tarjeta')
  tarjeta.estado = estado
  audit({ userId: ctx.userId, accion: 'ESTADO_TARJETA', entidad: 'tarjetas', entidadId: id, ip: ctx.ip, dispositivo: ctx.device, resultado: 'exito', detalle: estado })
  if (estado !== 'activa') {
    const cliente = getDb().clientes.find((item) => item.id === tarjeta.clienteId)
    if (cliente?.userId) notify(cliente.userId, 'tarjeta', 'Tarjeta bloqueada', `La tarjeta terminada en ${tarjeta.ultimos4} cambió a ${estado}.`, 'alta')
  }
  persist()
  return structuredClone(tarjeta)
}

export function reportarTarjeta(id: string) {
  return setTarjetaEstado(id, 'reportada')
}

export function catalogo() {
  const ctx = requireSession(true)
  const ids = idsDe(ctx)
  const clientes = getDb().clientes.filter((cliente) => ids === 'all' || ids.includes(cliente.id)).map((cliente) => presentarCliente(ctx, cliente))
  const cuentas = getDb().cuentas.filter((cuenta) => ids === 'all' || ids.includes(cuenta.clienteId)).map((cuenta) => presentarCuenta(getDb(), cuenta))
  const beneficiarios = getDb().beneficiarios.filter((item) => ids === 'all' || ids.includes(item.clienteId))
  const seguridad = ctx.role === 'admin' || ctx.role === 'auditor_seguridad'
  return {
    clientes,
    cuentas,
    beneficiarios,
    activos: seguridad ? getDb().activos.map((item) => structuredClone(item)) : [],
    usuarios: seguridad ? getDb().users.map((user) => ({ id: user.id, nombre: user.nombre, role: roleDe(user.id) })) : [],
  }
}

export function resumen(): Resumen {
  const ctx = requireSession(true)
  const db = getDb()
  const ids = idsDe(ctx)
  const cuentas = db.cuentas.filter((cuenta) => ids === 'all' || ids.includes(cuenta.clienteId))
  const txs = db.transacciones.filter((tx) => txVisible(ctx, tx))
  const today = dayKey(new Date().toISOString())
  const month = today.slice(0, 7)
  const within30 = (fecha: string) => Date.now() - new Date(fecha).getTime() <= 30 * 86400000
  const volumen = (list: Transaccion[]) => round2(list.filter((tx) => tx.estado === 'completada' || tx.estado === 'marcada').reduce((sum, tx) => sum + tx.monto, 0))
  const postura = calcularPostura(db.hallazgos, db.incidentes, db.riesgos)
  const canales = (['web', 'movil', 'cajero'] as const).map((canal) => ({
    canal,
    total: txs.filter((tx) => tx.canal === canal && (tx.estado === 'completada' || tx.estado === 'marcada')).length,
  }))
  const eventosPorDia = Array.from({ length: 14 }, (_, index) => {
    const key = dayKey(new Date(Date.now() - (13 - index) * 86400000).toISOString())
    return { fecha: key.slice(8) + '/' + key.slice(5, 7), total: db.securityEvents.filter((event) => dayKey(event.fecha) === key).length }
  })
  const gastosMes = (['retiro', 'transferencia_propia', 'transferencia_tercero'] as const).map((tipo) => ({
    tipo,
    total: round2(txs.filter((tx) => tx.tipo === tipo && tx.cuentaOrigenId && dayKey(tx.fecha).startsWith(month) && tx.estado !== 'rechazada').reduce((sum, tx) => sum + tx.monto, 0)),
  }))
  const severidad = (['baja', 'media', 'alta', 'critica'] as const).map((nivel) => ({
    severidad: nivel,
    total: db.securityEvents.filter((event) => event.severidad === nivel).length,
  }))
  const recientes = txs.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6).map((tx) => presentarTx(db, tx))
  const alertas = db.notificaciones.filter((item) => item.userId === ctx.userId && !item.leida).slice(0, 5)
  const saldo = round2(cuentas.reduce((sum, cuenta) => sum + cuenta.saldo, 0))
  const base = {
    rol: ctx.role,
    postura: postura.value,
    posturaNivel: postura.posturaNivel,
    canales,
    eventosPorDia,
    gastosMes,
    severidad,
    matriz: matrizConteo(db.riesgos, 'antes'),
    recientes,
    alertas,
  }
  if (ctx.role === 'cliente') {
    return {
      ...base,
      kpis: [
        { id: 'saldo', label: 'Saldo total', value: formatMoney(saldo), tone: 'info' },
        { id: 'cuentas', label: 'Cuentas', value: String(cuentas.length), tone: 'ok' },
        { id: 'mes', label: 'Salidas del mes', value: formatMoney(gastosMes.reduce((sum, item) => sum + item.total, 0)), tone: 'warn' },
        { id: 'alertas', label: 'Alertas', value: String(alertas.length), tone: alertas.length ? 'danger' : 'ok' },
      ],
    }
  }
  if (ctx.role === 'ejecutivo') {
    const propios = ids === 'all' ? db.clientes : db.clientes.filter((cliente) => ids.includes(cliente.id))
    const bloqueadas = db.tarjetas.filter((tarjeta) => propios.some((cliente) => cliente.id === tarjeta.clienteId) && tarjeta.estado !== 'activa')
    return {
      ...base,
      kpis: [
        { id: 'asignados', label: 'Clientes asignados', value: String(propios.length), tone: 'info' },
        { id: 'kyc', label: 'KYC pendientes', value: String(propios.filter((cliente) => cliente.estadoKyc === 'pendiente').length), tone: 'warn' },
        { id: 'tarjetas', label: 'Tarjetas bloqueadas', value: String(bloqueadas.length), tone: bloqueadas.length ? 'danger' : 'ok' },
        { id: 'saldo', label: 'Saldo de la cartera', value: formatMoney(saldo), tone: 'ok' },
      ],
    }
  }
  const activas = db.clientes.filter((cliente) => cliente.estado === 'activo').length
  return {
    ...base,
    kpis: [
      { id: 'clientes', label: 'Clientes activos', value: String(activas), tone: 'ok' },
      { id: 'cuentas', label: 'Cuentas', value: String(db.cuentas.length), tone: 'info' },
      { id: 'hoy', label: 'Volumen de hoy', value: formatMoney(volumen(db.transacciones.filter((tx) => dayKey(tx.fecha) === today))), tone: 'info' },
      { id: 'mes', label: 'Volumen 30 días', value: formatMoney(volumen(db.transacciones.filter((tx) => within30(tx.fecha)))), tone: 'ok' },
      { id: 'marcadas', label: 'Transacciones marcadas', value: String(db.transacciones.filter((tx) => tx.estado === 'marcada').length), tone: 'warn' },
      { id: 'incidentes', label: 'Incidentes abiertos', value: String(db.incidentes.filter((item) => item.estado === 'abierto' || item.estado === 'investigando').length), tone: 'danger' },
    ],
  }
}

export function restablecerDemo() {
  const ctx = requireSession(true)
  allow(ctx, ['admin'], 'restablecer demostración')
  resetDb()
  return { ok: true }
}
