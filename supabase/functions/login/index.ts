import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { codigoEnPantalla, cuentaDeClase, deliverCode, otpCode, sha256 } from '../_shared/mail.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method === 'GET') return json({ reveal: Deno.env.get('DEMO_REVEAL_OTP') === 'true' })
  try {
    const { email, password, device, simulateForeign } = await req.json()
    if (typeof email !== 'string' || typeof password !== 'string') {
      return json({ error: 'No se pudo iniciar sesión.' }, 400)
    }
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const admin = createClient(url, service)
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count } = await admin.from('login_attempts').select('id', { count: 'exact', head: true }).eq('email', email.toLowerCase()).eq('exito', false).gte('fecha', since)
    if ((count ?? 0) >= 8) return json({ error: 'Demasiados intentos. Espere unos minutos.' }, 429)

    const { data: userRow } = await admin.auth.admin.listUsers()
    const match = userRow.users.find((user: { email?: string }) => user.email?.toLowerCase() === email.toLowerCase())
    if (match) {
      const { data: lock } = await admin.from('account_locks').select('until').eq('user_id', match.id).maybeSingle()
      if (lock && new Date(lock.until).getTime() > Date.now()) {
        return json({ error: 'La cuenta está bloqueada temporalmente.' }, 423)
      }
    }

    const publicClient = createClient(url, anon)
    const signed = await publicClient.auth.signInWithPassword({ email, password })
    const simularPais = simulateForeign === true && Deno.env.get('DEMO_REVEAL_OTP') === 'true'
    const pais = simularPais ? 'US' : 'GT'
    const ip = simularPais ? '104.28.22.14' : (req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '190.56.10.10')
    const dispositivo = typeof device === 'string' ? device.slice(0, 180) : 'Navegador web'
    await admin.from('login_attempts').insert({
      email: email.toLowerCase(),
      user_id: signed.data.user?.id ?? match?.id ?? null,
      exito: !signed.error,
      ip,
      dispositivo,
    })
    await admin.from('audit_logs').insert({
      user_id: signed.data.user?.id ?? null,
      accion: signed.error ? 'LOGIN_FALLIDO' : 'LOGIN',
      entidad: 'auth',
      entidad_id: signed.data.user?.id ?? null,
      ip,
      dispositivo,
      resultado: signed.error ? 'fallo' : 'exito',
    })

    if (signed.error || !signed.data.user || !signed.data.session) {
      if (match) {
        const { count: fails } = await admin.from('login_attempts').select('id', { count: 'exact', head: true }).eq('user_id', match.id).eq('exito', false).gte('fecha', since)
        if ((fails ?? 0) >= 5) {
          await admin.from('account_locks').upsert({ user_id: match.id, until: new Date(Date.now() + 15 * 60 * 1000).toISOString(), reason: 'Cinco intentos fallidos.' })
          await admin.from('security_events').insert({
            tipo: 'login_fallido', severidad: 'alta', descripcion: 'La cuenta se bloqueó tras cinco intentos fallidos.',
            user_id: match.id, ip, pais, dispositivo,
          })
        }
      }
      return json({ error: 'Correo o contraseña incorrectos.' }, 401)
    }

    const code = otpCode()
    const codeHash = await sha256(code)
    await admin.from('otp_challenges').insert({
      user_id: signed.data.user.id,
      purpose: 'login',
      code_hash: codeHash,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    const reveal = codigoEnPantalla(email)
    if (!cuentaDeClase(email)) {
      try {
        await deliverCode(email, code, 'Úselo para terminar de ingresar.')
      } catch (error) {
        console.error('correo', error instanceof Error ? error.message : 'fallo')
        if (!reveal) return json({ error: 'No se pudo enviar el código. Configure el correo del proyecto.' }, 502)
      }
    }
    await admin.from('mfa_sessions').upsert({
      user_id: signed.data.user.id,
      verified: false,
      last_activity: new Date().toISOString(),
      ip,
      dispositivo,
      pais,
    })
    return json({
      email,
      expiresAt: Date.now() + 5 * 60 * 1000,
      demoCode: reveal ? code : '',
      session: signed.data.session,
    })
  } catch {
    return json({ error: 'No se pudo completar la operación. Inténtelo de nuevo.' }, 500)
  }
})
