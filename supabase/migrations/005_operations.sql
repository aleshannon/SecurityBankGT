-- Operaciones que el portal ejecuta contra PostgreSQL cuando deja el motor local.
-- El código de una transferencia mayor a Q10,000 solo lo conoce la función de servidor que lo envía por correo.

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
  otp_row uuid;
  draft uuid;
  v_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  perform set_config('app.movimiento', '1', true);
  if payload ? 'actorId' then
    if not v_service then
      raise exception 'No tiene permiso para esta operación.';
    end if;
    perform set_config('request.jwt.claim.sub', payload->>'actorId', true);
    perform set_config(
      'request.jwt.claims',
      jsonb_set(
        coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb),
        '{sub}',
        to_jsonb(payload->>'actorId')
      )::text,
      true
    );
  end if;
  if auth.uid() is null then
    raise exception 'Debe iniciar sesión.';
  end if;
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
  if monto is null or monto <= 0 or monto > 1000000 then
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
    if not v_service or coalesce(payload->>'otpHash', '') !~ '^[0-9a-f]{64}$' then
      raise exception 'El código de una transferencia mayor a Q10,000 se envía por correo.';
    end if;
    insert into public.otp_challenges (user_id, purpose, code_hash, expires_at)
    values (auth.uid(), 'transfer', payload->>'otpHash', now() + interval '5 minutes')
    returning id into otp_row;
    insert into public.transfer_drafts (
      user_id, cuenta_origen_id, cuenta_destino_id, beneficiario_id, monto, canal, idempotency_key, otp_id, expires_at
    ) values (
      auth.uid(), origen.id, destino.id, benef.id, monto, canal, clave, otp_row, now() + interval '5 minutes'
    ) returning id into draft;
    return jsonb_build_object(
      'tipo', 'requiere_otp',
      'draftId', draft,
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

create or replace function public.confirmar_transferencia(p_draft uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  draft public.transfer_drafts%rowtype;
  challenge public.otp_challenges%rowtype;
  origen public.cuentas%rowtype;
  destino public.cuentas%rowtype;
  cliente public.clientes%rowtype;
  existente public.transacciones%rowtype;
  ref text;
  nuevo_id uuid;
  tipo text;
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
  if p_code is null or p_code !~ '^\d{6}$' then
    raise exception 'El código no es válido.';
  end if;
  select * into draft from public.transfer_drafts where id = p_draft and user_id = auth.uid();
  if not found or draft.expires_at < now() then
    raise exception 'La confirmación expiró. Inicie la transferencia de nuevo.';
  end if;
  select * into challenge from public.otp_challenges where id = draft.otp_id and user_id = auth.uid();
  if not found or challenge.used or challenge.expires_at < now() then
    raise exception 'El código venció. Solicite uno nuevo.';
  end if;
  if challenge.attempts >= 5 then
    update public.otp_challenges set used = true where id = challenge.id;
    raise exception 'El código quedó invalidado.';
  end if;
  if challenge.code_hash <> encode(digest(p_code, 'sha256'), 'hex') then
    update public.otp_challenges set attempts = attempts + 1 where id = challenge.id;
    raise exception 'El código no es válido.';
  end if;
  update public.otp_challenges set used = true where id = challenge.id;

  select * into existente from public.transacciones where idempotency_key = draft.idempotency_key;
  if found then
    delete from public.transfer_drafts where id = draft.id;
    return jsonb_build_object('id', existente.id, 'referencia', existente.referencia, 'estado', existente.estado);
  end if;

  select * into origen from public.cuentas where id = draft.cuenta_origen_id for update;
  select * into destino from public.cuentas where id = draft.cuenta_destino_id for update;
  select * into cliente from public.clientes where id = origen.cliente_id;
  if cliente.estado <> 'activo' or cliente.estado_kyc <> 'verificado' or origen.estado <> 'activa' then
    raise exception 'La cuenta de origen no está habilitada para transferir.';
  end if;
  if origen.saldo < draft.monto then
    raise exception 'Saldo insuficiente.';
  end if;

  tipo := case
    when draft.beneficiario_id is not null or destino.cliente_id is distinct from origen.cliente_id then 'transferencia_tercero'
    else 'transferencia_propia'
  end;
  ref := 'TX-' || lpad(nextval('public.tx_seq')::text, 6, '0');
  insert into public.transacciones (
    referencia, tipo, monto, cuenta_origen_id, cuenta_destino_id, beneficiario_id,
    estado, canal, ip, dispositivo, idempotency_key, usuario_id
  ) values (
    ref, tipo, draft.monto, origen.id, destino.id, draft.beneficiario_id,
    'marcada', draft.canal, public.request_ip(), public.request_device(), draft.idempotency_key, auth.uid()
  ) returning id into nuevo_id;
  update public.cuentas set saldo = saldo - draft.monto where id = origen.id;
  if destino.id is not null and destino.estado = 'activa' then
    update public.cuentas set saldo = saldo + draft.monto where id = destino.id;
  end if;
  delete from public.transfer_drafts where id = draft.id;
  insert into public.security_events (tipo, severidad, descripcion, user_id, ip, pais, dispositivo)
  values ('umbral_monto', 'media', 'Transferencia de alto valor marcada para revisión.', auth.uid(), public.request_ip(), 'GT', public.request_device());
  insert into public.notificaciones (user_id, tipo, titulo, mensaje, severidad)
  select user_id, 'transferencia', 'Transferencia de alto valor', 'Se marcó una transferencia mayor a Q10,000.', 'alta'
  from public.user_roles
  where role in ('admin', 'auditor_seguridad');
  return jsonb_build_object('id', nuevo_id, 'referencia', ref, 'estado', 'marcada');
end;
$$;

create or replace function public.registrar_movimiento(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cuenta public.cuentas%rowtype;
  cliente public.clientes%rowtype;
  existente public.transacciones%rowtype;
  monto numeric;
  canal text;
  clave text;
  tipo text;
  usado numeric;
  ref text;
  nuevo_id uuid;
begin
  perform set_config('app.movimiento', '1', true);
  if not public.mfa_ok() then
    raise exception 'Debe confirmar el código de acceso.';
  end if;
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'ejecutivo')) then
    raise exception 'No tiene permiso para esta operación.';
  end if;
  tipo := payload->>'tipo';
  monto := (payload->>'monto')::numeric;
  canal := coalesce(payload->>'canal', 'web');
  clave := payload->>'idempotencyKey';
  if tipo not in ('deposito', 'retiro') or monto is null or monto <= 0 or monto > 1000000 then
    raise exception 'La operación no es válida.';
  end if;
  if canal not in ('movil', 'web', 'cajero') or clave is null or char_length(clave) < 8 then
    raise exception 'La operación no es válida.';
  end if;
  select * into existente from public.transacciones where idempotency_key = clave;
  if found then
    return jsonb_build_object('id', existente.id, 'referencia', existente.referencia, 'estado', existente.estado);
  end if;
  select * into cuenta from public.cuentas where id = (payload->>'cuentaId')::uuid for update;
  if not found then
    raise exception 'No se encontró la cuenta.';
  end if;
  select * into cliente from public.clientes where id = cuenta.cliente_id;
  if public.has_role(auth.uid(), 'ejecutivo') and not public.ejecutivo_puede(cliente.id) then
    raise exception 'El cliente no está asignado a su cartera.';
  end if;
  if cliente.estado <> 'activo' or cuenta.estado <> 'activa' then
    raise exception 'La cuenta no está activa.';
  end if;
  if tipo = 'retiro' and cliente.estado_kyc <> 'verificado' then
    raise exception 'El KYC del cliente no está verificado.';
  end if;
  if tipo = 'retiro' then
    select coalesce(sum(t.monto), 0) into usado
    from public.transacciones t
    where t.cuenta_origen_id = cuenta.id
      and t.estado in ('completada', 'marcada')
      and t.fecha >= date_trunc('day', now() at time zone 'America/Guatemala');
    select usado + coalesce(sum(d.monto), 0) into usado
    from public.transfer_drafts d
    where d.cuenta_origen_id = cuenta.id and d.expires_at > now();
    if monto > cuenta.saldo then
      raise exception 'Saldo insuficiente.';
    end if;
    if usado + monto > cuenta.limite_diario then
      raise exception 'Supera el límite diario de transferencia.';
    end if;
  end if;
  ref := 'TX-' || lpad(nextval('public.tx_seq')::text, 6, '0');
  insert into public.transacciones (
    referencia, tipo, monto, cuenta_origen_id, cuenta_destino_id, estado, canal, ip, dispositivo, idempotency_key, usuario_id
  ) values (
    ref, tipo, monto,
    case when tipo = 'retiro' then cuenta.id else null end,
    case when tipo = 'deposito' then cuenta.id else null end,
    'completada', canal, public.request_ip(), public.request_device(), clave, auth.uid()
  ) returning id into nuevo_id;
  if tipo = 'retiro' then
    update public.cuentas set saldo = saldo - monto where id = cuenta.id;
  else
    update public.cuentas set saldo = saldo + monto where id = cuenta.id;
  end if;
  return jsonb_build_object('id', nuevo_id, 'referencia', ref, 'estado', 'completada');
end;
$$;

create or replace function public.revertir_transaccion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  original public.transacciones%rowtype;
  origen public.cuentas%rowtype;
  destino public.cuentas%rowtype;
  ref text;
  nuevo_id uuid;
begin
  perform set_config('app.movimiento', '1', true);
  if not public.mfa_ok() or not public.has_role(auth.uid(), 'admin') then
    raise exception 'No tiene permiso para esta operación.';
  end if;
  select * into original from public.transacciones where id = p_id;
  if not found then
    raise exception 'No se encontró la transacción.';
  end if;
  if original.tipo = 'reversion' then
    raise exception 'Una reversión no se puede revertir desde este flujo.';
  end if;
  if original.estado not in ('completada', 'marcada') then
    raise exception 'Solo se revierten operaciones completadas o marcadas.';
  end if;
  if exists (select 1 from public.transacciones where referencia_origen = original.referencia) then
    raise exception 'Esta operación ya tiene una reversión.';
  end if;
  select * into origen from public.cuentas where id = original.cuenta_destino_id for update;
  select * into destino from public.cuentas where id = original.cuenta_origen_id for update;
  if origen.id is not null and origen.saldo < original.monto then
    raise exception 'La cuenta no tiene saldo para devolver el movimiento.';
  end if;
  ref := 'TX-' || lpad(nextval('public.tx_seq')::text, 6, '0');
  insert into public.transacciones (
    referencia, tipo, monto, cuenta_origen_id, cuenta_destino_id, estado, canal, ip, dispositivo,
    idempotency_key, usuario_id, referencia_origen, motivo
  ) values (
    ref, 'reversion', original.monto, origen.id, destino.id, 'completada', original.canal,
    public.request_ip(), public.request_device(), 'rev-' || original.referencia, auth.uid(),
    original.referencia, 'Reversión de ' || original.referencia
  ) returning id into nuevo_id;
  if origen.id is not null then
    update public.cuentas set saldo = saldo - original.monto where id = origen.id;
  end if;
  if destino.id is not null then
    update public.cuentas set saldo = saldo + original.monto where id = destino.id;
  end if;
  return jsonb_build_object('id', nuevo_id, 'referencia', ref, 'estado', 'completada');
end;
$$;

create or replace function public.siguiente_codigo(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public.mfa_ok() then
    raise exception 'Debe confirmar el código de acceso.';
  end if;
  if p_kind = 'cliente' then
    select coalesce(max(substring(codigo from 5)::int), 0) + 1 into n from public.clientes where codigo ~ '^CLI-[0-9]+$';
    return 'CLI-' || lpad(n::text, 4, '0');
  elsif p_kind = 'incidente' then
    select coalesce(max(substring(codigo from 5)::int), 0) + 1 into n from public.incidentes where codigo ~ '^INC-[0-9]+$';
    return 'INC-' || lpad(n::text, 2, '0');
  elsif p_kind = 'activo' then
    select coalesce(max(substring(codigo from 5)::int), 0) + 1 into n from public.activos where codigo ~ '^AST-[0-9]+$';
    return 'AST-' || lpad(n::text, 2, '0');
  elsif p_kind = 'amenaza' then
    select coalesce(max(substring(codigo from 5)::int), 0) + 1 into n from public.amenazas where codigo ~ '^AMN-[0-9]+$';
    return 'AMN-' || lpad(n::text, 2, '0');
  elsif p_kind = 'riesgo' then
    select coalesce(max(substring(codigo from 5)::int), 0) + 1 into n from public.riesgos where codigo ~ '^RSK-[0-9]+$';
    return 'RSK-' || lpad(n::text, 2, '0');
  elsif p_kind = 'hallazgo' then
    select coalesce(max(substring(codigo from 5)::int), 0) + 1 into n from public.hallazgos where codigo ~ '^HAL-[0-9]+$';
    return 'HAL-' || lpad(n::text, 2, '0');
  elsif p_kind = 'caso' then
    select coalesce(max(substring(codigo from 5)::int), 0) + 1 into n from public.casos_abuso where codigo ~ '^CAB-[0-9]+$';
    return 'CAB-' || lpad(n::text, 2, '0');
  elsif p_kind = 'cuenta' then
    select count(*) + 1 into n from public.cuentas;
    return '01-00' || ((n % 5) + 1)::text || '-' || lpad((100000 + n)::text, 6, '0');
  end if;
  raise exception 'Código no válido.';
end;
$$;

create or replace function public.guardar_cliente(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nuevo uuid;
  codigo text;
begin
  if not public.mfa_ok() then
    raise exception 'Debe confirmar el código de acceso.';
  end if;
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'ejecutivo')) then
    raise exception 'No tiene permiso para esta operación.';
  end if;
  if payload->>'id' is not null and payload->>'id' <> '' then
    if public.has_role(auth.uid(), 'ejecutivo') and not public.ejecutivo_puede((payload->>'id')::uuid) then
      raise exception 'El cliente no está asignado a su cartera.';
    end if;
    update public.clientes set
      nombres = payload->>'nombres',
      apellidos = payload->>'apellidos',
      dpi = payload->>'dpi',
      nit = payload->>'nit',
      correo = payload->>'correo',
      telefono = payload->>'telefono',
      direccion = payload->>'direccion',
      fecha_nacimiento = (payload->>'fechaNacimiento')::date,
      nivel_riesgo = payload->>'nivelRiesgo',
      estado_kyc = payload->>'estadoKyc',
      estado = payload->>'estado'
    where id = (payload->>'id')::uuid
    returning id into nuevo;
    if nuevo is null then
      raise exception 'No se encontró el registro.';
    end if;
    return nuevo;
  end if;
  select public.siguiente_codigo('cliente') into codigo;
  insert into public.clientes (
    codigo, nombres, apellidos, dpi, nit, correo, telefono, direccion,
    fecha_nacimiento, nivel_riesgo, estado_kyc, estado
  ) values (
    codigo, payload->>'nombres', payload->>'apellidos', payload->>'dpi', payload->>'nit',
    payload->>'correo', payload->>'telefono', payload->>'direccion',
    (payload->>'fechaNacimiento')::date, payload->>'nivelRiesgo', payload->>'estadoKyc', payload->>'estado'
  ) returning id into nuevo;
  if public.has_role(auth.uid(), 'ejecutivo') then
    insert into public.asignaciones (ejecutivo_user_id, cliente_id) values (auth.uid(), nuevo);
  end if;
  return nuevo;
end;
$$;

create or replace function public.abrir_cuenta(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nuevo uuid;
  numero text;
begin
  if not public.mfa_ok() then
    raise exception 'Debe confirmar el código de acceso.';
  end if;
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'ejecutivo')) then
    raise exception 'No tiene permiso para esta operación.';
  end if;
  if public.has_role(auth.uid(), 'ejecutivo') and not public.ejecutivo_puede((payload->>'clienteId')::uuid) then
    raise exception 'El cliente no está asignado a su cartera.';
  end if;
  select public.siguiente_codigo('cuenta') into numero;
  insert into public.cuentas (numero, cliente_id, tipo, saldo, limite_diario, estado)
  values (numero, (payload->>'clienteId')::uuid, payload->>'tipo', 0, (payload->>'limiteDiario')::numeric, 'activa')
  returning id into nuevo;
  return nuevo;
