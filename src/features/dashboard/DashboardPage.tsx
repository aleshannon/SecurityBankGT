import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { formatDateTime, formatMoney } from '@/domain/format'
import { CANAL_LABEL, ESTADO_TX, TIPO_TX, toneFor } from '@/domain/labels'
import { Badge, EmptyState, KpiCard, PageHeader, Panel, SkeletonRows } from '@/components/ui'

export function DashboardPage() {
  const query = useQuery({ queryKey: ['resumen'], queryFn: () => api.resumen() })
  if (query.isLoading) return <SkeletonRows />
  if (query.isError || !query.data) return <EmptyState title="No se pudo cargar el panel" body={errorText(query.error)} />
  const data = query.data
  const security = data.rol === 'admin' || data.rol === 'auditor_seguridad'
  const canales = data.canales.map((item) => ({ nombre: CANAL_LABEL[item.canal] ?? item.canal, total: item.total }))
  const gastos = data.gastosMes.map((item) => ({ nombre: TIPO_TX[item.tipo] ?? item.tipo, total: item.total }))
  return (
    <div>
      <PageHeader title="Panel" description={security ? 'Operación del día y postura de seguridad.' : data.rol === 'ejecutivo' ? 'Cartera asignada y pendientes de atención.' : 'Sus saldos, movimientos y alertas.'} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.kpis.map((kpi) => <KpiCard key={kpi.id} label={kpi.label} value={kpi.value} hint={kpi.hint} tone={kpi.tone} />)}
        {security ? (
          <article className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <p className="text-sm text-muted">Postura de seguridad</p>
            <p className="mt-1 text-2xl font-semibold">{data.postura}/100</p>
            <div className="mt-3"><Badge tone={data.posturaNivel === 'solida' ? 'ok' : data.posturaNivel === 'aceptable' ? 'warn' : 'danger'}>{data.posturaNivel === 'solida' ? 'Sólida' : data.posturaNivel === 'aceptable' ? 'Aceptable' : 'Débil'}</Badge></div>
          </article>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel>
          <h2 className="mb-3 font-semibold">{data.rol === 'cliente' ? 'Salidas del mes' : 'Transacciones por canal'}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.rol === 'cliente' ? gastos : canales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d6e0ea" />
                <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => data.rol === 'cliente' ? formatMoney(Number(value)) : String(value)} />
                <Bar dataKey="total" fill="#13A89E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        {security ? (
          <Panel>
            <h2 className="mb-3 font-semibold">Eventos de seguridad por día</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.eventosPorDia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6e0ea" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area dataKey="total" stroke="#0B2545" fill="#13A89E" fillOpacity={0.35} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        ) : (
          <Panel>
            <h2 className="mb-3 font-semibold">Alertas</h2>
            <div className="space-y-2">
              {data.alertas.length === 0 ? <p className="text-sm text-muted">No tiene alertas pendientes.</p> : data.alertas.map((item) => (
                <div key={item.id} className="rounded-xl bg-canvas px-3 py-2">
                  <Badge tone={toneFor(item.severidad)}>{item.severidad}</Badge>
                  <p className="mt-1 text-sm font-medium">{item.titulo}</p>
                  <p className="text-sm text-muted">{item.mensaje}</p>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
      {security ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
          <Panel>
            <h2 className="mb-3 font-semibold">Matriz de calor</h2>
            <div className="grid grid-cols-5 gap-1">
              {data.matriz.flat().map((count, index) => (
                <div key={index} className={`grid h-10 place-items-center rounded-md text-xs font-medium ${heat(index)}`}>{count}</div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Probabilidad de arriba hacia abajo, impacto de izquierda a derecha. Antes de controles.</p>
          </Panel>
          <Panel>
            <h2 className="mb-3 font-semibold">Eventos por severidad</h2>
            <div className="flex flex-wrap gap-2">
              {data.severidad.map((item) => <Badge key={item.severidad} tone={toneFor(item.severidad)}>{item.severidad}: {item.total}</Badge>)}
            </div>
          </Panel>
        </div>
      ) : null}
      <Panel className="mt-4">
        <h2 className="mb-3 font-semibold">Últimos movimientos</h2>
        {data.recientes.length === 0 ? <p className="text-sm text-muted">Todavía no hay movimientos.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted"><tr><th className="py-2">Fecha</th><th>Referencia</th><th>Tipo</th><th>Monto</th><th>Estado</th></tr></thead>
              <tbody>
                {data.recientes.map((tx) => (
                  <tr key={tx.id} className="border-t border-line">
                    <td className="py-2">{formatDateTime(tx.fecha)}</td>
                    <td>{tx.referencia}</td>
                    <td>{TIPO_TX[tx.tipo]}</td>
                    <td>{formatMoney(tx.monto)}</td>
                    <td><Badge tone={toneFor(tx.estado)}>{ESTADO_TX[tx.estado]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

function heat(index: number) {
  const row = Math.floor(index / 5)
  const col = index % 5
  const score = (5 - row) * (col + 1)
  if (score >= 20) return 'bg-rose-700 text-white'
  if (score >= 15) return 'bg-orange-500 text-white'
  if (score >= 10) return 'bg-amber-300 text-navy'
  if (score >= 5) return 'bg-lime-200 text-navy'
  return 'bg-emerald-100 text-navy'
}
