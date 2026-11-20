import { isoDate } from '@/domain/format'
import { criticidadDe, nivelDread, promedioDread } from '@/domain/posture'
import type { Activo, Amenaza, CasoAbuso, Cia, Hallazgo, Incidente, IncidenteNota, Riesgo } from '@/domain/types'

function activo(
  partial: Omit<Activo, 'criticidad'> & { confidencialidad: Cia; integridad: Cia; disponibilidad: Cia },
): Activo {
  return {
    ...partial,
    criticidad: criticidadDe(partial.confidencialidad, partial.integridad, partial.disponibilidad),
  }
}

function amenaza(
  partial: Omit<Amenaza, 'promedio' | 'nivel'>,
): Amenaza {
  const promedio = promedioDread([
    partial.damage,
    partial.reproducibility,
    partial.exploitability,
    partial.affectedUsers,
    partial.discoverability,
  ])
  return { ...partial, promedio, nivel: nivelDread(promedio) }
}

function riesgo(partial: Omit<Riesgo, 'riesgoInherente' | 'riesgoResidual'>): Riesgo {
  return {
    ...partial,
    riesgoInherente: partial.probabilidad * partial.impacto,
    riesgoResidual: partial.probabilidadResidual * partial.impactoResidual,
  }
}

export const ACTIVOS: Activo[] = [
  activo({ id: 'ast-01', codigo: 'AST-01', nombre: 'Aplicación móvil SecurityBankGT', proceso: 'Banca móvil', tipo: 'software', ubicacion: 'movil', confidencialidad: 'Alta', integridad: 'Alta', disponibilidad: 'Media', propietario: 'Gerencia de canales', custodio: 'Equipo móvil' }),
  activo({ id: 'ast-02', codigo: 'AST-02', nombre: 'Portal web de banca', proceso: 'Banca por internet', tipo: 'software', ubicacion: 'cloud', confidencialidad: 'Alta', integridad: 'Alta', disponibilidad: 'Alta', propietario: 'Gerencia de canales', custodio: 'Equipo web' }),
  activo({ id: 'ast-03', codigo: 'AST-03', nombre: 'API Gateway', proceso: 'Exposición de servicios', tipo: 'software', ubicacion: 'cloud', confidencialidad: 'Alta', integridad: 'Alta', disponibilidad: 'Alta', propietario: 'Arquitectura', custodio: 'Plataforma' }),
  activo({ id: 'ast-04', codigo: 'AST-04', nombre: 'Microservicio de pagos', proceso: 'Transferencias', tipo: 'software', ubicacion: 'cloud', confidencialidad: 'Alta', integridad: 'Alta', disponibilidad: 'Alta', propietario: 'Operaciones', custodio: 'Equipo de pagos' }),
  activo({ id: 'ast-05', codigo: 'AST-05', nombre: 'Base de datos transaccional', proceso: 'Registro contable', tipo: 'informacion', ubicacion: 'cloud', confidencialidad: 'Alta', integridad: 'Alta', disponibilidad: 'Alta', propietario: 'Datos', custodio: 'Administración de base de datos' }),
  activo({ id: 'ast-06', codigo: 'AST-06', nombre: 'Keystore del dispositivo', proceso: 'Custodia de claves', tipo: 'software', ubicacion: 'movil', confidencialidad: 'Alta', integridad: 'Alta', disponibilidad: 'Media', propietario: 'Seguridad', custodio: 'Equipo móvil' }),
  activo({ id: 'ast-07', codigo: 'AST-07', nombre: 'Servicio de identidad', proceso: 'Autenticación', tipo: 'servicios', ubicacion: 'cloud', confidencialidad: 'Alta', integridad: 'Alta', disponibilidad: 'Alta', propietario: 'Seguridad', custodio: 'Plataforma' }),
  activo({ id: 'ast-08', codigo: 'AST-08', nombre: 'Bucket de logs', proceso: 'Evidencia y monitoreo', tipo: 'informacion', ubicacion: 'cloud', confidencialidad: 'Alta', integridad: 'Media', disponibilidad: 'Media', propietario: 'Seguridad', custodio: 'SRE' }),
  activo({ id: 'ast-09', codigo: 'AST-09', nombre: 'Repositorio de código', proceso: 'Control de versiones', tipo: 'software', ubicacion: 'repositorio', confidencialidad: 'Media', integridad: 'Alta', disponibilidad: 'Media', propietario: 'Ingeniería', custodio: 'DevOps' }),
  activo({ id: 'ast-10', codigo: 'AST-10', nombre: 'Pipeline de integración', proceso: 'Despliegue', tipo: 'servicios', ubicacion: 'repositorio', confidencialidad: 'Media', integridad: 'Alta', disponibilidad: 'Alta', propietario: 'Ingeniería', custodio: 'DevOps' }),
  activo({ id: 'ast-11', codigo: 'AST-11', nombre: 'WAF de perímetro', proceso: 'Filtrado de tráfico', tipo: 'servicios', ubicacion: 'cloud', confidencialidad: 'Media', integridad: 'Alta', disponibilidad: 'Alta', propietario: 'Seguridad', custodio: 'Redes' }),
  activo({ id: 'ast-12', codigo: 'AST-12', nombre: 'Módulo de reportes', proceso: 'Información gerencial', tipo: 'software', ubicacion: 'cloud', confidencialidad: 'Alta', integridad: 'Media', disponibilidad: 'Baja', propietario: 'Riesgos', custodio: 'Equipo de datos' }),
  activo({ id: 'ast-13', codigo: 'AST-13', nombre: 'Políticas de seguridad', proceso: 'Gobierno ISO 27001', tipo: 'informacion', ubicacion: 'repositorio', confidencialidad: 'Media', integridad: 'Alta', disponibilidad: 'Baja', propietario: 'Oficial de seguridad', custodio: 'GRC' }),
  activo({ id: 'ast-14', codigo: 'AST-14', nombre: 'Personal de atención', proceso: 'Atención al cliente', tipo: 'personal', ubicacion: 'cloud', confidencialidad: 'Alta', integridad: 'Media', disponibilidad: 'Media', propietario: 'Servicio al cliente', custodio: 'Talento humano' }),
  activo({ id: 'ast-15', codigo: 'AST-15', nombre: 'Centro de procesamiento', proceso: 'Cómputo de la región', tipo: 'fisico', ubicacion: 'cloud', confidencialidad: 'Media', integridad: 'Alta', disponibilidad: 'Alta', propietario: 'Infraestructura', custodio: 'SRE' }),
]

