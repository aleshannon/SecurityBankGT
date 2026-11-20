-- SecurityBankGT: esquema relacional. Los datos son de demostración.
-- El rol de aplicación vive solo en user_roles, nunca en profiles.

create extension if not exists pgcrypto;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 3 and 120),
  email text not null unique check (position('@' in email) > 1),
  telefono text not null default '' check (telefono = '' or telefono ~ '^\+502 \d{4} \d{4}$'),
  pais_habitual text not null default 'GT' check (char_length(pais_habitual) = 2),
  creado_en timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'auditor_seguridad', 'ejecutivo', 'cliente')),
  asignado_en timestamptz not null default now()
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^CLI-[0-9]{4}$'),
  user_id uuid unique references auth.users (id) on delete set null,
  nombres text not null check (char_length(nombres) between 2 and 60),
  apellidos text not null check (char_length(apellidos) between 2 and 60),
  dpi text not null unique check (dpi ~ '^\d{13}$'),
  nit text not null check (nit ~ '^\d{6,8}-\d$'),
  correo text not null unique check (position('@' in correo) > 1),
  telefono text not null check (telefono ~ '^\+502 \d{4} \d{4}$'),
  direccion text not null check (char_length(direccion) between 8 and 160),
  fecha_nacimiento date not null,
  nivel_riesgo text not null check (nivel_riesgo in ('bajo', 'medio', 'alto')),
  estado_kyc text not null check (estado_kyc in ('pendiente', 'verificado', 'rechazado')),
  estado text not null check (estado in ('activo', 'inactivo', 'bloqueado')),
  fecha_alta date not null default current_date,
  constraint clientes_mayor_edad check (fecha_nacimiento <= (current_date - interval '18 years'))
);

create table public.cuentas (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique check (numero ~ '^[0-9]{2}-[0-9]{3}-[0-9]{6}$'),
  cliente_id uuid not null references public.clientes (id),
  tipo text not null check (tipo in ('monetaria', 'ahorro', 'inversion')),
  moneda text not null default 'GTQ' check (moneda = 'GTQ'),
  saldo numeric(14, 2) not null default 0 check (saldo >= 0),
  limite_diario numeric(14, 2) not null check (limite_diario > 0 and limite_diario <= 1000000),
  estado text not null check (estado in ('activa', 'bloqueada')),
  fecha_apertura date not null default current_date
);

create table public.beneficiarios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 3 and 80),
  numero_cuenta text not null check (char_length(numero_cuenta) between 6 and 30),
  banco text not null check (char_length(banco) between 2 and 60),
  alias text not null check (char_length(alias) between 2 and 40),
  creado_en timestamptz not null default now()
);

create table public.transacciones (
  id uuid primary key default gen_random_uuid(),
  referencia text not null unique,
  tipo text not null check (tipo in ('deposito', 'retiro', 'transferencia_propia', 'transferencia_tercero', 'reversion')),
  monto numeric(14, 2) not null check (monto > 0 and monto <= 1000000),
  cuenta_origen_id uuid references public.cuentas (id),
  cuenta_destino_id uuid references public.cuentas (id),
  beneficiario_id uuid references public.beneficiarios (id),
  estado text not null check (estado in ('completada', 'pendiente', 'rechazada', 'marcada')),
  canal text not null check (canal in ('movil', 'web', 'cajero')),
  ip text not null,
  dispositivo text not null,
  fecha timestamptz not null default now(),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 80),
  usuario_id uuid references auth.users (id),
  referencia_origen text,
  motivo text,
  constraint transacciones_no_misma_cuenta check (cuenta_origen_id is distinct from cuenta_destino_id or cuenta_destino_id is null)
);

