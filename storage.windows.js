// Windows: JSON files in the app's LocalFolder via the AviAudio native module (falls back to memory).
import { NativeModules } from 'react-native';
const N = NativeModules.AviAudio;
const mem = {};
export async function get(key, fallback) {
  try {
    const raw = N && N.getItem ? await N.getItem(key) : mem[key];
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
export async function set(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (N && N.setItem) N.setItem(key, raw); else mem[key] = raw;
  } catch (e) {}
}
