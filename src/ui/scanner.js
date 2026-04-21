import { analyzeImage, uploadImage, fileToBase64, fileToCompressedBase64 } from '../services/scanner.js';
import { saveItem } from '../services/collection.js';
import { state } from '../state.js';

let stream = null;
let capturedFile = null;
let backFile = null;
let extractionResult = null;
let backExtractionResult = null;
let scanSide = 'front'; // 'front' or 'back'

const EDITABLE_FIELDS = [
    { key: 'item_type', label: 'Item Type', type: 'select', options: ['card','watch','toy','coin','comic','figurine','other'] },
    { key: 'item_name', label: 'Name', type: 'text' },
    { key: 'brand', label: 'Brand', type: 'text' },
    { key: 'year', label: 'Year', type: 'number' },
    { key: 'set_name', label: 'Set', type: 'text' },
    { key: 'item_number', label: 'Card #', type: 'text' },
    { key: 'subset', label: 'Type/Subset', type: 'text', placeholder: 'Rookie, Base, Prism, Refractor...' },
    { key: 'team', label: 'Team', type: 'text' },
    { key: 'sport', label: 'Sport', type: 'text' },
    { key: 'rarity', label: 'Rarity', type: 'select', options: ['Common','Uncommon','Rare','Ultra Rare','Numbered','1/1','Unknown'] },
    { key: 'parallel', label: 'Parallel', type: 'text', placeholder: 'Gold, Silver, Blue...' },
    { key: 'numbered_to', label: 'Numbered /___', type: 'number' },
    { key: 'autographed', label: 'Autographed', type: 'checkbox' },
    { key: 'memorabilia', label: 'Memorabilia/Relic', type: 'checkbox' },
];

export function initScanner() {
    document.getElementById('scanBtn').addEventListener('click', openScanner);
    document.getElementById('scanClose').addEventListener('click', closeScanner);
    document.getElementById('captureBtn').addEventListener('click', capturePhoto);
    document.getElementById('fileInput').addEventListener('change', handleFileInput);
    document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('retakeBtn').addEventListener('click', retake);
    document.getElementById('saveItemBtn').addEventListener('click', saveToCollection);
    document.getElementById('scanBackBtn').addEventListener('click', startBackScan);
}

async function openScanner() {
    scanSide = 'front';
    backFile = null;
    backExtractionResult = null;
    document.getElementById('scannerModal').classList.add('active');
    document.getElementById('scanResult').classList.add('hidden');
    document.getElementById('scanCapture').classList.remove('hidden');
    document.getElementById('scanSideLabel').textContent = 'Front';
    startCamera();
}

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        document.getElementById('cameraFeed').srcObject = stream;
        document.getElementById('cameraFallback').classList.add('hidden');
    } catch (err) {
        console.error('Camera error:', err);
        document.getElementById('cameraFallback').classList.remove('hidden');
    }
}

function closeScanner() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    document.getElementById('scannerModal').classList.remove('active');
    extractionResult = null;
    capturedFile = null;
    backFile = null;
    backExtractionResult = null;
}

async function capturePhoto() {
    const video = document.getElementById('cameraFeed');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
        const file = new File([blob], `scan-${scanSide}.jpg`, { type: 'image/jpeg' });
        if (scanSide === 'back') {
            backFile = file;
            await processBackCapture(file);
        } else {
            capturedFile = file;
            await processCapture(file, canvas.toDataURL('image/jpeg', 0.85));
        }
    }, 'image/jpeg', 0.85);
}

async function handleFileInput(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (scanSide === 'back') {
        backFile = file;
        await processBackCapture(file);
    } else {
        capturedFile = file;
        const url = URL.createObjectURL(file);
        await processCapture(file, url);
    }
    e.target.value = '';
}

