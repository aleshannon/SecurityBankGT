import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api, modoDatos } from '@/api'
import { errorText } from '@/domain/errors'
import { deviceLabel } from '@/domain/format'
import { loginSchema } from '@/domain/schemas'
import { DEMO_ACCOUNTS } from '@/server/directory'
import { ROLE_LABEL } from '@/domain/labels'
import { useAuth } from '@/auth/AuthProvider'
import { rememberOtp } from '@/auth/pendingOtp'
import { useToast } from '@/components/toast'
import { Button, Field, Logo, PasswordMeter, TextInput, fieldErrors } from '@/components/ui'

export function LoginPage() {
  const { session, loading, refresh } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const real = modoDatos === 'supabase'
  const [mostrarCuentas, setMostrarCuentas] = useState(!real)
  const [email, setEmail] = useState(real ? '' : 'admin@securitybankgt.com')
  const [password, setPassword] = useState('')
  const [foreign, setForeign] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!real) return
    const base = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!base || !key) return
    let cancel = false
    void fetch(`${base}/functions/v1/login`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
      .then((response) => response.json())
      .then((data: { reveal?: boolean }) => {
        if (!cancel && data.reveal) setMostrarCuentas(true)
      })
      .catch(() => undefined)
    return () => { cancel = true }
  }, [real])
  if (!loading && session.status === 'ready') return <Navigate to="/panel" replace />
  if (!loading && session.status === 'mfa') return <Navigate to="/mfa" replace />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = loginSchema.safeParse({ email, password, simulateForeign: foreign })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setBusy(true)
    setErrors({})
    try {
      const pending = await api.signIn({ ...parsed.data, device: deviceLabel() })
      rememberOtp(pending.demoCode)
      await refresh()
      navigate('/mfa')
    } catch (error) {
      toast.push(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-navy px-10 py-12 text-white lg:flex">
        <Logo light />
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-accent">Banca digital · Guatemala</p>
          <h1 className="mt-4 max-w-md text-4xl font-semibold leading-tight">Cada acceso se autoriza en el servidor. Cada movimiento queda registrado.</h1>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            <li>Roles separados de la ficha del usuario.</li>
            <li>Transferencias atómicas, con límite diario e idempotencia.</li>
            <li>Riesgos, hallazgos y bitácora en el mismo portal.</li>
          </ul>
        </div>
        <p className="text-xs text-white/60">Quetzales (GTQ) · fechas dd/mm/aaaa{real ? '' : ' · datos ficticios'}</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8"><Logo /></div>
          <h2 className="text-2xl font-semibold">Ingresar</h2>
          <p className="mt-1 text-sm text-muted">{real ? 'Ingrese con su correo y contraseña.' : 'Use una cuenta de demostración o regístrese como cliente.'}</p>
          <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)} noValidate>
            <Field label="Correo" error={errors.email}>
              <TextInput type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </Field>
            <Field label="Contraseña" error={errors.password}>
              <TextInput type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </Field>
            <PasswordMeter password={password} />
            {mostrarCuentas ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={foreign} onChange={(event) => setForeign(event.target.checked)} />
                <span>Simular inicio desde el extranjero. El servidor registrará el país y generará un evento.</span>
              </label>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Verificando…' : 'Continuar'}</Button>
          </form>
          <p className="mt-4 text-sm">¿Aún no tiene acceso? <Link className="font-medium text-accentink" to="/registro">Crear cuenta de cliente</Link></p>
          {mostrarCuentas ? (
            <div className="mt-8 overflow-hidden rounded-2xl border border-line">
              <p className="bg-canvas px-4 py-3 text-sm font-medium">Cuentas de demostración</p>
              <ul className="divide-y divide-line">
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account.email} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{ROLE_LABEL[account.role]}</p>
                      <p className="text-muted">{account.email}</p>
                      <p className="font-mono text-xs text-muted">{account.password}</p>
                    </div>
                    <Button tone="ghost" onClick={() => { setEmail(account.email); setPassword(account.password) }}>Usar</Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
