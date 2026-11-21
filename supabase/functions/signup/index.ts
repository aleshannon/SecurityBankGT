import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function strong(password: string) {
  return password.length >= 12 && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const nombre = String(body.nombre ?? '').trim()
    const apellidos = String(body.apellidos ?? '').trim()
    const telefono = String(body.telefono ?? '')
    const dpi = String(body.dpi ?? '')
    const fecha = String(body.fechaNacimiento ?? '')
    if (!email.includes('@') || !strong(password) || nombre.length < 3 || apellidos.length < 3) {
      return json({ error: 'Revise el correo, la contraseña y el nombre.' }, 400)
    }
    if (!/^\+502 \d{4} \d{4}$/.test(telefono) || !/^\d{13}$/.test(dpi) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return json({ error: 'Revise el teléfono, el DPI y la fecha de nacimiento.' }, 400)
    }
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: `${nombre} ${apellidos}` },
    })
    if (created.error || !created.data.user) {
      return json({ error: 'El correo ya está registrado.' }, 400)
    }
    const userId = created.data.user.id
    const { data: last } = await admin.from('clientes').select('codigo').order('codigo', { ascending: false }).limit(1).maybeSingle()
    const next = Number(String(last?.codigo ?? 'CLI-0000').slice(4)) + 1
    const codigo = `CLI-${String(next).padStart(4, '0')}`
    const { data: cliente, error: clienteError } = await admin.from('clientes').insert({
      codigo,
      user_id: userId,
      nombres: nombre,
      apellidos,
      dpi,
      nit: '0000000-0',
      correo: email,
      telefono,
      direccion: 'Pendiente de actualizar',
      fecha_nacimiento: fecha,
      nivel_riesgo: 'medio',
      estado_kyc: 'pendiente',
      estado: 'activo',
    }).select('id').single()
    if (clienteError || !cliente) {
      await admin.auth.admin.deleteUser(userId)
      return json({ error: 'No se pudo crear el cliente. Revise que el DPI no esté registrado.' }, 400)
    }
    const { count } = await admin.from('cuentas').select('id', { count: 'exact', head: true })
    const n = (count ?? 0) + 1
    await admin.from('cuentas').insert({
      numero: `01-00${(n % 5) + 1}-${String(100000 + n).padStart(6, '0')}`,
      cliente_id: cliente.id,
      tipo: 'ahorro',
      saldo: 0,
      limite_diario: 5000,
      estado: 'activa',
    })
    await admin.from('profiles').update({ nombre: `${nombre} ${apellidos}`, telefono }).eq('user_id', userId)
    const { data: staff } = await admin.from('user_roles').select('user_id').in('role', ['admin', 'ejecutivo'])
    if (staff?.length) {
      await admin.from('notificaciones').insert(staff.map((row: { user_id: string }) => ({
        user_id: row.user_id,
        tipo: 'kyc',
        titulo: 'KYC pendiente',
        mensaje: `El cliente ${nombre} ${apellidos} quedó pendiente de verificación.`,
        severidad: 'media',
      })))
    }
    return json({ ok: true })
  } catch {
    return json({ error: 'No se pudo completar el registro.' }, 500)
  }
})
