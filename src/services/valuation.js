import { sb } from '../supabase.js';
import { AI_EDGE_FUNCTION } from '../config.js';

export async function estimateItemValue(item) {
    const payload = {
        action: 'estimate_value',
        items: [{
            item_type: item.item_type,
            item_name: item.item_name,
            brand: item.brand,
            year: item.year,
            set_name: item.set_name,
            subset: item.subset,
            item_number: item.item_number,
            team: item.team,
            sport: item.sport,
            rarity: item.rarity,
            numbered_to: item.numbered_to,
            parallel: item.parallel,
            autographed: item.autographed,
            memorabilia: item.memorabilia,
            overall_grade: item.overall_grade,
            condition_notes: item.condition_notes
        }]
    };

    const { data, error } = await sb.functions.invoke(AI_EDGE_FUNCTION, { body: payload });
    if (error) throw error;
    return data.data;
}

export async function analyzeCollection(items) {
    const summary = items.map(i => ({
        id: i.id,
        item_name: i.item_name,
        brand: i.brand,
        year: i.year,
        set_name: i.set_name,
        subset: i.subset,
        team: i.team,
        sport: i.sport,
        rarity: i.rarity,
        parallel: i.parallel,
        autographed: i.autographed,
        memorabilia: i.memorabilia,
        overall_grade: i.overall_grade,
        estimated_value: i.estimated_value
    }));

    const { data, error } = await sb.functions.invoke(AI_EDGE_FUNCTION, {
        body: { action: 'categorize_collection', items: summary }
    });
    if (error) throw error;
    return data.data;
}
