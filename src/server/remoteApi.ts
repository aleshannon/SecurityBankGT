import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PAGE_SIZE } from '@/domain/constants'
import { AppError } from '@/domain/errors'
import { dayKey, formatMoney, round2 } from '@/domain/format'
import { matrizConteo } from '@/domain/matrix'
import { calcularPostura } from '@/domain/posture'
import type {
  Activo,
  Amenaza,
  AuditLog,
  Beneficiario,
  CasoAbuso,
  Cliente,
  Cuenta,
  CuentaVista,
  Dispositivo,
  EstadoCliente,
  EstadoCuenta,
  EstadoIncidente,
  EstadoTarjeta,
  Hallazgo,
  Incidente,
  Notificacion,
  Page,
  ReportFilters,
  ReportId,
  Riesgo,
  Role,
  SecurityEvent,
  SessionView,
  Tarjeta,
  Transaccion,
  TransaccionVista,
} from '@/domain/types'
import type { BankApi } from './demoApi'
import { armarReporte, listadoReportes } from './remoteReports'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null

type Row = Record<string, unknown>

function client() {
  if (!supabase) throw new AppError('Supabase no está configurado.')
  return supabase
}

function fail(error: { message?: string } | null): never {
  const raw = error?.message ?? 'No se pudo completar la operación.'
  throw new AppError(raw.replace(/^.*ERROR:\s*/i, '').split('\n')[0] || 'No se pudo completar la operación.')
}

function text(value: unknown) {
  return value == null ? '' : String(value)
}

function day(value: unknown) {
  return text(value).slice(0, 10)
}

function num(value: unknown) {
  return Number(value ?? 0)
}

function nullable(value: unknown) {
  return value == null || value === '' ? null : String(value)
}

function safe(value?: string) {
  return (value ?? '').trim().replace(/[%_,.()]/g, '')
}

function paged<T>(items: T[], total: number, page = 1): Page<T> {
  return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), pageSize: PAGE_SIZE }
}

function span(page = 1) {
  const current = Math.max(1, page)
  const from = (current - 1) * PAGE_SIZE
  return { from, to: from + PAGE_SIZE - 1, current }
}

async function call<T>(fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client().rpc(fn, args)
  if (error) fail(error)
  if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data && data.error) {
    throw new AppError(String(data.error))
  }
  return data as T
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().functions.invoke(name, { body })
  if (data && typeof data === 'object' && data !== null && 'error' in data && data.error) {
    throw new AppError(String(data.error))
  }
  if (error) {
    let message = 'No se pudo completar la operación. Inténtelo de nuevo.'
    try {
      const context = (error as { context?: { json?: () => Promise<unknown> } }).context
      if (context?.json) {
        const payload = await context.json()
        if (payload && typeof payload === 'object' && payload !== null && 'error' in payload) {
          message = String((payload as { error: unknown }).error)
        }
      }
    } catch {
      message = 'No se pudo completar la operación. Inténtelo de nuevo.'
    }
    throw new AppError(message)
  }
  return data as T
}

async function rows(table: string, limit = 2000) {
  const { data, error } = await client().from(table).select('*').limit(limit)
  if (error) fail(error)
  return (data ?? []) as Row[]
}

function asCliente(row: Row): Cliente {
  return {
    id: text(row.id),
    codigo: text(row.codigo),
    userId: nullable(row.user_id),
    nombres: text(row.nombres),
    apellidos: text(row.apellidos),
    dpi: text(row.dpi),
    nit: text(row.nit),
    correo: text(row.correo),
    telefono: text(row.telefono),
    direccion: text(row.direccion),
    fechaNacimiento: day(row.fecha_nacimiento),
    nivelRiesgo: text(row.nivel_riesgo) as Cliente['nivelRiesgo'],
    estadoKyc: text(row.estado_kyc) as Cliente['estadoKyc'],
    estado: text(row.estado) as Cliente['estado'],
    fechaAlta: day(row.fecha_alta),
  }
}

function asCuenta(row: Row): Cuenta {
  return {
    id: text(row.id),
    numero: text(row.numero),
    clienteId: text(row.cliente_id),
    tipo: text(row.tipo) as Cuenta['tipo'],
    moneda: 'GTQ',
    saldo: num(row.saldo),
    limiteDiario: num(row.limite_diario),
    estado: text(row.estado) as Cuenta['estado'],
    fechaApertura: day(row.fecha_apertura),
  }
}

function asCuentaVista(row: Row): CuentaVista {
  const cliente = (row.clientes ?? {}) as Row
  const nombres = text(cliente.nombres)
  return {
    ...asCuenta(row),
    clienteNombre: nombres ? `${nombres} ${text(cliente.apellidos)}` : '—',
    clienteCodigo: text(cliente.codigo) || '—',
  }
}

function asTx(row: Row): Transaccion {
  return {
    id: text(row.id),
    referencia: text(row.referencia),
    tipo: text(row.tipo) as Transaccion['tipo'],
    monto: num(row.monto),
    cuentaOrigenId: nullable(row.cuenta_origen_id),
    cuentaDestinoId: nullable(row.cuenta_destino_id),
    beneficiarioId: nullable(row.beneficiario_id),
    estado: text(row.estado) as Transaccion['estado'],
    canal: text(row.canal) as Transaccion['canal'],
    ip: text(row.ip),
    dispositivo: text(row.dispositivo),
    fecha: text(row.fecha),
    idempotencyKey: text(row.idempotency_key),
    usuarioId: nullable(row.usuario_id),
    referenciaOrigen: nullable(row.referencia_origen),
    motivo: nullable(row.motivo),
  }
}

