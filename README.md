# SecurityBankGT

Portal bancario de demostración en quetzales (GTQ), con autenticación, cuentas, transferencias, monitoreo y gestión de riesgos. La interfaz está en español y las fechas se muestran como dd/mm/aaaa. Todos los datos son ficticios.

## Ejecutar

```bash
npm install
npm run dev
npm test
```

La aplicación abre en `http://127.0.0.1:5173`. Si `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` están vacíos, usa el motor de demostración del navegador: las reglas de saldo, límite, idempotencia, OTP y roles se evalúan en ese motor y los datos viven en `sessionStorage`.

Ese motor sirve para recorrer el portal sin un proyecto de Supabase. No es la frontera de seguridad frente a quien controla el navegador. En un despliegue real la autorización la hacen PostgreSQL (RLS y `has_role`) y las Edge Functions. El rol no se guarda en `localStorage` ni en el token de sesión: se consulta en `user_roles`.

## Cuentas de demostración

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Administrador | admin@securitybankgt.com | Admin#2026Gtq! |
| Auditor de seguridad | auditor@securitybankgt.com | Auditor#2026Gt! |
| Ejecutivo | ejecutivo@securitybankgt.com | Ejecutivo#2026! |
| Cliente | cliente@securitybankgt.com | Cliente#2026Gt! |

Después del correo y la contraseña, el portal pide un OTP de 6 dígitos. En el modo de demostración el código aparece en pantalla, vence a los 5 minutos y solo se usa una vez. La sesión se cierra tras 10 minutos sin actividad.

## Conectar Supabase

1. Cree un proyecto en Supabase.
2. Aplique, en orden, los archivos de `supabase/migrations`.
3. Despliegue las funciones `login`, `otp-generate`, `otp-verify`, `password-hook`, `signup` y `transfer`.
4. Guarde `SUPABASE_SERVICE_ROLE_KEY` como secreto de las funciones. No lo ponga en el frontend.
5. Para enviar el código, agregue `RESEND_API_KEY` y `MAIL_FROM`, o `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM`. No active `DEMO_REVEAL_OTP` si el código debe ir solo por correo.
6. Copie `.env.example` a `.env` y complete `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
7. En Authentication, desactive la confirmación de correo: el segundo factor del portal es el código de 6 dígitos.
8. Active el hook de contraseña apuntando a `password-hook`.

El esquema habilita RLS en todas las tablas. `has_role(user_id, role)` es `SECURITY DEFINER` para no provocar recursión al leer `user_roles`. Las transacciones y la bitácora no admiten `UPDATE` ni `DELETE`: una corrección se registra como reversión. El DPI y el teléfono se consultan por la vista `clientes_visibles`, que los enmascara salvo para administrador y ejecutivo.

Las transferencias se ejecutan con `procesar_transferencia`. Un monto mayor a Q10,000 no mueve saldo hasta confirmar el OTP y queda marcado para revisión.