export const AMENAZAS: Amenaza[] = [
  amenaza({ id: 'amn-01', codigo: 'AMN-01', nombre: 'Suplantación de la sesión móvil', descripcion: 'Un tercero reutiliza una sesión de la aplicación para operar como el cliente.', categoria: 'Spoofing', damage: 9, reproducibility: 6, exploitability: 5, affectedUsers: 7, discoverability: 5, activoId: 'ast-01' }),
  amenaza({ id: 'amn-02', codigo: 'AMN-02', nombre: 'Uso de credenciales ajenas', descripcion: 'Alguien prueba contraseñas hasta entrar a una cuenta de otro titular.', categoria: 'Spoofing', damage: 8, reproducibility: 8, exploitability: 7, affectedUsers: 8, discoverability: 7, activoId: 'ast-07' }),
  amenaza({ id: 'amn-03', codigo: 'AMN-03', nombre: 'Manipulación del monto', descripcion: 'La petición de pago se altera antes de llegar al registro contable.', categoria: 'Tampering', damage: 9, reproducibility: 4, exploitability: 4, affectedUsers: 6, discoverability: 3, activoId: 'ast-04' }),
  amenaza({ id: 'amn-04', codigo: 'AMN-04', nombre: 'Alteración de la bitácora', descripcion: 'Se modifican o borran eventos para ocultar una operación.', categoria: 'Tampering', damage: 8, reproducibility: 3, exploitability: 3, affectedUsers: 4, discoverability: 3, activoId: 'ast-08' }),
  amenaza({ id: 'amn-05', codigo: 'AMN-05', nombre: 'Repudio de una transferencia', descripcion: 'El ordenante niega haber autorizado un movimiento de alto valor.', categoria: 'Repudiation', damage: 6, reproducibility: 5, exploitability: 4, affectedUsers: 5, discoverability: 5, activoId: 'ast-04' }),
  amenaza({ id: 'amn-06', codigo: 'AMN-06', nombre: 'Repudio de un retiro en cajero', descripcion: 'No queda evidencia suficiente del canal, el equipo y la hora.', categoria: 'Repudiation', damage: 5, reproducibility: 4, exploitability: 3, affectedUsers: 4, discoverability: 4, activoId: 'ast-02' }),
  amenaza({ id: 'amn-07', codigo: 'AMN-07', nombre: 'Exfiltración de DPI', descripcion: 'Consultas amplias devuelven identificadores de muchas personas.', categoria: 'Information Disclosure', damage: 9, reproducibility: 6, exploitability: 6, affectedUsers: 8, discoverability: 5, activoId: 'ast-03' }),
  amenaza({ id: 'amn-08', codigo: 'AMN-08', nombre: 'Exposición en reportes', descripcion: 'Un reporte incluye datos de clientes que no corresponden al rol.', categoria: 'Information Disclosure', damage: 7, reproducibility: 5, exploitability: 5, affectedUsers: 6, discoverability: 5, activoId: 'ast-12' }),
  amenaza({ id: 'amn-09', codigo: 'AMN-09', nombre: 'Saturación del inicio de sesión', descripcion: 'Un volumen alto de intentos impide el acceso legítimo.', categoria: 'Denial of Service', damage: 7, reproducibility: 8, exploitability: 7, affectedUsers: 9, discoverability: 8, activoId: 'ast-07' }),
  amenaza({ id: 'amn-10', codigo: 'AMN-10', nombre: 'Agotamiento del servicio de pagos', descripcion: 'El microservicio deja de confirmar operaciones por carga excesiva.', categoria: 'Denial of Service', damage: 8, reproducibility: 5, exploitability: 5, affectedUsers: 8, discoverability: 4, activoId: 'ast-04' }),
  amenaza({ id: 'amn-11', codigo: 'AMN-11', nombre: 'Escalada de rol desde el navegador', descripcion: 'El cliente envía un rol privilegiado y el sistema lo acepta.', categoria: 'Elevation of Privilege', damage: 10, reproducibility: 4, exploitability: 3, affectedUsers: 7, discoverability: 3, activoId: 'ast-07' }),
  amenaza({ id: 'amn-12', codigo: 'AMN-12', nombre: 'Lectura de cuentas de otro cliente', descripcion: 'Cambiar el identificador permite ver o mover fondos ajenos.', categoria: 'Elevation of Privilege', damage: 9, reproducibility: 6, exploitability: 5, affectedUsers: 8, discoverability: 5, activoId: 'ast-03' }),
]