async function processCapture(file, previewUrl) {
    document.getElementById('scanCapture').classList.add('hidden');
    document.getElementById('scanResult').classList.remove('hidden');
    document.getElementById('scanPreview').src = previewUrl;
    document.getElementById('scanStatus').textContent = 'AI is reading your collectible...';
    document.getElementById('scanStatus').classList.remove('hidden');
    document.getElementById('extractionDetails').innerHTML = '<div class="analyzing-spinner"></div>';
    document.getElementById('saveItemBtn').classList.add('hidden');
    document.getElementById('scanBackBtn').classList.add('hidden');

    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }

    try {
        const base64 = await fileToCompressedBase64(file, 800);
        const result = await analyzeImage(base64);
        extractionResult = result;
        extractionResult._raw = { ...result };
        renderEditableExtraction(result);
        document.getElementById('scanStatus').classList.add('hidden');
        document.getElementById('saveItemBtn').classList.add('hidden');
        document.getElementById('scanBackBtn').classList.add('hidden');
        showBackPrompt();
    } catch (err) {
        console.error('Analysis error:', err);
        document.getElementById('scanStatus').textContent = 'Analysis failed: ' + (err.message || 'Unknown error');
        renderEditableExtraction({});
        showBackPrompt();
    }
}

async function processBackCapture(file) {
    document.getElementById('scanCapture').classList.add('hidden');
    document.getElementById('scanResult').classList.remove('hidden');

    const backPreview = document.getElementById('backPreview');
    if (backPreview) backPreview.src = URL.createObjectURL(file);

    document.getElementById('backStatus').textContent = 'Reading back of card...';
    document.getElementById('backStatus').classList.remove('hidden');

    try {
        const base64 = await fileToCompressedBase64(file, 800);
        const result = await analyzeImage(base64);
        backExtractionResult = result;
        mergeBackData(result);
        document.getElementById('backStatus').textContent = 'Back scan merged — review fields below';
        document.getElementById('scanStatus').textContent = 'Front + back analyzed — edit any field';
        document.getElementById('scanStatus').classList.remove('hidden');
        document.getElementById('saveItemBtn').classList.remove('hidden');
        document.getElementById('scanBackBtn').classList.add('hidden');
    } catch (err) {
        console.error('Back analysis error:', err);
        document.getElementById('backStatus').textContent = 'Back scan failed: ' + (err.message || '');
    }
}

function mergeBackData(backData) {
    if (!extractionResult) return;
    for (const field of EDITABLE_FIELDS) {
        const key = field.key;
        if (!extractionResult[key] && backData[key]) {
            extractionResult[key] = backData[key];
            const input = document.getElementById(`edit-${key}`);
            if (input) {
                if (field.type === 'checkbox') input.checked = !!backData[key];
                else input.value = backData[key];
                input.closest('.ext-field')?.classList.add('merged');
            }
        }
    }
}

function showBackPrompt() {
    const container = document.getElementById('backPrompt');
    if (container) container.remove();

    const prompt = document.createElement('div');
    prompt.id = 'backPrompt';
    prompt.className = 'back-prompt';
    prompt.innerHTML = `
        <div class="back-prompt-icon">🔄</div>
        <h3>Scan the back of the card?</h3>
        <p>The back has the card number, year, stats, and set info — helps the AI identify it more accurately.</p>
        <div class="back-prompt-actions">
            <button id="backPromptScan" class="btn btn-primary">📸 Scan Back</button>
            <button id="backPromptSkip" class="btn btn-secondary">Skip — Save As Is</button>
        </div>
    `;

    const details = document.getElementById('extractionDetails');
    details.parentNode.insertBefore(prompt, details);

    document.getElementById('backPromptScan').addEventListener('click', () => {
        prompt.remove();
        startBackScan();
    });
    document.getElementById('backPromptSkip').addEventListener('click', () => {
        prompt.remove();
        document.getElementById('scanStatus').textContent = 'Review and edit fields below';
        document.getElementById('scanStatus').classList.remove('hidden');
        document.getElementById('saveItemBtn').classList.remove('hidden');
        document.getElementById('scanBackBtn').classList.remove('hidden');
    });
}

function startBackScan() {
    scanSide = 'back';
    document.getElementById('scanSideLabel').textContent = 'Back';
    document.getElementById('scanResult').classList.add('hidden');
    document.getElementById('scanCapture').classList.remove('hidden');
    startCamera();
}

