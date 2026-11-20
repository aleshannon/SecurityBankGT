import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { registerSchema } from '@/domain/schemas'
import { useToast } from '@/components/toast'
import { Button, Field, Logo, PasswordMeter, TextInput, fieldErrors } from '@/components/ui'

const initial = { nombre: '', apellidos: '', email: '', password: '', telefono: '+502 ', dpi: '', fechaNacimiento: '' }

export function RegisterPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof initial, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = registerSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setBusy(true)
    try {
      await api.signUp(parsed.data)
      toast.push('Cuenta creada. El rol asignado es cliente y el KYC quedó pendiente.', 'ok')
      navigate('/login')
    } catch (error) {
      toast.push(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <Logo />
      <h1 className="mt-6 text-2xl font-semibold">Crear acceso de cliente</h1>
      <p className="mt-1 text-sm text-muted">El rol no se elige aquí. El servidor asigna siempre el rol cliente.</p>
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombres" error={errors.nombre}><TextInput value={form.nombre} onChange={(event) => set('nombre', event.target.value)} /></Field>
          <Field label="Apellidos" error={errors.apellidos}><TextInput value={form.apellidos} onChange={(event) => set('apellidos', event.target.value)} /></Field>
        </div>
        <Field label="Correo" error={errors.email}><TextInput type="email" value={form.email} onChange={(event) => set('email', event.target.value)} /></Field>
        <Field label="Contraseña" error={errors.password}>
          <TextInput type="password" autoComplete="new-password" value={form.password} onChange={(event) => set('password', event.target.value)} />
        </Field>
        <PasswordMeter password={form.password} />
        <Field label="Teléfono" error={errors.telefono}><TextInput value={form.telefono} onChange={(event) => set('telefono', event.target.value)} placeholder="+502 5555 0101" /></Field>
        <Field label="DPI" error={errors.dpi}><TextInput inputMode="numeric" maxLength={13} value={form.dpi} onChange={(event) => set('dpi', event.target.value)} /></Field>
        <Field label="Fecha de nacimiento" error={errors.fechaNacimiento}><TextInput type="date" value={form.fechaNacimiento} onChange={(event) => set('fechaNacimiento', event.target.value)} /></Field>
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Creando…' : 'Crear cuenta'}</Button>
      </form>
      <p className="mt-4 text-sm"><Link className="font-medium text-accentink" to="/login">Volver al ingreso</Link></p>
    </div>
  )
}
