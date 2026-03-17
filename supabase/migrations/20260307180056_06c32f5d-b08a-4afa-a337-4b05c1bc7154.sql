
-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'technician', 'user');

-- Create enum for equipment status
CREATE TYPE public.equipment_status AS ENUM ('disponible', 'asignado', 'mantenimiento', 'retirado');

-- Create enum for equipment type
CREATE TYPE public.equipment_type AS ENUM ('laptop', 'desktop', 'monitor', 'impresora', 'telefono', 'tablet', 'otro');

-- Create enum for ticket status
CREATE TYPE public.ticket_status AS ENUM ('abierto', 'en_proceso', 'en_espera', 'resuelto', 'cerrado');

-- Create enum for ticket priority
CREATE TYPE public.ticket_priority AS ENUM ('baja', 'media', 'alta', 'critica');

-- Create enum for ticket category
CREATE TYPE public.ticket_category AS ENUM ('hardware', 'software', 'red', 'acceso', 'otro');

-- Create enum for delivery status
CREATE TYPE public.delivery_status AS ENUM ('entregado', 'devuelto');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);

-- Equipment table
CREATE TABLE public.equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  serial TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  type equipment_type NOT NULL DEFAULT 'otro',
  ram TEXT,
  storage TEXT,
  os TEXT,
  status equipment_status NOT NULL DEFAULT 'disponible',
  location TEXT,
  assigned_to TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tickets table
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  requester TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  category ticket_category NOT NULL DEFAULT 'otro',
  priority ticket_priority NOT NULL DEFAULT 'media',
  subject TEXT NOT NULL,
  description TEXT,
  assigned_tech TEXT,
  status ticket_status NOT NULL DEFAULT 'abierto',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket comments
CREATE TABLE public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deliveries table
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  employee_name TEXT NOT NULL,
  employee_email TEXT NOT NULL,
  department TEXT,
  position TEXT,
  equipment_id UUID REFERENCES public.equipment(id),
  equipment_desc TEXT,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  return_date DATE,
  observations TEXT,
  status delivery_status NOT NULL DEFAULT 'entregado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Knowledge base articles
CREATE TABLE public.kb_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  solution TEXT,
  category TEXT,
  author TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for auto-creating profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kb_articles_updated_at BEFORE UPDATE ON public.kb_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sequence generators for readable codes
CREATE SEQUENCE IF NOT EXISTS equipment_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS ticket_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS delivery_code_seq START 1;

-- RLS Policies

-- Profiles: users see own, admins see all
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- User roles: only admins can manage
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Equipment: authenticated users can read, admins/techs can modify
CREATE POLICY "Authenticated can view equipment" ON public.equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert equipment" ON public.equipment FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can update equipment" ON public.equipment FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can delete equipment" ON public.equipment FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Tickets: authenticated can read, users can create, admins/techs can modify
CREATE POLICY "Authenticated can view tickets" ON public.tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins techs can update tickets" ON public.tickets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can delete tickets" ON public.tickets FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Ticket comments
CREATE POLICY "Authenticated can view comments" ON public.ticket_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can add comments" ON public.ticket_comments FOR INSERT TO authenticated WITH CHECK (true);

-- Deliveries
CREATE POLICY "Authenticated can view deliveries" ON public.deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins techs can insert deliveries" ON public.deliveries FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins techs can update deliveries" ON public.deliveries FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));

-- KB Articles: all authenticated can read, admins/techs can modify
CREATE POLICY "Authenticated can view articles" ON public.kb_articles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins techs can insert articles" ON public.kb_articles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins techs can update articles" ON public.kb_articles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));
CREATE POLICY "Admins can delete articles" ON public.kb_articles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