function asBeneficiario(row: Row): Beneficiario {
  return {
    id: text(row.id),
    clienteId: text(row.cliente_id),
    nombre: text(row.nombre),
    numeroCuenta: text(row.numero_cuenta),
    banco: text(row.banco),
    alias: text(row.alias),
    creadoEn: text(row.creado_en),
  }
}

function asTarjeta(row: Row): Tarjeta {
  return {
    id: text(row.id),
    clienteId: text(row.cliente_id),
    cuentaId: text(row.cuenta_id),
    tipo: text(row.tipo) as Tarjeta['tipo'],
    marca: text(row.marca) as Tarjeta['marca'],
    ultimos4: text(row.ultimos4),
    vencimiento: text(row.vencimiento),
    estado: text(row.estado) as Tarjeta['estado'],
    limiteDiario: num(row.limite_diario),
    limiteMensual: num(row.limite_mensual),
  }
}

function asActivo(row: Row): Activo {
  return {
    id: text(row.id),
    codigo: text(row.codigo),
    nombre: text(row.nombre),
    proceso: text(row.proceso),
    tipo: text(row.tipo) as Activo['tipo'],
    ubicacion: text(row.ubicacion) as Activo['ubicacion'],
    confidencialidad: text(row.confidencialidad) as Activo['confidencialidad'],
    integridad: text(row.integridad) as Activo['integridad'],
    disponibilidad: text(row.disponibilidad) as Activo['disponibilidad'],
    criticidad: text(row.criticidad) as Activo['criticidad'],
    propietario: text(row.propietario),
    custodio: text(row.custodio),
  }
}

function asAmenaza(row: Row): Amenaza {
  return {
    id: text(row.id),
    codigo: text(row.codigo),
    nombre: text(row.nombre),
    descripcion: text(row.descripcion),
    categoria: text(row.categoria) as Amenaza['categoria'],
    damage: num(row.damage),
    reproducibility: num(row.reproducibility),
    exploitability: num(row.exploitability),
    affectedUsers: num(row.affected_users),
    discoverability: num(row.discoverability),
    promedio: num(row.promedio),
    nivel: text(row.nivel) as Amenaza['nivel'],
    activoId: text(row.activo_id),
  }
}

function asRiesgo(row: Row): Riesgo {
  return {
    id: text(row.id),
    codigo: text(row.codigo),
    titulo: text(row.titulo),
    descripcion: text(row.descripcion),
    probabilidad: num(row.probabilidad),
    impacto: num(row.impacto),
    riesgoInherente: num(row.riesgo_inherente),
    controles: text(row.controles),
    probabilidadResidual: num(row.probabilidad_residual),
    impactoResidual: num(row.impacto_residual),
    riesgoResidual: num(row.riesgo_residual),
    tipo: text(row.tipo) as Riesgo['tipo'],
    tipoImpacto: text(row.tipo_impacto) as Riesgo['tipoImpacto'],
    tratamiento: text(row.tratamiento) as Riesgo['tratamiento'],
    activoId: text(row.activo_id),
  }
}

function asHallazgo(row: Row): Hallazgo {
  return {
    id: text(row.id),
    codigo: text(row.codigo),
    titulo: text(row.titulo),
    origen: text(row.origen) as Hallazgo['origen'],
    owasp: text(row.owasp) as Hallazgo['owasp'],
    severidad: text(row.severidad) as Hallazgo['severidad'],
    cvss: num(row.cvss),
    activoId: text(row.activo_id),
    evidencia: text(row.evidencia),
    recomendacion: text(row.recomendacion),
    responsable: text(row.responsable),
    estado: text(row.estado) as Hallazgo['estado'],
    fechaLimite: day(row.fecha_limite),
    capa: text(row.capa) as Hallazgo['capa'],
  }
}

function asCaso(row: Row): CasoAbuso {
  return {
    id: text(row.id),
    codigo: text(row.codigo),
    titulo: text(row.titulo),
    descripcion: text(row.descripcion),
    control: text(row.control),
    hallazgoId: text(row.hallazgo_id),
  }
}

function asNota(row: Row): Notificacion {
  return {
    id: text(row.id),
    userId: text(row.user_id),
    tipo: text(row.tipo),
    titulo: text(row.titulo),
    mensaje: text(row.mensaje),
    severidad: text(row.severidad) as Notificacion['severidad'],
    leida: Boolean(row.leida),
    fecha: text(row.fecha),
  }
}

function asEvento(row: Row): SecurityEvent {
  return {
    id: text(row.id),
    tipo: text(row.tipo) as SecurityEvent['tipo'],
    severidad: text(row.severidad) as SecurityEvent['severidad'],
    descripcion: text(row.descripcion),
    userId: nullable(row.user_id),
    ip: text(row.ip),
    pais: text(row.pais),
    dispositivo: text(row.dispositivo),
    fecha: text(row.fecha),
  }
}

function asAuditoria(row: Row): AuditLog {
  return {
    id: text(row.id),
    userId: nullable(row.user_id),
    accion: text(row.accion),
    entidad: text(row.entidad),
    entidadId: nullable(row.entidad_id),
    ip: text(row.ip),
    dispositivo: text(row.dispositivo),
    resultado: text(row.resultado) as AuditLog['resultado'],
    detalle: nullable(row.detalle),
    fecha: text(row.fecha),
  }
}

