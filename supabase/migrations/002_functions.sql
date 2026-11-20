-- Funciones de autorización y de negocio. Las de dinero son atómicas.
-- has_role es SECURITY DEFINER para no reconsultar user_roles dentro de sus propias políticas.

create or replace function public.has_role(p_user uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user and role = p_role
  );
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

create or replace function public.current_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.clientes where user_id = auth.uid();
$$;

create or replace function public.ejecutivo_puede(p_cliente uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.asignaciones
    where ejecutivo_user_id = auth.uid() and cliente_id = p_cliente
  );
$$;

create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select verified and last_activity > now() - interval '10 minutes'
    from public.mfa_sessions
    where user_id = auth.uid()
  ), false);
$$;

create or replace function public.puede_revelar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'ejecutivo');
$$;

create or replace function public.mask_dpi(p_dpi text)
returns text
language sql
immutable
as $$
  select case
    when p_dpi is null or char_length(p_dpi) < 4 then '****-*****-****'
    else '****-*****-' || right(p_dpi, 4)
  end;
$$;

create or replace function public.mask_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when p_phone is null or char_length(p_phone) < 4 then '****'
    else '****' || right(regexp_replace(p_phone, '\D', '', 'g'), 4)
  end;
$$;

create or replace function public.touch_session()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mfa_sessions
  set last_activity = now()
  where user_id = auth.uid()
    and verified
    and last_activity > now() - interval '10 minutes';
  if not found then
    raise exception 'Su sesión expiró por inactividad.';
  end if;
end;
$$;

create or replace function public.asignar_rol(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'No tiene permiso para esta operación.';
  end if;
  if p_role not in ('admin', 'auditor_seguridad', 'ejecutivo', 'cliente') then
    raise exception 'Rol no válido.';
  end if;
  insert into public.user_roles (user_id, role)
  values (p_user, p_role)
  on conflict (user_id) do update set role = excluded.role, asignado_en = now();
end;
$$;

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  headers json;
  ip text;
  device text;
begin
  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then
    headers := '{}'::json;
  end;
  ip := coalesce(nullif(split_part(headers->>'x-forwarded-for', ',', 1), ''), '190.56.10.10');
  device := coalesce(nullif(headers->>'user-agent', ''), 'Servidor');
  insert into public.audit_logs (user_id, accion, entidad, entidad_id, ip, dispositivo, resultado, detalle)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id)::text,
    ip,
    left(device, 180),
    'exito',
    null
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.rechazar_mutacion()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El registro es inmutable. Registre una reversión.';
end;
$$;

create trigger audit_clientes
  after insert or update or delete on public.clientes
  for each row execute function public.registrar_auditoria();
create trigger audit_cuentas
  after insert or update or delete on public.cuentas
  for each row execute function public.registrar_auditoria();
create trigger audit_tarjetas
  after insert or update or delete on public.tarjetas
  for each row execute function public.registrar_auditoria();
create trigger audit_beneficiarios
  after insert or update or delete on public.beneficiarios
  for each row execute function public.registrar_auditoria();
create trigger audit_transacciones
  after insert on public.transacciones
  for each row execute function public.registrar_auditoria();
create trigger audit_hallazgos
  after insert or update on public.hallazgos
  for each row execute function public.registrar_auditoria();

create or replace function public.proteger_saldo()
returns trigger
language plpgsql
as $$
begin
  if new.saldo is distinct from old.saldo and current_setting('app.movimiento', true) is distinct from '1' then
    raise exception 'El saldo solo cambia mediante una operación registrada.';
  end if;
  return new;
end;
$$;

create trigger cuentas_proteger_saldo
  before update on public.cuentas
  for each row execute function public.proteger_saldo();

create trigger transacciones_inmutables
  before update or delete on public.transacciones
  for each row execute function public.rechazar_mutacion();
create trigger auditoria_inmutable
  before update or delete on public.audit_logs
  for each row execute function public.rechazar_mutacion();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, nombre, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)), new.email);
  insert into public.user_roles (user_id, role) values (new.id, 'cliente');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.request_ip()