create table public.tarjetas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  cuenta_id uuid not null references public.cuentas (id),
  tipo text not null check (tipo in ('debito', 'credito')),
  marca text not null check (marca in ('Visa', 'Mastercard')),
  ultimos4 text not null check (ultimos4 ~ '^\d{4}$'),
  vencimiento text not null check (vencimiento ~ '^(0[1-9]|1[0-2])/\d{2}$'),
  estado text not null check (estado in ('activa', 'bloqueada', 'reportada')),
  limite_diario numeric(14, 2) not null check (limite_diario > 0 and limite_diario <= 200000),
  limite_mensual numeric(14, 2) not null check (limite_mensual > 0 and limite_mensual <= 1000000)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  accion text not null,
  entidad text not null,
  entidad_id text,
  ip text not null,
  dispositivo text not null,
  resultado text not null check (resultado in ('exito', 'fallo')),
  detalle text,
  fecha timestamptz not null default now()
);

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in (
    'login_fallido', 'dispositivo_nuevo', 'transferencia_inusual', 'acceso_no_autorizado',
    'pais_diferente', 'rafaga_transferencias', 'umbral_monto'
  )),
  severidad text not null check (severidad in ('baja', 'media', 'alta', 'critica')),
  descripcion text not null,
  user_id uuid,
  ip text not null,
  pais text not null,
  dispositivo text not null,
  fecha timestamptz not null default now()
);

create table public.incidentes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  titulo text not null check (char_length(titulo) between 3 and 140),
  descripcion text not null,
  severidad text not null check (severidad in ('baja', 'media', 'alta', 'critica')),
  estado text not null check (estado in ('abierto', 'investigando', 'contenido', 'cerrado')),
  asignado_a uuid references auth.users (id),
  fecha timestamptz not null default now()
);

create table public.incidente_notas (
  id uuid primary key default gen_random_uuid(),
  incidente_id uuid not null references public.incidentes (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  texto text not null check (char_length(texto) between 3 and 500),
  fecha timestamptz not null default now()
);

create table public.dispositivos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cliente_id uuid references public.clientes (id) on delete set null,
  nombre text not null,
  pais text not null,
  ip text not null,
  confianza boolean not null default false,
  ultimo_acceso timestamptz not null default now()
);

create table public.activos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  proceso text not null,
  tipo text not null check (tipo in ('informacion', 'software', 'fisico', 'personal', 'servicios')),
  ubicacion text not null check (ubicacion in ('cloud', 'movil', 'repositorio')),
  confidencialidad text not null check (confidencialidad in ('Alta', 'Media', 'Baja')),
  integridad text not null check (integridad in ('Alta', 'Media', 'Baja')),
  disponibilidad text not null check (disponibilidad in ('Alta', 'Media', 'Baja')),
  criticidad text generated always as (
    case
      when confidencialidad = 'Alta' or integridad = 'Alta' or disponibilidad = 'Alta' then 'Alta'
      when confidencialidad = 'Media' or integridad = 'Media' or disponibilidad = 'Media' then 'Media'
      else 'Baja'
    end
  ) stored,
  propietario text not null,
  custodio text not null
);

create table public.amenazas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  descripcion text not null,
  categoria text not null check (categoria in (
    'Spoofing', 'Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service', 'Elevation of Privilege'
  )),
  damage smallint not null check (damage between 1 and 10),
  reproducibility smallint not null check (reproducibility between 1 and 10),
  exploitability smallint not null check (exploitability between 1 and 10),
  affected_users smallint not null check (affected_users between 1 and 10),
  discoverability smallint not null check (discoverability between 1 and 10),
  promedio numeric(4, 1) generated always as (
    round((damage + reproducibility + exploitability + affected_users + discoverability) / 5.0, 1)
  ) stored,
  nivel text generated always as (
    case
      when round((damage + reproducibility + exploitability + affected_users + discoverability) / 5.0, 1) >= 8 then 'critico'
      when round((damage + reproducibility + exploitability + affected_users + discoverability) / 5.0, 1) >= 6 then 'alto'
      when round((damage + reproducibility + exploitability + affected_users + discoverability) / 5.0, 1) >= 4 then 'medio'
      else 'bajo'
    end
  ) stored,
  activo_id uuid not null references public.activos (id)
);

