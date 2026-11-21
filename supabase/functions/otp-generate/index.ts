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
  try {
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: auth } = await userClient.auth.getUser()
    if (!auth.user) return json({ error: 'Debe iniciar sesión.' }, 401)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count } = await admin.from('otp_challenges').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id).eq('purpose', 'login').gte('creado_en', since)
    if ((count ?? 0) >= 3) return json({ error: 'Demasiados códigos solicitados. Espere unos minutos.' }, 429)
    const code = otpCode()
    await admin.from('otp_challenges').insert({
      user_id: auth.user.id,
      purpose: 'login',
      code_hash: await sha256(code),
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    const correo = auth.user.email ?? ''
    const reveal = codigoEnPantalla(correo)
    if (!cuentaDeClase(correo)) {
      try {
        await deliverCode(correo, code, 'Úselo para terminar de ingresar.')
      } catch (error) {
        console.error('correo', error instanceof Error ? error.message : 'fallo')
        if (!reveal) return json({ error: 'No se pudo enviar el código. Configure el correo del proyecto.' }, 502)
      }
    }
    return json({
      email: auth.user.email,
      expiresAt: Date.now() + 5 * 60 * 1000,
      demoCode: reveal ? code : '',
    })
  } catch {
    return json({ error: 'No se pudo completar la operación. Inténtelo de nuevo.' }, 500)
  }
})
