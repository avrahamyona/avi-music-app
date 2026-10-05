import { NativeModules } from 'react-native';
import { audioUrl } from './audioSrc';

// Windows: native module "AviAudio" (C++/WinRT MediaPlayer + system media controls).
const Native = NativeModules.AviAudio;
const subs = new Set();
const emit = (s) => subs.forEach((f) => f(s));
let timer = null;
let endedSent = false;

export async function init() {
  if (!Native || timer) return;
  timer = setInterval(async () => {
    try {
      const p = await Native.getProgress();
      emit({ playing: !!p.playing, pos: p.pos || 0, dur: p.dur || 0 });
      if (p.cmd === 1 && handlers.next) handlers.next();
      if (p.cmd === 2 && handlers.prev) handlers.prev();
      if (p.ended && !endedSent) { endedSent = true; emit({ ended: true }); }
    } catch (e) {}
  }, 500);
}
export function on(fn) { subs.add(fn); return () => subs.delete(fn); }
let handlers = {};
export function setHandlers(h) { handlers = h || {}; }
export async function load(track) {
  await init();
  if (!Native) return false;
  endedSent = false;
  try {
    const url = await audioUrl(track.id);
    if (!url) return false;
    return !!(await Promise.race([
      Native.load(url, track.title || '', track.artist || ''),
      new Promise((r) => setTimeout(() => r(false), 15000)),
    ]));
  } catch (e) { return false; }
}
export async function toggle() { if (Native) await Native.toggle(); }
export async function seek(sec) { if (Native) await Native.seek(sec); }
export async function setVolume(v) { if (Native && Native.setVolume) { try { await Native.setVolume(Math.max(0, Math.min(1, v))); } catch (e) {} } }