function asIncidente(row: Row): Incidente {
  return {
    id: text(row.id),
    codigo: text(row.codigo),
    titulo: text(row.titulo),
    descripcion: text(row.descripcion),
    severidad: text(row.severidad) as Incidente['severidad'],
    estado: text(row.estado) as Incidente['estado'],
    asignadoA: nullable(row.asignado_a),
    fecha: text(row.fecha),
  }
}

async function mapaCuentas() {
  const { data, error } = await client().from('cuentas').select('*, clientes(nombres, apellidos, codigo)').limit(2000)
  if (error) fail(error)
  return new Map((data ?? []).map((row) => {
    const cuenta = asCuentaVista(row as Row)
    return [cuenta.id, cuenta] as const
  }))
}

function presentarTx(row: Row, cuentas: Map<string, CuentaVista>): TransaccionVista {
  const tx = asTx(row)
  const origen = tx.cuentaOrigenId ? cuentas.get(tx.cuentaOrigenId) : undefined
  const destino = tx.cuentaDestinoId ? cuentas.get(tx.cuentaDestinoId) : undefined
  return {
    ...tx,
    origenNumero: origen?.numero ?? null,
    destinoNumero: destino?.numero ?? null,
    clienteNombre: origen?.clienteNombre && origen.clienteNombre !== '—' ? origen.clienteNombre : destino?.clienteNombre ?? '—',
  }
}

async function transaccion(id: string) {
  const cuentas = await mapaCuentas()
  const { data, error } = await client().from('transacciones').select('*').eq('id', id).maybeSingle()
  if (error) fail(error)
  if (!data) throw new AppError('No se encontró la transacción.')
  return presentarTx(data as Row, cuentas)
}

async function readSession(): Promise<SessionView> {
  const { data } = await client().auth.getUser()
  if (!data.user) return { status: 'anonymous' }
  const mfa = await client().from('mfa_sessions').select('verified, last_activity').eq('user_id', data.user.id).maybeSingle()
  const idle = mfa.data?.last_activity ? Date.now() - new Date(mfa.data.last_activity).getTime() > 10 * 60 * 1000 : true
  if (!mfa.data?.verified || idle) return { status: 'mfa', email: data.user.email ?? '' }
  const role = await client().rpc('current_app_role')
  const cliente = await client().rpc('current_cliente_id')
  const profile = await client().from('profiles').select('nombre, email').eq('user_id', data.user.id).maybeSingle()
  return {
    status: 'ready',
    userId: data.user.id,
    email: profile.data?.email ?? data.user.email ?? '',
    nombre: profile.data?.nombre ?? '',
    role: role.data as Role,
    clienteId: cliente.data as string | null,
  }
}

async function ready() {
  const view = await readSession()
  if (view.status !== 'ready' || !view.role || !view.userId) throw new AppError('Debe iniciar sesión.')
  return view
}

