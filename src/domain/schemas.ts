import { z } from 'zod'
import { AppError } from './errors'
import { ageFromIso } from './format'

export const passwordSchema = z
  .string()
  .min(12, 'Mínimo 12 caracteres.')
  .regex(/[A-Z]/, 'Incluya al menos una mayúscula.')
  .regex(/\d/, 'Incluya al menos un número.')
  .regex(/[^A-Za-z0-9]/, 'Incluya al menos un símbolo.')

export const loginSchema = z.object({
  email: z.string().trim().email('Ingrese un correo válido.'),
  password: z.string().min(1, 'Ingrese la contraseña.'),
  simulateForeign: z.boolean(),
})

export const registerSchema = z.object({
  nombre: z.string().trim().min(3, 'Ingrese su nombre completo.').max(80),
  apellidos: z.string().trim().min(3, 'Ingrese sus apellidos.').max(80),
  email: z.string().trim().email('Ingrese un correo válido.'),
  password: passwordSchema,
  telefono: z.string().regex(/^\+502 \d{4} \d{4}$/, 'Use el formato +502 5555 0101.'),
  dpi: z.string().regex(/^\d{13}$/, 'El DPI debe tener 13 dígitos.'),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Seleccione la fecha de nacimiento.').refine((value) => ageFromIso(value) >= 18, 'Debe ser mayor de edad.'),
})

export const clienteSchema = z.object({
  nombres: z.string().trim().min(2, 'Ingrese los nombres.').max(60),
  apellidos: z.string().trim().min(2, 'Ingrese los apellidos.').max(60),
  dpi: z.string().regex(/^\d{13}$/, 'El DPI debe tener 13 dígitos.'),
  nit: z.string().regex(/^\d{6,8}-\d$/, 'Use el formato 1234567-8.'),
  correo: z.string().trim().email('Ingrese un correo válido.'),
  telefono: z.string().regex(/^\+502 \d{4} \d{4}$/, 'Use el formato +502 5555 0101.'),
  direccion: z.string().trim().min(8, 'Ingrese la dirección.').max(160),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Seleccione la fecha.').refine((value) => ageFromIso(value) >= 18, 'El cliente debe ser mayor de edad.'),
  nivelRiesgo: z.enum(['bajo', 'medio', 'alto']),
  estadoKyc: z.enum(['pendiente', 'verificado', 'rechazado']),
  estado: z.enum(['activo', 'inactivo', 'bloqueado']),
})

export const cuentaSchema = z.object({
  clienteId: z.string().min(1, 'Seleccione un cliente.'),
  tipo: z.enum(['monetaria', 'ahorro', 'inversion']),
  limiteDiario: z.number().positive('El límite debe ser mayor a cero.').max(1_000_000),
})

export const montoSchema = z.object({
  cuentaId: z.string().min(1, 'Seleccione una cuenta.'),
  monto: z.number().positive('El monto debe ser mayor a cero.').max(1_000_000),
  canal: z.enum(['movil', 'web', 'cajero']),
  idempotencyKey: z.string().min(8).max(80),
})

export const transferenciaSchema = z.object({
  cuentaOrigenId: z.string().min(1, 'Seleccione la cuenta de origen.'),
  destino: z.enum(['propia', 'beneficiario']),
  cuentaDestinoId: z.string().optional(),
  beneficiarioId: z.string().optional(),
  monto: z.number().positive('El monto debe ser mayor a cero.').max(1_000_000),
  canal: z.enum(['movil', 'web', 'cajero']),
  idempotencyKey: z.string().min(8).max(80),
}).superRefine((value, ctx) => {
  if (value.destino === 'propia' && !value.cuentaDestinoId) {
    ctx.addIssue({ code: 'custom', message: 'Seleccione la cuenta destino.', path: ['cuentaDestinoId'] })
  }
  if (value.destino === 'beneficiario' && !value.beneficiarioId) {
    ctx.addIssue({ code: 'custom', message: 'Seleccione un beneficiario.', path: ['beneficiarioId'] })
  }
})

export const beneficiarioSchema = z.object({
  clienteId: z.string().min(1, 'Seleccione el cliente.'),
  nombre: z.string().trim().min(3).max(80),
  numeroCuenta: z.string().trim().min(6).max(30),
  banco: z.string().trim().min(2).max(60),
  alias: z.string().trim().min(2).max(40),
})

