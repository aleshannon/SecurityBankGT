import type { Hallazgo, Incidente, Riesgo } from './types'

export function calcularPostura(hallazgos: Hallazgo[], incidentes: Incidente[], riesgos: Riesgo[]) {
  let score = 100
  for (const hallazgo of hallazgos) {
    if (hallazgo.estado === 'mitigado' || hallazgo.estado === 'aceptado') continue
    if (hallazgo.severidad === 'critica') score -= 8
    else if (hallazgo.severidad === 'alta') score -= 4
    else if (hallazgo.severidad === 'media') score -= 2
    else score -= 1
  }
  for (const incidente of incidentes) {
    if (incidente.estado === 'cerrado' || incidente.estado === 'contenido') continue
    if (incidente.severidad === 'critica') score -= 6
    else if (incidente.severidad === 'alta') score -= 3
    else if (incidente.severidad === 'media') score -= 1
  }
  for (const riesgo of riesgos) {
    if (riesgo.riesgoResidual >= 15) score -= 3
    else if (riesgo.riesgoResidual >= 10) score -= 1
  }
  const value = Math.max(0, Math.min(100, score))
  const posturaNivel = value >= 80 ? 'solida' : value >= 60 ? 'aceptable' : 'debil'
  return { value, posturaNivel } as const
}

export function criticidadDe(confidencialidad: string, integridad: string, disponibilidad: string) {
  const rank: Record<string, number> = { Alta: 3, Media: 2, Baja: 1 }
  const max = Math.max(rank[confidencialidad] ?? 1, rank[integridad] ?? 1, rank[disponibilidad] ?? 1)
  if (max === 3) return 'Alta' as const
  if (max === 2) return 'Media' as const
  return 'Baja' as const
}

export function promedioDread(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0)
  return Math.round((total / values.length) * 10) / 10
}

export function nivelDread(promedio: number): 'bajo' | 'medio' | 'alto' | 'critico' {
  if (promedio >= 8) return 'critico'
  if (promedio >= 6) return 'alto'
  if (promedio >= 4) return 'medio'
  return 'bajo'
}
