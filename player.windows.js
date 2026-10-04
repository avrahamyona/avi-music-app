import { NativeModules, NativeEventEmitter } from 'react-native';
import { WORKER } from './config';
import { bus } from './bus';

// Windows: native module "AviAudio" (C++/WinRT MediaPlayer + system media controls).
const Native = NativeModules.AviAudio;
const subs = new Set();
const emit = (s) => subs.forEach((f) => f(s));
let timer = null;

export async function init() {
  if (!Native || timer) return;
  try {
    const ev = new NativeEventEmitter(Native);
    ev.addListener('AviAudioEnded', () => emit({ ended: true }));
    ev.addListener('AviAudioNext', () => bus.emit('next'));
    ev.addListener('AviAudioPrev', () => bus.emit('prev'));
  } catch (e) {}
  timer = setInterval(async () => {
    try {
      const p = await Native.getProgress();
      emit({ playing: !!p.playing, pos: p.pos || 0, dur: p.dur || 0 });
    } catch (e) {}
  }, 500);
}
export function on(fn) { subs.add(fn); return () => subs.delete(fn); }
export function setHandlers() {}
export async function load(track) {
  await init();
  if (!Native) return false;
  try { return !!(await Native.load(WORKER + '/audio/' + track.id, track.title, track.artist)); } catch (e) { return false; }
}
export async function toggle() { if (Native) await Native.toggle(); }
export async function seek(sec) { if (Native) await Native.seek(sec); }
