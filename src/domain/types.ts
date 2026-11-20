export type Role = 'admin' | 'auditor_seguridad' | 'ejecutivo' | 'cliente'
export type Nivel = 'bajo' | 'medio' | 'alto'
export type Severidad = 'baja' | 'media' | 'alta' | 'critica'
export type Cia = 'Alta' | 'Media' | 'Baja'
export type Kyc = 'pendiente' | 'verificado' | 'rechazado'
export type EstadoCliente = 'activo' | 'inactivo' | 'bloqueado'
export type TipoCuenta = 'monetaria' | 'ahorro' | 'inversion'
export type EstadoCuenta = 'activa' | 'bloqueada'
export type TipoTx = 'deposito' | 'retiro' | 'transferencia_propia' | 'transferencia_tercero' | 'reversion'
export type EstadoTx = 'completada' | 'pendiente' | 'rechazada' | 'marcada'
export type Canal = 'movil' | 'web' | 'cajero'
export type TipoTarjeta = 'debito' | 'credito'
export type MarcaTarjeta = 'Visa' | 'Mastercard'
export type EstadoTarjeta = 'activa' | 'bloqueada' | 'reportada'
export type TipoActivo = 'informacion' | 'software' | 'fisico' | 'personal' | 'servicios'
export type Ubicacion = 'cloud' | 'movil' | 'repositorio'
export type Stride =
  | 'Spoofing'
  | 'Tampering'
  | 'Repudiation'
  | 'Information Disclosure'
  | 'Denial of Service'
  | 'Elevation of Privilege'
export type TipoRiesgo = 'software' | 'seguridad' | 'tecnico' | 'cloud'
export type TipoImpacto = 'reputacional' | 'operacional' | 'financiero' | 'legal'
export type Tratamiento = 'aceptar' | 'eliminar' | 'evitar' | 'mitigar' | 'transferir'
export type OrigenHallazgo = 'pentest_caja_negra' | 'pentest_caja_gris' | 'sast' | 'sca' | 'iac' | 'contenedores'
export type Owasp = 'API1' | 'API2' | 'API3' | 'API4' | 'API5' | 'API6' | 'API7' | 'API8' | 'API9' | 'API10'
export type EstadoHallazgo = 'abierto' | 'en_progreso' | 'mitigado' | 'aceptado'
export type Capa = 'datos' | 'aplicacion' | 'host' | 'red_interna' | 'perimetro' | 'fisica' | 'politicas'
export type EstadoIncidente = 'abierto' | 'investigando' | 'contenido' | 'cerrado'
export type TipoEvento =
  | 'login_fallido'
  | 'dispositivo_nuevo'
  | 'transferencia_inusual'
  | 'acceso_no_autorizado'
  | 'pais_diferente'
  | 'rafaga_transferencias'
  | 'umbral_monto'
export type ReportId =
  | 'ejecutivo_negocio'
  | 'estado_cuenta'
  | 'transacciones_periodo'
  | 'transacciones_marcadas'
  | 'auditoria'
  | 'eventos_incidentes'
  | 'activos_iso'
  | 'riesgos'
  | 'hallazgos'
  | 'kyc'
export type ExportFormat = 'pdf' | 'xlsx' | 'csv'

export interface User {
  id: string
  email: string
  nombre: string
  passwordHash: string
  paisHabitual: string
}

export interface UserRoleRow {
  userId: string
  role: Role
}

export interface Profile {
  userId: string
  nombre: string
  email: string
  telefono: string
  creadoEn: string
}

export interface Cliente {
  id: string
  codigo: string
  userId: string | null
  nombres: string
  apellidos: string
  dpi: string
  nit: string
  correo: string
  telefono: string
  direccion: string
  fechaNacimiento: string
  nivelRiesgo: Nivel
  estadoKyc: Kyc
  estado: EstadoCliente
  fechaAlta: string
}

export interface Cuenta {
  id: string
  numero: string
  clienteId: string
  tipo: TipoCuenta
  moneda: 'GTQ'
  saldo: number
  limiteDiario: number
  estado: EstadoCuenta
  fechaApertura: string
}

export interface Transaccion {
  id: string
  referencia: string
  tipo: TipoTx
  monto: number
  cuentaOrigenId: string | null
  cuentaDestinoId: string | null
  beneficiarioId: string | null
  estado: EstadoTx
  canal: Canal
  ip: string
  dispositivo: string
  fecha: string
  idempotencyKey: string
  usuarioId: string | null
  referenciaOrigen: string | null
  motivo: string | null
}

export interface Beneficiario {
  id: string
  clienteId: string
  nombre: string
  numeroCuenta: string
  banco: string
  alias: string
  creadoEn: string
}

export interface Tarjeta {
  id: string
  clienteId: string
  cuentaId: string
  tipo: TipoTarjeta
  marca: MarcaTarjeta
  ultimos4: string
  vencimiento: string
  estado: EstadoTarjeta
  limiteDiario: number
  limiteMensual: number
}

export interface AuditLog {
  id: string
  userId: string | null
  accion: string
  entidad: string
  entidadId: string | null
  ip: string
  dispositivo: string
  resultado: 'exito' | 'fallo'
  detalle: string | null
  fecha: string
}

export interface SecurityEvent {
  id: string
  tipo: TipoEvento
  severidad: Severidad
  descripcion: string
  userId: string | null
  ip: string
  pais: string
  dispositivo: string
  fecha: string
}

export interface Incidente {
  id: string
  codigo: string
  titulo: string
  descripcion: string
  severidad: Severidad
  estado: EstadoIncidente
  asignadoA: string | null
  fecha: string
}

