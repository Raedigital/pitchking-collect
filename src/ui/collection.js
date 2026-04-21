import { fetchItems, fetchCollections, filterItems, getCollectionStats, deleteItem, updateItem } from '../services/collection.js';
import { getSignedUrl } from '../services/scanner.js';
import { estimateItemValue, analyzeCollection } from '../services/valuation.js';
import { generateCollectionPDF } from '../services/pdf.js';
import { state } from '../state.js';

const imageCache = {};

export function initCollection() {
    document.addEventListener('collectionUpdated', loadCollection);
    document.getElementById('searchInput').addEventListener('input', renderItems);
    document.getElementById('filterSport').addEventListener('change', renderItems);
    document.getElementById('filterBrand').addEventListener('change', renderItems);
    document.getElementById('exportPdfBtn').addEventListener('click', exportPDF);
    document.getElementById('aiCollectionBtn').addEventListener('click', runCollectionAnalysis);
    document.getElementById('aiPanelClose').addEventListener('click', () => {
        document.getElementById('aiAnalysisPanel').classList.add('hidden');
    });
    initFilterSync();
}

export async function loadCollection() {
    try {
        await Promise.all([fetchItems(), fetchCollections()]);
        renderStats();
        renderItems();
        populateFilters();
    } catch (err) {
        console.error('Load error:', err);
    }
}

function renderStats() {
    const stats = getCollectionStats(state.items);
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statGraded').textContent = stats.graded;
    document.getElementById('statAvgGrade').textContent = stats.avgGrade > 0 ? stats.avgGrade.toFixed(1) : '-';
    document.getElementById('statValue').textContent = stats.totalValue > 0 ? `$${stats.totalValue.toFixed(0)}` : '-';
}

