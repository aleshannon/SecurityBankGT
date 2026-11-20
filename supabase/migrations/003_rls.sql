-- RLS en todas las tablas. No se fuerza RLS al propietario (las funciones SECURITY DEFINER
-- pertenecen a postgres y deben poder escribir). authenticated no recibe UPDATE/DELETE
-- sobre transacciones ni audit_logs.

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.clientes enable row level security;
alter table public.cuentas enable row level security;
alter table public.beneficiarios enable row level security;
alter table public.transacciones enable row level security;
alter table public.tarjetas enable row level security;
alter table public.audit_logs enable row level security;
alter table public.security_events enable row level security;
alter table public.incidentes enable row level security;
alter table public.incidente_notas enable row level security;
alter table public.dispositivos enable row level security;
alter table public.activos enable row level security;
alter table public.amenazas enable row level security;
alter table public.riesgos enable row level security;
alter table public.hallazgos enable row level security;
alter table public.casos_abuso enable row level security;
alter table public.notificaciones enable row level security;
alter table public.login_attempts enable row level security;
alter table public.account_locks enable row level security;
alter table public.mfa_sessions enable row level security;
alter table public.otp_challenges enable row level security;
alter table public.transfer_drafts enable row level security;
alter table public.asignaciones enable row level security;

grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.transacciones from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke select, update, delete on public.otp_challenges from authenticated;
revoke all on public.login_attempts from authenticated;
revoke all on public.account_locks from authenticated;
grant select on public.login_attempts to authenticated;
grant select on public.account_locks to authenticated;

-- La sesión MFA es legible por su dueño antes de verificar el código.
create policy mfa_propia on public.mfa_sessions
  for select to authenticated
  using (user_id = auth.uid());
create policy mfa_update_propia on public.mfa_sessions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy roles_lectura on public.user_roles
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
  );
create policy roles_admin on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy clientes_select on public.clientes
  for select to authenticated
  using (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'auditor_seguridad')
      or (public.has_role(auth.uid(), 'cliente') and user_id = auth.uid())
      or (public.has_role(auth.uid(), 'ejecutivo') and public.ejecutivo_puede(id))
    )
  );
create policy clientes_write on public.clientes
  for all to authenticated
  using (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or (public.has_role(auth.uid(), 'ejecutivo') and public.ejecutivo_puede(id))
    )
  )
  with check (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'ejecutivo')
    )
  );

create policy cuentas_select on public.cuentas
  for select to authenticated
  using (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'auditor_seguridad')
      or (public.has_role(auth.uid(), 'cliente') and cliente_id = public.current_cliente_id())
      or (public.has_role(auth.uid(), 'ejecutivo') and public.ejecutivo_puede(cliente_id))
    )
  );
create policy cuentas_write on public.cuentas
  for insert to authenticated
  with check (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or (public.has_role(auth.uid(), 'ejecutivo') and public.ejecutivo_puede(cliente_id))
    )
  );
create policy cuentas_estado on public.cuentas
  for update to authenticated
  using (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or (public.has_role(auth.uid(), 'ejecutivo') and public.ejecutivo_puede(cliente_id))
      or (public.has_role(auth.uid(), 'cliente') and cliente_id = public.current_cliente_id())
    )
  )
  with check (true);

create policy tx_select on public.transacciones
  for select to authenticated
  using (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'auditor_seguridad')
      or (
        public.has_role(auth.uid(), 'cliente')
        and (
          cuenta_origen_id in (select id from public.cuentas where cliente_id = public.current_cliente_id())
          or cuenta_destino_id in (select id from public.cuentas where cliente_id = public.current_cliente_id())
        )
      )
      or (
        public.has_role(auth.uid(), 'ejecutivo')
        and (
          cuenta_origen_id in (select id from public.cuentas where public.ejecutivo_puede(cliente_id))
          or cuenta_destino_id in (select id from public.cuentas where public.ejecutivo_puede(cliente_id))
        )
      )
    )
  );

create policy benef_all on public.beneficiarios
  for all to authenticated
  using (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or (public.has_role(auth.uid(), 'cliente') and cliente_id = public.current_cliente_id())
      or (public.has_role(auth.uid(), 'ejecutivo') and public.ejecutivo_puede(cliente_id))
    )
  )
  with check (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or (public.has_role(auth.uid(), 'cliente') and cliente_id = public.current_cliente_id())
      or (public.has_role(auth.uid(), 'ejecutivo') and public.ejecutivo_puede(cliente_id))
    )
  );

create policy tarjetas_select on public.tarjetas
  for select to authenticated
  using (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or (public.has_role(auth.uid(), 'cliente') and cliente_id = public.current_cliente_id())
      or (public.has_role(auth.uid(), 'ejecutivo') and public.ejecutivo_puede(cliente_id))
    )
  );
