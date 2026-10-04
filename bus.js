const listeners = {};
export const bus = {
  on(ev, fn) { (listeners[ev] = listeners[ev] || new Set()).add(fn); return () => listeners[ev].delete(fn); },
  emit(ev, ...a) { (listeners[ev] || []).forEach((fn) => fn(...a)); },
};
