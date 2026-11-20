const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const body = await req.json().catch(() => ({}))
  const password = String(body.password ?? body?.user?.password ?? '')
  const strong = password.length >= 12 && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)
  if (!strong) {
    return new Response(JSON.stringify({ error: { message: 'La contraseña debe tener 12 caracteres, una mayúscula, un número y un símbolo.' } }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({}), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
})