create table public.riesgos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  titulo text not null,
  descripcion text not null,
  probabilidad smallint not null check (probabilidad between 1 and 5),
  impacto smallint not null check (impacto between 1 and 5),
  riesgo_inherente smallint generated always as (probabilidad * impacto) stored,
  controles text not null,
  probabilidad_residual smallint not null check (probabilidad_residual between 1 and 5),
  impacto_residual smallint not null check (impacto_residual between 1 and 5),
  riesgo_residual smallint generated always as (probabilidad_residual * impacto_residual) stored,
  tipo text not null check (tipo in ('software', 'seguridad', 'tecnico', 'cloud')),
  tipo_impacto text not null check (tipo_impacto in ('reputacional', 'operacional', 'financiero', 'legal')),
  tratamiento text not null check (tratamiento in ('aceptar', 'eliminar', 'evitar', 'mitigar', 'transferir')),
  activo_id uuid not null references public.activos (id)
);

create table public.hallazgos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  titulo text not null,
  origen text not null check (origen in ('pentest_caja_negra', 'pentest_caja_gris', 'sast', 'sca', 'iac', 'contenedores')),
  owasp text not null check (owasp in ('API1', 'API2', 'API3', 'API4', 'API5', 'API6', 'API7', 'API8', 'API9', 'API10')),
  severidad text not null check (severidad in ('baja', 'media', 'alta', 'critica')),
  cvss numeric(3, 1) not null check (cvss between 0 and 10),
  activo_id uuid not null references public.activos (id),
  evidencia text not null,
  recomendacion text not null,
  responsable text not null,
  estado text not null check (estado in ('abierto', 'en_progreso', 'mitigado', 'aceptado')),
  fecha_limite date not null,
  capa text not null check (capa in ('datos', 'aplicacion', 'host', 'red_interna', 'perimetro', 'fisica', 'politicas'))
);

create table public.casos_abuso (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  titulo text not null,
  descripcion text not null,
  control text not null,
  hallazgo_id uuid not null references public.hallazgos (id)
);

create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null,
  titulo text not null,
  mensaje text not null,
  severidad text not null check (severidad in ('baja', 'media', 'alta', 'critica', 'info')),
  leida boolean not null default false,
  fecha timestamptz not null default now()
);

create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid,
  exito boolean not null,
  ip text not null,
  dispositivo text not null,
  fecha timestamptz not null default now()
);

create table public.account_locks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  until timestamptz not null,
  reason text not null
);

create table public.mfa_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  verified boolean not null default false,
  last_activity timestamptz not null default now(),
  ip text not null default '',
  dispositivo text not null default '',
  pais text not null default 'GT'
);

create table public.otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('login', 'transfer')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  used boolean not null default false,
  draft_id uuid,
  creado_en timestamptz not null default now()
);

create table public.transfer_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cuenta_origen_id uuid not null references public.cuentas (id),
  cuenta_destino_id uuid references public.cuentas (id),
  beneficiario_id uuid references public.beneficiarios (id),
  monto numeric(14, 2) not null check (monto > 10000),
  canal text not null check (canal in ('movil', 'web', 'cajero')),
  idempotency_key text not null unique,
  otp_id uuid not null,
  expires_at timestamptz not null,
  creado_en timestamptz not null default now()
);

create table public.asignaciones (
  ejecutivo_user_id uuid not null references auth.users (id) on delete cascade,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  primary key (ejecutivo_user_id, cliente_id)
);

create index clientes_nombre_idx on public.clientes (apellidos, nombres);
create index clientes_estado_idx on public.clientes (estado, estado_kyc, nivel_riesgo);
create index cuentas_cliente_idx on public.cuentas (cliente_id);
create index transacciones_fecha_idx on public.transacciones (fecha desc);
create index transacciones_origen_idx on public.transacciones (cuenta_origen_id);
create index transacciones_destino_idx on public.transacciones (cuenta_destino_id);
create index audit_logs_fecha_idx on public.audit_logs (fecha desc);
create index security_events_fecha_idx on public.security_events (fecha desc);
create index login_attempts_email_idx on public.login_attempts (email, fecha desc);
create index notificaciones_user_idx on public.notificaciones (user_id, leida, fecha desc);
