// Anon RLS check: node --env-file=.env rls-test.mjs  (leaves rows named "RLS TEST"; delete them in the dashboard)
import { createClient } from '@supabase/supabase-js'; import assert from 'assert';
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const r = await sb.from('reviews').insert({ name: 'RLS TEST', rating: 5, comment: 'automated test, delete me' }).select().single();
assert(!r.error, r.error?.message);
const l = await sb.from('reviews').select('*').order('created_at', { ascending: false }).limit(1);
assert(l.data?.[0]?.id === r.data.id, 'review not listed newest-first');
assert((await sb.from('reviews').insert({ name: 'RLS TEST', rating: 6, comment: 'x' })).error, 'rating 6 accepted');
assert((await sb.from('reviews').insert({ name: 'x'.repeat(81), rating: 5, comment: 'x' })).error, 'long name accepted');
const del = await sb.from('reviews').delete().eq('id', r.data.id).select(); assert(!del.data?.length, 'anon deleted a review');
const upd = await sb.from('reviews').update({ comment: 'hacked' }).eq('id', r.data.id).select(); assert(!upd.data?.length, 'anon updated a review');
const c = await sb.from('contact_messages').insert({ name: 'RLS TEST', email: 'test@example.com', message: 'automated test, delete me' });
assert(!c.error, c.error?.message);
const cr = await sb.from('contact_messages').select('*'); assert(cr.error || cr.data.length === 0, 'anon can read contact messages!');
assert((await sb.from('contact_messages').insert({ name: 'RLS TEST', email: 'nope', message: 'x' })).error, 'bad email accepted');
console.log('RLS OK: review posted+listed, contact inserted, contact read ->', cr.error ? cr.error.message : `${cr.data.length} rows`);