create policy tarjetas_insert on public.tarjetas
  for insert to authenticated
  with check (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or (public.has_role(auth.uid(), 'ejecutivo') and public.ejecutivo_puede(cliente_id))
    )
  );
create policy tarjetas_update on public.tarjetas
  for update to authenticated
  using (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or (public.has_role(auth.uid(), 'ejecutivo') and public.ejecutivo_puede(cliente_id))
      or (public.has_role(auth.uid(), 'cliente') and cliente_id = public.current_cliente_id())
    )
  )
  with check (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or (public.has_role(auth.uid(), 'ejecutivo') and public.ejecutivo_puede(cliente_id))
      or (public.has_role(auth.uid(), 'cliente') and cliente_id = public.current_cliente_id())
    )
  );

create policy audit_read on public.audit_logs
  for select to authenticated
  using (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'auditor_seguridad')
    )
  );

create policy events_read on public.security_events
  for select to authenticated
  using (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'auditor_seguridad')
    )
  );
create policy events_insert on public.security_events
  for insert to authenticated
  with check (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'auditor_seguridad')
    )
  );

create policy incidentes_rw on public.incidentes
  for all to authenticated
  using (public.mfa_ok() and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad')))
  with check (public.mfa_ok() and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad')));

create policy notas_rw on public.incidente_notas
  for all to authenticated
  using (public.mfa_ok() and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad')))
  with check (public.mfa_ok() and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad')));

create policy dispositivos_rw on public.dispositivos
  for all to authenticated
  using (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'auditor_seguridad')
      or user_id = auth.uid()
    )
  )
  with check (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or user_id = auth.uid()
    )
  );

create policy gov_read on public.activos
  for select to authenticated
  using (public.mfa_ok() and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad')));
create policy gov_write on public.activos
  for all to authenticated
  using (public.mfa_ok() and public.has_role(auth.uid(), 'admin'))
  with check (public.mfa_ok() and public.has_role(auth.uid(), 'admin'));

create policy amenazas_read on public.amenazas
  for select to authenticated
  using (public.mfa_ok() and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad')));
create policy amenazas_write on public.amenazas
  for all to authenticated
  using (public.mfa_ok() and public.has_role(auth.uid(), 'admin'))
  with check (public.mfa_ok() and public.has_role(auth.uid(), 'admin'));

create policy riesgos_read on public.riesgos
  for select to authenticated
  using (public.mfa_ok() and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad')));
create policy riesgos_write on public.riesgos
  for all to authenticated
  using (public.mfa_ok() and public.has_role(auth.uid(), 'admin'))
  with check (public.mfa_ok() and public.has_role(auth.uid(), 'admin'));

create policy hallazgos_read on public.hallazgos
  for select to authenticated
  using (public.mfa_ok() and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad')));
create policy hallazgos_write on public.hallazgos
  for all to authenticated
  using (public.mfa_ok() and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad')))
  with check (public.mfa_ok() and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad')));

create policy casos_read on public.casos_abuso
  for select to authenticated
  using (public.mfa_ok() and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad')));
create policy casos_write on public.casos_abuso
  for insert to authenticated
  with check (public.mfa_ok() and public.has_role(auth.uid(), 'admin'));

create policy notif_propia on public.notificaciones
  for select to authenticated
  using (public.mfa_ok() and user_id = auth.uid());
create policy notif_update on public.notificaciones
  for update to authenticated
  using (public.mfa_ok() and user_id = auth.uid())
  with check (user_id = auth.uid());

create policy locks_admin on public.account_locks
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or user_id = auth.uid());
create policy attempts_admin on public.login_attempts
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'auditor_seguridad'));

create policy drafts_propia on public.transfer_drafts
  for select to authenticated
  using (public.mfa_ok() and user_id = auth.uid());

create policy asignaciones_read on public.asignaciones
  for select to authenticated
  using (
    public.mfa_ok() and (
      public.has_role(auth.uid(), 'admin')
      or ejecutivo_user_id = auth.uid()
    )
  );

-- Vista enmascarada. El DPI completo no se selecciona desde la tabla para el rol cliente:
-- la vista aplica el enmascarado y es la que debe consultar el portal.
revoke select (dpi, telefono) on public.clientes from authenticated;

create or replace view public.clientes_visibles
with (security_invoker = false) as
select
  id, codigo, user_id, nombres, apellidos,
  case when public.puede_revelar() then dpi else public.mask_dpi(dpi) end as dpi,
  nit, correo,
  case when public.puede_revelar() then telefono else public.mask_phone(telefono) end as telefono,
  direccion, fecha_nacimiento, nivel_riesgo, estado_kyc, estado, fecha_alta
from public.clientes;

grant select on public.clientes_visibles to authenticated;
