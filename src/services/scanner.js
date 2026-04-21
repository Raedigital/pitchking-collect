import { sb } from '../supabase.js';
import { AI_EDGE_FUNCTION, STORAGE_BUCKET } from '../config.js';
import { state } from '../state.js';

export async function analyzeImage(imageBase64) {
    // Call AI — always extract first
    const { data, error } = await sb.functions.invoke(AI_EDGE_FUNCTION, {
        body: {
            action: 'extract_collectible',
            image_base64: imageBase64
        }
    });
    if (error) throw error;
    const result = data.data;

    // Try to find a cache match to fill in missing fields
    if (result.item_name || result.item_number) {
        const cached = await findCacheMatch(result);
        if (cached) {
            result._cached = true;
            for (const key of Object.keys(cached)) {
                if (key === 'id' || key === 'cache_key' || key === 'times_matched' ||
                    key === 'first_scanned_at' || key === 'last_matched_at' || key === 'full_response') continue;
                if (!result[key] && cached[key]) {
                    result[key] = cached[key];
                }
            }
            // Bump match count
            await sb.from('card_cache')
                .update({ times_matched: (cached.times_matched || 0) + 1, last_matched_at: new Date().toISOString() })
                .eq('id', cached.id);
        }
    }

    // Cache this result for future lookups
    await cacheResult(result);

    return result;
}

async function findCacheMatch(result) {
    // Try exact match first: brand + year + item_number
    if (result.brand && result.year && result.item_number) {
        const key = buildCacheKey(result.brand, result.year, result.item_number);
        const { data } = await sb.from('card_cache')
            .select('*')
            .eq('cache_key', key)
            .maybeSingle();
        if (data) return data;
    }

    // Try name + brand + year match
    if (result.item_name && result.brand) {
        const { data } = await sb.from('card_cache')
            .select('*')
            .eq('item_name', result.item_name)
            .eq('brand', result.brand)
            .limit(1)
            .maybeSingle();
        if (data) return data;
    }

    // Try name + sport match
    if (result.item_name && result.sport) {
        const { data } = await sb.from('card_cache')
            .select('*')
            .eq('item_name', result.item_name)
            .eq('sport', result.sport)
            .limit(1)
            .maybeSingle();
        if (data) return data;
    }

    return null;
}

async function cacheResult(result) {
    if (!result.item_name && !result.item_number) return;

    const key = buildCacheKey(
        result.brand || 'unknown',
        result.year || 0,
        result.item_number || result.item_name || ''
    );

    try {
        await sb.from('card_cache').upsert({
            cache_key: key,
            item_type: result.item_type || 'card',
            brand: result.brand || null,
            year: result.year || null,
            item_name: result.item_name || null,
            item_number: result.item_number || null,
            set_name: result.set_name || null,
            subset: result.subset || null,
            team: result.team || null,
            sport: result.sport || null,
            rarity: result.rarity || null,
            numbered_to: result.numbered_to || null,
            parallel: result.parallel || null,
            autographed: result.autographed || false,
            memorabilia: result.memorabilia || false,
            description: result.description || null,
            full_response: result,
            last_matched_at: new Date().toISOString()
        }, { onConflict: 'cache_key' });
    } catch (err) {
        console.warn('Cache write failed:', err);
    }
}

function buildCacheKey(brand, year, identifier) {
    return `${String(brand).toLowerCase().trim()}|${year}|${String(identifier).toLowerCase().trim()}`;
}

export async function uploadImage(file) {
    const userId = state.user.id;
    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const fileName = `${userId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(fileName, file, {
        cacheControl: '3600',
        contentType: file.type
    });
    if (error) throw error;
    return fileName;
}

export function getImageUrl(path) {
    const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
}

export async function getSignedUrl(path) {
    const { data, error } = await sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
}

export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function fileToCompressedBase64(file, maxWidth = 800) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width;
            let h = img.height;
            if (w > maxWidth) {
                h = Math.round(h * (maxWidth / w));
                w = maxWidth;
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
            resolve(base64);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}
