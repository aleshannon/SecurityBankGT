import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { code, purpose } = await req.json()
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return json({ error: 'El código no es válido.' }, 400)
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: auth } = await userClient.auth.getUser()
    if (!auth.user) return json({ error: 'Debe iniciar sesión.' }, 401)
    const admin = createClient(url, service)
    const { data: challenge } = await admin.from('otp_challenges')
      .select('id, code_hash, expires_at, attempts, used')
      .eq('user_id', auth.user.id)
      .eq('purpose', purpose === 'transfer' ? 'transfer' : 'login')
      .eq('used', false)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!challenge || new Date(challenge.expires_at).getTime() < Date.now()) {
      return json({ error: 'El código venció. Solicite uno nuevo.' }, 400)
    }
    if (challenge.attempts >= 5) {
      await admin.from('otp_challenges').update({ used: true }).eq('id', challenge.id)
      return json({ error: 'El código quedó invalidado.' }, 400)
    }
    if (challenge.code_hash !== await sha256(code)) {
      await admin.from('otp_challenges').update({ attempts: challenge.attempts + 1 }).eq('id', challenge.id)
      return json({ error: 'El código no es válido.' }, 400)
    }
    await admin.from('otp_challenges').update({ used: true }).eq('id', challenge.id)
    if (purpose !== 'transfer') {
      await admin.from('mfa_sessions').update({ verified: true, last_activity: new Date().toISOString() }).eq('user_id', auth.user.id)
      const { data: mfa } = await admin.from('mfa_sessions').select('pais, ip, dispositivo').eq('user_id', auth.user.id).maybeSingle()
      const { data: profile } = await admin.from('profiles').select('pais_habitual, email').eq('user_id', auth.user.id).maybeSingle()
      const habitual = profile?.pais_habitual ?? 'GT'
      if (mfa?.pais && mfa.pais !== habitual) {
        await admin.from('security_events').insert({
          tipo: 'pais_diferente',
          severidad: 'alta',
          descripcion: 'El acceso se observó desde un país distinto al habitual.',
          user_id: auth.user.id,
          ip: mfa.ip || '',
          pais: mfa.pais,
          dispositivo: mfa.dispositivo || 'Navegador web',
        })
        const correo = profile?.email ?? auth.user.email ?? 'un usuario'
        await admin.from('notificaciones').insert({
          user_id: auth.user.id,
          tipo: 'dispositivo',
          titulo: 'Acceso desde otro país',
          mensaje: `Se registró un acceso desde ${mfa.pais}.`,
          severidad: 'alta',
        })
        const { data: staff } = await admin.from('user_roles').select('user_id').in('role', ['admin', 'auditor_seguridad'])
        if (staff?.length) {
          await admin.from('notificaciones').insert(staff.map((row: { user_id: string }) => ({
            user_id: row.user_id,
            tipo: 'dispositivo',
            titulo: 'Acceso desde otro país',
            mensaje: `${correo} ingresó desde ${mfa.pais}.`,
            severidad: 'alta',
          })))
        }
      }
    }
    return json({ ok: true })
  } catch {
    return json({ error: 'No se pudo completar la operación. Inténtelo de nuevo.' }, 500)
  }
})
