-- ========================================================
-- PÉGATE AHÍ - DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- ========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. STORES / BARBERSHOPS TABLE
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    phone_whatsapp VARCHAR(50),
    grace_period_minutes INT DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. BARBERS / STAFF TABLE
CREATE TABLE IF NOT EXISTS public.barbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. QUEUE / TURNS TABLE (Real-time queue & GPS Errand Window)
CREATE TABLE IF NOT EXISTS public.queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    barber_id UUID REFERENCES public.barbers(id) ON DELETE SET NULL,
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_service', 'completed', 'cancelled', 'grace_period')),
    position INT NOT NULL,
    estimated_wait_minutes INT DEFAULT 15,
    gps_lat NUMERIC(10, 7),
    gps_lng NUMERIC(10, 7),
    grace_timer_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Realtime for Queue updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue;

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;

-- Public read access for customers viewing the queue
CREATE POLICY "Allow public read access on stores" ON public.stores FOR SELECT USING (true);
CREATE POLICY "Allow public read access on barbers" ON public.barbers FOR SELECT USING (true);
CREATE POLICY "Allow public read access on queue" ON public.queue FOR SELECT USING (true);

-- Public insert access for clients joining the queue
CREATE POLICY "Allow public insert on queue" ON public.queue FOR INSERT WITH CHECK (true);

-- Public update access for status changes (or lock down to auth users as needed)
CREATE POLICY "Allow public update on queue" ON public.queue FOR UPDATE USING (true);
