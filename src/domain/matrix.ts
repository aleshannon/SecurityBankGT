import type { Riesgo } from './types'

export interface CeldaCalor {
  probabilidad: number
  impacto: number
  total: number
  riesgos: { id: string; titulo: string; valor: number }[]
}

export function matrizCalor(riesgos: Riesgo[], modo: 'antes' | 'despues'): CeldaCalor[] {
  const celdas: CeldaCalor[] = []
  for (let probabilidad = 1; probabilidad <= 5; probabilidad += 1) {
    for (let impacto = 1; impacto <= 5; impacto += 1) {
      const matches = riesgos.filter((riesgo) => {
        const p = modo === 'antes' ? riesgo.probabilidad : riesgo.probabilidadResidual
        const i = modo === 'antes' ? riesgo.impacto : riesgo.impactoResidual
        return p === probabilidad && i === impacto
      })
      celdas.push({
        probabilidad,
        impacto,
        total: matches.length,
        riesgos: matches.map((riesgo) => ({
          id: riesgo.id,
          titulo: riesgo.titulo,
          valor: modo === 'antes' ? riesgo.riesgoInherente : riesgo.riesgoResidual,
        })),
      })
    }
  }
  return celdas
}

export function matrizConteo(riesgos: Riesgo[], modo: 'antes' | 'despues'): number[][] {
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0))
  for (const celda of matrizCalor(riesgos, modo)) {
    grid[5 - celda.probabilidad][celda.impacto - 1] = celda.total
  }
  return grid
}
