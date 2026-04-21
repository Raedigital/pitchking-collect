-- ============================================================
-- CardGrader / Collectibles Manager - Database Schema
-- ============================================================

-- Profiles (auto-created on signup)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Collections (groups of items)
-- ============================================================
CREATE TABLE public.collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    collection_type TEXT NOT NULL DEFAULT 'cards',
        -- cards, watches, toys, coins, comics, other
    cover_image_url TEXT,
    item_count INTEGER DEFAULT 0,
    total_estimated_value NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX collections_user_idx ON public.collections(user_id);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collections_select" ON public.collections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "collections_insert" ON public.collections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "collections_update" ON public.collections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "collections_delete" ON public.collections FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Items (individual collectibles)
-- ============================================================
CREATE TABLE public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL,

    -- Core metadata (AI-extracted)
    item_type TEXT NOT NULL DEFAULT 'card',
        -- card, watch, toy, coin, comic, figurine, other
    brand TEXT,              -- Topps, Panini, Upper Deck, Rolex, Funko, etc.
    year INTEGER,            -- Year of production/release
    item_name TEXT,          -- Player name, character, model name
    item_number TEXT,        -- Card #, serial #, model #
    set_name TEXT,           -- Set the item belongs to (e.g., "Topps Chrome", "Base Set")
    subset TEXT,             -- Rookie, Prism, Refractor, Holo, Base, Insert, etc.
    team TEXT,               -- Team (sports cards)
    sport TEXT,              -- Sport (baseball, basketball, football, hockey, soccer, pokemon, etc.)
    rarity TEXT,             -- Common, Uncommon, Rare, Ultra Rare, 1/1, Numbered
    numbered_to INTEGER,     -- If numbered (/25, /50, /100, etc.)
    parallel TEXT,           -- Parallel variant (Gold, Silver, Blue, etc.)
    autographed BOOLEAN DEFAULT FALSE,
    memorabilia BOOLEAN DEFAULT FALSE,   -- Game-used, patch, relic
    condition_notes TEXT,

    -- AI extraction metadata
    ai_raw_response JSONB,
    ai_confidence NUMERIC(3,2),
    ai_extracted_at TIMESTAMPTZ,

    -- Grading
    overall_grade NUMERIC(3,1),
    centering_grade NUMERIC(3,1),
    corners_grade NUMERIC(3,1),
    edges_grade NUMERIC(3,1),
    surface_grade NUMERIC(3,1),
    grade_details JSONB,     -- Full grade breakdown with issues
    graded_at TIMESTAMPTZ,

    -- Professional grading (if sent to PSA/BGS)
    pro_grader TEXT,          -- PSA, BGS, CGC, SGC
    pro_grade NUMERIC(3,1),
    pro_cert_number TEXT,
    pro_graded_at TIMESTAMPTZ,

    -- Value tracking
    estimated_value NUMERIC(12,2),
    purchase_price NUMERIC(12,2),
    purchase_date DATE,
    value_source TEXT,        -- manual, ai_estimate, market_lookup

    -- Images
    front_image_url TEXT,
    back_image_url TEXT,
    additional_images JSONB DEFAULT '[]'::JSONB,

    -- Categorization (AI-learned)
    category TEXT,            -- AI-assigned category/segment
    tags TEXT[] DEFAULT '{}',

    -- Status
    status TEXT DEFAULT 'in_collection',
        -- in_collection, for_sale, sold, traded, sent_for_grading
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX items_user_idx ON public.items(user_id);
CREATE INDEX items_collection_idx ON public.items(collection_id);
CREATE INDEX items_brand_idx ON public.items(brand);
CREATE INDEX items_year_idx ON public.items(year);
CREATE INDEX items_type_idx ON public.items(item_type);
CREATE INDEX items_sport_idx ON public.items(sport);
CREATE INDEX items_grade_idx ON public.items(overall_grade);
CREATE INDEX items_status_idx ON public.items(status);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_select" ON public.items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "items_insert" ON public.items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "items_update" ON public.items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "items_delete" ON public.items FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Scan history (track every scan even before saving to collection)
-- ============================================================
CREATE TABLE public.scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    image_url TEXT,
    ai_response JSONB,
    grade_result JSONB,
    saved_to_collection BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX scans_user_idx ON public.scans(user_id);
CREATE INDEX scans_created_idx ON public.scans(created_at DESC);

ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scans_select" ON public.scans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "scans_insert" ON public.scans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "scans_delete" ON public.scans FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Update collection counts trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_collection_counts()
RETURNS TRIGGER AS $$
BEGIN
    -- Update old collection if item moved
    IF TG_OP = 'UPDATE' AND OLD.collection_id IS DISTINCT FROM NEW.collection_id THEN
        IF OLD.collection_id IS NOT NULL THEN
            UPDATE public.collections SET
                item_count = (SELECT COUNT(*) FROM public.items WHERE collection_id = OLD.collection_id),
                total_estimated_value = COALESCE((SELECT SUM(estimated_value) FROM public.items WHERE collection_id = OLD.collection_id), 0),
                updated_at = NOW()
            WHERE id = OLD.collection_id;
        END IF;
    END IF;

    -- Update new/current collection
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.collection_id IS NOT NULL THEN
        UPDATE public.collections SET
            item_count = (SELECT COUNT(*) FROM public.items WHERE collection_id = NEW.collection_id),
            total_estimated_value = COALESCE((SELECT SUM(estimated_value) FROM public.items WHERE collection_id = NEW.collection_id), 0),
            updated_at = NOW()
        WHERE id = NEW.collection_id;
    END IF;

    -- Handle deletes
    IF TG_OP = 'DELETE' AND OLD.collection_id IS NOT NULL THEN
        UPDATE public.collections SET
            item_count = (SELECT COUNT(*) FROM public.items WHERE collection_id = OLD.collection_id),
            total_estimated_value = COALESCE((SELECT SUM(estimated_value) FROM public.items WHERE collection_id = OLD.collection_id), 0),
            updated_at = NOW()
        WHERE id = OLD.collection_id;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER items_collection_count
    AFTER INSERT OR UPDATE OR DELETE ON public.items
    FOR EACH ROW EXECUTE FUNCTION public.update_collection_counts();

-- ============================================================
-- Storage bucket for card images
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'collectibles',
    'collectibles',
    false,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "collectibles_upload" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'collectibles' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "collectibles_read" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'collectibles' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "collectibles_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'collectibles' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );
