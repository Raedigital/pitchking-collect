import { sb } from '../supabase.js';
import { state } from '../state.js';

export async function fetchItems(collectionId = null) {
    let query = sb.from('items').select('*').order('created_at', { ascending: false });
    if (collectionId) query = query.eq('collection_id', collectionId);

    const { data, error } = await query;
    if (error) throw error;
    state.items = data;
    return data;
}

export async function fetchCollections() {
    const { data, error } = await sb.from('collections')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    state.collections = data;
    return data;
}

export async function createCollection(name, type = 'cards', description = '') {
    const { data, error } = await sb.from('collections').insert({
        user_id: state.user.id,
        name,
        collection_type: type,
        description: description || null
    }).select().single();
    if (error) throw error;
    state.collections.unshift(data);
    return data;
}

export async function saveItem(itemData) {
    const payload = {
        user_id: state.user.id,
        item_type: itemData.item_type || 'card',
        brand: itemData.brand || null,
        year: itemData.year || null,
        item_name: itemData.item_name || null,
        item_number: itemData.item_number || null,
        set_name: itemData.set_name || null,
        subset: itemData.subset || null,
        team: itemData.team || null,
        sport: itemData.sport || null,
        rarity: itemData.rarity || null,
        numbered_to: itemData.numbered_to || null,
        parallel: itemData.parallel || null,
        autographed: itemData.autographed || false,
        memorabilia: itemData.memorabilia || false,
        ai_confidence: itemData.confidence || null,
        ai_raw_response: itemData._raw || null,
        ai_extracted_at: new Date().toISOString(),
        front_image_url: itemData.front_image_url || null,
        collection_id: itemData.collection_id || null,
        status: 'in_collection',
        notes: itemData.notes || null,
        category: itemData.category || null,
        condition_notes: itemData.description || null
    };

    const { data, error } = await sb.from('items').insert(payload).select().single();
    if (error) throw error;
    state.items.unshift(data);
    return data;
}

export async function updateItem(id, updates) {
    const { data, error } = await sb.from('items')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    const idx = state.items.findIndex(i => i.id === id);
    if (idx >= 0) state.items[idx] = data;
    return data;
}

export async function deleteItem(id) {
    const { error } = await sb.from('items').delete().eq('id', id);
    if (error) throw error;
    state.items = state.items.filter(i => i.id !== id);
}

export async function deleteCollection(id) {
    const { error } = await sb.from('collections').delete().eq('id', id);
    if (error) throw error;
    state.collections = state.collections.filter(c => c.id !== id);
}

export function filterItems(items, filters) {
    return items.filter(item => {
        if (filters.sport && item.sport !== filters.sport) return false;
        if (filters.brand && item.brand !== filters.brand) return false;
        if (filters.year && item.year !== parseInt(filters.year)) return false;
        if (filters.type && item.subset !== filters.type) return false;
        if (filters.search) {
            const q = filters.search.toLowerCase();
            const searchable = [item.item_name, item.brand, item.team, item.set_name, item.item_number]
                .filter(Boolean).join(' ').toLowerCase();
            if (!searchable.includes(q)) return false;
        }
        return true;
    });
}

export function getCollectionStats(items) {
    const total = items.length;
    const graded = items.filter(i => i.overall_grade).length;
    const avgGrade = graded > 0
        ? items.reduce((sum, i) => sum + (i.overall_grade || 0), 0) / graded
        : 0;
    const totalValue = items.reduce((sum, i) => sum + (i.estimated_value || 0), 0);
    const brands = [...new Set(items.map(i => i.brand).filter(Boolean))];
    const sports = [...new Set(items.map(i => i.sport).filter(Boolean))];

    return { total, graded, avgGrade, totalValue, brands, sports };
}
