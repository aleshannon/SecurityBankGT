import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { ESTADO_TX, TIPO_TX } from '@/domain/labels'
import type { ExportFormat, ReportFilters, ReportId } from '@/domain/types'
import { useToast } from '@/components/toast'
import { Button, EmptyState, Field, PageHeader, Panel, SelectInput, SkeletonRows, TextInput } from '@/components/ui'
import { exportarCsv, exportarExcel, exportarPdf } from './exportar'

export function ReportesPage() {
  const toast = useToast()
  const catalogo = useQuery({ queryKey: ['catalogo'], queryFn: () => api.catalogo() })
  const reportes = useQuery({ queryKey: ['reportes'], queryFn: () => api.listadoReportes() })
  const [id, setId] = useState<ReportId>('ejecutivo_negocio')
  const [filters, setFilters] = useState<ReportFilters>({})
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const active = reportes.data?.some((item) => item.id === id) ? id : reportes.data?.[0]?.id
  const preview = useQuery({
    queryKey: ['reporte', active, filters],
    queryFn: () => api.generarReporte(active as ReportId, filters),
    enabled: Boolean(active),
  })

  const exportar = async (formato: ExportFormat) => {
    if (!preview.data) return
    setBusy(formato)
    try {
      await api.registrarExportacion(active as ReportId, formato)
      if (formato === 'pdf') exportarPdf(preview.data)
      if (formato === 'xlsx') exportarExcel(preview.data)
      if (formato === 'csv') exportarCsv(preview.data)
      toast.push(`Exportación ${formato.toUpperCase()} registrada en la bitácora.`, 'ok')
    } catch (error) {
      toast.push(errorText(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader title="Reportes" description="Vista previa y exportación en PDF, Excel y CSV. Cada descarga queda en la bitácora y respeta su rol." />
      {reportes.isLoading ? <SkeletonRows /> : reportes.isError ? <EmptyState title="No se pudieron cargar los reportes" body={errorText(reportes.error)} /> : (
        <>
          <Panel className="mb-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Field label="Reporte">
                <SelectInput value={active ?? ''} onChange={(event) => setId(event.target.value as ReportId)}>
                  {reportes.data?.map((item) => <option key={item.id} value={item.id}>{item.titulo}</option>)}
                </SelectInput>
              </Field>
              <Field label="Desde"><TextInput type="date" value={filters.desde ?? ''} onChange={(event) => setFilters({ ...filters, desde: event.target.value })} /></Field>
              <Field label="Hasta"><TextInput type="date" value={filters.hasta ?? ''} onChange={(event) => setFilters({ ...filters, hasta: event.target.value })} /></Field>
              <Field label="Cliente">
                <SelectInput value={filters.clienteId ?? ''} onChange={(event) => setFilters({ ...filters, clienteId: event.target.value || undefined })}>
                  <option value="">Todos los permitidos</option>
                  {catalogo.data?.clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.codigo} · {cliente.nombres}</option>)}
                </SelectInput>
              </Field>
              <Field label="Tipo / estado">
                <div className="grid grid-cols-2 gap-2">
                  <SelectInput aria-label="Tipo" value={filters.tipo ?? ''} onChange={(event) => setFilters({ ...filters, tipo: event.target.value || undefined })}>
                    <option value="">Tipo</option>
                    {Object.entries(TIPO_TX).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </SelectInput>
                  <SelectInput aria-label="Estado" value={filters.estado ?? ''} onChange={(event) => setFilters({ ...filters, estado: event.target.value || undefined })}>
                    <option value="">Estado</option>
                    {Object.entries(ESTADO_TX).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </SelectInput>
                </div>
              </Field>
            </div>
            <p className="mt-3 text-sm text-muted">{reportes.data?.find((item) => item.id === active)?.descripcion}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button tone="primary" disabled={!preview.data || busy !== null} onClick={() => void exportar('pdf')}>{busy === 'pdf' ? 'Generando…' : 'Exportar PDF'}</Button>
              <Button tone="accent" disabled={!preview.data || busy !== null} onClick={() => void exportar('xlsx')}>{busy === 'xlsx' ? 'Generando…' : 'Exportar Excel'}</Button>
              <Button tone="ghost" disabled={!preview.data || busy !== null} onClick={() => void exportar('csv')}>{busy === 'csv' ? 'Generando…' : 'Exportar CSV'}</Button>
            </div>
          </Panel>
          {preview.isLoading ? <SkeletonRows /> : preview.isError ? <EmptyState title="No se pudo preparar el reporte" body={errorText(preview.error)} /> : preview.data ? (
            <Panel>
              <h2 className="font-semibold">{preview.data.titulo}</h2>
              <p className="text-sm text-muted">{preview.data.subtitulo} · {preview.data.fechaGeneracion}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {preview.data.kpis.map((kpi) => <div key={kpi.label} className="rounded-xl bg-canvas px-3 py-2"><p className="text-xs text-muted">{kpi.label}</p><p className="font-semibold">{kpi.value}</p></div>)}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-muted"><tr>{preview.data.columnas.map((column) => <th key={column} className="px-2 py-2">{column}</th>)}</tr></thead>
                  <tbody>
                    {preview.data.filas.slice(0, 12).map((row, index) => <tr key={index} className="border-t border-line">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-2 py-2">{cell}</td>)}</tr>)}
                  </tbody>
                </table>
              </div>
              {preview.data.filas.length > 12 ? <p className="mt-2 text-xs text-muted">La vista previa muestra 12 filas. La exportación incluye {preview.data.filas.length}.</p> : null}
            </Panel>
          ) : null}
        </>
      )}
    </div>
  )
}
