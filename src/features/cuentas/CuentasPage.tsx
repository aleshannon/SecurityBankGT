import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { formatDate, formatMoney } from '@/domain/format'
import { CUENTA_TIPO, toneFor } from '@/domain/labels'
import { cuentaSchema } from '@/domain/schemas'
import type { CuentaVista } from '@/domain/types'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/toast'
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Pagination, SelectInput, SkeletonRows, TextInput, fieldErrors } from '@/components/ui'

export function CuentasPage() {
  const { session } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const canOpen = session.role === 'admin' || session.role === 'ejecutivo'
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('')
  const [tipo, setTipo] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ clienteId: '', tipo: 'monetaria', limiteDiario: '10000' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [target, setTarget] = useState<CuentaVista | null>(null)
  const query = useQuery({ queryKey: ['cuentas', q, estado, tipo, page], queryFn: () => api.listCuentas({ q, estado, tipo, page }) })
  const catalogo = useQuery({ queryKey: ['catalogo'], queryFn: () => api.catalogo(), enabled: canOpen })

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = cuentaSchema.safeParse({ ...form, limiteDiario: Number(form.limiteDiario) })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    try {
      await api.saveCuenta(parsed.data)
      toast.push('Cuenta abierta.', 'ok')
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['cuentas'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }

  const cambiar = async () => {
    if (!target) return
    try {
      await api.setCuentaEstado(target.id, target.estado === 'activa' ? 'bloqueada' : 'activa')
      toast.push(target.estado === 'activa' ? 'Cuenta bloqueada.' : 'Cuenta desbloqueada.', 'ok')
      setTarget(null)
      await queryClient.invalidateQueries({ queryKey: ['cuentas'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }

  return (
    <div>
      <PageHeader title={session.role === 'cliente' ? 'Mis cuentas' : 'Cuentas'} description="Monetarias, de ahorro e inversión en quetzales." actions={canOpen ? <Button onClick={() => setOpen(true)}>Abrir cuenta</Button> : null} />
      <div className="mb-4 grid gap-2 md:grid-cols-3">
        <TextInput aria-label="Buscar número" placeholder="Número de cuenta" value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} />
        <SelectInput aria-label="Tipo" value={tipo} onChange={(event) => { setTipo(event.target.value); setPage(1) }}><option value="">Todos los tipos</option><option value="monetaria">Monetaria</option><option value="ahorro">Ahorro</option><option value="inversion">Inversión</option></SelectInput>
        <SelectInput aria-label="Estado" value={estado} onChange={(event) => { setEstado(event.target.value); setPage(1) }}><option value="">Todos</option><option value="activa">Activa</option><option value="bloqueada">Bloqueada</option></SelectInput>
      </div>
      {query.isLoading ? <SkeletonRows /> : query.isError ? <EmptyState title="No se pudieron cargar las cuentas" body={errorText(query.error)} /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-muted"><tr>{['Número', 'Cliente', 'Tipo', 'Saldo', 'Límite diario', 'Estado', 'Apertura', ''].map((head) => <th key={head} className="px-3 py-3 font-medium">{head}</th>)}</tr></thead>
            <tbody>
              {query.data?.items.map((cuenta) => (
                <tr key={cuenta.id} className="border-t border-line">
                  <td className="px-3 py-3 font-mono text-xs">{cuenta.numero}</td>
                  <td className="px-3 py-3">{cuenta.clienteNombre}</td>
                  <td className="px-3 py-3">{CUENTA_TIPO[cuenta.tipo]}</td>
                  <td className="px-3 py-3">{formatMoney(cuenta.saldo)}</td>
                  <td className="px-3 py-3">{formatMoney(cuenta.limiteDiario)}</td>
                  <td className="px-3 py-3"><Badge tone={toneFor(cuenta.estado)}>{cuenta.estado === 'activa' ? 'Activa' : 'Bloqueada'}</Badge></td>
                  <td className="px-3 py-3">{formatDate(cuenta.fechaApertura)}</td>
                  <td className="px-3 py-3">{session.role === 'auditor_seguridad' ? null : <button type="button" className="text-accentink" onClick={() => setTarget(cuenta)}>{cuenta.estado === 'activa' ? 'Bloquear' : 'Desbloquear'}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.data ? <Pagination page={query.data.page} pages={query.data.pages} total={query.data.total} onPage={setPage} /> : null}
      <Modal open={open} title="Abrir cuenta" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(event) => void save(event)}>
          <Field label="Cliente" error={errors.clienteId}>
            <SelectInput value={form.clienteId} onChange={(event) => setForm({ ...form, clienteId: event.target.value })}>
              <option value="">Seleccione</option>
              {catalogo.data?.clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.codigo} · {cliente.nombres} {cliente.apellidos}</option>)}
            </SelectInput>
          </Field>
          <Field label="Tipo" error={errors.tipo}>
            <SelectInput value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })}><option value="monetaria">Monetaria</option><option value="ahorro">Ahorro</option><option value="inversion">Inversión</option></SelectInput>
          </Field>
          <Field label="Límite diario (GTQ)" error={errors.limiteDiario}><TextInput inputMode="decimal" value={form.limiteDiario} onChange={(event) => setForm({ ...form, limiteDiario: event.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button tone="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit">Abrir</Button></div>
        </form>
      </Modal>
      <Modal open={Boolean(target)} title={target?.estado === 'activa' ? 'Bloquear cuenta' : 'Desbloquear cuenta'} onClose={() => setTarget(null)}>
        <p className="text-sm text-muted">La cuenta {target?.numero} cambiará de estado. El saldo y los movimientos se conservan.</p>
        <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={() => setTarget(null)}>Cancelar</Button><Button tone={target?.estado === 'activa' ? 'danger' : 'primary'} onClick={() => void cambiar()}>Confirmar</Button></div>
      </Modal>
    </div>
  )
}
