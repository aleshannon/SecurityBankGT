import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { errorText } from '@/domain/errors'
import { useAuth } from '@/auth/AuthProvider'
import { clearOtp, readOtp } from '@/auth/pendingOtp'
import { useToast } from '@/components/toast'
import { Button, Logo } from '@/components/ui'

export function MfaPage() {
  const { session, loading, refresh, signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [demoCode, setDemoCode] = useState(readOtp)
  const [busy, setBusy] = useState(false)
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  if (!loading && session.status === 'anonymous') return <Navigate to="/login" replace />
  if (!loading && session.status === 'ready') return <Navigate to="/panel" replace />

  const update = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '')
    if (clean.length > 1) {
      const next = clean.slice(0, 6).split('')
      const filled = ['', '', '', '', '', '']
      next.forEach((char, position) => { filled[position] = char })
      setDigits(filled)
      inputs.current[Math.min(next.length, 5)]?.focus()
      return
    }
    const copy = [...digits]
    copy[index] = clean
    setDigits(copy)
    if (clean && index < 5) inputs.current[index + 1]?.focus()
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.verifyOtp(digits.join(''))
      clearOtp()
      await refresh()
      toast.push('Acceso confirmado.', 'ok')
      navigate('/panel')
    } catch (error) {
      toast.push(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    try {
      const result = await api.resendOtp()
      setDemoCode(result.demoCode)
      toast.push(result.demoCode ? 'Se generó un código nuevo. Vence en 5 minutos.' : 'Enviamos un código nuevo a su correo. Vence en 5 minutos.', 'info')
    } catch (error) {
      toast.push(errorText(error), 'error')
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Logo />
      <h1 className="mt-6 text-2xl font-semibold">Verificación en dos pasos</h1>
      <p className="mt-1 text-sm text-muted">Ingrese el código de 6 dígitos enviado a {session.email}. Vence en 5 minutos y solo puede usarse una vez.</p>
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <div className="flex justify-between gap-2" role="group" aria-label="Código de 6 dígitos">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(node) => { inputs.current[index] = node }}
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              aria-label={`Dígito ${index + 1}`}
              className={`h-14 w-12 rounded-2xl border bg-surface text-center text-xl font-semibold text-ink shadow-[0_1px_2px_rgba(11,37,69,0.06),0_6px_16px_rgba(11,37,69,0.04)] outline-none transition duration-150 hover:border-accent/55 focus:border-accent focus:shadow-[0_0_0_4px_rgba(19,168,158,0.18)] ${digit ? 'border-accent' : 'border-[#c9d7e4] dark:border-line'}`}
              value={digit}
              onChange={(event) => update(index, event.target.value)}
            />
          ))}
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Validando…' : 'Confirmar código'}</Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button type="button" className="font-medium text-accentink" onClick={() => void resend()}>Generar otro código</button>
        <button type="button" className="text-muted" onClick={() => void signOut().then(() => navigate('/login'))}>Cancelar</button>
      </div>
      {demoCode ? <p className="mt-6 rounded-xl bg-canvas px-4 py-3 text-sm">Código de demostración: <strong className="font-mono">{demoCode}</strong>. Vence en 5 minutos y solo puede usarse una vez.</p> : (
        <p className="mt-6 text-sm text-muted">Si no vio el código al ingresar, genere uno nuevo. El servidor guarda solo su resumen, no el número en claro.</p>
      )}
    </div>
  )
}