function renderEditableExtraction(data) {
    const container = document.getElementById('extractionDetails');
    let html = '<div class="extraction-grid editable">';

    for (const field of EDITABLE_FIELDS) {
        const value = data[field.key];
        const uncertain = data.uncertain_fields?.includes(field.key) ? ' uncertain' : '';
        const hasValue = value !== null && value !== undefined && value !== '' && value !== false;

        html += `<div class="ext-field${uncertain}${field.type === 'checkbox' ? ' checkbox-field' : ''}">`;
        html += `<label class="ext-label" for="edit-${field.key}">${field.label}</label>`;

        if (field.type === 'select') {
            html += `<select id="edit-${field.key}" class="ext-input">`;
            html += `<option value="">—</option>`;
            for (const opt of field.options) {
                const selected = String(value).toLowerCase() === opt.toLowerCase() ? ' selected' : '';
                html += `<option value="${opt}"${selected}>${opt}</option>`;
            }
            html += `</select>`;
        } else if (field.type === 'checkbox') {
            html += `<input type="checkbox" id="edit-${field.key}" class="ext-checkbox" ${value ? 'checked' : ''}>`;
        } else {
            html += `<input type="${field.type}" id="edit-${field.key}" class="ext-input"
                value="${hasValue ? value : ''}" placeholder="${field.placeholder || ''}">`;
        }
        html += `</div>`;
    }

    if (data.description) {
        html += `<div class="ext-field full-width">
            <label class="ext-label">AI Description</label>
            <div class="ext-desc">${data.description}</div>
        </div>`;
    }

    if (data.confidence) {
        const pct = Math.round(data.confidence * 100);
        const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';
        html += `<div class="ext-field">
            <span class="ext-label">AI Confidence</span>
            <div class="confidence-bar">
                <div class="confidence-fill" style="width:${pct}%; background:${color}"></div>
            </div>
            <span class="ext-value" style="color:${color}">${pct}%</span>
        </div>`;
    }

    html += '</div>';

    // Back scan section
    html += `
        <div id="backScanSection" class="${backFile ? '' : 'hidden'}" style="margin-top:16px;">
            <div class="ext-field full-width">
                <span class="ext-label">Back of Card</span>
                <img id="backPreview" class="back-preview" src="" alt="">
                <div id="backStatus" class="scan-status hidden"></div>
            </div>
        </div>`;

    container.innerHTML = html;
}

function getEditedData() {
    const data = { ...(extractionResult || {}) };
    for (const field of EDITABLE_FIELDS) {
        const el = document.getElementById(`edit-${field.key}`);
        if (!el) continue;
        if (field.type === 'checkbox') {
            data[field.key] = el.checked;
        } else if (field.type === 'number') {
            data[field.key] = el.value ? parseInt(el.value) : null;
        } else {
            data[field.key] = el.value || null;
        }
    }
    // Auto-generate tags from fields
    data.tags = generateTags(data);
    return data;
}

function generateTags(data) {
    const tags = [];
    if (data.sport) tags.push(data.sport.toLowerCase());
    if (data.brand) tags.push(data.brand.toLowerCase());
    if (data.team) tags.push(data.team.toLowerCase());
    if (data.subset) tags.push(data.subset.toLowerCase());
    if (data.rarity && data.rarity !== 'Common' && data.rarity !== 'Unknown') tags.push(data.rarity.toLowerCase());
    if (data.autographed) tags.push('autograph', 'auto');
    if (data.memorabilia) tags.push('memorabilia', 'relic', 'game-used');
    if (data.parallel) tags.push(data.parallel.toLowerCase());
    if (data.item_type && data.item_type !== 'card') tags.push(data.item_type);
    if (data.year) {
        if (data.year < 1980) tags.push('vintage');
        else if (data.year < 2000) tags.push('junk-wax-era');
        else if (data.year < 2010) tags.push('modern-classic');
        else tags.push('modern');
    }
    return [...new Set(tags)];
}

function retake() {
    extractionResult = null;
    capturedFile = null;
    backFile = null;
    backExtractionResult = null;
    scanSide = 'front';
    document.getElementById('scanSideLabel').textContent = 'Front';
    document.getElementById('scanResult').classList.add('hidden');
    document.getElementById('scanCapture').classList.remove('hidden');
    startCamera();
}

async function saveToCollection() {
    const btn = document.getElementById('saveItemBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const itemData = getEditedData();

        if (capturedFile) {
            const imagePath = await uploadImage(capturedFile);
            itemData.front_image_url = imagePath;
        }

        itemData.collection_id = state.activeCollection || null;
        await saveItem(itemData);

        btn.textContent = 'Saved!';
        btn.classList.add('saved');
        setTimeout(() => {
            closeScanner();
            document.dispatchEvent(new Event('collectionUpdated'));
        }, 1000);
    } catch (err) {
        console.error('Save error:', err);
        btn.textContent = 'Save failed — try again';
        btn.disabled = false;
    }
}