end;
$$;

create or replace function public.cambiar_estado_cliente(p_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cliente public.clientes%rowtype;
begin
  if not public.mfa_ok() then
    raise exception 'Debe confirmar el código de acceso.';
  end if;
  if p_estado not in ('activo', 'inactivo', 'bloqueado') then
    raise exception 'Estado no válido.';
  end if;
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'ejecutivo')) then
    raise exception 'No tiene permiso para esta operación.';
  end if;
  select * into cliente from public.clientes where id = p_id;
  if not found then
    raise exception 'No se encontró el registro.';
  end if;
  if public.has_role(auth.uid(), 'ejecutivo') and not public.ejecutivo_puede(p_id) then
    raise exception 'El cliente no está asignado a su cartera.';
  end if;
  update public.clientes set estado = p_estado where id = p_id;
  if p_estado = 'bloqueado' then
    perform set_config('app.movimiento', '1', true);
    update public.cuentas set estado = 'bloqueada' where cliente_id = p_id;
    if cliente.user_id is not null then
      insert into public.notificaciones (user_id, tipo, titulo, mensaje, severidad)
      values (cliente.user_id, 'cuenta', 'Cuenta bloqueada', 'Su relación comercial fue bloqueada. Comuníquese con el banco.', 'alta');
    end if;
  end if;