function renderItems() {
    const search = document.getElementById('searchInput').value;
    const sport = document.getElementById('filterSport').value;
    const brand = document.getElementById('filterBrand').value;

    const filtered = filterItems(state.items, { search, sport, brand });
    const container = document.getElementById('itemsGrid');

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <p>No items yet</p>
                <p class="sub">Scan your first collectible to start</p>
            </div>`;
        return;
    }

    container.innerHTML = filtered.map(item => renderItemCard(item)).join('');

    // Load images
    container.querySelectorAll('.lazy-img').forEach(loadLazyImage);

    container.querySelectorAll('.item-card').forEach(card => {
        card.addEventListener('click', () => openItemDetail(card.dataset.id));
    });
}

function renderItemCard(item) {
    const grade = item.overall_grade ? item.overall_grade.toFixed(1) : '';
    const gradeClass = item.overall_grade >= 9 ? 'grade-gem' :
                       item.overall_grade >= 7 ? 'grade-good' :
                       item.overall_grade >= 5 ? 'grade-fair' : 'grade-poor';
    const subtitle = [item.brand, item.year, item.subset].filter(Boolean).join(' · ');
    const teamBadge = item.team ? `<span class="team-badge">${item.team}</span>` : '';

    return `
        <div class="item-card" data-id="${item.id}">
            <div class="item-image">
                ${item.front_image_url
                    ? `<img src="" data-path="${item.front_image_url}" class="lazy-img" alt="">`
                    : `<div class="no-image">📷</div>`}
                ${grade ? `<span class="grade-badge ${gradeClass}">${grade}</span>` : ''}
            </div>
            <div class="item-info">
                <div class="item-name">${item.item_name || 'Unknown Item'}</div>
                <div class="item-sub">${subtitle}</div>
                ${teamBadge}
                ${item.rarity && item.rarity !== 'Common' ? `<span class="rarity-badge">${item.rarity}</span>` : ''}
            </div>
        </div>`;
}

async function openItemDetail(id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    const modal = document.getElementById('itemDetailModal');
    const content = document.getElementById('itemDetailContent');

    let imgHtml = '<div class="detail-no-image">📷</div>';
    if (item.front_image_url) {
        try {
            const url = imageCache[item.front_image_url] || await getSignedUrl(item.front_image_url);
            imageCache[item.front_image_url] = url;
            imgHtml = `<img src="${url}" alt="" class="detail-image">`;
        } catch { }
    }

    const editFields = [
        { key: 'item_name', label: 'Name', type: 'text' },
        { key: 'brand', label: 'Brand', type: 'text' },
        { key: 'year', label: 'Year', type: 'number' },
        { key: 'set_name', label: 'Set', type: 'text' },
        { key: 'item_number', label: 'Card #', type: 'text' },
        { key: 'subset', label: 'Type/Subset', type: 'text' },
        { key: 'team', label: 'Team', type: 'text' },
        { key: 'sport', label: 'Sport', type: 'text' },
        { key: 'rarity', label: 'Rarity', type: 'text' },
        { key: 'parallel', label: 'Parallel', type: 'text' },
        { key: 'numbered_to', label: 'Numbered /___', type: 'number' },
        { key: 'autographed', label: 'Autographed', type: 'checkbox' },
        { key: 'memorabilia', label: 'Memorabilia', type: 'checkbox' },
        { key: 'notes', label: 'Notes', type: 'text' },
    ];

    let fieldsHtml = '<div class="detail-fields">';
    for (const f of editFields) {
        const val = item[f.key];
        if (f.type === 'checkbox') {
            fieldsHtml += `<div class="detail-field checkbox-field">
                <input type="checkbox" id="detail-${f.key}" class="ext-checkbox" ${val ? 'checked' : ''}>
                <label class="detail-label" for="detail-${f.key}">${f.label}</label>
            </div>`;
        } else {
            fieldsHtml += `<div class="detail-field">
                <label class="detail-label" for="detail-${f.key}">${f.label}</label>
                <input type="${f.type}" id="detail-${f.key}" class="ext-input" value="${val ?? ''}">
            </div>`;
        }
    }
    fieldsHtml += '</div>';

    const valueHtml = item.estimated_value
        ? `<div class="value-display">Estimated: <strong>$${parseFloat(item.estimated_value).toFixed(2)}</strong></div>`
        : '';

    content.innerHTML = `
        ${imgHtml}
        ${fieldsHtml}
        ${item.condition_notes ? `<p class="detail-notes">${item.condition_notes}</p>` : ''}
        <div class="value-section">
            ${valueHtml}
            <button class="btn btn-accent" id="estimateValueBtn">🤖 Estimate Value</button>
            <div id="valueResult" class="hidden"></div>
        </div>
        <div class="detail-actions">
            <button class="btn btn-danger" id="deleteItemBtn">Delete</button>
            <button class="btn btn-primary" id="saveDetailBtn">Save Changes</button>
        </div>`;

    modal.classList.add('active');
    document.getElementById('itemDetailClose').onclick = () => modal.classList.remove('active');

    document.getElementById('saveDetailBtn').addEventListener('click', async () => {
        const btn = document.getElementById('saveDetailBtn');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        const updates = {};
        for (const f of editFields) {
            const el = document.getElementById(`detail-${f.key}`);
            if (!el) continue;
            if (f.type === 'checkbox') updates[f.key] = el.checked;
            else if (f.type === 'number') updates[f.key] = el.value ? parseInt(el.value) : null;
            else updates[f.key] = el.value || null;
        }
        try {
            await updateItem(id, updates);
            btn.textContent = 'Saved!';
            setTimeout(() => {
                modal.classList.remove('active');
                renderItems();
                renderStats();
            }, 500);
        } catch (err) {
            console.error('Update error:', err);
            btn.textContent = 'Save failed';
            btn.disabled = false;
        }
    });

    document.getElementById('estimateValueBtn').addEventListener('click', async () => {
        const btn = document.getElementById('estimateValueBtn');
        const resultDiv = document.getElementById('valueResult');
        btn.disabled = true;
        btn.textContent = 'Estimating...';
        resultDiv.classList.add('hidden');

        try {
            const currentData = {};
            for (const f of editFields) {
                const el = document.getElementById(`detail-${f.key}`);
                if (!el) continue;
                if (f.type === 'checkbox') currentData[f.key] = el.checked;
                else if (f.type === 'number') currentData[f.key] = el.value ? parseInt(el.value) : null;
                else currentData[f.key] = el.value || null;
            }
            currentData.item_type = item.item_type;
            currentData.overall_grade = item.overall_grade;
            currentData.condition_notes = item.condition_notes;

            const valuation = await estimateItemValue(currentData);
            resultDiv.classList.remove('hidden');
            resultDiv.innerHTML = `
                <div class="valuation-card">
                    <div class="valuation-range">
                        <div class="val-col"><span class="val-label">Low</span><span class="val-amount">$${valuation.estimated_value_low?.toFixed(0) || '?'}</span></div>
                        <div class="val-col val-mid"><span class="val-label">Mid</span><span class="val-amount">$${valuation.estimated_value_mid?.toFixed(0) || '?'}</span></div>
                        <div class="val-col"><span class="val-label">High</span><span class="val-amount">$${valuation.estimated_value_high?.toFixed(0) || '?'}</span></div>
                    </div>
                    ${valuation.factors?.length ? `<div class="val-factors"><strong>Factors:</strong> ${valuation.factors.join(', ')}</div>` : ''}
                    ${valuation.notes ? `<p class="val-notes">${valuation.notes}</p>` : ''}
                    <button class="btn btn-secondary val-apply" id="applyValueBtn">Apply Mid Value</button>
                </div>`;

            document.getElementById('applyValueBtn')?.addEventListener('click', async () => {
                if (valuation.estimated_value_mid) {
                    await updateItem(id, { estimated_value: valuation.estimated_value_mid });
                    const applyBtn = document.getElementById('applyValueBtn');
                    applyBtn.textContent = 'Applied!';
                    applyBtn.disabled = true;
                    renderStats();
                }
            });
        } catch (err) {
            resultDiv.classList.remove('hidden');
            resultDiv.innerHTML = `<p style="color:var(--red)">Estimation failed: ${err.message || 'Unknown error'}</p>`;
        } finally {
            btn.textContent = '🤖 Estimate Value';
            btn.disabled = false;
        }
    });

    document.getElementById('deleteItemBtn').addEventListener('click', async () => {
        if (confirm('Delete this item?')) {
            await deleteItem(id);
            modal.classList.remove('active');
            renderItems();
            renderStats();
        }
    });
}

function populateFilters() {
    const sports = [...new Set(state.items.map(i => i.sport).filter(Boolean))].sort();
    const brands = [...new Set(state.items.map(i => i.brand).filter(Boolean))].sort();

    populateSelect('filterSport', sports);
    populateSelect('filterBrand', brands);
}

function populateSelect(id, options) {
    const el = document.getElementById(id);
    const current = el.value;
    el.innerHTML = `<option value="">All</option>` +
        options.map(o => `<option value="${o}" ${o === current ? 'selected' : ''}>${o}</option>`).join('');
}

function exportPDF() {
    const stats = getCollectionStats(state.items);
    generateCollectionPDF(state.items, stats);
}

async function runCollectionAnalysis() {
    if (state.items.length === 0) {
        alert('No items to analyze. Scan some collectibles first.');
        return;
    }

    const panel = document.getElementById('aiAnalysisPanel');
    const content = document.getElementById('aiAnalysisContent');
    panel.classList.remove('hidden');
    content.innerHTML = '<div class="analyzing-spinner"></div><p style="text-align:center; color:var(--text2); margin-top:12px;">Analyzing your collection...</p>';

    try {
        const analysis = await analyzeCollection(state.items);
        let html = '';

        if (analysis.segments?.length) {
            html += '<h4 class="ai-section-title">Collection Segments</h4>';
            for (const seg of analysis.segments) {
                html += `<div class="ai-segment">
                    <div class="seg-name">${seg.name}</div>
                    <div class="seg-meta">${seg.item_count || '?'} items ${seg.total_value ? '· $' + seg.total_value.toFixed(0) : ''}</div>
                    <div class="seg-desc">${seg.description || ''}</div>
                </div>`;
            }
        }

        if (analysis.insights?.length) {
            html += '<h4 class="ai-section-title">Insights</h4>';
            html += '<ul class="ai-list">';
            for (const insight of analysis.insights) {
                html += `<li>${insight}</li>`;
            }
            html += '</ul>';
        }

        if (analysis.recommendations?.length) {
            html += '<h4 class="ai-section-title">Recommendations</h4>';
            html += '<ul class="ai-list recommendations">';
            for (const rec of analysis.recommendations) {
                html += `<li>${rec}</li>`;
            }
            html += '</ul>';
        }

        content.innerHTML = html || '<p>No analysis available.</p>';
    } catch (err) {
        content.innerHTML = `<p style="color:var(--red)">Analysis failed: ${err.message || 'Unknown error'}</p>`;
    }
}

function initFilterSync() {}

async function loadLazyImage(img) {
    const path = img.dataset.path;
    if (!path || img.dataset.loaded) return;
    img.dataset.loaded = '1';
    try {
        let url = imageCache[path];
        if (!url) {
            url = await getSignedUrl(path);
            imageCache[path] = url;
        }
        img.src = url;
    } catch {
        img.alt = '📷';
    }
}
