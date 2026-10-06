// Google sign-in (device flow), YouTube import and Google Takeout import. Plain JS, fetch only.
import * as store from './storage';
import * as Cfg from './config';

const CID = (Cfg && Cfg.GOOGLE_CLIENT_ID) || '';
const SEC = (Cfg && Cfg.GOOGLE_CLIENT_SECRET) || '';
const OWNER = String((Cfg && Cfg.OWNER_EMAIL) || '').toLowerCase();
const WK = (Cfg && Cfg.WORKER) || 'https://avi-music-audio.avi-music.workers.dev';
export const SCOPE = 'openid email profile https://www.googleapis.com/auth/youtube.readonly';

export const lockEnabled = () => !!CID && !!OWNER;

const form = (o) => Object.keys(o).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');
async function post(path, body) {
  const r = await fetch(WK + '/g' + path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(body) });
  const j = await r.json().catch(() => ({}));
  return j;
}

export async function getAuth() { return store.get('auth', null); }
export async function signOut() { await store.set('auth', null); }

export async function startDevice() {
  const j = await post('/device/code', { client_id: CID, scope: SCOPE });
  if (!j.device_code) throw new Error(j.error_description || j.error || 'no code');
  return j; // { device_code, user_code, verification_url, expires_in, interval }
}

// Poll until approved, denied or expired. cancel() returns true to stop.
export async function pollDevice(d, cancel) {
  const end = Date.now() + (d.expires_in || 600) * 1000;
  let wait = Math.max(3, d.interval || 5);
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, wait * 1000));
    if (cancel && cancel()) return null;
    const j = await post('/token', { client_id: CID, client_secret: SEC, device_code: d.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
    if (j.access_token) {
      const a = { access: j.access_token, refresh: j.refresh_token || '', exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000 };
      await store.set('auth', a);
      return a;
    }
    if (j.error === 'slow_down') wait += 5;
    else if (j.error && j.error !== 'authorization_pending') throw new Error(j.error);
  }
  throw new Error('expired');
}

export async function token() {
  const a = await getAuth();
  if (!a) return null;
  if (a.exp > Date.now()) return a.access;
  if (!a.refresh) return null;
  const j = await post('/token', { client_id: CID, client_secret: SEC, refresh_token: a.refresh, grant_type: 'refresh_token' });
  if (!j.access_token) { if (j.error === 'invalid_grant') await store.set('auth', null); return null; }
  const n = { access: j.access_token, refresh: a.refresh, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000 };
  await store.set('auth', n);
  return n.access;
}

// Returns { state: 'ok'|'denied'|'out'|'offline', email, name }.
export async function check() {
  if (!lockEnabled()) return { state: 'ok', email: '', name: '' };
  const a = await getAuth();
  if (!a) return { state: 'out' };
  const t = await token().catch(() => null);
  if (!t) return { state: a && a.refresh ? 'offline' : 'out' };
  try {
    const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + t } });
    if (r.status === 401) { await store.set('auth', null); return { state: 'out' }; }
    const u = await r.json();
    const em = String(u.email || '').toLowerCase();
    if (u.email_verified !== false && em === OWNER) return { state: 'ok', email: em, name: u.name || '' };
    await store.set('auth', null);
    return { state: 'denied', email: em };
  } catch (e) { return { state: 'offline' }; }
}

// Header for worker calls (used when the server lock is on).
export async function authHeader() { const t = await token().catch(() => null); return t ? { Authorization: 'Bearer ' + t } : {}; }

async function yt(path, params, t) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/' + path + '?' + form(params), { headers: { Authorization: 'Bearer ' + t } });
  if (!r.ok) throw new Error('yt ' + r.status);
  return r.json();
}
async function allPages(path, params, t, max) {
  const out = []; let pt = '';
  for (let i = 0; i < (max || 20); i++) {
    const j = await yt(path, pt ? { ...params, pageToken: pt } : params, t);
    out.push(...(j.items || []));
    pt = j.nextPageToken || '';
    if (!pt) break;
  }
  return out;
}
const stripTopic = (s) => String(s || '').replace(/ - Topic$/i, '');

