import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deliverCode, otpCode, sha256 } from '../_shared/mail.ts'

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
    const payload = await req.json()
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: auth } = await userClient.auth.getUser()
    if (!auth.user) return json({ error: 'Debe iniciar sesión.' }, 401)
    const monto = Number(payload?.monto)
    const next = { ...payload, actorId: auth.user.id }
    let code = ''
    if (monto > 10000) {
      code = otpCode()
      next.otpHash = await sha256(code)
    }
    const admin = createClient(url, service)
    const { data, error } = await admin.rpc('procesar_transferencia', { payload: next })
    if (error) return json({ error: error.message }, 400)
    if (data && typeof data === 'object' && 'error' in data && data.error) return json({ error: data.error }, 400)
    if (data && typeof data === 'object' && data.tipo === 'requiere_otp') {
      const reveal = Deno.env.get('DEMO_REVEAL_OTP') === 'true'
      try {
        await deliverCode(auth.user.email ?? '', code, 'Úselo para confirmar la transferencia mayor a Q10,000.')
      } catch {
        if (!reveal) return json({ error: 'No se pudo enviar el código de la transferencia.' }, 502)
      }
      return json({
        tipo: 'requiere_otp',
        draftId: data.draftId,
        expiresAt: new Date(Number(data.expiresAt)).toISOString(),
        demoCode: reveal ? code : '',
      })
    }
    return json(data)
  } catch {
    return json({ error: 'No se pudo completar la operación. Inténtelo de nuevo.' }, 500)
  }
})
