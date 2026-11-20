import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { beneficiarioSchema } from '@/domain/schemas'
import type { Beneficiario } from '@/domain/types'
import { useToast } from '@/components/toast'
import { Button, EmptyState, Field, Modal, PageHeader, SelectInput, SkeletonRows, TextInput, fieldErrors } from '@/components/ui'

const empty = { clienteId: '', nombre: '', numeroCuenta: '', banco: 'SecurityBankGT', alias: '' }

export function BeneficiariosPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [remove, setRemove] = useState<Beneficiario | null>(null)
  const query = useQuery({ queryKey: ['beneficiarios'], queryFn: () => api.listBeneficiarios() })
  const catalogo = useQuery({ queryKey: ['catalogo'], queryFn: () => api.catalogo() })

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = beneficiarioSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    try {
      await api.saveBeneficiario(editing ? { ...parsed.data, id: editing } : parsed.data)
      toast.push('Beneficiario guardado.', 'ok')
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['beneficiarios'] })
      await queryClient.invalidateQueries({ queryKey: ['catalogo'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }

  return (
    <div>
      <PageHeader title="Beneficiarios" description="Destinos frecuentes para transferencias a terceros." actions={<Button onClick={() => { setEditing(null); setForm(empty); setOpen(true) }}>Agregar</Button>} />
      {query.isLoading ? <SkeletonRows /> : query.isError ? <EmptyState title="No se pudo cargar" body={errorText(query.error)} /> : query.data?.length === 0 ? <EmptyState title="Sin beneficiarios" body="Agregue un destino para transferir a terceros." /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-muted"><tr>{['Alias', 'Nombre', 'Cuenta', 'Banco', ''].map((head) => <th key={head} className="px-3 py-3 font-medium">{head}</th>)}</tr></thead>
            <tbody>
              {query.data?.map((item) => (
                <tr key={item.id} className="border-t border-line">
                  <td className="px-3 py-3">{item.alias}</td>
                  <td className="px-3 py-3">{item.nombre}</td>
                  <td className="px-3 py-3 font-mono text-xs">{item.numeroCuenta}</td>
                  <td className="px-3 py-3">{item.banco}</td>
                  <td className="px-3 py-3 space-x-3">
                    <button type="button" className="text-accentink" onClick={() => { setEditing(item.id); setForm({ clienteId: item.clienteId, nombre: item.nombre, numeroCuenta: item.numeroCuenta, banco: item.banco, alias: item.alias }); setOpen(true) }}>Editar</button>
                    <button type="button" className="text-rose-700" onClick={() => setRemove(item)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={open} title={editing ? 'Editar beneficiario' : 'Nuevo beneficiario'} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(event) => void save(event)}>
          <Field label="Cliente" error={errors.clienteId}>
            <SelectInput value={form.clienteId} onChange={(event) => setForm({ ...form, clienteId: event.target.value })}>
              <option value="">Seleccione</option>
              {catalogo.data?.clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.codigo} · {cliente.nombres}</option>)}
            </SelectInput>
          </Field>
          <Field label="Nombre" error={errors.nombre}><TextInput value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} /></Field>
          <Field label="Alias" error={errors.alias}><TextInput value={form.alias} onChange={(event) => setForm({ ...form, alias: event.target.value })} /></Field>
          <Field label="Número de cuenta" error={errors.numeroCuenta}><TextInput value={form.numeroCuenta} onChange={(event) => setForm({ ...form, numeroCuenta: event.target.value })} /></Field>
          <Field label="Banco" error={errors.banco}><TextInput value={form.banco} onChange={(event) => setForm({ ...form, banco: event.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button tone="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit">Guardar</Button></div>
        </form>
      </Modal>
      <Modal open={Boolean(remove)} title="Eliminar beneficiario" onClose={() => setRemove(null)}>
        <p className="text-sm text-muted">Se quitará {remove?.alias}. Las transferencias ya hechas no se modifican.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button tone="ghost" onClick={() => setRemove(null)}>Cancelar</Button>
          <Button tone="danger" onClick={() => void api.deleteBeneficiario(remove!.id).then(async () => { toast.push('Beneficiario eliminado.', 'ok'); setRemove(null); await queryClient.invalidateQueries({ queryKey: ['beneficiarios'] }) }).catch((error: unknown) => toast.push(errorText(error), 'error'))}>Eliminar</Button>
        </div>
      </Modal>
    </div>
  )
}