// Playlists, liked music and subscriptions through the YouTube Data API.
export async function importYouTube(onStep) {
  const t = await token();
  if (!t) throw new Error('not signed in');
  const res = { playlists: [], liked: [], subs: [] };
  onStep && onStep('פלייליסטים');
  const pls = await allPages('playlists', { part: 'snippet,contentDetails', mine: 'true', maxResults: 50 }, t, 6);
  for (const p of pls) {
    try {
      const items = await allPages('playlistItems', { part: 'snippet,contentDetails', playlistId: p.id, maxResults: 50 }, t, 6);
      const tracks = items.filter((x) => x.contentDetails && x.contentDetails.videoId && x.snippet && x.snippet.title !== 'Private video' && x.snippet.title !== 'Deleted video').map((x) => ({
        id: x.contentDetails.videoId, title: x.snippet.title, artist: stripTopic(x.snippet.videoOwnerChannelTitle), thumb: 'https://i.ytimg.com/vi/' + x.contentDetails.videoId + '/mqdefault.jpg', dur: 0, ch: x.snippet.videoOwnerChannelId || '',
      }));
      if (tracks.length) res.playlists.push({ id: p.id, name: p.snippet.title, tracks });
    } catch (e) {}
  }
  onStep && onStep('סרטונים שאהבת');
  try {
    const liked = await allPages('videos', { part: 'snippet,contentDetails', myRating: 'like', maxResults: 50 }, t, 10);
    res.liked = liked.filter((v) => String(v.snippet.categoryId) === '10' || /topic/i.test(v.snippet.channelTitle)).map((v) => ({
      id: v.id, title: v.snippet.title, artist: stripTopic(v.snippet.channelTitle), thumb: 'https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg', dur: 0, ch: v.snippet.channelId || '',
    }));
  } catch (e) {}
  onStep && onStep('מנויים');
  try {
    const subs = await allPages('subscriptions', { part: 'snippet', mine: 'true', maxResults: 50 }, t, 10);
    res.subs = subs.map((s) => ({ title: stripTopic(s.snippet.title), ch: s.snippet.resourceId && s.snippet.resourceId.channelId }));
  } catch (e) {}
  return res;
}

// Google Takeout: YouTube / YouTube Music watch-history.json -> taste summary.
export function parseWatchHistory(text) {
  let arr; try { arr = JSON.parse(text); } catch (e) { return null; }
  if (!Array.isArray(arr)) return null;
  const artists = {}, songs = {}, hours = new Array(24).fill(0), months = {};
  let n = 0;
  for (const e of arr) {
    const isMusic = /music/i.test(e.header || '') || (e.subtitles && e.subtitles[0] && / - Topic$/i.test(e.subtitles[0].name || ''));
    if (!isMusic || !e.title || /^Watched https?:/.test(e.title)) continue;
    const title = String(e.title).replace(/^Watched /, '');
    const artist = stripTopic(e.subtitles && e.subtitles[0] ? e.subtitles[0].name : '');
    if (!artist) continue;
    n++;
    artists[artist] = (artists[artist] || 0) + 1;
    const k = title + '\u0001' + artist; songs[k] = (songs[k] || 0) + 1;
    const d = new Date(e.time);
    if (!isNaN(d)) { hours[d.getHours()]++; const m = String(e.time).slice(0, 7); months[m] = (months[m] || 0) + 1; }
  }
  const topSongs = Object.keys(songs).sort((a, b) => songs[b] - songs[a]).slice(0, 50).map((k) => { const p = k.split('\u0001'); return { title: p[0], artist: p[1], count: songs[k] }; });
  return { total: n, artists, topSongs, hours, months };
}

// Takeout playlists CSV ("Video ID,Playlist video creation timestamp"). Names come from the file name.
export function parsePlaylistCsv(text) {
  const ids = [];
  String(text).split(/\r?\n/).slice(1).forEach((l) => { const id = l.split(',')[0].trim(); if (/^[A-Za-z0-9_-]{11}$/.test(id)) ids.push(id); });
  return ids;
}