export const RIESGOS: Riesgo[] = [
  riesgo({ id: 'rsk-01', codigo: 'RSK-01', titulo: 'Toma de cuentas por acceso débil', descripcion: 'Credenciales predecibles o intentos repetidos permiten entrar como otro cliente.', probabilidad: 5, impacto: 5, controles: 'Contraseña robusta, bloqueo temporal, MFA y bitácora.', probabilidadResidual: 2, impactoResidual: 3, tipo: 'seguridad', tipoImpacto: 'reputacional', tratamiento: 'mitigar', activoId: 'ast-07' }),
  riesgo({ id: 'rsk-02', codigo: 'RSK-02', titulo: 'Fraude en transferencias', descripcion: 'Un movimiento no autorizado sale de una cuenta activa.', probabilidad: 4, impacto: 5, controles: 'Límite diario, OTP sobre Q10,000 y marcado para revisión.', probabilidadResidual: 3, impactoResidual: 4, tipo: 'software', tipoImpacto: 'financiero', tratamiento: 'mitigar', activoId: 'ast-04' }),
  riesgo({ id: 'rsk-03', codigo: 'RSK-03', titulo: 'Fuga de datos personales', descripcion: 'DPI y teléfono quedan visibles para roles que no los necesitan.', probabilidad: 4, impacto: 5, controles: 'Enmascarado por defecto y políticas de fila.', probabilidadResidual: 2, impactoResidual: 4, tipo: 'seguridad', tipoImpacto: 'legal', tratamiento: 'mitigar', activoId: 'ast-05' }),
  riesgo({ id: 'rsk-04', codigo: 'RSK-04', titulo: 'Indisponibilidad del registro contable', descripcion: 'La base transaccional no responde durante la operación del día.', probabilidad: 3, impacto: 5, controles: 'Respaldos y función atómica de movimiento.', probabilidadResidual: 2, impactoResidual: 4, tipo: 'cloud', tipoImpacto: 'operacional', tratamiento: 'mitigar', activoId: 'ast-05' }),
  riesgo({ id: 'rsk-05', codigo: 'RSK-05', titulo: 'Cambio no autorizado en el código', descripcion: 'Una modificación en el repositorio llega a producción sin revisión.', probabilidad: 2, impacto: 4, controles: 'Revisión obligatoria y protección de ramas.', probabilidadResidual: 1, impactoResidual: 3, tipo: 'tecnico', tipoImpacto: 'operacional', tratamiento: 'mitigar', activoId: 'ast-09' }),
  riesgo({ id: 'rsk-06', codigo: 'RSK-06', titulo: 'Abuso de consultas de la API', descripcion: 'Peticiones amplias extraen más información de la necesaria.', probabilidad: 4, impacto: 4, controles: 'Tope de página, límite de intentos y WAF.', probabilidadResidual: 2, impactoResidual: 3, tipo: 'tecnico', tipoImpacto: 'operacional', tratamiento: 'mitigar', activoId: 'ast-03' }),
  riesgo({ id: 'rsk-07', codigo: 'RSK-07', titulo: 'Pérdida de la clave del dispositivo', descripcion: 'La clave local puede copiarse fuera del teléfono.', probabilidad: 2, impacto: 5, controles: 'Almacén de hardware y prohibición de exportación.', probabilidadResidual: 1, impactoResidual: 4, tipo: 'software', tipoImpacto: 'financiero', tratamiento: 'mitigar', activoId: 'ast-06' }),
  riesgo({ id: 'rsk-08', codigo: 'RSK-08', titulo: 'Error de atención al cliente', descripcion: 'Un ejecutivo consulta o modifica un cliente que no tiene asignado.', probabilidad: 3, impacto: 3, controles: 'Asignación explícita y segregación de funciones.', probabilidadResidual: 2, impactoResidual: 2, tipo: 'seguridad', tipoImpacto: 'reputacional', tratamiento: 'mitigar', activoId: 'ast-14' }),
  riesgo({ id: 'rsk-09', codigo: 'RSK-09', titulo: 'Incumplimiento del marco de control', descripcion: 'Los controles documentados no se operan ni se revisan.', probabilidad: 3, impacto: 4, controles: 'Inventario, registro de riesgos y auditoría.', probabilidadResidual: 2, impactoResidual: 3, tipo: 'seguridad', tipoImpacto: 'legal', tratamiento: 'mitigar', activoId: 'ast-13' }),
  riesgo({ id: 'rsk-10', codigo: 'RSK-10', titulo: 'Logs accesibles de más', descripcion: 'El almacén de evidencia puede leerse fuera del equipo de seguridad.', probabilidad: 3, impacto: 5, controles: 'Acceso privado, cifrado y bitácora inmutable.', probabilidadResidual: 1, impactoResidual: 4, tipo: 'cloud', tipoImpacto: 'legal', tratamiento: 'mitigar', activoId: 'ast-08' }),
  riesgo({ id: 'rsk-11', codigo: 'RSK-11', titulo: 'Dependencia del proveedor de identidad', descripcion: 'Una falla del servicio de identidad detiene el acceso al banco.', probabilidad: 2, impacto: 4, controles: 'Contrato con niveles de servicio y plan de salida.', probabilidadResidual: 2, impactoResidual: 3, tipo: 'cloud', tipoImpacto: 'operacional', tratamiento: 'transferir', activoId: 'ast-07' }),
  riesgo({ id: 'rsk-12', codigo: 'RSK-12', titulo: 'Reversión indebida', descripcion: 'Una corrección contable se usa para alterar la historia.', probabilidad: 2, impacto: 5, controles: 'Solo el administrador revierte y el movimiento original permanece.', probabilidadResidual: 1, impactoResidual: 3, tipo: 'tecnico', tipoImpacto: 'financiero', tratamiento: 'evitar', activoId: 'ast-04' }),
]