end;
$$;

create or replace function public.directorio_usuarios()
returns table (id uuid, nombre text, role text)
language sql
security definer
set search_path = public
as $$
  select p.user_id, p.nombre, r.role
  from public.profiles p
  join public.user_roles r on r.user_id = p.user_id
  where public.mfa_ok()
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad'));
$$;

revoke all on function public.confirmar_transferencia(uuid, text) from public;
revoke all on function public.registrar_movimiento(jsonb) from public;
revoke all on function public.revertir_transaccion(uuid) from public;
revoke all on function public.siguiente_codigo(text) from public;
revoke all on function public.guardar_cliente(jsonb) from public;
revoke all on function public.abrir_cuenta(jsonb) from public;
revoke all on function public.cambiar_estado_cliente(uuid, text) from public;
revoke all on function public.directorio_usuarios() from public;

grant execute on function public.confirmar_transferencia(uuid, text) to authenticated;
grant execute on function public.registrar_movimiento(jsonb) to authenticated;
grant execute on function public.revertir_transaccion(uuid) to authenticated;
grant execute on function public.siguiente_codigo(text) to authenticated;
grant execute on function public.guardar_cliente(jsonb) to authenticated;
grant execute on function public.abrir_cuenta(jsonb) to authenticated;
grant execute on function public.cambiar_estado_cliente(uuid, text) to authenticated;
grant execute on function public.directorio_usuarios() to authenticated;
