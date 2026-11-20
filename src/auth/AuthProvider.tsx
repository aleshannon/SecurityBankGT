import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { IDLE_MS } from '@/domain/constants'
import type { SessionView } from '@/domain/types'
import { useToast } from '@/components/toast'
import { Button, Modal } from '@/components/ui'

interface AuthValue {
  session: SessionView
  loading: boolean
  refresh: () => Promise<unknown>
  signOut: (reason?: string) => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const generation = useRef(0)
  const [closed, setClosed] = useState(false)
  const query = useQuery({
    queryKey: ['session'],
    staleTime: Infinity,
    queryFn: async () => {
      const ticket = generation.current
      const view = await api.session()
      if (ticket !== generation.current) return { status: 'anonymous' as const }
      return view
    },
  })
  const session = closed ? { status: 'anonymous' as const } : (query.data ?? { status: 'anonymous' as const })
  const signOut = useCallback(async (reason?: string) => {
    await api.signOut()
    generation.current += 1
    flushSync(() => setClosed(true))
    queryClient.setQueryData(['session'], { status: 'anonymous' })
    queryClient.removeQueries({ predicate: (item) => item.queryKey[0] !== 'session' })
    if (reason) toast.push(reason, 'info')
  }, [queryClient, toast])
  const expire = useCallback(() => {
    void signOut('Su sesión se cerró por inactividad.')
  }, [signOut])
  const refresh = useCallback(() => {
    setClosed(false)
    return query.refetch()
  }, [query])
  const value = useMemo<AuthValue>(() => ({
    session,
    loading: query.isLoading,
    refresh,
    signOut,
  }), [session, query.isLoading, refresh, signOut])
  return (
    <AuthContext.Provider value={value}>
      {children}
      {session.status === 'ready' ? <IdleGuard onExpire={expire} /> : null}
    </AuthContext.Provider>
  )
}

function IdleGuard({ onExpire }: { onExpire: () => void }) {
  const [warn, setWarn] = useState(false)
  const last = useRef(Date.now())
  const touched = useRef(0)
  useEffect(() => {
    const mark = () => {
      last.current = Date.now()
      setWarn(false)
      if (Date.now() - touched.current > 20000) {
        touched.current = Date.now()
        void api.touch()
      }
    }
    const events = ['keydown', 'pointerdown', 'scroll'] as const
    events.forEach((event) => window.addEventListener(event, mark, { passive: true }))
    const timer = window.setInterval(() => {
      const idle = Date.now() - last.current
      if (idle >= IDLE_MS) onExpire()
      else setWarn(idle >= IDLE_MS - 60000)
    }, 1000)
    return () => {
      events.forEach((event) => window.removeEventListener(event, mark))
      window.clearInterval(timer)
    }
  }, [onExpire])
  return (
    <Modal open={warn} title="La sesión está por cerrarse" onClose={() => { last.current = Date.now(); setWarn(false); void api.touch() }}>
      <p className="text-sm text-muted">Por seguridad, SecurityBankGT cierra la sesión después de 10 minutos sin actividad.</p>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => { last.current = Date.now(); setWarn(false); void api.touch() }}>Seguir conectado</Button>
      </div>
    </Modal>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('Falta el proveedor de sesión')
  return context
}
