-- Semilla ficticia. Contraseñas de demostración, solo para el aula.
-- admin@securitybankgt.com / Admin#2026Gtq!
-- auditor@securitybankgt.com / Auditor#2026Gt!
-- ejecutivo@securitybankgt.com / Ejecutivo#2026!
-- cliente@securitybankgt.com / Cliente#2026Gt!

create extension if not exists pgcrypto;

do $$
declare
  admin_id uuid := '11111111-1111-4111-8111-111111111111';
  auditor_id uuid := '22222222-2222-4222-8222-222222222222';
  ejecutivo_id uuid := '33333333-3333-4333-8333-333333333333';
  cliente_user uuid := '44444444-4444-4444-8444-444444444444';
  instance uuid := '00000000-0000-0000-0000-000000000000';
  nombres text[] := array['María José','Juan Carlos','Ana Lucía','Carlos Eduardo','Sofía Alejandra','Diego Andrés','Andrea Paola','Luis Fernando','Gabriela Isabel','Pedro Antonio','Valeria Nicole','Jorge Alberto','Camila Fernanda','Ricardo Estuardo','Daniela Beatriz','Miguel Ángel','Paola Alejandra','Roberto Carlos','Elena Rocío','Héctor Manuel','Carmen Yolanda','Oscar Iván','Patricia Noemí','Fernando Josué','Lucía Mercedes'];
  apellidos text[] := array['García Morales','López Hernández','Pérez Ramírez','González Cruz','Rodríguez Flores','Hernández Reyes','Morales Gómez','Ramírez Díaz','Castillo Ruiz','Méndez Ortiz','Vásquez Salazar','Chávez Aguilar','Juárez Pineda','Orozco Cabrera','Santos Figueroa','Alvarado León','Cifuentes Palma','Monzón Escobar','Barrios Quiñónez','De León Soto','Gálvez Navarro','Recinos Argueta','Velásquez Chamalé','Ixcoy Tum','Yat Coc'];
  i int;
  j int;
  cid uuid;
  cuenta uuid;
  saldo numeric;
  cliente_ids uuid[] := '{}';
  cuenta_ids uuid[] := '{}';
  activo_ids uuid[] := '{}';
  hallazgo_ids uuid[] := '{}';
  n_cuentas int := 0;
  n_tx int := 0;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values
    (instance, admin_id, 'authenticated', 'authenticated', 'admin@securitybankgt.com', crypt('Admin#2026Gtq!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"nombre":"Andrea Castillo Ruiz"}', now(), now(), '', '', '', ''),
    (instance, auditor_id, 'authenticated', 'authenticated', 'auditor@securitybankgt.com', crypt('Auditor#2026Gt!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"nombre":"Héctor Morales Díaz"}', now(), now(), '', '', '', ''),
    (instance, ejecutivo_id, 'authenticated', 'authenticated', 'ejecutivo@securitybankgt.com', crypt('Ejecutivo#2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"nombre":"Lucía Fernández Gómez"}', now(), now(), '', '', '', ''),
    (instance, cliente_user, 'authenticated', 'authenticated', 'cliente@securitybankgt.com', crypt('Cliente#2026Gt!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"nombre":"María José García Morales"}', now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  select id, id, jsonb_build_object('sub', id::text, 'email', email), 'email', id::text, now(), now(), now()
  from auth.users
  where id in (admin_id, auditor_id, ejecutivo_id, cliente_user)
  on conflict do nothing;

  update public.profiles set nombre = 'Andrea Castillo Ruiz' where user_id = admin_id;
  update public.profiles set nombre = 'Héctor Morales Díaz' where user_id = auditor_id;
  update public.profiles set nombre = 'Lucía Fernández Gómez' where user_id = ejecutivo_id;
  update public.profiles set nombre = 'María José García Morales', telefono = '+502 5555 0101' where user_id = cliente_user;
  update public.user_roles set role = 'admin' where user_id = admin_id;
  update public.user_roles set role = 'auditor_seguridad' where user_id = auditor_id;
  update public.user_roles set role = 'ejecutivo' where user_id = ejecutivo_id;

  for i in 1..25 loop
    insert into public.clientes (
      codigo, user_id, nombres, apellidos, dpi, nit, correo, telefono, direccion,
      fecha_nacimiento, nivel_riesgo, estado_kyc, estado, fecha_alta
    ) values (
      'CLI-' || lpad(i::text, 4, '0'),
      case when i = 1 then cliente_user else null end,
      nombres[i], apellidos[i],
      lpad((2400000000100 + i * 137)::text, 13, '0'),
      lpad((1000000 + i * 17)::text, 7, '0') || '-' || (i % 9)::text,
      case when i = 1 then 'cliente@securitybankgt.com' else lower(split_part(nombres[i], ' ', 1)) || '.' || lower(split_part(apellidos[i], ' ', 1)) || i::text || '@correo.gt' end,
      '+502 5' || lpad((100 + i)::text, 3, '0') || ' ' || lpad((1000 + i * 3)::text, 4, '0'),
      i::text || ' avenida, zona ' || ((i % 15) + 1)::text || ', Ciudad de Guatemala',
      date '1985-03-12' + (i * 140),
      case when i % 7 = 0 then 'alto' when i % 3 = 0 then 'medio' else 'bajo' end,
      case when i % 8 = 0 then 'pendiente' when i % 11 = 0 then 'rechazado' else 'verificado' end,
      case when i = 25 then 'bloqueado' when i in (23, 24) then 'inactivo' else 'activo' end,
      current_date - (i * 12)
    ) returning id into cid;
    cliente_ids := cliente_ids || cid;
    if i <= 10 then
      insert into public.asignaciones (ejecutivo_user_id, cliente_id) values (ejecutivo_id, cid);
    end if;
  end loop;

  for i in 1..25 loop
    for j in 1..(case when i = 1 then 3 when i <= 14 then 2 else 1 end) loop
      n_cuentas := n_cuentas + 1;
      saldo := case when cliente_ids[i] is not null and i = 25 then 0 else 8000 + (n_cuentas * 1379) % 70000 end;
      insert into public.cuentas (numero, cliente_id, tipo, saldo, limite_diario, estado, fecha_apertura)
      values (
        '01-' || lpad(i::text, 3, '0') || '-' || lpad((100000 + n_cuentas)::text, 6, '0'),
        cliente_ids[i],
        case j when 1 then 'monetaria' when 2 then 'ahorro' else 'inversion' end,
        saldo,
        case when i = 1 then 80000 else 20000 end,
        case when i = 25 then 'bloqueada' else 'activa' end,
        current_date - (90 - n_cuentas)
      ) returning id into cuenta;
      cuenta_ids := cuenta_ids || cuenta;
    end loop;
  end loop;

  for i in 1..15 loop
    insert into public.beneficiarios (cliente_id, nombre, numero_cuenta, banco, alias)
    values (
      cliente_ids[((i - 1) % 10) + 1],
      nombres[((i + 3) % 25) + 1] || ' ' || apellidos[((i + 5) % 25) + 1],
      '02-010-' || lpad((200000 + i)::text, 6, '0'),
      case when i % 2 = 0 then 'Banco de Occidente' else 'Banco Industrial' end,
      'Beneficiario ' || i::text
    );
  end loop;

  for i in 1..30 loop
    insert into public.tarjetas (cliente_id, cuenta_id, tipo, marca, ultimos4, vencimiento, estado, limite_diario, limite_mensual)
    values (
      cliente_ids[((i - 1) % 20) + 1],
      cuenta_ids[((i - 1) % 30) + 1],
      case when i % 3 = 0 then 'credito' else 'debito' end,
      case when i % 2 = 0 then 'Mastercard' else 'Visa' end,
      lpad((1000 + i * 17 % 9000)::text, 4, '0'),
      lpad(((i % 12) + 1)::text, 2, '0') || '/' || lpad(((28 + i % 4))::text, 2, '0'),
      case when i % 9 = 0 then 'bloqueada' when i % 13 = 0 then 'reportada' else 'activa' end,
      5000, 25000
    );
  end loop;

  while n_tx < 300 loop
    n_tx := n_tx + 1;
    insert into public.transacciones (
      referencia, tipo, monto, cuenta_origen_id, cuenta_destino_id, estado, canal, ip, dispositivo,
      fecha, idempotency_key, usuario_id, motivo
    ) values (
      'TX-' || lpad(n_tx::text, 6, '0'),
      case n_tx % 5 when 0 then 'deposito' when 1 then 'retiro' when 2 then 'transferencia_propia' else 'transferencia_tercero' end,
      round((150 + (n_tx * 97) % 18000)::numeric, 2),
      case when n_tx % 5 = 0 then null else cuenta_ids[((n_tx - 1) % 40) + 1] end,
      case when n_tx % 5 in (2, 3, 4) then cuenta_ids[(n_tx % 40) + 1] else null end,
      case when n_tx % 30 = 0 then 'rechazada' when n_tx % 29 = 0 then 'marcada' else 'completada' end,
      case n_tx % 3 when 0 then 'web' when 1 then 'movil' else 'cajero' end,
      '190.56.' || (n_tx % 40)::text || '.' || (10 + n_tx % 200)::text,
      'Navegador web',
      now() - ((n_tx % 90) || ' days')::interval - ((n_tx % 20) || ' hours')::interval,
      'seed-' || lpad(n_tx::text, 4, '0'),
      admin_id,
      case when n_tx % 30 = 0 then 'Rechazada en la semilla de demostración.' else null end
    );
  end loop;
  perform setval('public.tx_seq', 300);

  for i in 1..60 loop
    insert into public.audit_logs (user_id, accion, entidad, entidad_id, ip, dispositivo, resultado, fecha)
    values (
      case when i % 4 = 0 then auditor_id when i % 3 = 0 then ejecutivo_id else admin_id end,
      case i % 4 when 0 then 'CONSULTA' when 1 then 'LOGIN' when 2 then 'EXPORTACION' else 'ACTUALIZACION' end,
      case i % 3 when 0 then 'clientes' when 1 then 'cuentas' else 'transacciones' end,
      i::text, '190.56.8.' || i::text, 'Navegador web', case when i % 11 = 0 then 'fallo' else 'exito' end,
      now() - (i || ' hours')::interval
    );
  end loop;

  for i in 1..30 loop
    insert into public.security_events (tipo, severidad, descripcion, user_id, ip, pais, dispositivo, fecha)
    values (
      case i % 5 when 0 then 'login_fallido' when 1 then 'dispositivo_nuevo' when 2 then 'transferencia_inusual' when 3 then 'acceso_no_autorizado' else 'pais_diferente' end,
      case i % 4 when 0 then 'critica' when 1 then 'alta' when 2 then 'media' else 'baja' end,
      case i % 5
        when 0 then 'Se acumuló una serie de intentos de acceso fallidos.'
        when 1 then 'El acceso provino de un dispositivo que no estaba marcado como de confianza.'
        when 2 then 'El patrón de la transferencia se apartó del uso habitual de la cuenta.'
        when 3 then 'Se intentó consultar un registro fuera del alcance del rol.'
        else 'El acceso se observó desde un país distinto al habitual.'
      end,
      case when i % 2 = 0 then cliente_user else admin_id end,
      '190.56.9.' || i::text,
      case when i % 6 = 0 then 'US' else 'GT' end,
      'Navegador web',
      now() - (i || ' hours')::interval
    );
  end loop;

  insert into public.activos (codigo, nombre, proceso, tipo, ubicacion, confidencialidad, integridad, disponibilidad, propietario, custodio)
  select * from (values
    ('AST-01','Aplicación móvil SecurityBankGT','Banca móvil','software','movil','Alta','Alta','Media','Gerencia de canales','Equipo móvil'),
    ('AST-02','Portal web de banca','Banca por internet','software','cloud','Alta','Alta','Alta','Gerencia de canales','Equipo web'),
    ('AST-03','API Gateway','Exposición de servicios','software','cloud','Alta','Alta','Alta','Arquitectura','Plataforma'),
    ('AST-04','Microservicio de pagos','Transferencias','software','cloud','Alta','Alta','Alta','Operaciones','Equipo de pagos'),
    ('AST-05','Base de datos transaccional','Registro contable','informacion','cloud','Alta','Alta','Alta','Datos','Administración de base de datos'),
    ('AST-06','Keystore del dispositivo','Custodia de claves','software','movil','Alta','Alta','Media','Seguridad','Equipo móvil'),
    ('AST-07','Servicio de identidad','Autenticación','servicios','cloud','Alta','Alta','Alta','Seguridad','Plataforma'),
    ('AST-08','Bucket de logs','Evidencia y monitoreo','informacion','cloud','Alta','Media','Media','Seguridad','SRE'),
    ('AST-09','Repositorio de código','Control de versiones','software','repositorio','Media','Alta','Media','Ingeniería','DevOps'),
    ('AST-10','Pipeline de integración','Despliegue','servicios','repositorio','Media','Alta','Alta','Ingeniería','DevOps'),
    ('AST-11','WAF de perímetro','Filtrado de tráfico','servicios','cloud','Media','Alta','Alta','Seguridad','Redes'),
    ('AST-12','Módulo de reportes','Información gerencial','software','cloud','Alta','Media','Baja','Riesgos','Equipo de datos'),
    ('AST-13','Políticas de seguridad','Gobierno ISO 27001','informacion','repositorio','Media','Alta','Baja','Oficial de seguridad','GRC'),
    ('AST-14','Personal de atención','Atención al cliente','personal','cloud','Alta','Media','Media','Servicio al cliente','Talento humano'),
    ('AST-15','Centro de procesamiento','Cómputo de la región','fisico','cloud','Media','Alta','Alta','Infraestructura','SRE')
  ) as v(codigo, nombre, proceso, tipo, ubicacion, confidencialidad, integridad, disponibilidad, propietario, custodio);

  select array_agg(id order by codigo) into activo_ids from public.activos;

  insert into public.amenazas (codigo, nombre, descripcion, categoria, damage, reproducibility, exploitability, affected_users, discoverability, activo_id)
  values
    ('AMN-01','Suplantación de la sesión móvil','Un tercero reutiliza una sesión para operar como el cliente.','Spoofing',9,6,5,7,5, activo_ids[1]),
    ('AMN-02','Uso de credenciales ajenas','Alguien prueba contraseñas hasta entrar a una cuenta de otro titular.','Spoofing',8,8,7,8,7, activo_ids[7]),
    ('AMN-03','Manipulación del monto','La petición de pago se altera antes de llegar al registro contable.','Tampering',9,4,4,6,3, activo_ids[4]),
    ('AMN-04','Alteración de la bitácora','Se modifican o borran eventos para ocultar una operación.','Tampering',8,3,3,4,3, activo_ids[8]),
    ('AMN-05','Repudio de una transferencia','El ordenante niega haber autorizado un movimiento de alto valor.','Repudiation',6,5,4,5,5, activo_ids[4]),
    ('AMN-06','Repudio de un retiro en cajero','No queda evidencia suficiente del canal, el equipo y la hora.','Repudiation',5,4,3,4,4, activo_ids[2]),
    ('AMN-07','Exfiltración de DPI','Consultas amplias devuelven identificadores de muchas personas.','Information Disclosure',9,6,6,8,5, activo_ids[3]),
    ('AMN-08','Exposición en reportes','Un reporte incluye datos de clientes que no corresponden al rol.','Information Disclosure',7,5,5,6,5, activo_ids[12]),
    ('AMN-09','Saturación del inicio de sesión','Un volumen alto de intentos impide el acceso legítimo.','Denial of Service',7,8,7,9,8, activo_ids[7]),
    ('AMN-10','Agotamiento del servicio de pagos','El microservicio deja de confirmar operaciones por carga excesiva.','Denial of Service',8,5,5,8,4, activo_ids[4]),
    ('AMN-11','Escalada de rol desde el navegador','El cliente envía un rol privilegiado y el sistema lo acepta.','Elevation of Privilege',10,4,3,7,3, activo_ids[7]),
    ('AMN-12','Lectura de cuentas de otro cliente','Cambiar el identificador permite ver o mover fondos ajenos.','Elevation of Privilege',9,6,5,8,5, activo_ids[3]);

  insert into public.riesgos (codigo, titulo, descripcion, probabilidad, impacto, controles, probabilidad_residual, impacto_residual, tipo, tipo_impacto, tratamiento, activo_id)
  values
    ('RSK-01','Toma de cuentas por acceso débil','Credenciales predecibles o intentos repetidos permiten entrar como otro cliente.',5,5,'Contraseña robusta, bloqueo temporal, MFA y bitácora.',2,3,'seguridad','reputacional','mitigar', activo_ids[7]),
    ('RSK-02','Fraude en transferencias','Un movimiento no autorizado sale de una cuenta activa.',4,5,'Límite diario, OTP sobre Q10,000 y marcado para revisión.',3,4,'software','financiero','mitigar', activo_ids[4]),
    ('RSK-03','Fuga de datos personales','DPI y teléfono quedan visibles para roles que no los necesitan.',4,5,'Enmascarado por defecto y políticas de fila.',2,4,'seguridad','legal','mitigar', activo_ids[5]),
    ('RSK-04','Indisponibilidad del registro contable','La base transaccional no responde durante la operación del día.',3,5,'Respaldos y función atómica de movimiento.',2,4,'cloud','operacional','mitigar', activo_ids[5]),
    ('RSK-05','Cambio no autorizado en el código','Una modificación en el repositorio llega a producción sin revisión.',2,4,'Revisión obligatoria y protección de ramas.',1,3,'tecnico','operacional','mitigar', activo_ids[9]),
    ('RSK-06','Abuso de consultas de la API','Peticiones amplias extraen más información de la necesaria.',4,4,'Tope de página, límite de intentos y WAF.',2,3,'tecnico','operacional','mitigar', activo_ids[3]),
    ('RSK-07','Pérdida de la clave del dispositivo','La clave local puede copiarse fuera del teléfono.',2,5,'Almacén de hardware y prohibición de exportación.',1,4,'software','financiero','mitigar', activo_ids[6]),
    ('RSK-08','Error de atención al cliente','Un ejecutivo consulta o modifica un cliente que no tiene asignado.',3,3,'Asignación explícita y segregación de funciones.',2,2,'seguridad','reputacional','mitigar', activo_ids[14]),
    ('RSK-09','Incumplimiento del marco de control','Los controles documentados no se operan ni se revisan.',3,4,'Inventario, registro de riesgos y auditoría.',2,3,'seguridad','legal','mitigar', activo_ids[13]),
    ('RSK-10','Logs accesibles de más','El almacén de evidencia puede leerse fuera del equipo de seguridad.',3,5,'Acceso privado, cifrado y bitácora inmutable.',1,4,'cloud','legal','mitigar', activo_ids[8]),
    ('RSK-11','Dependencia del proveedor de identidad','Una falla del servicio de identidad detiene el acceso al banco.',2,4,'Contrato con niveles de servicio y plan de salida.',2,3,'cloud','operacional','transferir', activo_ids[7]),
    ('RSK-12','Reversión indebida','Una corrección contable se usa para alterar la historia.',2,5,'Solo el administrador revierte y el movimiento original permanece.',1,3,'tecnico','financiero','evitar', activo_ids[4]);

  insert into public.hallazgos (codigo, titulo, origen, owasp, severidad, cvss, activo_id, evidencia, recomendacion, responsable, estado, fecha_limite, capa)
  values
    ('HAL-01','Lectura de cuentas de otro cliente','pentest_caja_gris','API1','critica',8.6, activo_ids[3],'Al cambiar el identificador, la consulta devolvía la cuenta de otra persona.','Autorizar cada lectura con el propietario y registrar el intento.','Plataforma','en_progreso', current_date - 6, 'aplicacion'),
    ('HAL-02','Intentos de acceso sin contención','pentest_caja_negra','API2','alta',7.5, activo_ids[7],'Se observaron varios intentos fallidos sin un bloqueo temporal.','Bloquear la cuenta tras cinco fallos y dejar constancia en la bitácora.','Seguridad','mitigado', current_date + 20, 'perimetro'),
    ('HAL-03','Segundo factor decidido en el cliente','pentest_caja_gris','API2','critica',9.1, activo_ids[1],'El indicador de verificación podía alterarse en el navegador.','Generar y validar el OTP en el servidor, con vigencia de cinco minutos y un solo uso.','Equipo móvil','en_progreso', current_date - 2, 'aplicacion'),
    ('HAL-04','DPI y teléfono visibles para cualquier rol','sast','API3','alta',7.1, activo_ids[5],'La respuesta incluía los identificadores completos sin distinguir el rol.','Enmascarar por defecto y revelar el dato solo a roles autorizados.','Datos','mitigado', current_date + 15, 'datos'),
    ('HAL-05','Paginación sin tamaño máximo','pentest_caja_negra','API4','alta',7.4, activo_ids[3],'El tamaño de página aceptaba valores muy altos.','Fijar un máximo de 20 registros y mantener la política de fila.','Plataforma','abierto', current_date - 4, 'aplicacion'),
    ('HAL-06','Inicio de sesión sin límite de ritmo','pentest_caja_negra','API4','alta',7.3, activo_ids[7],'El acceso aceptaba ráfagas de intentos sobre el mismo correo.','Limitar los intentos por correo y registrar cada uno.','Seguridad','mitigado', current_date + 12, 'perimetro'),
    ('HAL-07','Reversión disponible fuera del administrador','pentest_caja_gris','API5','critica',8.8, activo_ids[4],'El flujo de reversión no distinguía el rol en el servidor.','Reservar la reversión al administrador y conservar el movimiento original.','Pagos','abierto', current_date + 10, 'aplicacion'),
    ('HAL-08','Alto valor sin una segunda confirmación','pentest_caja_gris','API6','media',5.8, activo_ids[4],'Una transferencia elevada se confirmaba solo con la sesión.','Pedir OTP cuando el monto supere Q10,000 y marcarla para revisión.','Pagos','mitigado', current_date + 18, 'aplicacion'),
    ('HAL-09','Destino interno aceptado en notificaciones','pentest_caja_gris','API7','alta',8.1, activo_ids[3],'Un parámetro de destino aceptaba direcciones de la red interna.','Usar una lista de destinos permitidos y rechazar rangos internos.','Plataforma','abierto', current_date + 8, 'red_interna'),
    ('HAL-10','Almacén de logs con lectura amplia','iac','API8','critica',9.0, activo_ids[8],'La política del bucket permitía lectura más allá del equipo de seguridad.','Privar el almacén, cifrarlo y revisar quién accede.','SRE','en_progreso', current_date + 6, 'datos'),
    ('HAL-11','Servicios sin dueño en el inventario','pentest_caja_negra','API9','media',5.2, activo_ids[9],'Había rutas publicadas que no figuraban en el inventario.','Mantener el inventario con propietario y una revisión periódica.','GRC','aceptado', current_date + 40, 'politicas'),
    ('HAL-12','Respuesta de KYC aceptada sin comprobar','sca','API10','media',6.0, activo_ids[7],'La respuesta del proveedor se incorporaba sin verificar su origen.','Comprobar firma, vigencia y procedencia antes de actualizar el KYC.','Seguridad','abierto', current_date + 14, 'perimetro'),
    ('HAL-13','Imagen con componentes desactualizados','contenedores','API8','alta',7.8, activo_ids[4],'El escaneo de la imagen reportó componentes con avisos abiertos.','Reconstruir la imagen y detener el despliegue si el escaneo falla.','DevOps','en_progreso', current_date + 9, 'host'),
    ('HAL-14','Secreto de servicio en el repositorio','sast','API8','critica',9.2, activo_ids[9],'Un archivo versionado contenía una clave de servicio.','Retirar el secreto, rotarlo y guardarlo en el almacén del proveedor.','DevOps','mitigado', current_date + 5, 'datos'),
    ('HAL-15','Consola de operaciones sin segundo control','pentest_caja_gris','API8','alta',7.2, activo_ids[15],'La consola de la sala quedaba disponible sin un control adicional.','Registrar el acceso físico y bloquear la consola al ausentarse.','Infraestructura','abierto', current_date + 11, 'fisica');

  select array_agg(id order by codigo) into hallazgo_ids from public.hallazgos;

  insert into public.casos_abuso (codigo, titulo, descripcion, control, hallazgo_id) values
    ('CAB-01','Fuerza bruta en el inicio de sesión','Se intenta adivinar la contraseña con muchos ensayos sobre el mismo correo.','Bloqueo temporal tras cinco fallos, límite de ritmo y registro de cada intento.', hallazgo_ids[2]),
    ('CAB-02','Omisión del segundo factor','Se pretende dar por verificado el acceso sin pasar por el servidor.','El OTP se genera y se valida en una función de servidor, vence a los cinco minutos y solo se usa una vez.', hallazgo_ids[3]),
    ('CAB-03','Extracción por paginación de la API','Se amplía el tamaño de página para llevarse muchos registros.','Tope de 20 filas, políticas de fila y enmascarado de datos personales.', hallazgo_ids[5]),
    ('CAB-04','Acceso a un objeto de otro cliente','Se cambia el identificador de una cuenta o un cliente para leer datos ajenos.','La autorización compara el propietario en el servidor y deja un evento de seguridad.', hallazgo_ids[1]),
    ('CAB-05','Rol enviado desde el navegador','La petición incluye un rol privilegiado para saltarse las restricciones.','El rol vive en user_roles y se consulta con has_role, definida como SECURITY DEFINER.', hallazgo_ids[7]),
    ('CAB-06','Repetición de una transferencia','La misma operación se envía dos veces y podría duplicar el débito.','Cada operación lleva una clave de idempotencia única.', hallazgo_ids[8]);

  insert into public.incidentes (codigo, titulo, descripcion, severidad, estado, asignado_a, fecha) values
    ('INC-01','Ráfaga de intentos de acceso','Se concentraron intentos fallidos sobre cuentas de la demostración.','critica','abierto', auditor_id, now() - interval '2 days'),
    ('INC-02','Consulta de una cuenta ajena','El control de propiedad rechazó una lectura y dejó el evento correspondiente.','alta','investigando', auditor_id, now() - interval '5 days'),
    ('INC-03','Transferencia marcada por monto','Una operación superior al umbral quedó en revisión.','alta','contenido', admin_id, now() - interval '8 days'),
    ('INC-04','Dispositivo no reconocido','Un acceso desde un equipo nuevo generó alerta.','media','cerrado', ejecutivo_id, now() - interval '15 days'),
    ('INC-05','Hallazgo de paginación fuera de plazo','El hallazgo de tamaño de página superó la fecha comprometida.','alta','abierto', admin_id, now() - interval '1 day');

  insert into public.notificaciones (user_id, tipo, titulo, mensaje, severidad) values
    (admin_id, 'incidente', 'Incidente crítico', 'Hay un incidente de severidad crítica abierto.', 'critica'),
    (auditor_id, 'hallazgo', 'Hallazgo vencido', 'Un hallazgo superó su fecha límite.', 'alta'),
    (cliente_user, 'tarjeta', 'Tarjeta bloqueada', 'Una de sus tarjetas está bloqueada.', 'media'),
    (ejecutivo_id, 'kyc', 'KYC pendiente', 'Hay clientes asignados con verificación pendiente.', 'media');
end $$;
