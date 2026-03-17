DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'delivery_status' AND e.enumlabel = 'pendiente'
  ) THEN
    ALTER TYPE public.delivery_status ADD VALUE 'pendiente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'delivery_status' AND e.enumlabel = 'en_configuracion'
  ) THEN
    ALTER TYPE public.delivery_status ADD VALUE 'en_configuracion';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'delivery_status' AND e.enumlabel = 'configurado'
  ) THEN
    ALTER TYPE public.delivery_status ADD VALUE 'configurado';
  END IF;
END $$;