export interface IncidenteNota {
  id: string
  incidenteId: string
  userId: string
  texto: string
  fecha: string
}

export interface Dispositivo {
  id: string
  userId: string
  clienteId: string | null
  nombre: string
  pais: string
  ip: string
  confianza: boolean
  ultimoAcceso: string
}

export interface Activo {
  id: string
  codigo: string
  nombre: string
  proceso: string
  tipo: TipoActivo
  ubicacion: Ubicacion
  confidencialidad: Cia
  integridad: Cia
  disponibilidad: Cia
  criticidad: Cia
  propietario: string
  custodio: string
}

export interface Amenaza {
  id: string
  codigo: string
  nombre: string
  descripcion: string
  categoria: Stride
  damage: number
  reproducibility: number
  exploitability: number
  affectedUsers: number
  discoverability: number
  promedio: number
  nivel: 'bajo' | 'medio' | 'alto' | 'critico'
  activoId: string
}

export interface Riesgo {
  id: string
  codigo: string
  titulo: string
  descripcion: string
  probabilidad: number
  impacto: number
  riesgoInherente: number
  controles: string
  probabilidadResidual: number
  impactoResidual: number
  riesgoResidual: number
  tipo: TipoRiesgo
  tipoImpacto: TipoImpacto
  tratamiento: Tratamiento
  activoId: string
}

export interface Hallazgo {
  id: string
  codigo: string
  titulo: string
  origen: OrigenHallazgo
  owasp: Owasp
  severidad: Severidad
  cvss: number
  activoId: string
  evidencia: string
  recomendacion: string
  responsable: string
  estado: EstadoHallazgo
  fechaLimite: string
  capa: Capa
}

export interface CasoAbuso {
  id: string
  codigo: string
  titulo: string
  descripcion: string
  control: string
  hallazgoId: string
}

export interface Notificacion {
  id: string
  userId: string
  tipo: string
  titulo: string
  mensaje: string
  severidad: Severidad | 'info'
  leida: boolean
  fecha: string
}

export interface LoginAttempt {
  id: string
  email: string
  userId: string | null
  exito: boolean
  ip: string
  dispositivo: string
  fecha: string
}

export interface AccountLock {
  userId: string
  until: string
  reason: string
}

export interface OtpCode {
  id: string
  userId: string
  purpose: 'login' | 'transfer'
  codeHash: string
  expiresAt: number
  attempts: number
  used: boolean
  draftId: string | null
  createdAt: number
}

export interface SessionRow {
  token: string
  userId: string
  mfaVerified: boolean
  lastActivity: number
  tag: string
  ip: string
  device: string
  pais: string
  createdAt: number
}

export interface Draft {
  id: string
  userId: string
  cuentaOrigenId: string
  cuentaDestinoId: string | null
  beneficiarioId: string | null
  monto: number
  canal: Canal
  idempotencyKey: string
  otpId: string
  expiresAt: number
  createdAt: number
}

export interface Asignacion {
  ejecutivoUserId: string
  clienteId: string
}

export interface Database {
  users: User[]
  userRoles: UserRoleRow[]
  profiles: Profile[]
  clientes: Cliente[]
  cuentas: Cuenta[]
  transacciones: Transaccion[]
  beneficiarios: Beneficiario[]
  tarjetas: Tarjeta[]
  auditLogs: AuditLog[]
  securityEvents: SecurityEvent[]
  incidentes: Incidente[]
  notas: IncidenteNota[]
  dispositivos: Dispositivo[]
  activos: Activo[]
  amenazas: Amenaza[]
  riesgos: Riesgo[]
  hallazgos: Hallazgo[]
  casos: CasoAbuso[]
  notificaciones: Notificacion[]
  loginAttempts: LoginAttempt[]
  locks: AccountLock[]
  otps: OtpCode[]
  sessions: SessionRow[]
  drafts: Draft[]
  asignaciones: Asignacion[]
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pages: number
  pageSize: number
}

export interface SessionView {
  status: 'anonymous' | 'mfa' | 'ready'
  userId?: string
  email?: string
  nombre?: string
  role?: Role
  clienteId?: string | null
}

export interface CuentaVista extends Cuenta {
  clienteNombre: string
  clienteCodigo: string
}

export interface TransaccionVista extends Transaccion {
  origenNumero: string | null
  destinoNumero: string | null
  clienteNombre: string
}

export interface Kpi {
  id: string
  label: string
  value: string
  hint?: string
  tone: 'ok' | 'warn' | 'danger' | 'info'
}

export interface Resumen {
  rol: Role
  postura: number
  posturaNivel: 'solida' | 'aceptable' | 'debil'
  kpis: Kpi[]
  canales: { canal: string; total: number }[]
  eventosPorDia: { fecha: string; total: number }[]
  gastosMes: { tipo: string; total: number }[]
  severidad: { severidad: string; total: number }[]
  matriz: number[][]
  recientes: TransaccionVista[]
  alertas: Notificacion[]
}

export interface ReportFilters {
  desde?: string
  hasta?: string
  clienteId?: string
  tipo?: string
  estado?: string
}

export interface ReportDocument {
  id: ReportId
  titulo: string
  subtitulo: string
  generadoPor: string
  fechaGeneracion: string
  kpis: { label: string; value: string; tone?: 'ok' | 'warn' | 'danger' }[]
  columnas: string[]
  filas: string[][]
  detalleTitulo: string
  detalleColumnas: string[]
  detalleFilas: string[][]
  notas: string[]
}

export interface ReportMeta {
  id: ReportId
  titulo: string
  descripcion: string
}
