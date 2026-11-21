export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('')
}

export function otpCode() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char))
}

function emailHtml(code: string, motivo: string) {
  const digits = escapeHtml(code)
  const detail = escapeHtml(motivo)
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#e7eef3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e7eef3;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;">
        <tr><td style="background:#0B2545;padding:28px 32px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#ffffff;">SecurityBankGT</div>
          <div style="margin-top:8px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.16em;color:#13A89E;">BANCA DIGITAL · GUATEMALA</div>
        </td></tr>
        <tr><td style="padding:32px;font-family:Arial,sans-serif;color:#0B2545;">
          <p style="margin:0 0 8px;font-size:20px;font-weight:700;">Su código de verificación</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3d5166;">${detail}</p>
          <div style="background:#f3f7f8;border:1px solid #d5e4e2;border-radius:14px;padding:22px 12px;text-align:center;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:0.28em;color:#0B2545;">${digits}</div>
          <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#3d5166;">Vence en 5 minutos y solo puede usarse una vez. No comparta este número con nadie.</p>
        </td></tr>
        <tr><td style="padding:0 32px 28px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7c8d;">Si usted no solicitó este código, ignore el mensaje. SecurityBankGT nunca le pedirá su clave por correo.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

const CUENTAS_CLASE = new Set([
  'admin@securitybankgt.com',
  'auditor@securitybankgt.com',
  'ejecutivo@securitybankgt.com',
  'cliente@securitybankgt.com',
])

export function cuentaDeClase(email: string) {
  return CUENTAS_CLASE.has(email.trim().toLowerCase())
}

export function codigoEnPantalla(email: string) {
  return Deno.env.get('DEMO_REVEAL_OTP') === 'true' || cuentaDeClase(email)
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
      body: JSON.stringify({ from, to: [email], subject, text, html: emailHtml(code, motivo) }),
    })
    if (!response.ok) throw new Error('No se pudo enviar el correo.')
    return
  }
  throw new Error('NO_MAIL')
}