export function summarize(taste) {
  if (!taste) return null;
  const top = Object.keys(taste.artists || {}).sort((a, b) => taste.artists[b] - taste.artists[a]);
  const hrs = taste.hours || [];
  const peak = hrs.indexOf(Math.max.apply(null, hrs.length ? hrs : [0]));
  return { topArtists: top.slice(0, 20).map((n) => ({ name: n, count: taste.artists[n] })), topSongs: (taste.topSongs || []).slice(0, 20), peakHour: peak >= 0 ? peak : null, total: taste.total || 0 };
}

// ---- Apple Music import: JSON {playlists:[{name,tracks:[{title,artist}]}], library:[...], recent:[...], artists:[...]} ----
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\b(feat|ft)\b\.?.*$/, ' ').replace(/ - topic$/i, '').replace(/official (music )?video|official audio|lyrics?|audio|remastered( \d+)?/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function sameSong(want, got) {
  const wt = norm(want.title), gt = norm(got.title);
  const wa = norm(want.artist), ga = norm(got.artist + ' ' + got.title);
  if (!wt || !gt) return false;
  const titleOk = gt === wt || gt.indexOf(wt) >= 0 || wt.indexOf(gt) >= 0;
  const first = wa.split(/ (?:and|&|x|,) /)[0].trim();
  return titleOk && (!wa || ga.indexOf(first || wa) >= 0);
}
export function parseAppleExport(text) {
  let j; try { j = JSON.parse(text); } catch (e) { return null; }
  if (!j || typeof j !== 'object') return null;
  const tr = (a) => (Array.isArray(a) ? a : []).filter((x) => x && x.title).map((x) => ({ title: String(x.title), artist: String(x.artist || ''), album: String(x.album || '') }));
  return { playlists: (Array.isArray(j.playlists) ? j.playlists : []).map((p) => ({ name: String(p.name || 'פלייליסט'), tracks: tr(p.tracks) })).filter((p) => p.tracks.length), library: tr(j.library), recent: tr(j.recent), artists: (Array.isArray(j.artists) ? j.artists : []).map((a) => String(a.name || a)).filter(Boolean) };
}
// search(q) -> tracks[] (already filtered by the app). Never substitutes a different song.
export async function matchTrack(t, search, cache) {
  const key = norm(t.title) + '|' + norm(t.artist);
  if (cache[key] !== undefined) return cache[key];
  let found = null;
  for (const q of [t.title + ' ' + t.artist, t.title + ' ' + t.artist + ' audio']) {
    try { const r = await search(q); found = (r || []).find((x) => sameSong(t, x)) || null; } catch (e) { found = null; }
    if (found) break;
  }
  cache[key] = found ? { id: found.id, title: found.title, artist: String(found.artist).replace(/ - Topic$/i, ''), thumb: found.thumb, dur: found.dur || 0, ch: found.ch || '' } : null;
  return cache[key];
}
export async function importApple(data, A, onProgress) {
  const cache = (await store.get('applematch', {})) || {};
  const miss = []; let done = 0, ok = 0;
  const total = data.playlists.reduce((n, p) => n + p.tracks.length, 0) + data.library.length + data.recent.length;
  const run = async (list) => {
    const out = [];
    for (const t of list) {
      const m = await matchTrack(t, A.search, cache);
      done++; if (m) { ok++; out.push(m); } else miss.push(t.title + ' - ' + t.artist);
      onProgress && onProgress(done, total);
      if (done % 20 === 0) store.set('applematch', cache);
    }
    return out;
  };
  for (const p of data.playlists) { const tracks = await run(p.tracks); if (tracks.length) A.addPlaylist({ id: 'apple-' + norm(p.name).replace(/ /g, '-'), name: p.name, tracks }); }
  A.importFavs(await run(data.library));
  const rec = await run(data.recent); if (rec.length) A.importHistory(rec);
  const artists = {}; data.artists.forEach((n) => { artists[n] = (artists[n] || 0) + 10; });
  data.library.concat(data.recent).forEach((t) => { if (t.artist) artists[t.artist] = (artists[t.artist] || 0) + 1; });
  await A.mergeTaste({ artists, total: 0, topSongs: [], hours: [], months: {} });
  store.set('applematch', cache);
  return { total, ok, miss };
}
