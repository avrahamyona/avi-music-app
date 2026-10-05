import { audioUrl } from './audioSrc';

const subs = new Set();
const emit = (s) => subs.forEach((f) => f(s));
let el = null;
let vol = 1;
let handlers = {};

export async function init() {}
export function on(fn) { subs.add(fn); return () => subs.delete(fn); }

export function setHandlers(h) {
  handlers = h || {};
  if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
  const ms = navigator.mediaSession;
  try {
    ms.setActionHandler('play', () => el && el.play());
    ms.setActionHandler('pause', () => el && el.pause());
    ms.setActionHandler('nexttrack', () => handlers.next && handlers.next());
    ms.setActionHandler('previoustrack', () => handlers.prev && handlers.prev());
  } catch (e) {}
}

function meta(track, playing) {
  if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
  if (track && typeof MediaMetadata !== 'undefined') {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title, artist: track.artist,
      artwork: track.thumb ? [{ src: track.thumb }] : [],
    });
  }
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}

let lastTrack = null;
const push = () => {
  if (!el) return;
  emit({ playing: !el.paused && !el.ended, pos: el.currentTime || 0, dur: isFinite(el.duration) ? el.duration : 0 });
};

// Plain HTMLAudioElement: starts as soon as the first bytes arrive, no waiting for expo-av to finish loading.
export async function load(track) {
  lastTrack = track;
  if (el) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {} el = null; }
  let src;
  try { src = await audioUrl(track.id); } catch (e) { return false; }
  if (!src) return false;
  const a = new Audio();
  a.preload = 'auto';
  a.volume = vol;
  el = a;
  a.addEventListener('timeupdate', push);
  a.addEventListener('play', push);
  a.addEventListener('pause', push);
  a.addEventListener('durationchange', push);
  a.addEventListener('ended', () => { push(); emit({ ended: true }); });
  const ok = await new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; clearTimeout(tm); resolve(v); } };
    const tm = setTimeout(() => fin(false), 9000);
    a.addEventListener('playing', () => fin(true), { once: true });
    a.addEventListener('error', () => fin(false), { once: true });
    a.src = src;
    const p = a.play();
    if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotAllowedError') fin(true); });
  });
  if (!ok) { if (el === a) { try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) {} el = null; } return false; }
  meta(track, true);
  return true;
}

export async function toggle() {
  if (!el) return;
  if (el.paused) { try { await el.play(); } catch (e) {} } else el.pause();
  meta(lastTrack, !el.paused);
}
export async function seek(sec) { if (el) { try { el.currentTime = sec; } catch (e) {} } }

export async function setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (el) el.volume = vol; }

export function cast() { try { if (el && el.remote && el.remote.prompt) { el.remote.prompt().catch(() => {}); return true; } } catch (e) {} return false; }