export const tarjetaSchema = z.object({
  clienteId: z.string().min(1),
  cuentaId: z.string().min(1, 'Seleccione la cuenta.'),
  tipo: z.enum(['debito', 'credito']),
  marca: z.enum(['Visa', 'Mastercard']),
  ultimos4: z.string().regex(/^\d{4}$/, 'Ingrese solo los últimos 4 dígitos.'),
  vencimiento: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use el formato mm/aa.'),
  limiteDiario: z.number().positive().max(200_000),
  limiteMensual: z.number().positive().max(1_000_000),
}).strict()

export const activoSchema = z.object({
  nombre: z.string().trim().min(3).max(80),
  proceso: z.string().trim().min(3).max(80),
  tipo: z.enum(['informacion', 'software', 'fisico', 'personal', 'servicios']),
  ubicacion: z.enum(['cloud', 'movil', 'repositorio']),
  confidencialidad: z.enum(['Alta', 'Media', 'Baja']),
  integridad: z.enum(['Alta', 'Media', 'Baja']),
  disponibilidad: z.enum(['Alta', 'Media', 'Baja']),
  propietario: z.string().trim().min(3).max(80),
  custodio: z.string().trim().min(3).max(80),
})

const score10 = z.number().int().min(1, 'Use un valor de 1 a 10.').max(10)
const score5 = z.number().int().min(1, 'Use un valor de 1 a 5.').max(5)

export const amenazaSchema = z.object({
  nombre: z.string().trim().min(3).max(100),
  descripcion: z.string().trim().min(8).max(400),
  categoria: z.enum(['Spoofing', 'Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service', 'Elevation of Privilege']),
  damage: score10,
  reproducibility: score10,
  exploitability: score10,
  affectedUsers: score10,
  discoverability: score10,
  activoId: z.string().min(1, 'Seleccione un activo.'),
})

export const riesgoSchema = z.object({
  titulo: z.string().trim().min(3).max(120),
  descripcion: z.string().trim().min(8).max(400),
  probabilidad: score5,
  impacto: score5,
  controles: z.string().trim().min(3).max(400),
  probabilidadResidual: score5,
  impactoResidual: score5,
  tipo: z.enum(['software', 'seguridad', 'tecnico', 'cloud']),
  tipoImpacto: z.enum(['reputacional', 'operacional', 'financiero', 'legal']),
  tratamiento: z.enum(['aceptar', 'eliminar', 'evitar', 'mitigar', 'transferir']),
  activoId: z.string().min(1),
})

export const hallazgoSchema = z.object({
  titulo: z.string().trim().min(3).max(140),
  origen: z.enum(['pentest_caja_negra', 'pentest_caja_gris', 'sast', 'sca', 'iac', 'contenedores']),
  owasp: z.enum(['API1', 'API2', 'API3', 'API4', 'API5', 'API6', 'API7', 'API8', 'API9', 'API10']),
  severidad: z.enum(['baja', 'media', 'alta', 'critica']),
  cvss: z.number().min(0).max(10),
  activoId: z.string().min(1),
  evidencia: z.string().trim().min(8).max(500),
  recomendacion: z.string().trim().min(8).max(500),
  responsable: z.string().trim().min(3).max(80),
  estado: z.enum(['abierto', 'en_progreso', 'mitigado', 'aceptado']),
  fechaLimite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Seleccione la fecha límite.'),
  capa: z.enum(['datos', 'aplicacion', 'host', 'red_interna', 'perimetro', 'fisica', 'politicas']),
})

export const casoSchema = z.object({
  titulo: z.string().trim().min(3).max(140),
  descripcion: z.string().trim().min(8).max(500),
  control: z.string().trim().min(8).max(500),
  hallazgoId: z.string().min(1, 'Relacione un hallazgo.'),
})

export const incidenteSchema = z.object({
  titulo: z.string().trim().min(3).max(140),
  descripcion: z.string().trim().min(8).max(500),
  severidad: z.enum(['baja', 'media', 'alta', 'critica']),
  estado: z.enum(['abierto', 'investigando', 'contenido', 'cerrado']),
  asignadoA: z.string().nullable(),
})

export const notaSchema = z.object({
  texto: z.string().trim().min(3, 'Escriba una nota.').max(500),
})

export const otpSchema = z.string().regex(/^\d{6}$/, 'Ingrese el código de 6 dígitos.')

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new AppError(result.error.issues[0]?.message ?? 'Los datos no son válidos.')
  }
  return result.data
}
