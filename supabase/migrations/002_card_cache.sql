-- Card cache table — stores AI extraction results for reuse
CREATE TABLE public.card_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key TEXT UNIQUE NOT NULL,
    item_type TEXT,
    brand TEXT,
    year INTEGER,
    item_name TEXT,
    item_number TEXT,
    set_name TEXT,
    subset TEXT,
    team TEXT,
    sport TEXT,
    rarity TEXT,
    numbered_to INTEGER,
    parallel TEXT,
    autographed BOOLEAN DEFAULT FALSE,
    memorabilia BOOLEAN DEFAULT FALSE,
    description TEXT,
    full_response JSONB,
    times_matched INTEGER DEFAULT 1,
    first_scanned_at TIMESTAMPTZ DEFAULT NOW(),
    last_matched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX card_cache_key_idx ON public.card_cache(cache_key);
CREATE INDEX card_cache_brand_year_idx ON public.card_cache(brand, year);
CREATE INDEX card_cache_name_idx ON public.card_cache(item_name);

-- No RLS on cache — it's shared across all users (that's the point)
ALTER TABLE public.card_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cache_read_all" ON public.card_cache FOR SELECT USING (true);
CREATE POLICY "cache_insert_authenticated" ON public.card_cache FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "cache_update_authenticated" ON public.card_cache FOR UPDATE USING (auth.uid() IS NOT NULL);