export const remote: BankApi = {
  session: readSession,
  async signIn(input) {
    const data = await invoke<{ email: string; demoCode: string; expiresAt: number; session?: { access_token: string; refresh_token: string } }>('login', input)
    if (data.session?.access_token && data.session.refresh_token) {
      await client().auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
    }
    return { email: data.email, demoCode: data.demoCode ?? '', expiresAt: new Date(data.expiresAt).toISOString() }
  },
  async verifyOtp(code) {
    await invoke('otp-verify', { code, purpose: 'login' })
    return readSession()
  },
  async resendOtp() {
    const data = await invoke<{ demoCode: string; expiresAt: number }>('otp-generate', { purpose: 'login' })
    return { demoCode: data.demoCode ?? '', expiresAt: new Date(data.expiresAt).toISOString() }
  },
  signUp: (input) => invoke('signup', input as Record<string, unknown>),
  async signOut() {
    await client().auth.signOut()
  },
  async touch() {
    const { error } = await client().rpc('touch_session')
    if (error) throw new AppError('Su sesión expiró por inactividad.')
    return { ok: true }
  },
  async changePassword(input) {
    const { data } = await client().auth.getUser()
    const email = data.user?.email
    if (!email) throw new AppError('Debe iniciar sesión.')
    const signed = await client().auth.signInWithPassword({ email, password: input.actual })
    if (signed.error) throw new AppError('La contraseña actual no es correcta.')
    const updated = await client().auth.updateUser({ password: input.nueva })
    if (updated.error) throw new AppError('La contraseña no cumple la política.')
    return { ok: true }
  },
  async listClientes(filters) {
    const window = span(filters.page)
    const q = safe(filters.q)
    let query = client().from('clientes_visibles').select('*', { count: 'exact' })
    if (filters.estado) query = query.eq('estado', filters.estado)
    if (filters.kyc) query = query.eq('estado_kyc', filters.kyc)
    if (filters.riesgo) query = query.eq('nivel_riesgo', filters.riesgo)
    if (q) query = query.or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%,codigo.ilike.%${q}%,correo.ilike.%${q}%`)
    const { data, error, count } = await query.order('codigo').range(window.from, window.to)
    if (error) fail(error)
    return paged((data ?? []).map((row) => asCliente(row as Row)), count ?? 0, window.current)
  },
  async getCliente(id) {
    const cliente = await client().from('clientes_visibles').select('*').eq('id', id).maybeSingle()
    if (cliente.error) fail(cliente.error)
    if (!cliente.data) throw new AppError('No se encontró el registro.')
    const cuentas = await client().from('cuentas').select('*, clientes(nombres, apellidos, codigo)').eq('cliente_id', id)
    if (cuentas.error) fail(cuentas.error)
    const tarjetas = await client().from('tarjetas').select('*').eq('cliente_id', id)
    if (tarjetas.error) fail(tarjetas.error)
    return {
      cliente: asCliente(cliente.data as Row),
      cuentas: (cuentas.data ?? []).map((row) => asCuentaVista(row as Row)),
      tarjetas: (tarjetas.data ?? []).map((row) => asTarjeta(row as Row)),
    }
  },
  async saveCliente(input) {
    const id = await call<string>('guardar_cliente', { payload: input })
    const { data, error } = await client().from('clientes_visibles').select('*').eq('id', id).single()
    if (error) fail(error)
    return asCliente(data as Row)
  },
  async setClienteEstado(id, estado: EstadoCliente) {
    await call('cambiar_estado_cliente', { p_id: id, p_estado: estado })
    const { data, error } = await client().from('clientes_visibles').select('*').eq('id', id).single()
    if (error) fail(error)
    return asCliente(data as Row)
  },
  async listCuentas(filters) {
    const window = span(filters.page)
    const q = safe(filters.q)
    let query = client().from('cuentas').select('*, clientes(nombres, apellidos, codigo)', { count: 'exact' })
    if (filters.estado) query = query.eq('estado', filters.estado)
    if (filters.tipo) query = query.eq('tipo', filters.tipo)
    if (filters.clienteId) query = query.eq('cliente_id', filters.clienteId)
    if (q) query = query.or(`numero.ilike.%${q}%`)
    const { data, error, count } = await query.order('numero').range(window.from, window.to)
    if (error) fail(error)
    return paged((data ?? []).map((row) => asCuentaVista(row as Row)), count ?? 0, window.current)
  },
  async saveCuenta(input) {
    const id = await call<string>('abrir_cuenta', { payload: input })
    const { data, error } = await client().from('cuentas').select('*, clientes(nombres, apellidos, codigo)').eq('id', id).single()
    if (error) fail(error)
    return asCuentaVista(data as Row)
  },
  async setCuentaEstado(id, estado: EstadoCuenta) {
    const { error } = await client().from('cuentas').update({ estado }).eq('id', id)
    if (error) fail(error)
    const { data, readError } = await client().from('cuentas').select('*, clientes(nombres, apellidos, codigo)').eq('id', id).single().then((result) => ({ data: result.data, readError: result.error }))
    if (readError) fail(readError)
    return asCuentaVista(data as Row)
  },
  async listTransacciones(filters) {
    const window = span(filters.page)
    const q = safe(filters.q)
    let query = client().from('transacciones').select('*', { count: 'exact' })
    if (filters.tipo) query = query.eq('tipo', filters.tipo)
    if (filters.estado) query = query.eq('estado', filters.estado)
    if (filters.canal) query = query.eq('canal', filters.canal)
    if (filters.desde) query = query.gte('fecha', `${filters.desde}T00:00:00-06:00`)
    if (filters.hasta) query = query.lte('fecha', `${filters.hasta}T23:59:59-06:00`)
    if (q) query = query.ilike('referencia', `%${q}%`)
    const { data, error, count } = await query.order('fecha', { ascending: false }).range(window.from, window.to)
    if (error) fail(error)
    const cuentas = await mapaCuentas()
    return paged((data ?? []).map((row) => presentarTx(row as Row, cuentas)), count ?? 0, window.current)
  },
  async depositar(input) {
    const created = await call<{ id: string }>('registrar_movimiento', { payload: { ...(input as object), tipo: 'deposito' } })
    return transaccion(created.id)
  },
  async retirar(input) {
    const created = await call<{ id: string }>('registrar_movimiento', { payload: { ...(input as object), tipo: 'retiro' } })
    return transaccion(created.id)
  },
  transferir: (input) => invoke('transfer', input as Record<string, unknown>),
  async confirmarTransferencia(input) {
    const created = await call<{ id: string }>('confirmar_transferencia', { p_draft: input.draftId, p_code: input.code })
    return transaccion(created.id)
  },
  async revertir(id) {
    const created = await call<{ id: string }>('revertir_transaccion', { p_id: id })
    return transaccion(created.id)
  },
  async intentarModificarTransaccion(_id) {
    throw new AppError('Las transacciones son inmutables. Registre una reversión si necesita corregir una operación.')
  },
  async listBeneficiarios(clienteId) {
    let query = client().from('beneficiarios').select('*').order('alias')
    if (clienteId) query = query.eq('cliente_id', clienteId)
    const { data, error } = await query
    if (error) fail(error)
    return (data ?? []).map((row) => asBeneficiario(row as Row))
  },
  async saveBeneficiario(input) {
    const body = input as Beneficiario
    const record = { cliente_id: body.clienteId, nombre: body.nombre, numero_cuenta: body.numeroCuenta, banco: body.banco, alias: body.alias }
    const saved = body.id
      ? await client().from('beneficiarios').update(record).eq('id', body.id).select('*').single()
      : await client().from('beneficiarios').insert(record).select('*').single()
    if (saved.error) fail(saved.error)
    return asBeneficiario(saved.data as Row)
  },
  async deleteBeneficiario(id) {
    const { error } = await client().from('beneficiarios').delete().eq('id', id)
    if (error) fail(error)
    return { ok: true }
  },
  async listTarjetas(filters) {
    const window = span(filters.page)
    let query = client().from('tarjetas').select('*, clientes(nombres, apellidos)', { count: 'exact' })
    if (filters.estado) query = query.eq('estado', filters.estado)
    if (filters.clienteId) query = query.eq('cliente_id', filters.clienteId)
    const { data, error, count } = await query.order('ultimos4').range(window.from, window.to)
    if (error) fail(error)
    return paged((data ?? []).map((row) => {
      const cliente = ((row as Row).clientes ?? {}) as Row
      const nombres = text(cliente.nombres)
      return { ...asTarjeta(row as Row), clienteNombre: nombres ? `${nombres} ${text(cliente.apellidos)}` : '—' }
    }), count ?? 0, window.current)
  },
  async saveTarjeta(input) {
    const body = input as Tarjeta
    const record = {
      cliente_id: body.clienteId,
      cuenta_id: body.cuentaId,
      tipo: body.tipo,
      marca: body.marca,
      ultimos4: body.ultimos4,
      vencimiento: body.vencimiento,
      estado: 'activa',
      limite_diario: body.limiteDiario,
      limite_mensual: body.limiteMensual,
    }
    const { data, error } = await client().from('tarjetas').insert(record).select('*').single()
    if (error) fail(error)
    return asTarjeta(data as Row)
  },
  async setTarjetaEstado(id, estado: EstadoTarjeta) {
    const { data, error } = await client().from('tarjetas').update({ estado }).eq('id', id).select('*').single()
    if (error) fail(error)
    return asTarjeta(data as Row)
  },
  async reportarTarjeta(id) {
    const { data, error } = await client().from('tarjetas').update({ estado: 'reportada' }).eq('id', id).select('*').single()
    if (error) fail(error)
    return asTarjeta(data as Row)
  },
  async catalogo() {
    const view = await ready()
    const seguridad = view.role === 'admin' || view.role === 'auditor_seguridad'
    const [clientes, cuentas, beneficiarios, activos, usuarios] = await Promise.all([
      client().from('clientes_visibles').select('*').order('codigo').limit(500),
      client().from('cuentas').select('*, clientes(nombres, apellidos, codigo)').limit(1000),
      client().from('beneficiarios').select('*').limit(1000),
      seguridad ? client().from('activos').select('*').order('codigo') : Promise.resolve({ data: [], error: null }),
      seguridad ? client().rpc('directorio_usuarios') : Promise.resolve({ data: [], error: null }),
    ])
    if (clientes.error) fail(clientes.error)
    if (cuentas.error) fail(cuentas.error)
    if (beneficiarios.error) fail(beneficiarios.error)
    if (activos.error) fail(activos.error)
    if (usuarios.error) fail(usuarios.error)
    return {
      clientes: (clientes.data ?? []).map((row) => asCliente(row as Row)),
      cuentas: (cuentas.data ?? []).map((row) => asCuentaVista(row as Row)),
      beneficiarios: (beneficiarios.data ?? []).map((row) => asBeneficiario(row as Row)),
      activos: ((activos.data ?? []) as Row[]).map(asActivo),
      usuarios: ((usuarios.data ?? []) as Array<{ id: string; nombre: string; role: Role }>).map((user) => ({ id: user.id, nombre: user.nombre, role: user.role })),
    }
  },
  async resumen() {
    const view = await ready()
    const [cuentasRaw, txRaw, eventosRaw, notasRaw, hallazgosRaw, incidentesRaw, riesgosRaw, tarjetasRaw, clientesRaw] = await Promise.all([
      rows('cuentas'),
      rows('transacciones'),
      rows('security_events'),
      client().from('notificaciones').select('*').eq('user_id', view.userId).eq('leida', false).order('fecha', { ascending: false }).limit(5),
      rows('hallazgos'),
      rows('incidentes'),
      rows('riesgos'),
      rows('tarjetas'),
      rows('clientes_visibles'),
    ])
    if (notasRaw.error) fail(notasRaw.error)
    const cuentas = cuentasRaw.map(asCuenta)
    const txs = txRaw.map(asTx)
    const eventos = eventosRaw.map(asEvento)
    const hallazgos = hallazgosRaw.map(asHallazgo)
    const incidentes = incidentesRaw.map(asIncidente)
    const riesgos = riesgosRaw.map(asRiesgo)
    const tarjetas = tarjetasRaw.map(asTarjeta)
    const clientes = clientesRaw.map(asCliente)
    const today = dayKey(new Date().toISOString())
    const month = today.slice(0, 7)
    const volumen = (list: Transaccion[]) => round2(list.filter((tx) => tx.estado === 'completada' || tx.estado === 'marcada').reduce((sum, tx) => sum + tx.monto, 0))
    const postura = calcularPostura(hallazgos, incidentes, riesgos)
    const mapa = await mapaCuentas()
    const alertas = (notasRaw.data ?? []).map((row) => asNota(row as Row))
    const saldo = round2(cuentas.reduce((sum, cuenta) => sum + cuenta.saldo, 0))
    const gastosMes = (['retiro', 'transferencia_propia', 'transferencia_tercero'] as const).map((tipo) => ({
      tipo,
      total: round2(txs.filter((tx) => tx.tipo === tipo && tx.cuentaOrigenId && dayKey(tx.fecha).startsWith(month) && tx.estado !== 'rechazada').reduce((sum, tx) => sum + tx.monto, 0)),
    }))
    const base = {
      rol: view.role!,
      postura: postura.value,
      posturaNivel: postura.posturaNivel,
      canales: (['web', 'movil', 'cajero'] as const).map((canal) => ({ canal, total: txs.filter((tx) => tx.canal === canal && (tx.estado === 'completada' || tx.estado === 'marcada')).length })),
      eventosPorDia: Array.from({ length: 14 }, (_, index) => {
        const key = dayKey(new Date(Date.now() - (13 - index) * 86400000).toISOString())
        return { fecha: `${key.slice(8)}/${key.slice(5, 7)}`, total: eventos.filter((event) => dayKey(event.fecha) === key).length }
      }),
      gastosMes,
      severidad: (['baja', 'media', 'alta', 'critica'] as const).map((nivel) => ({ severidad: nivel, total: eventos.filter((event) => event.severidad === nivel).length })),
      matriz: matrizConteo(riesgos, 'antes'),
      recientes: txRaw.slice().sort((a, b) => text(b.fecha).localeCompare(text(a.fecha))).slice(0, 6).map((row) => presentarTx(row, mapa)),
      alertas,
    }
    if (view.role === 'cliente') {
      return { ...base, kpis: [
        { id: 'saldo', label: 'Saldo total', value: formatMoney(saldo), tone: 'info' as const },
        { id: 'cuentas', label: 'Cuentas', value: String(cuentas.length), tone: 'ok' as const },
        { id: 'mes', label: 'Salidas del mes', value: formatMoney(gastosMes.reduce((sum, item) => sum + item.total, 0)), tone: 'warn' as const },
        { id: 'alertas', label: 'Alertas', value: String(alertas.length), tone: alertas.length ? 'danger' as const : 'ok' as const },
      ] }
    }
    if (view.role === 'ejecutivo') {
      const bloqueadas = tarjetas.filter((tarjeta) => tarjeta.estado !== 'activa')
      return { ...base, kpis: [
        { id: 'asignados', label: 'Clientes asignados', value: String(clientes.length), tone: 'info' as const },
        { id: 'kyc', label: 'KYC pendientes', value: String(clientes.filter((cliente) => cliente.estadoKyc === 'pendiente').length), tone: 'warn' as const },
        { id: 'tarjetas', label: 'Tarjetas bloqueadas', value: String(bloqueadas.length), tone: bloqueadas.length ? 'danger' as const : 'ok' as const },
        { id: 'saldo', label: 'Saldo de la cartera', value: formatMoney(saldo), tone: 'ok' as const },
      ] }
    }
    return { ...base, kpis: [
      { id: 'clientes', label: 'Clientes activos', value: String(clientes.filter((cliente) => cliente.estado === 'activo').length), tone: 'ok' as const },
      { id: 'cuentas', label: 'Cuentas', value: String(cuentas.length), tone: 'info' as const },
      { id: 'hoy', label: 'Volumen de hoy', value: formatMoney(volumen(txs.filter((tx) => dayKey(tx.fecha) === today))), tone: 'info' as const },
      { id: 'mes', label: 'Volumen 30 días', value: formatMoney(volumen(txs.filter((tx) => Date.now() - new Date(tx.fecha).getTime() <= 30 * 86400000))), tone: 'ok' as const },
      { id: 'marcadas', label: 'Transacciones marcadas', value: String(txs.filter((tx) => tx.estado === 'marcada').length), tone: 'warn' as const },
      { id: 'incidentes', label: 'Incidentes abiertos', value: String(incidentes.filter((item) => item.estado === 'abierto' || item.estado === 'investigando').length), tone: 'danger' as const },
    ] }
  },
  async restablecerDemo() {
    throw new AppError('Los datos viven en Supabase. Este restablecimiento solo existe en el motor local.')
  },
  async listAuditoria(filters) {
    const window = span(filters.page)
    const q = safe(filters.q)
    let query = client().from('audit_logs').select('*', { count: 'exact' })
    if (filters.desde) query = query.gte('fecha', `${filters.desde}T00:00:00-06:00`)
    if (filters.hasta) query = query.lte('fecha', `${filters.hasta}T23:59:59-06:00`)
    if (q) query = query.or(`accion.ilike.%${q}%,entidad.ilike.%${q}%`)
    const { data, error, count } = await query.order('fecha', { ascending: false }).range(window.from, window.to)
    if (error) fail(error)
    return paged((data ?? []).map((row) => asAuditoria(row as Row)), count ?? 0, window.current)
  },
  async listEventos(filters) {
    const window = span(filters.page)
    let query = client().from('security_events').select('*', { count: 'exact' })
    if (filters.severidad) query = query.eq('severidad', filters.severidad)
    if (filters.tipo) query = query.eq('tipo', filters.tipo)
    const { data, error, count } = await query.order('fecha', { ascending: false }).range(window.from, window.to)
    if (error) fail(error)
    return paged((data ?? []).map((row) => asEvento(row as Row)), count ?? 0, window.current)
  },
  async listIncidentes() {
    const [incidentes, notas, usuarios] = await Promise.all([
      client().from('incidentes').select('*').order('fecha', { ascending: false }),
      client().from('incidente_notas').select('*').order('fecha'),
      client().rpc('directorio_usuarios'),
    ])
    if (incidentes.error) fail(incidentes.error)
    if (notas.error) fail(notas.error)
    if (usuarios.error) fail(usuarios.error)
    const nombres = new Map(((usuarios.data ?? []) as Array<{ id: string; nombre: string }>).map((user) => [user.id, user.nombre]))
    return (incidentes.data ?? []).map((row) => {
      const incidente = asIncidente(row as Row)
      return {
        ...incidente,
        asignadoNombre: incidente.asignadoA ? nombres.get(incidente.asignadoA) ?? 'Sin asignar' : 'Sin asignar',
        notas: ((notas.data ?? []) as Row[]).filter((nota) => text(nota.incidente_id) === incidente.id).map((nota) => ({
          id: text(nota.id),
          incidenteId: text(nota.incidente_id),
          userId: text(nota.user_id),
          texto: text(nota.texto),
          fecha: text(nota.fecha),
          autor: nombres.get(text(nota.user_id)) ?? 'Usuario',
        })),
      }
    })
  },
  async saveIncidente(input) {
    const body = input as { id?: string; titulo: string; descripcion: string; severidad: string; estado: string; asignadoA: string | null }
    if (body.id) {
      const { data, error } = await client().from('incidentes').update({
        titulo: body.titulo, descripcion: body.descripcion, severidad: body.severidad, estado: body.estado, asignado_a: body.asignadoA || null,
      }).eq('id', body.id).select('*').single()
      if (error) fail(error)
      return asIncidente(data as Row)
    }
    const codigo = await call<string>('siguiente_codigo', { p_kind: 'incidente' })
    const { data, error } = await client().from('incidentes').insert({
      codigo, titulo: body.titulo, descripcion: body.descripcion, severidad: body.severidad, estado: body.estado, asignado_a: body.asignadoA || null,
    }).select('*').single()
    if (error) fail(error)
    return asIncidente(data as Row)
  },
  async setIncidenteEstado(id, estado: EstadoIncidente, asignadoA) {
    const { data, error } = await client().from('incidentes').update({ estado, asignado_a: asignadoA }).eq('id', id).select('*').single()
    if (error) fail(error)
    return asIncidente(data as Row)
  },
  async addNota(id, texto) {
    const view = await ready()
    const { data, error } = await client().from('incidente_notas').insert({ incidente_id: id, user_id: view.userId, texto }).select('*').single()
    if (error) fail(error)
    const row = data as Row
    return { id: text(row.id), incidenteId: text(row.incidente_id), userId: text(row.user_id), texto: text(row.texto), fecha: text(row.fecha) }
  },
  async listDispositivos() {
    const view = await ready()
    const { data, error } = await client().from('dispositivos').select('*').order('ultimo_acceso', { ascending: false })
    if (error) fail(error)
    const usuarios = view.role === 'admin' || view.role === 'auditor_seguridad' ? await client().rpc('directorio_usuarios') : { data: [], error: null }
    if (usuarios.error) fail(usuarios.error)
    const nombres = new Map(((usuarios.data ?? []) as Array<{ id: string; nombre: string }>).map((user) => [user.id, user.nombre]))
    return ((data ?? []) as Row[]).map((row) => ({
      id: text(row.id),
      userId: text(row.user_id),
      clienteId: nullable(row.cliente_id),
      nombre: text(row.nombre),
      pais: text(row.pais),
      ip: text(row.ip),
      confianza: Boolean(row.confianza),
      ultimoAcceso: text(row.ultimo_acceso),
      usuario: text(row.user_id) === view.userId ? view.nombre ?? '—' : nombres.get(text(row.user_id)) ?? '—',
    } satisfies Dispositivo & { usuario: string }))
  },
  async setConfianza(id, confianza) {
    const { data, error } = await client().from('dispositivos').update({ confianza }).eq('id', id).select('*').single()
    if (error) fail(error)
    const row = data as Row
    return {
      id: text(row.id), userId: text(row.user_id), clienteId: nullable(row.cliente_id), nombre: text(row.nombre),
      pais: text(row.pais), ip: text(row.ip), confianza: Boolean(row.confianza), ultimoAcceso: text(row.ultimo_acceso),
    }
  },
  async listActivos() {
    return (await rows('activos')).map(asActivo)
  },
  async saveActivo(input) {
    const body = input as Omit<Activo, 'id' | 'codigo' | 'criticidad'>
    const codigo = await call<string>('siguiente_codigo', { p_kind: 'activo' })
    const { data, error } = await client().from('activos').insert({
      codigo, nombre: body.nombre, proceso: body.proceso, tipo: body.tipo, ubicacion: body.ubicacion,
      confidencialidad: body.confidencialidad, integridad: body.integridad, disponibilidad: body.disponibilidad,
      propietario: body.propietario, custodio: body.custodio,
    }).select('*').single()
    if (error) fail(error)
    return asActivo(data as Row)
  },
  async listAmenazas() {
    return (await rows('amenazas')).map(asAmenaza)
  },
  async saveAmenaza(input) {
    const body = input as Omit<Amenaza, 'id' | 'codigo' | 'promedio' | 'nivel'>
    const codigo = await call<string>('siguiente_codigo', { p_kind: 'amenaza' })
    const { data, error } = await client().from('amenazas').insert({
      codigo, nombre: body.nombre, descripcion: body.descripcion, categoria: body.categoria, damage: body.damage,
      reproducibility: body.reproducibility, exploitability: body.exploitability, affected_users: body.affectedUsers,
      discoverability: body.discoverability, activo_id: body.activoId,
    }).select('*').single()
    if (error) fail(error)
    return asAmenaza(data as Row)
  },
  async listRiesgos() {
    return (await rows('riesgos')).map(asRiesgo)
  },
  async saveRiesgo(input) {
    const body = input as Omit<Riesgo, 'id' | 'codigo' | 'riesgoInherente' | 'riesgoResidual'>
    const codigo = await call<string>('siguiente_codigo', { p_kind: 'riesgo' })
    const { data, error } = await client().from('riesgos').insert({
      codigo, titulo: body.titulo, descripcion: body.descripcion, probabilidad: body.probabilidad, impacto: body.impacto,
      controles: body.controles, probabilidad_residual: body.probabilidadResidual, impacto_residual: body.impactoResidual,
      tipo: body.tipo, tipo_impacto: body.tipoImpacto, tratamiento: body.tratamiento, activo_id: body.activoId,
    }).select('*').single()
    if (error) fail(error)
    return asRiesgo(data as Row)
  },
  async listHallazgos() {
    const { data, error } = await client().from('hallazgos').select('*, activos(nombre)').order('codigo')
    if (error) fail(error)
    return (data ?? []).map((row) => ({ ...asHallazgo(row as Row), activoNombre: text((row as Row).activos && ((row as Row).activos as Row).nombre) || '—' }))
  },
  async saveHallazgo(input) {
    const body = input as Hallazgo
    const role = await call<Role>('current_app_role')
    if (role === 'auditor_seguridad') {
      if (!body.id) throw new AppError('No tiene permiso para esta operación.')
      const { data, error } = await client().from('hallazgos').update({ estado: body.estado }).eq('id', body.id).select('*').single()
      if (error) fail(error)
      return asHallazgo(data as Row)
    }
    const record = {
      titulo: body.titulo, origen: body.origen, owasp: body.owasp, severidad: body.severidad, cvss: body.cvss,
      activo_id: body.activoId, evidencia: body.evidencia, recomendacion: body.recomendacion, responsable: body.responsable,
      estado: body.estado, fecha_limite: body.fechaLimite, capa: body.capa,
    }
    const saved = body.id
      ? await client().from('hallazgos').update(record).eq('id', body.id).select('*').single()
      : await client().from('hallazgos').insert({ ...record, codigo: await call<string>('siguiente_codigo', { p_kind: 'hallazgo' }) }).select('*').single()
    if (saved.error) fail(saved.error)
    return asHallazgo(saved.data as Row)
  },
  async listCasos() {
    return (await rows('casos_abuso')).map(asCaso)
  },
  async saveCaso(input) {
    const body = input as Omit<CasoAbuso, 'id' | 'codigo'>
    const codigo = await call<string>('siguiente_codigo', { p_kind: 'caso' })
    const { data, error } = await client().from('casos_abuso').insert({
      codigo, titulo: body.titulo, descripcion: body.descripcion, control: body.control, hallazgo_id: body.hallazgoId,
    }).select('*').single()
    if (error) fail(error)
    return asCaso(data as Row)
  },
  async listNotificaciones() {
    const view = await ready()
    const { data, error } = await client().from('notificaciones').select('*').eq('user_id', view.userId).order('fecha', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map((row) => asNota(row as Row))
  },
  async marcarNotificacion(id) {
    const { data, error } = await client().from('notificaciones').update({ leida: true }).eq('id', id).select('*').single()
    if (error) fail(error)
    return asNota(data as Row)
  },
  async marcarTodas() {
    const view = await ready()
    const { error } = await client().from('notificaciones').update({ leida: true }).eq('user_id', view.userId).eq('leida', false)
    if (error) fail(error)
    return { ok: true }
  },
  async listadoReportes() {
    const view = await ready()
    return listadoReportes(view.role!)
  },
  async generarReporte(id: ReportId, filters: ReportFilters) {
    const view = await ready()
    const [clientes, cuentas, transacciones, auditLogs, securityEvents, incidentes, activos, riesgos, amenazas, hallazgos, casos] = await Promise.all([
      rows('clientes_visibles'), rows('cuentas'), rows('transacciones'), rows('audit_logs'), rows('security_events'),
      rows('incidentes'), rows('activos'), rows('riesgos'), rows('amenazas'), rows('hallazgos'), rows('casos_abuso'),
    ])
    return armarReporte({
      role: view.role!,
      nombre: view.nombre ?? '',
      email: view.email ?? '',
      clienteId: view.clienteId ?? null,
      clientes: clientes.map(asCliente),
      cuentas: cuentas.map(asCuenta),
      transacciones: transacciones.map(asTx),
      auditLogs: auditLogs.map(asAuditoria),
      securityEvents: securityEvents.map(asEvento),
      incidentes: incidentes.map(asIncidente),
      activos: activos.map(asActivo),
      riesgos: riesgos.map(asRiesgo),
      amenazas: amenazas.map(asAmenaza),
      hallazgos: hallazgos.map(asHallazgo),
      casos: casos.map(asCaso),
    }, id, filters)
  },
  async registrarExportacion(id, formato) {
    await call('registrar_exportacion', { p_reporte: id, p_formato: formato })
    return { ok: true }
  },
}
