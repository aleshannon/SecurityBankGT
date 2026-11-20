import type { Capa, OrigenHallazgo, Owasp, Role, Tratamiento } from './types'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  auditor_seguridad: 'Auditor de seguridad',
  ejecutivo: 'Ejecutivo de servicio',
  cliente: 'Cliente',
}

export const OWASP_LABEL: Record<Owasp, string> = {
  API1: 'API1 BOLA',
  API2: 'API2 Autenticación rota',
  API3: 'API3 Autorización de propiedades',
  API4: 'API4 Consumo de recursos sin límite',
  API5: 'API5 Autorización de funciones',
  API6: 'API6 Flujos de negocio sin restricción',
  API7: 'API7 SSRF',
  API8: 'API8 Configuración incorrecta',
  API9: 'API9 Gestión de inventario',
  API10: 'API10 Consumo inseguro de APIs',
}

export const ORIGEN_LABEL: Record<OrigenHallazgo, string> = {
  pentest_caja_negra: 'Pentest caja negra',
  pentest_caja_gris: 'Pentest caja gris',
  sast: 'SAST',
  sca: 'SCA',
  iac: 'IaC',
  contenedores: 'Contenedores',
}

export const CAPA_LABEL: Record<Capa, string> = {
  datos: 'Datos',
  aplicacion: 'Aplicación',
  host: 'Host',
  red_interna: 'Red interna',
  perimetro: 'Perímetro',
  fisica: 'Seguridad física',
  politicas: 'Políticas',
}

export const CAPAS: { id: Capa; descripcion: string }[] = [
  { id: 'datos', descripcion: 'Bases, archivos y datos personales en reposo o en tránsito.' },
  { id: 'aplicacion', descripcion: 'Portal, aplicación móvil y lógica de negocio.' },
  { id: 'host', descripcion: 'Sistemas operativos, contenedores y almacenes del dispositivo.' },
  { id: 'red_interna', descripcion: 'Comunicación entre servicios y redes de confianza.' },
  { id: 'perimetro', descripcion: 'Borde expuesto: identidad, WAF y límites de acceso.' },
  { id: 'fisica', descripcion: 'Instalaciones, consolas y acceso de personas.' },
  { id: 'politicas', descripcion: 'Normas, inventario y gobierno de la seguridad.' },
]

export const TRATAMIENTO_LABEL: Record<Tratamiento, string> = {
  aceptar: 'Aceptar',
  eliminar: 'Eliminar',
  evitar: 'Evitar',
  mitigar: 'Mitigar',
  transferir: 'Transferir',
}

export const ESTADO_TX: Record<string, string> = {
  completada: 'Completada',
  pendiente: 'Pendiente',
  rechazada: 'Rechazada',
  marcada: 'Marcada',
}

export const TIPO_TX: Record<string, string> = {
  deposito: 'Depósito',
  retiro: 'Retiro',
  transferencia_propia: 'Transferencia propia',
  transferencia_tercero: 'Transferencia a tercero',
  reversion: 'Reversión',
}

export const CANAL_LABEL: Record<string, string> = {
  movil: 'Móvil',
  web: 'Web',
  cajero: 'Cajero',
}

export const KYC_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  verificado: 'Verificado',
  rechazado: 'Rechazado',
}

export const CLIENTE_ESTADO: Record<string, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  bloqueado: 'Bloqueado',
}

export const CUENTA_TIPO: Record<string, string> = {
  monetaria: 'Monetaria',
  ahorro: 'Ahorro',
  inversion: 'Inversión',
}

export const RIESGO_NIVEL: Record<string, string> = {
  bajo: 'Bajo',
  medio: 'Medio',
  alto: 'Alto',
  critico: 'Crítico',
}

export const SEVERIDAD: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
}

export const HALLAZGO_ESTADO: Record<string, string> = {
  abierto: 'Abierto',
  en_progreso: 'En progreso',
  mitigado: 'Mitigado',
  aceptado: 'Aceptado',
}

export const INCIDENTE_ESTADO: Record<string, string> = {
  abierto: 'Abierto',
  investigando: 'Investigando',
  contenido: 'Contenido',
  cerrado: 'Cerrado',
}

export const TARJETA_ESTADO: Record<string, string> = {
  activa: 'Activa',
  bloqueada: 'Bloqueada',
  reportada: 'Reportada',
}

export const ACTIVO_TIPO: Record<string, string> = {
  informacion: 'Información',
  software: 'Software',
  fisico: 'Físico',
  personal: 'Personal',
  servicios: 'Servicios',
}

export const UBICACION: Record<string, string> = {
  cloud: 'Cloud',
  movil: 'Móvil',
  repositorio: 'Repositorio',
}

export const STRIDE: Record<string, string> = {
  Spoofing: 'Suplantación',
  Tampering: 'Manipulación',
  Repudiation: 'Repudio',
  'Information Disclosure': 'Divulgación de información',
  'Denial of Service': 'Denegación de servicio',
  'Elevation of Privilege': 'Elevación de privilegios',
}

export function toneFor(value: string): 'ok' | 'warn' | 'danger' | 'info' | 'neutral' {
  if (['activo', 'activa', 'completada', 'verificado', 'bajo', 'baja', 'cerrado', 'mitigado', 'solida', 'contenida'].includes(value)) {
    return 'ok'
  }
  if (['pendiente', 'medio', 'media', 'investigando', 'en_progreso', 'aceptable'].includes(value)) return 'warn'
  if (['alto', 'alta', 'marcada', 'bloqueado', 'bloqueada', 'reportada'].includes(value)) return 'danger'
  if (['critico', 'critica', 'rechazado', 'rechazada', 'inactivo', 'debil', 'abierto'].includes(value)) return 'danger'
  if (['info'].includes(value)) return 'info'
  return 'neutral'
}
