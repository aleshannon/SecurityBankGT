import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { formatMoney } from '@/domain/format'
import { TARJETA_ESTADO, toneFor } from '@/domain/labels'
import { tarjetaSchema } from '@/domain/schemas'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/toast'
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Pagination, SelectInput, SkeletonRows, TextInput, fieldErrors } from '@/components/ui'

export function TarjetasPage() {
  const { session } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const canIssue = session.role === 'admin' || session.role === 'ejecutivo'
  const [page, setPage] = useState(1)
  const [estado, setEstado] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ clienteId: '', cuentaId: '', tipo: 'debito', marca: 'Visa', ultimos4: '', vencimiento: '', limiteDiario: '4000', limiteMensual: '12000' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const query = useQuery({ queryKey: ['tarjetas', estado, page], queryFn: () => api.listTarjetas({ estado, page }) })
  const catalogo = useQuery({ queryKey: ['catalogo'], queryFn: () => api.catalogo(), enabled: canIssue })
  const cuentas = catalogo.data?.cuentas.filter((cuenta) => cuenta.clienteId === form.clienteId) ?? []

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = tarjetaSchema.safeParse({ ...form, limiteDiario: Number(form.limiteDiario), limiteMensual: Number(form.limiteMensual) })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    try {
      await api.saveTarjeta(parsed.data)
      toast.push('Tarjeta registrada. Solo se guardaron los últimos 4 dígitos.', 'ok')
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['tarjetas'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }

  const cambiar = async (id: string, accion: 'bloquear' | 'desbloquear' | 'reportar') => {
    try {
      if (accion === 'reportar') await api.reportarTarjeta(id)
      else await api.setTarjetaEstado(id, accion === 'bloquear' ? 'bloqueada' : 'activa')
      toast.push('Estado de la tarjeta actualizado.', 'ok')
      await queryClient.invalidateQueries({ queryKey: ['tarjetas'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }

  return (
    <div>
      <PageHeader title="Tarjetas" description="Débito y crédito. Nunca se almacena el número completo ni el CVV." actions={canIssue ? <Button onClick={() => setOpen(true)}>Emitir tarjeta</Button> : null} />
      <div className="mb-4 max-w-xs">
        <SelectInput aria-label="Estado de tarjeta" value={estado} onChange={(event) => { setEstado(event.target.value); setPage(1) }}>
          <option value="">Todos</option><option value="activa">Activa</option><option value="bloqueada">Bloqueada</option><option value="reportada">Reportada</option>
        </SelectInput>
      </div>
      {query.isLoading ? <SkeletonRows /> : query.isError ? <EmptyState title="No se pudieron cargar las tarjetas" body={errorText(query.error)} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {query.data?.items.map((tarjeta) => (
            <article key={tarjeta.id} className="rounded-2xl bg-navy p-4 text-white shadow-card">
              <div className="flex items-center justify-between text-sm text-white/70"><span>{tarjeta.marca}</span><Badge tone={toneFor(tarjeta.estado)}>{TARJETA_ESTADO[tarjeta.estado]}</Badge></div>
              <p className="mt-6 font-mono text-xl tracking-widest">···· ···· ···· {tarjeta.ultimos4}</p>
              <p className="mt-4 text-sm text-white/80">{tarjeta.clienteNombre} · {tarjeta.tipo === 'debito' ? 'Débito' : 'Crédito'}</p>
              <p className="text-xs text-white/60">Vence {tarjeta.vencimiento} · límite {formatMoney(tarjeta.limiteDiario)} / día</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {tarjeta.estado === 'activa' ? <Button tone="ghost" className="!bg-white/10 !text-white" onClick={() => void cambiar(tarjeta.id, 'bloquear')}>Bloquear</Button> : null}
                {tarjeta.estado !== 'activa' && canIssue ? <Button tone="ghost" className="!bg-white/10 !text-white" onClick={() => void cambiar(tarjeta.id, 'desbloquear')}>Desbloquear</Button> : null}
                {tarjeta.estado !== 'reportada' ? <Button tone="danger" onClick={() => void cambiar(tarjeta.id, 'reportar')}>Reportar pérdida</Button> : null}
              </div>
            </article>
          ))}
        </div>
      )}
      {query.data ? <Pagination page={query.data.page} pages={query.data.pages} total={query.data.total} onPage={setPage} /> : null}
      <Modal open={open} title="Emitir tarjeta" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(event) => void save(event)}>
          <Field label="Cliente" error={errors.clienteId}><SelectInput value={form.clienteId} onChange={(event) => setForm({ ...form, clienteId: event.target.value, cuentaId: '' })}><option value="">Seleccione</option>{catalogo.data?.clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombres} {cliente.apellidos}</option>)}</SelectInput></Field>
          <Field label="Cuenta" error={errors.cuentaId}><SelectInput value={form.cuentaId} onChange={(event) => setForm({ ...form, cuentaId: event.target.value })}><option value="">Seleccione</option>{cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.numero}</option>)}</SelectInput></Field>
          <Field label="Tipo"><SelectInput value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })}><option value="debito">Débito</option><option value="credito">Crédito</option></SelectInput></Field>
          <Field label="Marca"><SelectInput value={form.marca} onChange={(event) => setForm({ ...form, marca: event.target.value })}><option>Visa</option><option>Mastercard</option></SelectInput></Field>
          <Field label="Últimos 4 dígitos" error={errors.ultimos4}><TextInput inputMode="numeric" maxLength={4} value={form.ultimos4} onChange={(event) => setForm({ ...form, ultimos4: event.target.value })} /></Field>
          <Field label="Vencimiento mm/aa" error={errors.vencimiento}><TextInput placeholder="08/29" value={form.vencimiento} onChange={(event) => setForm({ ...form, vencimiento: event.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button tone="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit">Emitir</Button></div>
        </form>
      </Modal>
    </div>
  )
}
