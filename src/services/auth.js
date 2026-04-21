import { sb } from '../supabase.js';
import { state } from '../state.js';

export async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    state.user = data.user;
    state.authToken = data.session?.access_token;
    return data;
}

export async function signUp(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    state.user = data.user;
    state.authToken = data.session?.access_token;
    return data;
}

export async function signOut() {
    await sb.auth.signOut();
    state.user = null;
    state.authToken = null;
    state.items = [];
    state.collections = [];
}

export async function getSession() {
    const { data } = await sb.auth.getSession();
    if (data.session) {
        state.user = data.session.user;
        state.authToken = data.session.access_token;
    }
    return data.session;
}

export function onAuthChange(callback) {
    sb.auth.onAuthStateChange((event, session) => {
        if (session) {
            state.user = session.user;
            state.authToken = session.access_token;
        } else {
            state.user = null;
            state.authToken = null;
        }
        callback(event, session);
    });
}
