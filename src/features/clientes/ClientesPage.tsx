import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { formatDate } from '@/domain/format'
import { CLIENTE_ESTADO, KYC_LABEL, RIESGO_NIVEL, toneFor } from '@/domain/labels'
import { clienteSchema } from '@/domain/schemas'
import type { Cliente, EstadoCliente } from '@/domain/types'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/toast'
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Pagination, SelectInput, SkeletonRows, TextInput, fieldErrors } from '@/components/ui'

const empty = { nombres: '', apellidos: '', dpi: '', nit: '', correo: '', telefono: '+502 ', direccion: '', fechaNacimiento: '', nivelRiesgo: 'bajo', estadoKyc: 'pendiente', estado: 'activo' }

export function ClientesPage() {
  const { session } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const canWrite = session.role === 'admin' || session.role === 'ejecutivo'
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('')
  const [kyc, setKyc] = useState('')
  const [riesgo, setRiesgo] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<Cliente | null>(null)
  const query = useQuery({ queryKey: ['clientes', q, estado, kyc, riesgo, page], queryFn: () => api.listClientes({ q, estado, kyc, riesgo, page }) })

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = clienteSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    try {
      await api.saveCliente(editing ? { ...parsed.data, id: editing } : parsed.data)
      toast.push(editing ? 'Cliente actualizado.' : 'Cliente registrado.', 'ok')
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['clientes'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }

  const desactivar = async () => {
    if (!confirm) return
    try {
      await api.setClienteEstado(confirm.id, 'inactivo')
      toast.push('Cliente desactivado.', 'ok')
      setConfirm(null)
      await queryClient.invalidateQueries({ queryKey: ['clientes'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }

  return (
    <div>
      <PageHeader title="Clientes" description="Alta, consulta y desactivación. El DPI se enmascara para los roles que no deben verlo completo." actions={canWrite ? <Button onClick={() => { setEditing(null); setForm(empty); setErrors({}); setOpen(true) }}>Registrar cliente</Button> : null} />
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <TextInput placeholder="Buscar código, nombre o correo" aria-label="Buscar clientes" value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} />
        <SelectInput aria-label="Estado" value={estado} onChange={(event) => { setEstado(event.target.value); setPage(1) }}>
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
          <option value="bloqueado">Bloqueado</option>
        </SelectInput>
        <SelectInput aria-label="KYC" value={kyc} onChange={(event) => { setKyc(event.target.value); setPage(1) }}>
          <option value="">Todo KYC</option>
          <option value="pendiente">Pendiente</option>
          <option value="verificado">Verificado</option>
          <option value="rechazado">Rechazado</option>
        </SelectInput>
        <SelectInput aria-label="Riesgo" value={riesgo} onChange={(event) => { setRiesgo(event.target.value); setPage(1) }}>
          <option value="">Todo riesgo</option>
          <option value="bajo">Bajo</option>
          <option value="medio">Medio</option>
          <option value="alto">Alto</option>
        </SelectInput>
      </div>
      {query.isLoading ? <SkeletonRows /> : query.isError || !query.data ? <EmptyState title="No se pudo consultar" body={errorText(query.error)} /> : query.data.items.length === 0 ? <EmptyState title="Sin clientes" body="Ajuste los filtros o registre un cliente nuevo." /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-muted"><tr>{['Código', 'Nombre', 'DPI', 'Correo', 'KYC', 'Riesgo', 'Estado', 'Alta', ''].map((head) => <th key={head} className="px-3 py-3 font-medium">{head}</th>)}</tr></thead>
            <tbody>
              {query.data.items.map((cliente) => (
                <tr key={cliente.id} className="border-t border-line">
                  <td className="px-3 py-3">{cliente.codigo}</td>
                  <td className="px-3 py-3">{cliente.nombres} {cliente.apellidos}</td>
                  <td className="px-3 py-3 font-mono text-xs">{cliente.dpi}</td>
                  <td className="px-3 py-3">{cliente.correo}</td>
                  <td className="px-3 py-3"><Badge tone={toneFor(cliente.estadoKyc)}>{KYC_LABEL[cliente.estadoKyc]}</Badge></td>
                  <td className="px-3 py-3"><Badge tone={toneFor(cliente.nivelRiesgo)}>{RIESGO_NIVEL[cliente.nivelRiesgo]}</Badge></td>
                  <td className="px-3 py-3"><Badge tone={toneFor(cliente.estado)}>{CLIENTE_ESTADO[cliente.estado]}</Badge></td>
                  <td className="px-3 py-3">{formatDate(cliente.fechaAlta)}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <Link className="text-accentink" to={`/clientes/${cliente.id}`}>Ver</Link>
                      {canWrite ? <button type="button" className="text-accentink" onClick={() => { setEditing(cliente.id); setForm({ nombres: cliente.nombres, apellidos: cliente.apellidos, dpi: cliente.dpi, nit: cliente.nit, correo: cliente.correo, telefono: cliente.telefono, direccion: cliente.direccion, fechaNacimiento: cliente.fechaNacimiento, nivelRiesgo: cliente.nivelRiesgo, estadoKyc: cliente.estadoKyc, estado: cliente.estado }); setErrors({}); setOpen(true) }}>Editar</button> : null}
                      {canWrite && cliente.estado === 'activo' ? <button type="button" className="text-rose-700" onClick={() => setConfirm(cliente)}>Desactivar</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.data ? <Pagination page={query.data.page} pages={query.data.pages} total={query.data.total} onPage={setPage} /> : null}
      <Modal open={open} title={editing ? 'Editar cliente' : 'Registrar cliente'} onClose={() => setOpen(false)} wide>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
          <Field label="Nombres" error={errors.nombres}><TextInput value={form.nombres} onChange={(event) => setForm({ ...form, nombres: event.target.value })} /></Field>
          <Field label="Apellidos" error={errors.apellidos}><TextInput value={form.apellidos} onChange={(event) => setForm({ ...form, apellidos: event.target.value })} /></Field>
          <Field label="DPI" error={errors.dpi}><TextInput value={form.dpi} onChange={(event) => setForm({ ...form, dpi: event.target.value })} /></Field>
          <Field label="NIT" error={errors.nit}><TextInput value={form.nit} placeholder="1234567-8" onChange={(event) => setForm({ ...form, nit: event.target.value })} /></Field>
          <Field label="Correo" error={errors.correo}><TextInput type="email" value={form.correo} onChange={(event) => setForm({ ...form, correo: event.target.value })} /></Field>
          <Field label="Teléfono" error={errors.telefono}><TextInput value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} /></Field>
          <Field label="Dirección" error={errors.direccion}><TextInput value={form.direccion} onChange={(event) => setForm({ ...form, direccion: event.target.value })} /></Field>
          <Field label="Nacimiento" error={errors.fechaNacimiento}><TextInput type="date" value={form.fechaNacimiento} onChange={(event) => setForm({ ...form, fechaNacimiento: event.target.value })} /></Field>
          <Field label="Riesgo" error={errors.nivelRiesgo}>
            <SelectInput value={form.nivelRiesgo} onChange={(event) => setForm({ ...form, nivelRiesgo: event.target.value })}>
              <option value="bajo">Bajo</option><option value="medio">Medio</option><option value="alto">Alto</option>
            </SelectInput>
          </Field>
          <Field label="KYC" error={errors.estadoKyc}>
            <SelectInput value={form.estadoKyc} onChange={(event) => setForm({ ...form, estadoKyc: event.target.value })}>
              <option value="pendiente">Pendiente</option><option value="verificado">Verificado</option><option value="rechazado">Rechazado</option>
            </SelectInput>
          </Field>
          <Field label="Estado" error={errors.estado}>
            <SelectInput value={form.estado} onChange={(event) => setForm({ ...form, estado: event.target.value as EstadoCliente })}>
              <option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="bloqueado">Bloqueado</option>
            </SelectInput>
          </Field>
          <div className="sm:col-span-2 flex justify-end gap-2"><Button tone="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit">Guardar</Button></div>
        </form>
      </Modal>
      <Modal open={Boolean(confirm)} title="Desactivar cliente" onClose={() => setConfirm(null)}>
        <p className="text-sm text-muted">El cliente {confirm?.nombres} quedará inactivo. Esta acción no borra su historial.</p>
        <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={() => setConfirm(null)}>Cancelar</Button><Button tone="danger" onClick={() => void desactivar()}>Desactivar</Button></div>
      </Modal>
    </div>
  )
}
