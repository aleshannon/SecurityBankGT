export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('')
}

export function otpCode() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
}

export async function deliverCode(email: string, code: string, motivo: string) {
  const text = `Su código de verificación de SecurityBankGT es ${code}. ${motivo} Vence en 5 minutos y solo puede usarse una vez.`
  const subject = 'Código de verificación · SecurityBankGT'
  const from = Deno.env.get('MAIL_FROM') ?? 'SecurityBankGT <onboarding@resend.dev>'
  const resend = Deno.env.get('RESEND_API_KEY')
  if (resend) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject, text }),
    })
    if (!response.ok) throw new Error('No se pudo enviar el correo.')
    return
  }
  const host = Deno.env.get('SMTP_HOST')
  const user = Deno.env.get('SMTP_USER')
  const pass = Deno.env.get('SMTP_PASS')
  if (host && user && pass) {
    const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts')
    const smtp = new SMTPClient({
      connection: {
        hostname: host,
        port: Number(Deno.env.get('SMTP_PORT') ?? 587),
        tls: true,
        auth: { username: user, password: pass },
      },
    })
    await smtp.send({ from: Deno.env.get('MAIL_FROM') ?? user, to: email, subject, content: text })
    await smtp.close()
    return
  }
  throw new Error('NO_MAIL')
}
