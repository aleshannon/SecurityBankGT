import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { formatMoney } from '@/domain/format'
import { transferenciaSchema } from '@/domain/schemas'
import { useToast } from '@/components/toast'
import { Button, Field, PageHeader, Panel, SelectInput, TextInput, fieldErrors } from '@/components/ui'

export function TransferirPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const catalogo = useQuery({ queryKey: ['catalogo'], queryFn: () => api.catalogo() })
  const [form, setForm] = useState({ cuentaOrigenId: '', destino: 'propia', cuentaDestinoId: '', beneficiarioId: '', monto: '', canal: 'web' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<{ draftId: string; demoCode: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const origen = catalogo.data?.cuentas.find((cuenta) => cuenta.id === form.cuentaOrigenId)
  const propias = catalogo.data?.cuentas.filter((cuenta) => cuenta.clienteId === origen?.clienteId && cuenta.id !== origen?.id) ?? []
  const beneficiarios = catalogo.data?.beneficiarios.filter((item) => !origen || item.clienteId === origen.clienteId) ?? []

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = transferenciaSchema.safeParse({ ...form, monto: Number(form.monto), idempotencyKey: crypto.randomUUID() })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setBusy(true)
    try {
      const result = await api.transferir(parsed.data)
      if ('tipo' in result && result.tipo === 'requiere_otp') {
        setPending({ draftId: result.draftId, demoCode: result.demoCode })
        toast.push(result.demoCode ? 'El monto supera Q10,000. Confirme con el código.' : 'El monto supera Q10,000. Enviamos el código a su correo.', 'info')
      } else {
        toast.push(`Transferencia ${result.referencia} registrada.`, 'ok')
        await queryClient.invalidateQueries({ queryKey: ['movimientos'] })
        await queryClient.invalidateQueries({ queryKey: ['catalogo'] })
      }
    } catch (error) {
      toast.push(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!pending) return
    setBusy(true)
    try {
      const done = await api.confirmarTransferencia({ draftId: pending.draftId, code })
      toast.push(`Operación ${done.referencia} marcada para revisión.`, 'ok')
      setPending(null)
      setCode('')
      await queryClient.invalidateQueries({ queryKey: ['catalogo'] })
    } catch (error) {
      toast.push(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Transferir" description="Entre cuentas propias o hacia un beneficiario. Sobre Q10,000 se pide un código y la operación queda marcada." />
      <Panel>
        <form className="space-y-3" onSubmit={(event) => void submit(event)}>
          <Field label="Cuenta origen" error={errors.cuentaOrigenId}>
            <SelectInput value={form.cuentaOrigenId} onChange={(event) => setForm({ ...form, cuentaOrigenId: event.target.value })}>
              <option value="">Seleccione</option>
              {catalogo.data?.cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.numero} · {cuenta.clienteNombre} · {formatMoney(cuenta.saldo)}</option>)}
            </SelectInput>
          </Field>
          <Field label="Destino">
            <SelectInput value={form.destino} onChange={(event) => setForm({ ...form, destino: event.target.value })}>
              <option value="propia">Cuenta propia</option>
              <option value="beneficiario">Beneficiario</option>
            </SelectInput>
          </Field>
          {form.destino === 'propia' ? (
            <Field label="Cuenta destino" error={errors.cuentaDestinoId}>
              <SelectInput value={form.cuentaDestinoId} onChange={(event) => setForm({ ...form, cuentaDestinoId: event.target.value })}>
                <option value="">Seleccione</option>
                {propias.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.numero} · {formatMoney(cuenta.saldo)}</option>)}
              </SelectInput>
            </Field>
          ) : (
            <Field label="Beneficiario" error={errors.beneficiarioId}>
              <SelectInput value={form.beneficiarioId} onChange={(event) => setForm({ ...form, beneficiarioId: event.target.value })}>
                <option value="">Seleccione</option>
                {beneficiarios.map((item) => <option key={item.id} value={item.id}>{item.alias} · {item.nombre} · {item.banco}</option>)}
              </SelectInput>
            </Field>
          )}
          <Field label="Monto en quetzales" error={errors.monto}><TextInput inputMode="decimal" value={form.monto} onChange={(event) => setForm({ ...form, monto: event.target.value })} /></Field>
          <Field label="Canal">
            <SelectInput value={form.canal} onChange={(event) => setForm({ ...form, canal: event.target.value })}><option value="web">Web</option><option value="movil">Móvil</option><option value="cajero">Cajero</option></SelectInput>
          </Field>
          <Button type="submit" disabled={busy}>Transferir</Button>
        </form>
      </Panel>
      {pending ? (
        <Panel className="mt-4">
          <h2 className="font-semibold">Confirmación con código</h2>
          <p className="mt-1 text-sm text-muted">{pending.demoCode ? <>Código de demostración: <strong className="font-mono">{pending.demoCode}</strong>. Vence en 5 minutos.</> : 'Enviamos un código de 6 dígitos al correo con el que inició sesión. Vence en 5 minutos y solo puede usarse una vez.'}</p>
          <form className="mt-3 flex gap-2" onSubmit={(event) => void confirm(event)}>
            <TextInput aria-label="Código" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} />
            <Button type="submit" disabled={busy}>Confirmar</Button>
          </form>
        </Panel>
      ) : null}
    </div>
  )
}
