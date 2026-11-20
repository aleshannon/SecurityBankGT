import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { formatDateTime, formatMoney } from '@/domain/format'
import { CANAL_LABEL, ESTADO_TX, TIPO_TX, toneFor } from '@/domain/labels'
import type { TransaccionVista } from '@/domain/types'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/toast'
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Pagination, SelectInput, SkeletonRows, TextInput } from '@/components/ui'

export function MovimientosPage() {
  const { session } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const canOperate = session.role === 'admin' || session.role === 'ejecutivo'
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('')
  const [estado, setEstado] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page, setPage] = useState(1)
  const [modo, setModo] = useState<'deposito' | 'retiro' | null>(null)
  const [cuentaId, setCuentaId] = useState('')
  const [monto, setMonto] = useState('')
  const [revertir, setRevertir] = useState<TransaccionVista | null>(null)
  const query = useQuery({ queryKey: ['movimientos', q, tipo, estado, desde, hasta, page], queryFn: () => api.listTransacciones({ q, tipo, estado, desde, hasta, page }) })
  const catalogo = useQuery({ queryKey: ['catalogo'], queryFn: () => api.catalogo(), enabled: canOperate })

  const operar = async (event: React.FormEvent) => {
    event.preventDefault()
    const payload = { cuentaId, monto: Number(monto), canal: 'web' as const, idempotencyKey: crypto.randomUUID() }
    try {
      if (modo === 'deposito') await api.depositar(payload)
      else await api.retirar(payload)
      toast.push(modo === 'deposito' ? 'Depósito registrado.' : 'Retiro registrado.', 'ok')
      setModo(null)
      await queryClient.invalidateQueries({ queryKey: ['movimientos'] })
      await queryClient.invalidateQueries({ queryKey: ['cuentas'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }

  const confirmarReversion = async () => {
    if (!revertir) return
    try {
      await api.revertir(revertir.id)
      toast.push('Se registró la reversión. El movimiento original no cambió.', 'ok')
      setRevertir(null)
      await queryClient.invalidateQueries({ queryKey: ['movimientos'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }

  return (
    <div>
      <PageHeader title="Movimientos" description="Los registros son inmutables. Una corrección se anota como reversión." actions={canOperate ? <><Button tone="ghost" onClick={() => setModo('deposito')}>Depósito</Button><Button onClick={() => setModo('retiro')}>Retiro</Button></> : null} />
      <div className="mb-4 grid gap-2 md:grid-cols-5">
        <TextInput aria-label="Buscar referencia" placeholder="Referencia" value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} />
        <SelectInput aria-label="Tipo" value={tipo} onChange={(event) => { setTipo(event.target.value); setPage(1) }}><option value="">Todos</option>{Object.entries(TIPO_TX).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</SelectInput>
        <SelectInput aria-label="Estado" value={estado} onChange={(event) => { setEstado(event.target.value); setPage(1) }}><option value="">Todos</option>{Object.entries(ESTADO_TX).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</SelectInput>
        <TextInput aria-label="Desde" type="date" value={desde} onChange={(event) => { setDesde(event.target.value); setPage(1) }} />
        <TextInput aria-label="Hasta" type="date" value={hasta} onChange={(event) => { setHasta(event.target.value); setPage(1) }} />
      </div>
      {query.isLoading ? <SkeletonRows /> : query.isError ? <EmptyState title="No se pudieron cargar los movimientos" body={errorText(query.error)} /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-muted"><tr>{['Fecha', 'Referencia', 'Tipo', 'Monto', 'Origen', 'Destino', 'Estado', 'Canal', ''].map((head) => <th key={head} className="px-3 py-3 font-medium">{head}</th>)}</tr></thead>
            <tbody>
              {query.data?.items.map((tx) => (
                <tr key={tx.id} className="border-t border-line">
                  <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(tx.fecha)}</td>
                  <td className="px-3 py-3">{tx.referencia}</td>
                  <td className="px-3 py-3">{TIPO_TX[tx.tipo]}</td>
                  <td className="px-3 py-3">{formatMoney(tx.monto)}</td>
                  <td className="px-3 py-3 font-mono text-xs">{tx.origenNumero ?? '—'}</td>
                  <td className="px-3 py-3 font-mono text-xs">{tx.destinoNumero ?? '—'}</td>
                  <td className="px-3 py-3"><Badge tone={toneFor(tx.estado)}>{ESTADO_TX[tx.estado]}</Badge></td>
                  <td className="px-3 py-3">{CANAL_LABEL[tx.canal]}</td>
                  <td className="px-3 py-3">{session.role === 'admin' && tx.tipo !== 'reversion' && (tx.estado === 'completada' || tx.estado === 'marcada') ? <button type="button" className="text-accentink" onClick={() => setRevertir(tx)}>Revertir</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.data ? <Pagination page={query.data.page} pages={query.data.pages} total={query.data.total} onPage={setPage} /> : null}
      <Modal open={Boolean(modo)} title={modo === 'deposito' ? 'Registrar depósito' : 'Registrar retiro'} onClose={() => setModo(null)}>
        <form className="space-y-3" onSubmit={(event) => void operar(event)}>
          <Field label="Cuenta">
            <SelectInput value={cuentaId} onChange={(event) => setCuentaId(event.target.value)} required>
              <option value="">Seleccione</option>
              {catalogo.data?.cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.numero} · {formatMoney(cuenta.saldo)}</option>)}
            </SelectInput>
          </Field>
          <Field label="Monto en quetzales"><TextInput inputMode="decimal" value={monto} onChange={(event) => setMonto(event.target.value)} required /></Field>
          <div className="flex justify-end gap-2"><Button tone="ghost" onClick={() => setModo(null)}>Cancelar</Button><Button type="submit">Confirmar</Button></div>
        </form>
      </Modal>
      <Modal open={Boolean(revertir)} title="Registrar reversión" onClose={() => setRevertir(null)}>
        <p className="text-sm text-muted">Se creará un movimiento nuevo ligado a {revertir?.referencia}. El original permanece igual.</p>
        <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={() => setRevertir(null)}>Cancelar</Button><Button tone="danger" onClick={() => void confirmarReversion()}>Revertir</Button></div>
      </Modal>
    </div>
  )
}
