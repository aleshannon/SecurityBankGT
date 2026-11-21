import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { ROLE_LABEL } from '@/domain/labels'
import { passwordSchema } from '@/domain/schemas'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/toast'
import { Button, Field, PageHeader, Panel, PasswordMeter, TextInput } from '@/components/ui'

export function PerfilPage() {
  const { session } = useAuth()
  const toast = useToast()
  const cliente = useQuery({ queryKey: ['mi-cliente', session.clienteId], queryFn: () => api.getCliente(session.clienteId ?? ''), enabled: Boolean(session.clienteId) })
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')

  const cambiar = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = passwordSchema.safeParse(nueva)
    if (!parsed.success) return toast.push(parsed.error.issues[0]?.message ?? 'La contraseña no cumple la política.', 'error')
    try {
      await api.changePassword({ actual, nueva: parsed.data })
      toast.push('Contraseña actualizada.', 'ok')
      setActual('')
      setNueva('')
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Perfil" description="La sesión muestra el rol que devuelve el servidor. No se lee desde el navegador." />
      <Panel>
        <p className="text-lg font-semibold">{session.nombre}</p>
        <p className="text-sm text-muted">{session.email}</p>
        <p className="mt-2 text-sm">Rol: {session.role ? ROLE_LABEL[session.role] : '—'}</p>
        {cliente.data ? (
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Código</dt><dd>{cliente.data.cliente.codigo}</dd></div>
            <div><dt className="text-muted">DPI</dt><dd className="font-mono">{cliente.data.cliente.dpi}</dd></div>
            <div><dt className="text-muted">Teléfono</dt><dd>{cliente.data.cliente.telefono}</dd></div>
            <div><dt className="text-muted">KYC</dt><dd>{cliente.data.cliente.estadoKyc}</dd></div>
          </dl>
        ) : null}
      </Panel>
      <Panel className="mt-4">
        <h2 className="font-semibold">Cambiar contraseña</h2>
        <form className="mt-3 space-y-3" onSubmit={(event) => void cambiar(event)}>
          <Field label="Contraseña actual"><TextInput type="password" value={actual} onChange={(event) => setActual(event.target.value)} /></Field>
          <Field label="Nueva contraseña"><TextInput type="password" value={nueva} onChange={(event) => setNueva(event.target.value)} /></Field>
          <PasswordMeter password={nueva} />
          <Button type="submit">Actualizar</Button>
        </form>
      </Panel>
    </div>
  )
}
