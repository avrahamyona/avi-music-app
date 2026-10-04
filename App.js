import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, Image, Pressable, StyleSheet,
  useColorScheme, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import * as player from './player';
import { bus } from './bus';

const VERSION = '0.2.0';
const BUILD = (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_BUILD) || 'dev';
const PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.leptons.xyz',
];
const RED = '#fa2d48';

let pipedBase = null;
async function pipedGet(path) {
  const hosts = [...(pipedBase ? [pipedBase] : []), ...PIPED.filter((h) => h !== pipedBase)];
  let last;
  for (const h of hosts) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(h + path, { signal: ctl.signal });
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      pipedBase = h;
      return j;
    } catch (e) { last = e; } finally { clearTimeout(to); }
  }
  throw last || new Error('no host');
}

async function searchTracks(q) {
  const one = async (f) => {
    const j = await pipedGet('/search?q=' + encodeURIComponent(q) + '&filter=' + f);
    return (j.items || [])
      .filter((it) => it.type === 'stream' && it.url)
      .map((it) => {
        const m = /v=([A-Za-z0-9_-]{11})/.exec(it.url);
        return m && {
          id: m[1], title: it.title || '', artist: it.uploaderName || '',
          thumb: it.thumbnail || '', dur: it.duration > 0 ? it.duration : 0,
        };
      })
      .filter(Boolean);
  };
  const rs = await Promise.allSettled([one('music_songs'), one('videos')]);
  const seen = new Set();
  const out = [];
  for (const r of rs) {
    if (r.status !== 'fulfilled') continue;
    for (const t of r.value) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
  }
  return out;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[\u0591-\u05C7]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const fmt = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
};

