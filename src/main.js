import { getSession, onAuthChange, signIn, signOut } from './services/auth.js';
import { initAuth } from './ui/auth.js';
import { initScanner } from './ui/scanner.js';
import { initCollection, loadCollection } from './ui/collection.js';

async function init() {
    initAuth(() => showApp());
    initScanner();
    initCollection();

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await signOut();
        showAuth();
    });

    onAuthChange((event, session) => {
        if (session) showApp();
        else showAuth();
    });

    const session = await getSession();
    if (session) {
        showApp();
    } else {
        // Auto-sign in for dev
        try {
            await signIn('mbasso@gmail.com', 'pitchking2026');
            showApp();
        } catch {
            showAuth();
        }
    }
}

function showApp() {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');
    loadCollection();
}

function showAuth() {
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appScreen').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', init);