returns text
language plpgsql
stable
as $$
declare
  headers json;
begin
  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then
    return '190.56.10.10';
  end;
  return coalesce(nullif(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1), ''), '190.56.10.10');
end;
$$;

create or replace function public.request_device()
returns text
language plpgsql
stable
as $$
declare
  headers json;
begin
  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then
    return 'Navegador web';
  end;
  return left(coalesce(nullif(headers->>'user-agent', ''), 'Navegador web'), 180);
end;
$$;

create sequence if not exists public.tx_seq start 1;

create or replace function public.procesar_transferencia(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  origen public.cuentas%rowtype;
  destino public.cuentas%rowtype;
  benef public.beneficiarios%rowtype;
  cliente public.clientes%rowtype;
  monto numeric;
  canal text;
  clave text;
  existente public.transacciones%rowtype;
  usado numeric;
  ref text;
  nuevo_id uuid;
  otp_code text;
  otp_row uuid;
  draft uuid;
begin
  perform set_config('app.movimiento', '1', true);
  if not public.mfa_ok() then
    raise exception 'Debe confirmar el código de acceso.';
  end if;
  if not (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'ejecutivo')
    or public.has_role(auth.uid(), 'cliente')
  ) then
    raise exception 'No tiene permiso para esta operación.';
  end if;

  monto := (payload->>'monto')::numeric;
  canal := payload->>'canal';
  clave := payload->>'idempotencyKey';
  if monto is null or monto <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;
  if canal not in ('movil', 'web', 'cajero') then
    raise exception 'Canal no válido.';
  end if;
  if clave is null or char_length(clave) < 8 then
    raise exception 'Falta la clave de idempotencia.';
  end if;

  select * into existente from public.transacciones where idempotency_key = clave;
  if found then
    return jsonb_build_object('id', existente.id, 'referencia', existente.referencia, 'estado', existente.estado, 'idempotente', true);
  end if;

  select * into origen from public.cuentas where id = (payload->>'cuentaOrigenId')::uuid for update;
  if not found then
    raise exception 'No se encontró la cuenta de origen.';
  end if;
  select * into cliente from public.clientes where id = origen.cliente_id;
  if public.has_role(auth.uid(), 'cliente') and cliente.user_id is distinct from auth.uid() then
    insert into public.security_events (tipo, severidad, descripcion, user_id, ip, pais, dispositivo)
    values ('acceso_no_autorizado', 'alta', 'Intento de operar una cuenta de otro cliente.', auth.uid(), public.request_ip(), 'GT', public.request_device());
    raise exception 'No tiene permiso para esta operación.';
  end if;
  if public.has_role(auth.uid(), 'ejecutivo') and not public.ejecutivo_puede(cliente.id) then
    raise exception 'El cliente no está asignado a su cartera.';
  end if;
  if cliente.estado <> 'activo' or cliente.estado_kyc <> 'verificado' or origen.estado <> 'activa' then
    raise exception 'La cuenta de origen no está habilitada para transferir.';
  end if;

  if payload->>'destino' = 'propia' then
    select * into destino from public.cuentas where id = (payload->>'cuentaDestinoId')::uuid for update;
    if not found or destino.cliente_id <> origen.cliente_id then
      raise exception 'La cuenta destino no pertenece al mismo cliente.';
    end if;
  else
    select * into benef from public.beneficiarios where id = (payload->>'beneficiarioId')::uuid;
    if not found or benef.cliente_id <> origen.cliente_id then
      raise exception 'El beneficiario no pertenece a la cuenta de origen.';
    end if;
    select * into destino from public.cuentas where numero = benef.numero_cuenta for update;
  end if;

  if destino.id is not null and destino.id = origen.id then
    raise exception 'No puede transferir a la misma cuenta.';
  end if;

  select coalesce(sum(monto), 0) into usado
  from public.transacciones
  where cuenta_origen_id = origen.id
    and estado in ('completada', 'marcada')
    and fecha >= date_trunc('day', now() at time zone 'America/Guatemala');

  if usado + monto > origen.limite_diario or monto > origen.saldo then
    ref := 'TX-' || lpad(nextval('public.tx_seq')::text, 6, '0');
    insert into public.transacciones (
      referencia, tipo, monto, cuenta_origen_id, cuenta_destino_id, beneficiario_id,
      estado, canal, ip, dispositivo, idempotency_key, usuario_id, motivo
    ) values (
      ref,
      case when payload->>'destino' = 'propia' then 'transferencia_propia' else 'transferencia_tercero' end,
      monto, origen.id, destino.id, benef.id, 'rechazada', canal, public.request_ip(), public.request_device(),
      clave, auth.uid(),
      case when monto > origen.saldo then 'Saldo insuficiente.' else 'Supera el límite diario.' end
    );
    return jsonb_build_object('error', case when monto > origen.saldo then 'Saldo insuficiente.' else 'Supera el límite diario.' end);
  end if;

  if monto > 10000 then
    otp_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    insert into public.otp_challenges (user_id, purpose, code_hash, expires_at)
    values (auth.uid(), 'transfer', encode(digest(otp_code, 'sha256'), 'hex'), now() + interval '5 minutes')
    returning id into otp_row;
    insert into public.transfer_drafts (
      user_id, cuenta_origen_id, cuenta_destino_id, beneficiario_id, monto, canal, idempotency_key, otp_id, expires_at
    ) values (
      auth.uid(), origen.id, destino.id, benef.id, monto, canal, clave, otp_row, now() + interval '5 minutes'
    ) returning id into draft;
    return jsonb_build_object(
      'tipo', 'requiere_otp',
      'draftId', draft,
      'demoCode', case when current_setting('app.demo_reveal_otp', true) = 'true' then otp_code else null end,
      'expiresAt', (extract(epoch from now() + interval '5 minutes') * 1000)::bigint
    );
  end if;

  ref := 'TX-' || lpad(nextval('public.tx_seq')::text, 6, '0');
  insert into public.transacciones (
    referencia, tipo, monto, cuenta_origen_id, cuenta_destino_id, beneficiario_id,
    estado, canal, ip, dispositivo, idempotency_key, usuario_id
  ) values (
    ref,
    case when payload->>'destino' = 'propia' then 'transferencia_propia' else 'transferencia_tercero' end,
    monto, origen.id, destino.id, benef.id, 'completada', canal, public.request_ip(), public.request_device(), clave, auth.uid()
  ) returning id into nuevo_id;
  update public.cuentas set saldo = saldo - monto where id = origen.id;
  if destino.id is not null and destino.estado = 'activa' then
    update public.cuentas set saldo = saldo + monto where id = destino.id;
  end if;
  return jsonb_build_object('id', nuevo_id, 'referencia', ref, 'estado', 'completada');
end;
$$;

create or replace function public.registrar_exportacion(p_reporte text, p_formato text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mfa_ok() then
    raise exception 'Debe confirmar el código de acceso.';
  end if;
  if p_formato not in ('pdf', 'xlsx', 'csv') then
    raise exception 'Formato no válido.';
  end if;
  insert into public.audit_logs (user_id, accion, entidad, entidad_id, ip, dispositivo, resultado, detalle)
  values (auth.uid(), 'EXPORTACION', 'reportes', p_reporte, public.request_ip(), public.request_device(), 'exito', p_formato);
end;
$$;

revoke all on function public.procesar_transferencia(jsonb) from public;
grant execute on function public.procesar_transferencia(jsonb) to authenticated;
grant execute on function public.has_role(uuid, text) to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_cliente_id() to authenticated;
grant execute on function public.mfa_ok() to authenticated;
grant execute on function public.touch_session() to authenticated;
grant execute on function public.mask_dpi(text) to authenticated;
grant execute on function public.mask_phone(text) to authenticated;
grant execute on function public.asignar_rol(uuid, text) to authenticated;
grant execute on function public.registrar_exportacion(text, text) to authenticated;
