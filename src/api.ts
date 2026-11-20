import { demo } from '@/server/demoApi'
import { remote } from '@/server/remoteApi'

const enabled = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

export const api = enabled ? remote : demo
export const modoDatos = enabled ? 'supabase' : 'demostracion'