export const HALLAZGOS: Hallazgo[] = [
  { id: 'hal-01', codigo: 'HAL-01', titulo: 'Lectura de cuentas de otro cliente', origen: 'pentest_caja_gris', owasp: 'API1', severidad: 'critica', cvss: 8.6, activoId: 'ast-03', evidencia: 'Al cambiar el identificador, la consulta devolvía la cuenta de otra persona.', recomendacion: 'Autorizar cada lectura con el propietario y registrar el intento.', responsable: 'Plataforma', estado: 'en_progreso', fechaLimite: isoDate(-6), capa: 'aplicacion' },
  { id: 'hal-02', codigo: 'HAL-02', titulo: 'Intentos de acceso sin contención', origen: 'pentest_caja_negra', owasp: 'API2', severidad: 'alta', cvss: 7.5, activoId: 'ast-07', evidencia: 'Se observaron varios intentos fallidos sin un bloqueo temporal.', recomendacion: 'Bloquear la cuenta tras cinco fallos y dejar constancia en la bitácora.', responsable: 'Seguridad', estado: 'mitigado', fechaLimite: isoDate(20), capa: 'perimetro' },
  { id: 'hal-03', codigo: 'HAL-03', titulo: 'Segundo factor decidido en el cliente', origen: 'pentest_caja_gris', owasp: 'API2', severidad: 'critica', cvss: 9.1, activoId: 'ast-01', evidencia: 'El indicador de verificación podía alterarse en el navegador.', recomendacion: 'Generar y validar el OTP en el servidor, con vigencia de cinco minutos y un solo uso.', responsable: 'Equipo móvil', estado: 'en_progreso', fechaLimite: isoDate(-2), capa: 'aplicacion' },
  { id: 'hal-04', codigo: 'HAL-04', titulo: 'DPI y teléfono visibles para cualquier rol', origen: 'sast', owasp: 'API3', severidad: 'alta', cvss: 7.1, activoId: 'ast-05', evidencia: 'La respuesta incluía los identificadores completos sin distinguir el rol.', recomendacion: 'Enmascarar por defecto y revelar el dato solo a roles autorizados.', responsable: 'Datos', estado: 'mitigado', fechaLimite: isoDate(15), capa: 'datos' },
  { id: 'hal-05', codigo: 'HAL-05', titulo: 'Paginación sin tamaño máximo', origen: 'pentest_caja_negra', owasp: 'API4', severidad: 'alta', cvss: 7.4, activoId: 'ast-03', evidencia: 'El tamaño de página aceptaba valores muy altos.', recomendacion: 'Fijar un máximo de 20 registros y mantener la política de fila.', responsable: 'Plataforma', estado: 'abierto', fechaLimite: isoDate(-4), capa: 'aplicacion' },
  { id: 'hal-06', codigo: 'HAL-06', titulo: 'Inicio de sesión sin límite de ritmo', origen: 'pentest_caja_negra', owasp: 'API4', severidad: 'alta', cvss: 7.3, activoId: 'ast-07', evidencia: 'El acceso aceptaba ráfagas de intentos sobre el mismo correo.', recomendacion: 'Limitar los intentos por correo y registrar cada uno.', responsable: 'Seguridad', estado: 'mitigado', fechaLimite: isoDate(12), capa: 'perimetro' },
  { id: 'hal-07', codigo: 'HAL-07', titulo: 'Reversión disponible fuera del administrador', origen: 'pentest_caja_gris', owasp: 'API5', severidad: 'critica', cvss: 8.8, activoId: 'ast-04', evidencia: 'El flujo de reversión no distinguía el rol en el servidor.', recomendacion: 'Reservar la reversión al administrador y conservar el movimiento original.', responsable: 'Pagos', estado: 'abierto', fechaLimite: isoDate(10), capa: 'aplicacion' },
  { id: 'hal-08', codigo: 'HAL-08', titulo: 'Alto valor sin una segunda confirmación', origen: 'pentest_caja_gris', owasp: 'API6', severidad: 'media', cvss: 5.8, activoId: 'ast-04', evidencia: 'Una transferencia elevada se confirmaba solo con la sesión.', recomendacion: 'Pedir OTP cuando el monto supere Q10,000 y marcarla para revisión.', responsable: 'Pagos', estado: 'mitigado', fechaLimite: isoDate(18), capa: 'aplicacion' },
  { id: 'hal-09', codigo: 'HAL-09', titulo: 'Destino interno aceptado en notificaciones', origen: 'pentest_caja_gris', owasp: 'API7', severidad: 'alta', cvss: 8.1, activoId: 'ast-03', evidencia: 'Un parámetro de destino aceptaba direcciones de la red interna.', recomendacion: 'Usar una lista de destinos permitidos y rechazar rangos internos.', responsable: 'Plataforma', estado: 'abierto', fechaLimite: isoDate(8), capa: 'red_interna' },
  { id: 'hal-10', codigo: 'HAL-10', titulo: 'Almacén de logs con lectura amplia', origen: 'iac', owasp: 'API8', severidad: 'critica', cvss: 9.0, activoId: 'ast-08', evidencia: 'La política del bucket permitía lectura más allá del equipo de seguridad.', recomendacion: 'Privar el almacén, cifrarlo y revisar quién accede.', responsable: 'SRE', estado: 'en_progreso', fechaLimite: isoDate(6), capa: 'datos' },
  { id: 'hal-11', codigo: 'HAL-11', titulo: 'Servicios sin dueño en el inventario', origen: 'pentest_caja_negra', owasp: 'API9', severidad: 'media', cvss: 5.2, activoId: 'ast-09', evidencia: 'Había rutas publicadas que no figuraban en el inventario.', recomendacion: 'Mantener el inventario con propietario y una revisión periódica.', responsable: 'GRC', estado: 'aceptado', fechaLimite: isoDate(40), capa: 'politicas' },
  { id: 'hal-12', codigo: 'HAL-12', titulo: 'Respuesta de KYC aceptada sin comprobar', origen: 'sca', owasp: 'API10', severidad: 'media', cvss: 6.0, activoId: 'ast-07', evidencia: 'La respuesta del proveedor se incorporaba sin verificar su origen.', recomendacion: 'Comprobar firma, vigencia y procedencia antes de actualizar el KYC.', responsable: 'Seguridad', estado: 'abierto', fechaLimite: isoDate(14), capa: 'perimetro' },
  { id: 'hal-13', codigo: 'HAL-13', titulo: 'Imagen con componentes desactualizados', origen: 'contenedores', owasp: 'API8', severidad: 'alta', cvss: 7.8, activoId: 'ast-04', evidencia: 'El escaneo de la imagen reportó componentes con avisos abiertos.', recomendacion: 'Reconstruir la imagen y detener el despliegue si el escaneo falla.', responsable: 'DevOps', estado: 'en_progreso', fechaLimite: isoDate(9), capa: 'host' },
  { id: 'hal-14', codigo: 'HAL-14', titulo: 'Secreto de servicio en el repositorio', origen: 'sast', owasp: 'API8', severidad: 'critica', cvss: 9.2, activoId: 'ast-09', evidencia: 'Un archivo versionado contenía una clave de servicio.', recomendacion: 'Retirar el secreto, rotarlo y guardarlo en el almacén del proveedor.', responsable: 'DevOps', estado: 'mitigado', fechaLimite: isoDate(5), capa: 'datos' },
  { id: 'hal-15', codigo: 'HAL-15', titulo: 'Consola de operaciones sin segundo control', origen: 'pentest_caja_gris', owasp: 'API8', severidad: 'alta', cvss: 7.2, activoId: 'ast-15', evidencia: 'La consola de la sala quedaba disponible sin un control adicional.', recomendacion: 'Registrar el acceso físico y bloquear la consola al ausentarse.', responsable: 'Infraestructura', estado: 'abierto', fechaLimite: isoDate(11), capa: 'fisica' },
]

