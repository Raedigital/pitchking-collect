import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const { createClient } = supabase;
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
});
