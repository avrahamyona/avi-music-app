import { NativeModules } from 'react-native';
import { WORKER } from './config';

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
      if (p.ended && !endedSent) { endedSent = true; emit({ ended: true }); }
    } catch (e) {}
  }, 500);
}
export function on(fn) { subs.add(fn); return () => subs.delete(fn); }
export function setHandlers() {}
export async function load(track) {
  await init();
  if (!Native) return false;
  endedSent = false;
  try {
    const url = WORKER + '/audio/' + track.id;
    return !!(await Promise.race([
      Native.load(url, track.title || '', track.artist || ''),
      new Promise((r) => setTimeout(() => r(false), 15000)),
    ]));
  } catch (e) { return false; }
}
export async function toggle() { if (Native) await Native.toggle(); }
export async function seek(sec) { if (Native) await Native.seek(sec); }
