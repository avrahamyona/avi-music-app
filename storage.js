// Default storage: browser localStorage on web, in-memory elsewhere (Windows until a native store is added).
const mem = {};
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
export async function get(key, fallback) {
  try {
    const s = ls();
    const raw = s ? s.getItem('avi:' + key) : mem[key];
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
export async function set(key, value) {
  try {
    const raw = JSON.stringify(value);
    const s = ls();
    if (s) s.setItem('avi:' + key, raw); else mem[key] = raw;
  } catch (e) {}
}
