import { Platform } from 'react-native';
import { WORKER } from './config';

// Resolves a playable URL for the SAME song id. The worker's extraction can fail on some
// edge locations, so we probe it twice, then ask public Piped servers for the same id.
// It never substitutes a different song.
const PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.leptons.xyz',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

function pick(j) {
  const as = ((j && j.audioStreams) || []).filter((a) => a.url);
  if (!as.length) throw new Error('no audio streams');
  const mp4 = as.filter((a) => /audio\/mp4/.test(a.mimeType || ''));
  return (mp4.length ? mp4 : as).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0].url;
}

const urlCache = new Map();
// Warm the worker (and, on native, the resolved URL) for a song that is likely to play next.
export function warm(id) {
  if (!id) return;
  try {
    if (Platform.OS === 'web') { fetch(WORKER + '/audio/' + id, { mode: 'no-cors', headers: { Range: 'bytes=0-1' } }).catch(() => {}); return; }
    audioUrl(id).catch(() => {});
  } catch (e) {}
}

export async function audioUrl(id) {
  const hit = urlCache.get(id);
  if (hit && Date.now() - hit.t < 20 * 60 * 1000) return hit.u;
  const u = await audioUrl0(id);
  urlCache.set(id, { u, t: Date.now() });
  return u;
}

async function audioUrl0(id) {
  // On web a fetch probe is blocked by CORS even when the audio element loads fine, so use the worker URL directly (same as the website).
  if (Platform.OS === 'web') return WORKER + '/audio/' + id;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await timeout(fetch(WORKER + '/audio/' + id, { headers: { Range: 'bytes=0-0' } }), 8000);
      if (r.ok || r.status === 206) return WORKER + '/audio/' + id;
    } catch (e) {}
    if (a < 2) await sleep(400);
  }
  return new Promise((resolve) => {
    let left = PIPED.length;
    let done = false;
    PIPED.forEach((base) => {
      timeout(fetch(base + '/streams/' + id).then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }), 9000)
        .then((j) => { const u = pick(j); if (!done) { done = true; resolve(u); } })
        .catch(() => { left -= 1; if (left === 0 && !done) resolve(WORKER + '/audio/' + id); });
    });
  });
}