export const CASOS: CasoAbuso[] = [
  { id: 'cab-01', codigo: 'CAB-01', titulo: 'Fuerza bruta en el inicio de sesión', descripcion: 'Se intenta adivinar la contraseña con muchos ensayos sobre el mismo correo.', control: 'Bloqueo temporal tras cinco fallos, límite de ritmo y registro de cada intento.', hallazgoId: 'hal-02' },
  { id: 'cab-02', codigo: 'CAB-02', titulo: 'Omisión del segundo factor', descripcion: 'Se pretende dar por verificado el acceso sin pasar por el servidor.', control: 'El OTP se genera y se valida en una función de servidor, vence a los cinco minutos y solo se usa una vez.', hallazgoId: 'hal-03' },
  { id: 'cab-03', codigo: 'CAB-03', titulo: 'Extracción por paginación de la API', descripcion: 'Se amplía el tamaño de página para llevarse muchos registros.', control: 'Tope de 20 filas, políticas de fila y enmascarado de datos personales.', hallazgoId: 'hal-05' },
  { id: 'cab-04', codigo: 'CAB-04', titulo: 'Acceso a un objeto de otro cliente', descripcion: 'Se cambia el identificador de una cuenta o un cliente para leer datos ajenos.', control: 'La autorización compara el propietario en el servidor y deja un evento de seguridad.', hallazgoId: 'hal-01' },
  { id: 'cab-05', codigo: 'CAB-05', titulo: 'Rol enviado desde el navegador', descripcion: 'La petición incluye un rol privilegiado para saltarse las restricciones.', control: 'El rol vive en user_roles y se consulta con has_role, definida como SECURITY DEFINER.', hallazgoId: 'hal-07' },
  { id: 'cab-06', codigo: 'CAB-06', titulo: 'Repetición de una transferencia', descripcion: 'La misma operación se envía dos veces y podría duplicar el débito.', control: 'Cada operación lleva una clave de idempotencia única.', hallazgoId: 'hal-08' },
]