export default function App() {
  const system = useColorScheme();
  const [override, setOverride] = useState(null);
  const dark = (override || system) === 'dark';
  const c = dark
    ? { bg: '#000', fg: '#fff', sub: '#9a9aa0', card: '#1c1c1e', line: '#2c2c2e' }
    : { bg: '#fff', fg: '#111', sub: '#6e6e73', card: '#f2f2f7', line: '#e5e5ea' };

  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cur, setCur] = useState(null);
  const [status, setStatus] = useState('');
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const gen = useRef(0);
  const barW = useRef(1);
  const resultsRef = useRef([]);
  const curRef = useRef(null);
  const playRef = useRef(null);
  resultsRef.current = results;
  curRef.current = cur;

  useEffect(() => {
    player.init().catch(() => {});
    const off = player.on((st) => {
      if (st.playing !== undefined) setPlaying(st.playing);
      if (st.pos !== undefined) { setPos(st.pos); setDur(st.dur || 0); }
      if (st.ended) go(1);
    });
    const o1 = bus.on('next', () => go(1));
    const o2 = bus.on('prev', () => go(-1));
    player.setHandlers({ next: () => go(1), prev: () => go(-1) });
    return () => { off(); o1(); o2(); };
  }, []);

  const search = useCallback(async () => {
    const s = q.trim();
    if (!s) return;
    setBusy(true); setErr('');
    try {
      const r = await searchTracks(s);
      setResults(r);
      if (!r.length) setErr('לא נמצאו תוצאות');
    } catch (e) { setErr('החיפוש נכשל, נסה שוב'); }
    setBusy(false);
  }, [q]);

  // Queue = the current results list. Next/previous move within it.
  const go = (d) => {
    const list = resultsRef.current;
    const c = curRef.current;
    const i = c ? list.findIndex((t) => t.id === c.id) : -1;
    if (i < 0) return;
    const n = list[i + d];
    if (n) playRef.current(n);
  };

  // A failing song is never swapped for another: retry the same id, then say so.
  const play = async (t) => {
    const g = ++gen.current;
    setCur(t); curRef.current = t; setStatus('טוען...'); setPos(0); setDur(0);
    for (let i = 0; i < 3; i++) {
      if (g !== gen.current) return;
      if (await player.load(t)) { if (g === gen.current) setStatus(''); return; }
    }
    if (g === gen.current) setStatus('השיר לא זמין כרגע במקורות הישירים. לא עברנו לשיר אחר.');
  };
  playRef.current = play;

  const toggle = () => { player.toggle(); };
  const seek = (e) => {
    if (!dur) return;
    const x = e.nativeEvent.locationX;
    player.seek(Math.max(0, Math.min(1, x / barW.current)) * dur);
  };

  return (
    <View style={[s.root, { backgroundColor: c.bg, direction: 'rtl' }]}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <View style={s.top}>
        <Text style={[s.title, { color: c.fg }]}>Avi Music</Text>
        <View style={{ backgroundColor: '#1db954', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginHorizontal: 8 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{'v' + BUILD}</Text>
        </View>
        <Text style={{ color: c.sub, fontSize: 11 }}>{VERSION}</Text>
        <Pressable onPress={() => setOverride(dark ? 'light' : 'dark')} style={s.theme}>
          <Text style={{ color: c.fg, fontSize: 20 }}>{dark ? '☀️' : '🌙'}</Text>
        </Pressable>
      </View>
      <TextInput
        value={q} onChangeText={setQ} onSubmitEditing={search} returnKeyType="search"
        placeholder="חפש שירים, אמנים..." placeholderTextColor={c.sub}
        style={[s.input, { backgroundColor: c.card, color: c.fg, textAlign: 'right' }]}
      />
      {busy && <ActivityIndicator color={RED} style={{ margin: 6 }} />}
      {!!err && <Text style={{ color: c.sub, textAlign: 'center', margin: 8 }}>{err}</Text>}
      <FlatList
        data={results} keyExtractor={(t) => t.id} style={{ flex: 1 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => play(item)} style={[s.row, cur && cur.id === item.id && { backgroundColor: c.card }]}>
            {item.thumb ? <Image source={{ uri: item.thumb }} style={s.thumb} /> : <View style={s.thumb} />}
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text numberOfLines={1} style={{ color: c.fg, fontWeight: '600' }}>{item.title}</Text>
              <Text numberOfLines={1} style={{ color: c.sub }}>{item.artist}</Text>
            </View>
            <Text style={{ color: c.sub }}>{item.dur ? fmt(item.dur) : ''}</Text>
          </Pressable>
        )}
      />
      <View style={[s.player, { backgroundColor: c.card, borderTopColor: c.line }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text numberOfLines={1} style={{ flex: 1, color: c.fg, fontWeight: '700' }}>
            {cur ? cur.title : 'בחר שיר מהתוצאות'}
          </Text>
          <Pressable onPress={() => go(-1)} disabled={!cur} style={s.skip}>
            <Text style={{ color: c.fg, fontSize: 20 }}>⏮</Text>
          </Pressable>
          <Pressable onPress={toggle} disabled={!cur} style={s.play}>
            <Text style={{ color: '#fff', fontSize: 22 }}>{playing ? '❚❚' : '▶'}</Text>
          </Pressable>
          <Pressable onPress={() => go(1)} disabled={!cur} style={s.skip}>
            <Text style={{ color: c.fg, fontSize: 20 }}>⏭</Text>
          </Pressable>
        </View>
        {!!status && <Text style={{ color: c.sub, marginTop: 2 }}>{status}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: c.sub, width: 40 }}>{fmt(pos)}</Text>
          <Pressable
            onPress={seek} style={{ flex: 1, height: 28, justifyContent: 'center' }}
            onLayout={(e) => { barW.current = e.nativeEvent.layout.width || 1; }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: c.line }}>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: RED, width: (dur ? Math.min(100, (pos / dur) * 100) : 0) + '%' }} />
            </View>
          </Pressable>
          <Text style={{ color: c.sub, width: 40, textAlign: 'left' }}>{fmt(dur)}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'web' ? 8 : 44 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '800', flex: 1 },
  theme: { padding: 6 },
  input: { margin: 12, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  thumb: { width: 52, height: 52, borderRadius: 6, backgroundColor: '#8884' },
  player: { padding: 12, borderTopWidth: 1 },
  skip: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
});
