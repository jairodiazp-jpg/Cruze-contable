-- Seed idempotente para pruebas integrales de Zynera
-- Crea: empresa, perfil coordinador, equipo, reglas firewall (USB/VPN),
-- correo corporativo y configuracion VPN.
--
-- Nota:
-- - user_roles.app_role solo acepta admin/technician/user.
-- - El rol "coordinador" se representa en role_profiles + devices.role_type.
-- - Si existe el usuario coordinador.prueba@zynera.com en auth.users,
--   se enlaza a la empresa y se le asigna app_role=technician para permisos de prueba.

DO $$
DECLARE
  v_company_id uuid;
  v_profile_id uuid;
  v_device_id uuid;
  v_user_id uuid;
BEGIN
  -- 1) Empresa Zynera
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE slug = 'zynera'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (
      name,
      slug,
      domain,
      plan,
      max_devices,
      max_users,
      active
    ) VALUES (
      'Zynera',
      'zynera',
      'zynera.com',
      'enterprise',
      250,
      250,
      true
    )
    RETURNING id INTO v_company_id;
  ELSE
    UPDATE public.companies
    SET
      name = 'Zynera',
      domain = 'zynera.com',
      plan = 'enterprise',
      max_devices = 250,
      max_users = 250,
      active = true,
      updated_at = now()
    WHERE id = v_company_id;
  END IF;

  -- 2) Perfil de rol coordinador (capa funcional)
  SELECT id INTO v_profile_id
  FROM public.role_profiles
  WHERE company_id = v_company_id
    AND name = 'coordinador'
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.role_profiles (
      company_id,
      name,
      display_name,
      description,
      permissions_level
    ) VALUES (
      v_company_id,
      'coordinador',
      'Coordinador',
      'Perfil de coordinacion para validacion de flujos de red, seguridad y soporte.',
      'standard'
    )
    RETURNING id INTO v_profile_id;
  ELSE
    UPDATE public.role_profiles
    SET
      display_name = 'Coordinador',
      description = 'Perfil de coordinacion para validacion de flujos de red, seguridad y soporte.',
      permissions_level = 'standard',
      updated_at = now()
    WHERE id = v_profile_id;
  END IF;

  -- 3) Equipo/dispositivo de prueba
  INSERT INTO public.devices (
    company_id,
    device_id,
    hostname,
    serial_number,
    user_assigned,
    department,
    role_type,
    operating_system,
    ip_address,
    connection_type,
    vpn_status,
    last_seen,
    health_status,
    agent_installed,
    agent_version,
    report_interval
  ) VALUES (
    v_company_id,
    'ZYNERA-COORD-01',
    'ZYN-COORD-LT01',
    'ZYN-COORD-0001',
    'Coordinador Pruebas',
    'Operaciones',
    'coordinador',
    'Windows 11 Pro',
    '10.42.10.25',
    'ethernet',
    'connected',
    now(),
    'healthy',
    true,
    '1.0.0-test',
    60
  )
  ON CONFLICT (device_id)
  DO UPDATE SET
    company_id = EXCLUDED.company_id,
    hostname = EXCLUDED.hostname,
    serial_number = EXCLUDED.serial_number,
    user_assigned = EXCLUDED.user_assigned,
    department = EXCLUDED.department,
    role_type = EXCLUDED.role_type,
    operating_system = EXCLUDED.operating_system,
    ip_address = EXCLUDED.ip_address,
    connection_type = EXCLUDED.connection_type,
    vpn_status = EXCLUDED.vpn_status,
    last_seen = EXCLUDED.last_seen,
    health_status = EXCLUDED.health_status,
    agent_installed = EXCLUDED.agent_installed,
    agent_version = EXCLUDED.agent_version,
    report_interval = EXCLUDED.report_interval,
    updated_at = now();

  SELECT id INTO v_device_id
  FROM public.devices
  WHERE device_id = 'ZYNERA-COORD-01'
  LIMIT 1;

  -- 4) Reglas de firewall para validar bloqueos USB y VPN
  DELETE FROM public.firewall_rules
  WHERE company_id = v_company_id
    AND rule_name IN (
      'USB-All-Ports-Block',
      'VPN-Block-Port-1194',
      'VPN-Block-Port-1701',
      'VPN-Block-Port-1723',
      'VPN-Block-Port-500',
      'VPN-Block-Port-4500'
    );

  INSERT INTO public.firewall_rules (
    company_id,
    device_id,
    profile_id,
    rule_name,
    direction,
    action,
    protocol,
    port_start,
    port_end,
    source_ip,
    destination_ip,
    priority,
    enabled,
    status,
    applied_at
  ) VALUES
    (v_company_id, v_device_id, v_profile_id, 'USB-All-Ports-Block', 'outbound', 'block', 'any', 0, NULL, NULL, NULL, 4, true, 'applied', now()),
    (v_company_id, v_device_id, v_profile_id, 'VPN-Block-Port-1194', 'outbound', 'block', 'udp', 1194, NULL, NULL, NULL, 5, true, 'applied', now()),
    (v_company_id, v_device_id, v_profile_id, 'VPN-Block-Port-1701', 'outbound', 'block', 'any', 1701, NULL, NULL, NULL, 6, true, 'applied', now()),
    (v_company_id, v_device_id, v_profile_id, 'VPN-Block-Port-1723', 'outbound', 'block', 'any', 1723, NULL, NULL, NULL, 7, true, 'applied', now()),
    (v_company_id, v_device_id, v_profile_id, 'VPN-Block-Port-500',  'outbound', 'block', 'any', 500,  NULL, NULL, NULL, 8, true, 'applied', now()),
    (v_company_id, v_device_id, v_profile_id, 'VPN-Block-Port-4500', 'outbound', 'block', 'any', 4500, NULL, NULL, NULL, 9, true, 'applied', now());

  -- 5) Dominio y correo corporativo de prueba (tabla legacy email_configs)
  DELETE FROM public.email_configs
  WHERE company_id = v_company_id
    AND user_email = 'coordinador.prueba@zynera.com';

  INSERT INTO public.email_configs (
    company_id,
    device_id,
    user_email,
    display_name,
    provider,
    domain,
    imap_server,
    imap_port,
    smtp_server,
    smtp_port,
    exchange_server,
    use_exchange,
    status,
    applied_at
  ) VALUES (
    v_company_id,
    v_device_id,
    'coordinador.prueba@zynera.com',
    'Coordinador Pruebas',
    'microsoft365',
    'zynera.com',
    'outlook.office365.com',
    993,
    'smtp.office365.com',
    587,
    'outlook.office365.com',
    true,
    'applied',
    now()
  );

  -- 6) Configuracion VPN de prueba
  DELETE FROM public.vpn_configs
  WHERE company_id = v_company_id
    AND user_email = 'coordinador.prueba@zynera.com'
    AND display_name = 'Coordinador Zynera VPN';

  INSERT INTO public.vpn_configs (
    company_id,
    device_id,
    user_email,
    display_name,
    vpn_type,
    server_address,
    server_port,
    protocol,
    auth_type,
    config_data,
    connection_status,
    assigned_ip,
    status,
    applied_at,
    last_connected_at
  ) VALUES (
    v_company_id,
    v_device_id,
    'coordinador.prueba@zynera.com',
    'Coordinador Zynera VPN',
    'openvpn',
    'vpn.zynera.com',
    1194,
    'udp',
    'certificate',
    'client\nremote vpn.zynera.com 1194\nproto udp\n',
    'connected',
    '10.8.0.25',
    'applied',
    now(),
    now()
  );

  -- 7) Catalogo de dominios para bloqueo VPN (opcional para pruebas de categoria)
  INSERT INTO public.firewall_domain_database (company_id, category, domain)
  VALUES
    (v_company_id, 'vpn', 'nordvpn.com'),
    (v_company_id, 'vpn', 'expressvpn.com'),
    (v_company_id, 'vpn', 'surfshark.com')
  ON CONFLICT (category, domain)
  DO UPDATE SET company_id = EXCLUDED.company_id;

  -- 8) Enlace opcional a usuario real si existe en auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower('coordinador.prueba@zynera.com')
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, full_name, company_id)
    VALUES (v_user_id, 'coordinador.prueba@zynera.com', 'Coordinador Pruebas', v_company_id)
    ON CONFLICT (id)
    DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      company_id = EXCLUDED.company_id,
      updated_at = now();

    -- Mapeo tecnico para permisos actuales del sistema.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'technician'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 9) Si existen tablas corporativas nuevas, sembrar dominio/cuenta tambien
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'corporate_domains'
  ) THEN
    EXECUTE format(
      'INSERT INTO public.corporate_domains (company_id, domain_name, display_name, provider, status, created_at, updated_at)
       VALUES (%L::uuid, %L, %L, %L, %L, now(), now())
       ON CONFLICT (company_id, domain_name)
       DO UPDATE SET display_name = EXCLUDED.display_name, provider = EXCLUDED.provider, status = EXCLUDED.status, updated_at = now()',
      v_company_id,
      'zynera.com',
      'Zynera',
      'microsoft',
      'active'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'corporate_email_accounts'
  ) THEN
    EXECUTE format(
      'INSERT INTO public.corporate_email_accounts (
          company_id, email_address, local_part, display_name, device_id,
          provider, smtp_host, smtp_port, imap_host, imap_port, use_tls, status, created_at, updated_at
        )
        VALUES (
          %L::uuid, %L, %L, %L, %L::uuid,
          %L, %L, %s, %L, %s, true, %L, now(), now()
        )
        ON CONFLICT (company_id, email_address)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          device_id = EXCLUDED.device_id,
          provider = EXCLUDED.provider,
          smtp_host = EXCLUDED.smtp_host,
          smtp_port = EXCLUDED.smtp_port,
          imap_host = EXCLUDED.imap_host,
          imap_port = EXCLUDED.imap_port,
          status = EXCLUDED.status,
          updated_at = now()',
      v_company_id,
      'coordinador.prueba@zynera.com',
      'coordinador.prueba',
      'Coordinador Pruebas',
      v_device_id,
      'microsoft',
      'smtp.office365.com',
      587,
      'outlook.office365.com',
      993,
      'active'
    );
  END IF;
END
$$;
