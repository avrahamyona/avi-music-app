import { Audio } from 'expo-av';
import { WORKER } from './config';

const subs = new Set();
const emit = (s) => subs.forEach((f) => f(s));
let sound = null;
let vol = 1;
let handlers = {};

export async function init() {
  try { await Audio.setAudioModeAsync({ staysActiveInBackground: true, playsInSilentModeIOS: true }); } catch (e) {}
}
export function on(fn) { subs.add(fn); return () => subs.delete(fn); }

export function setHandlers(h) {
  handlers = h || {};
  if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
  const ms = navigator.mediaSession;
  try {
    ms.setActionHandler('play', () => sound && sound.playAsync());
    ms.setActionHandler('pause', () => sound && sound.pauseAsync());
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
function onStatus(st) {
  if (!st.isLoaded) return;
  emit({ playing: st.isPlaying, pos: (st.positionMillis || 0) / 1000, dur: (st.durationMillis || 0) / 1000 });
  meta(lastTrack, st.isPlaying);
  if (st.didJustFinish) emit({ ended: true });
}

export async function load(track) {
  await init();
  if (sound) { await sound.unloadAsync().catch(() => {}); sound = null; }
  lastTrack = track;
  try {
    const r = await Audio.Sound.createAsync({ uri: WORKER + '/audio/' + track.id }, { shouldPlay: true, volume: vol }, onStatus);
    if (!r.status.isLoaded) { await r.sound.unloadAsync().catch(() => {}); return false; }
    sound = r.sound;
    meta(track, true);
    return true;
  } catch (e) { return false; }
}

export async function toggle() {
  if (!sound) return;
  const st = await sound.getStatusAsync();
  if (st.isLoaded) { if (st.isPlaying) await sound.pauseAsync(); else await sound.playAsync(); }
}
export async function seek(sec) { if (sound) await sound.setPositionAsync(sec * 1000); }

export async function setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (sound) await sound.setVolumeAsync(vol).catch(() => {}); }