export const INCIDENTES: Incidente[] = [
  { id: 'inc-01', codigo: 'INC-01', titulo: 'Ráfaga de intentos de acceso', descripcion: 'Se concentraron intentos fallidos sobre cuentas de la demostración en una ventana corta.', severidad: 'critica', estado: 'abierto', asignadoA: 'user-auditor', fecha: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: 'inc-02', codigo: 'INC-02', titulo: 'Consulta de una cuenta ajena', descripcion: 'El control de propiedad rechazó una lectura y dejó el evento correspondiente.', severidad: 'alta', estado: 'investigando', asignadoA: 'user-auditor', fecha: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: 'inc-03', codigo: 'INC-03', titulo: 'Transferencia marcada por monto', descripcion: 'Una operación superior al umbral quedó en revisión después de confirmarse.', severidad: 'alta', estado: 'contenido', asignadoA: 'user-admin', fecha: new Date(Date.now() - 8 * 86400000).toISOString() },
  { id: 'inc-04', codigo: 'INC-04', titulo: 'Dispositivo no reconocido', descripcion: 'Un acceso desde un equipo nuevo generó alerta. El cliente lo reconoció después.', severidad: 'media', estado: 'cerrado', asignadoA: 'user-ejecutivo', fecha: new Date(Date.now() - 15 * 86400000).toISOString() },
  { id: 'inc-05', codigo: 'INC-05', titulo: 'Hallazgo de paginación fuera de plazo', descripcion: 'El hallazgo de tamaño de página superó la fecha comprometida y sigue abierto.', severidad: 'alta', estado: 'abierto', asignadoA: 'user-admin', fecha: new Date(Date.now() - 1 * 86400000).toISOString() },
]

export const NOTAS: IncidenteNota[] = [
  { id: 'nota-01', incidenteId: 'inc-01', userId: 'user-auditor', texto: 'Se confirmó que los intentos quedaron registrados y que la cuenta de prueba se bloqueó al llegar al umbral.', fecha: new Date(Date.now() - 1.5 * 86400000).toISOString() },
  { id: 'nota-02', incidenteId: 'inc-02', userId: 'user-admin', texto: 'La política de acceso niega la fila. Se mantiene el incidente abierto hasta cerrar el hallazgo relacionado.', fecha: new Date(Date.now() - 4 * 86400000).toISOString() },
  { id: 'nota-03', incidenteId: 'inc-03', userId: 'user-auditor', texto: 'El monto se movió y la operación quedó marcada. No se modificó el registro original.', fecha: new Date(Date.now() - 7 * 86400000).toISOString() },
]
