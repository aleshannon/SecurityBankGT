import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { formatDateTime } from '@/domain/format'
import { toneFor } from '@/domain/labels'
import { useToast } from '@/components/toast'
import { Badge, Button, EmptyState, PageHeader, Panel, SkeletonRows } from '@/components/ui'

export function NotificacionesPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['notificaciones'], queryFn: () => api.listNotificaciones() })
  const mark = async (id: string) => {
    try {
      await api.marcarNotificacion(id)
      await queryClient.invalidateQueries({ queryKey: ['notificaciones'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }
  return (
    <div>
      <PageHeader title="Alertas" description="Transferencias grandes, dispositivos, bloqueos, incidentes, hallazgos y KYC." actions={<Button tone="ghost" onClick={() => void api.marcarTodas().then(() => queryClient.invalidateQueries({ queryKey: ['notificaciones'] }))}>Marcar todas como leídas</Button>} />
      {query.isLoading ? <SkeletonRows /> : query.isError ? <EmptyState title="No se pudieron cargar las alertas" body={errorText(query.error)} /> : query.data?.length === 0 ? <EmptyState title="Sin alertas" body="Cuando ocurra un evento relevante aparecerá aquí." /> : (
        <div className="space-y-2">
          {query.data?.map((item) => (
            <Panel key={item.id} className={item.leida ? 'opacity-70' : ''}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Badge tone={toneFor(item.severidad)}>{item.severidad}</Badge><span className="text-xs text-muted">{formatDateTime(item.fecha)}</span></div>
                {!item.leida ? <Button tone="ghost" onClick={() => void mark(item.id)}>Marcar leída</Button> : null}
              </div>
              <h2 className="mt-2 font-semibold">{item.titulo}</h2>
              <p className="text-sm text-muted">{item.mensaje}</p>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}
