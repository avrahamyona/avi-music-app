import TrackPlayer, {
  Capability, Event, State, AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import * as FileSystem from 'expo-file-system';
import { WORKER } from './config';
import { bus } from './bus';

const subs = new Set();
const emit = (s) => subs.forEach((f) => f(s));
let ready = false;
let playing = false;
let timer = null;

export async function init() {
  if (ready) return;
  try { await TrackPlayer.setupPlayer(); } catch (e) { /* already set up */ }
  await TrackPlayer.updateOptions({
    capabilities: [
      Capability.Play, Capability.Pause, Capability.SkipToNext,
      Capability.SkipToPrevious, Capability.SeekTo,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
    android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification },
  });
  TrackPlayer.addEventListener(Event.PlaybackState, (e) => {
    playing = e.state === State.Playing;
    emit({ playing });
  });
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => emit({ ended: true }));
  timer = setInterval(async () => {
    try {
      const p = await TrackPlayer.getProgress();
      emit({ pos: p.position, dur: p.duration });
    } catch (e) {}
  }, 500);
  ready = true;
}

export function on(fn) { subs.add(fn); return () => subs.delete(fn); }
export function setHandlers() { /* native uses the bus (service.js) */ }
export { bus };

// Resolves true once playback really starts; false if the source fails.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The worker's chunked stream is flaky per edge, so download the whole file first
// (retrying the same song id) and play the local copy.
async function fetchLocal(id) {
  const uri = FileSystem.cacheDirectory + id + '.mp4';
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && info.size > 50000) return uri;
  } catch (e) {}
  for (let i = 0; i < 4; i++) {
    try {
      const r = await FileSystem.downloadAsync(WORKER + '/audio/' + id, uri);
      if (r.status === 200 || r.status === 206) {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && info.size > 50000) return uri;
      }
    } catch (e) {}
    await sleep(1500);
  }
  return null;
}

export async function load(track) {
  await init();
  const local = await fetchLocal(track.id);
  if (!local) return false;
  await TrackPlayer.reset();
  await TrackPlayer.add({
    id: track.id,
    url: local,
    title: track.title,
    artist: track.artist,
    artwork: track.thumb || undefined,
    duration: track.dur || undefined,
  });
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(to); a.remove(); b.remove();
      resolve(v);
    };
    const to = setTimeout(() => finish(false), 12000);
    const a = TrackPlayer.addEventListener(Event.PlaybackState, (e) => {
      if (e.state === State.Playing) finish(true);
      if (e.state === State.Error) finish(false);
    });
    const b = TrackPlayer.addEventListener(Event.PlaybackError, () => finish(false));
    TrackPlayer.play().catch(() => finish(false));
  });
}

export async function toggle() {
  const st = await TrackPlayer.getPlaybackState();
  if (st.state === State.Playing) await TrackPlayer.pause(); else await TrackPlayer.play();
}
export async function seek(sec) { await TrackPlayer.seekTo(sec); }
export async function setVolume(v) { try { await TrackPlayer.setVolume(Math.max(0, Math.min(1, v))); } catch (e) {} }
