// Android / iOS: JSON files in the app's document folder.
import * as FS from 'expo-file-system';
const path = (k) => FS.documentDirectory + 'avi-' + k + '.json';
export async function get(key, fallback) {
  try {
    const raw = await FS.readAsStringAsync(path(key));
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
export async function set(key, value) {
  try { await FS.writeAsStringAsync(path(key), JSON.stringify(value)); } catch (e) {}
}
