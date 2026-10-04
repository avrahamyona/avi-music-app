import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, Image, Pressable, StyleSheet,
  useColorScheme, Platform, ActivityIndicator, StatusBar, Linking, ScrollView, useWindowDimensions,
} from 'react-native';
import * as player from './player';
import { bus } from './bus';
import * as store from './storage';

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


const BAD = /נחמן|ברסלב|breslov|nachman|\bdj\b|dj set|דיג'יי|live set|megamix|mashup/i;
const clean = (list) => list.filter((t) => !BAD.test(t.title + ' ' + t.artist));
const cache = new Map();
async function searchCached(q) {
  if (cache.has(q)) return cache.get(q);
  const r = clean(await searchTracks(q));
  if (r.length) cache.set(q, r);
  return r;
}
const GRADS = [['#fa2d48', '#ff7a45'], ['#5e5ce6', '#9a6bff'], ['#0a84ff', '#30d5c8'], ['#ff9f0a', '#ff453a'], ['#30b0c7', '#34c759']];

const TABS = [
  { k: 'home', t: 'בית', i: '⌂' },
  { k: 'browse', t: 'עיון', i: '▦' },
  { k: 'radio', t: 'רדיו', i: '◉' },
  { k: 'lib', t: 'ספרייה', i: '♫' },
  { k: 'search', t: 'חיפוש', i: '⌕' },
];

function Card({ t, onPress, c, wide, sub }) {
  const w = wide ? 280 : 150;
  return (
    <Pressable onPress={onPress} style={{ width: w, marginLeft: 14 }}>
      {t.thumb ? <Image source={{ uri: t.thumb }} style={{ width: w, height: wide ? 158 : 150, borderRadius: 8, backgroundColor: c.card }} />
        : <View style={{ width: w, height: 150, borderRadius: 8, backgroundColor: c.card }} />}
      <Text numberOfLines={1} style={{ color: c.fg, fontWeight: '600', marginTop: 6, textAlign: 'right' }}>{t.title}</Text>
      <Text numberOfLines={1} style={{ color: c.sub, fontSize: 13, textAlign: 'right' }}>{sub || t.artist}</Text>
    </Pressable>
  );
}

function Row({ t, onPress, c, active, fav, onFav }) {
  return (
    <Pressable onPress={onPress} style={[s.row, active && { backgroundColor: c.card }]}>
      {t.thumb ? <Image source={{ uri: t.thumb }} style={s.thumb} /> : <View style={s.thumb} />}
      <View style={{ flex: 1, marginHorizontal: 10 }}>
        <Text numberOfLines={1} style={{ color: c.fg, fontWeight: '600', textAlign: 'right' }}>{t.title}</Text>
        <Text numberOfLines={1} style={{ color: c.sub, textAlign: 'right' }}>{t.artist}</Text>
      </View>
      {!!t.dur && <Text style={{ color: c.sub, marginHorizontal: 6 }}>{fmt(t.dur)}</Text>}
      <Pressable onPress={onFav} style={{ padding: 8 }}><Text style={{ color: fav ? RED : c.sub, fontSize: 18 }}>{fav ? '♥' : '♡'}</Text></Pressable>
    </Pressable>
  );
}

// A shelf that loads one search and paints cards, like the website's home sections.
function Shelf({ title, query, c, A, wide, rows, limit = 12, hideIfEmpty }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let live = true;
    searchCached(query).then((r) => { if (live) setItems(r); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [query]);
  if (items && !items.length && hideIfEmpty) return null;
  return (
    <View style={{ marginTop: 22 }}>
      <Pressable disabled={!items || !items.length} onPress={() => A.open({ title, items })} style={s.sechead}>
        <Text style={[s.h2, { color: c.fg }]}>{title}</Text>
        {!!items && items.length > limit && <Text style={{ color: c.sub }}>{'הכל ‹'}</Text>}
      </Pressable>
      {!items && <ActivityIndicator color={RED} style={{ margin: 14 }} />}
      {!!items && !items.length && <Text style={{ color: c.sub, textAlign: 'right', marginHorizontal: 16 }}>לא זמין כרגע</Text>}
      {!!items && !!items.length && (rows ? items.slice(0, 8).map((t) => (
        <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onPress={() => A.play(t, items)} />
      )) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {items.slice(0, limit).map((t) => <Card key={t.id} t={t} c={c} wide={wide} onPress={() => A.play(t, items)} />)}
        </ScrollView>
      ))}
    </View>
  );
}

function Hero({ title, kicker, img, grad, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ width: 300, height: 190, marginLeft: 14, borderRadius: 14, overflow: 'hidden', backgroundColor: grad[0] }}>
      {!!img && <Image source={{ uri: img }} style={{ position: 'absolute', width: 300, height: 190, opacity: 0.55 }} />}
      <View style={{ padding: 14, flex: 1, justifyContent: 'space-between' }}>
        <Text style={{ color: '#fff', opacity: 0.85, fontSize: 12, fontWeight: '700', textAlign: 'right' }}>{kicker}</Text>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'right' }}>{title}</Text>
      </View>
    </Pressable>
  );
}

function Home({ c, A }) {
  const seeds = [];
  for (const t of A.history) { const a = t.artist.replace(/ - Topic$/i, ''); if (a && !seeds.includes(a)) seeds.push(a); if (seeds.length >= 6) break; }
  const byArtist = (a) => A.history.find((t) => t.artist.replace(/ - Topic$/i, '') === a);
  return (
    <View>
      {!!seeds.length && (
        <View style={{ marginTop: 18 }}>
          <Text style={[s.h2, { color: c.fg, marginHorizontal: 16, textAlign: 'right' }]}>בחירות מובילות עבורך</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10 }}>
            {seeds.map((a, i) => (
              <Hero key={a} title={'המיקס של ' + a} kicker="במיוחד עבורך" grad={GRADS[i % GRADS.length]}
                img={byArtist(a) && byArtist(a).thumb} onPress={() => A.openArtist(a)} />
            ))}
          </ScrollView>
        </View>
      )}
      <View style={{ marginTop: 22 }}>
        <Text style={[s.h2, { color: c.fg, marginHorizontal: 16, textAlign: 'right' }]}>הושמעו לאחרונה</Text>
        {A.history.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10 }}>
            {A.history.slice(0, 12).map((t) => <Card key={t.id} t={t} c={c} onPress={() => A.play(t, A.history)} />)}
          </ScrollView>
        ) : <Text style={{ color: c.sub, textAlign: 'right', marginHorizontal: 16, marginTop: 8 }}>נגן משהו ונתחיל להכיר את הטעם שלך.</Text>}
      </View>
      <Shelf title="השירים החדשים הטובים ביותר" query="שירים חדשים ישראל" c={c} A={A} rows />
      <Shelf title="מוזיקה חדשה" query="שירים פופולריים ישראל" c={c} A={A} />
      <Shelf title="כולם מקשיבים ל..." query="להיטים ישראלים" c={c} A={A} wide />
    </View>
  );
}

const TOPICS = [
  ['אימון', 'קצב לאימון', 'מוזיקה לאימון קצבית'],
  ['נסיעה', 'שירים לדרך', 'שירים לנסיעה ישראל'],
  ['רגוע', 'לנשום עמוק', 'שירים רגועים ישראל'],
  ['שמח', 'מצב רוח טוב', 'שירים שמחים ישראל'],
  ['רומנטי', 'שירי אהבה', 'שירי אהבה ישראל'],
  ['שבת', 'אווירת שבת', 'שירי שבת'],
];
function Topic({ t, c, A }) {
  const [items, setItems] = useState(null);
  useEffect(() => { let live = true; searchCached(t[2]).then((r) => live && setItems(r)).catch(() => live && setItems([])); return () => { live = false; }; }, []);
  const cover = items && items[0];
  return (
    <Pressable disabled={!items || !items.length} onPress={() => A.open({ title: t[0], items })}
      style={{ width: '48%', height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: c.card, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
      {cover ? <Image source={{ uri: cover.thumb }} style={{ width: 84, height: 84 }} /> : <View style={{ width: 84, height: 84 }} />}
      <View style={{ flex: 1, paddingHorizontal: 10 }}>
        <Text style={{ color: c.fg, fontWeight: '700', textAlign: 'right' }}>{t[0]}</Text>
        <Text numberOfLines={1} style={{ color: c.sub, fontSize: 12, textAlign: 'right' }}>{items && !items.length ? 'לא זמין כרגע' : t[1]}</Text>
      </View>
    </Pressable>
  );
}
function Browse({ c, A }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 10 }}>
        {TOPICS.map((t) => <Topic key={t[0]} t={t} c={c} A={A} />)}
      </View>
      <Shelf title="מוזיקה חדשה" query="שירים חדשים ישראל" c={c} A={A} />
      <Shelf title="להיטי ישראל" query="להיטים ישראלים" c={c} A={A} />
      <Shelf title="מזרחית וים-תיכונית" query="מוזיקה מזרחית להיטים" c={c} A={A} />
      <Shelf title="מוזיקה ערבית" query={'اغاني عربية'} c={c} A={A} />
    </View>
  );
}
const STATIONS = [['להיטי ישראל', 'להיטים ישראלים'], ['מזרחית', 'מוזיקה מזרחית להיטים'], ['שירים חדשים', 'שירים חדשים ישראל'], ['ים-תיכונית', 'ים תיכונית ישראלית'], ['רגוע', 'שירים רגועים ישראל']];
function Radio({ c, A }) {
  return (
    <View>
      {STATIONS.map(([n, q], i) => (
        <Pressable key={n} onPress={async () => { try { const r = await searchCached(q); if (r.length) A.play(r[0], r.slice().sort(() => Math.random() - 0.5).length ? [r[0], ...r.slice(1).sort(() => Math.random() - 0.5)] : r); } catch (e) {} }}
          style={{ height: 96, borderRadius: 14, marginHorizontal: 16, marginTop: 12, backgroundColor: GRADS[i % GRADS.length][0], justifyContent: 'flex-end', padding: 14 }}>
          <Text style={{ color: '#fff', opacity: 0.85, fontSize: 12, fontWeight: '700', textAlign: 'right' }}>תחנה</Text>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'right' }}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function Library({ c, A }) {
  const [sec, setSec] = useState('fav');
  const list = sec === 'fav' ? A.favs : A.history;
  return (
    <View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginTop: 8 }}>
        {[['fav', 'מועדפים'], ['hist', 'הושמעו לאחרונה']].map(([k, n]) => (
          <Pressable key={k} onPress={() => setSec(k)} style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, marginLeft: 8, backgroundColor: sec === k ? RED : c.card }}>
            <Text style={{ color: sec === k ? '#fff' : c.fg, fontWeight: '600' }}>{n}</Text>
          </Pressable>
        ))}
      </View>
      {!list.length && <Text style={{ color: c.sub, textAlign: 'center', marginTop: 40 }}>{sec === 'fav' ? 'עוד אין מועדפים. הקש על הלב ליד שיר.' : 'עוד לא הושמע כלום.'}</Text>}
      {list.map((t) => <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onPress={() => A.play(t, list)} />)}
    </View>
  );
}
function SearchTab({ c, A }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    const x = q.trim(); if (!x) return;
    setBusy(true); setErr('');
    try { const r = await searchCached(x); setRes(r); if (!r.length) setErr('לא נמצאו תוצאות'); } catch (e) { setErr('החיפוש נכשל, נסה שוב'); }
    setBusy(false);
  };
  return (
    <View>
      <TextInput value={q} onChangeText={setQ} onSubmitEditing={go} returnKeyType="search" placeholder="חפש שירים, אמנים..." placeholderTextColor={c.sub}
        style={[s.input, { backgroundColor: c.card, color: c.fg, textAlign: 'right' }]} />
      {busy && <ActivityIndicator color={RED} style={{ margin: 6 }} />}
      {!!err && <Text style={{ color: c.sub, textAlign: 'center', margin: 8 }}>{err}</Text>}
      {res.map((t) => <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onPress={() => A.play(t, res)} />)}
    </View>
  );
}
function ListPage({ c, A, page }) {
  return (
    <View>
      <Pressable onPress={A.back} style={{ padding: 16 }}><Text style={{ color: RED, fontSize: 16, textAlign: 'right' }}>{'› חזרה'}</Text></Pressable>
      <Text style={[s.large, { color: c.fg }]}>{page.title}</Text>
      {page.items.map((t) => <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onPress={() => A.play(t, page.items)} />)}
    </View>
  );
}

export default function App() {
  const system = useColorScheme();
  const { width } = useWindowDimensions();
  const wideScreen = width >= 900;
  const [override, setOverride] = useState(null);
  const dark = (override || system) === 'dark';
  const c = dark
    ? { bg: '#000', fg: '#fff', sub: '#9a9aa0', card: '#1c1c1e', line: '#2c2c2e' }
    : { bg: '#fff', fg: '#111', sub: '#6e6e73', card: '#f2f2f7', line: '#e5e5ea' };

  const [upd, setUpd] = useState(null);
  useEffect(() => {
    const pre = Platform.OS === 'windows' ? 'win-' : Platform.OS === 'android' ? 'app-' : null;
    const mine = parseInt(BUILD, 10);
    if (!pre || !mine) return;
    fetch('https://api.github.com/repos/avrahamyona/avi-music-app/releases?per_page=30')
      .then((r) => r.json())
      .then((list) => {
        let best = null;
        for (const rel of list || []) {
          if (!rel.tag_name || rel.tag_name.indexOf(pre) !== 0) continue;
          const n = parseInt(rel.tag_name.slice(pre.length), 10);
          const asset = (rel.assets || []).find((x) => /\.(apk|exe)$/i.test(x.name));
          if (n > mine && asset && (!best || n > best.n)) best = { n, url: asset.browser_download_url };
        }
        if (best) setUpd(best);
      })
      .catch(() => {});
  }, []);

  const [tab, setTab] = useState('home');
  const [pages, setPages] = useState([]);
  const [queue, setQueue] = useState([]);
  const [cur, setCur] = useState(null);
  const [status, setStatus] = useState('');
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [full, setFull] = useState(false);
  const [history, setHistory] = useState([]);
  const [favs, setFavs] = useState([]);
  const gen = useRef(0);
  const barW = useRef(1);
  const queueRef = useRef([]);
  const curRef = useRef(null);
  const playRef = useRef(null);
  queueRef.current = queue;
  curRef.current = cur;

  useEffect(() => {
    store.get('history', []).then(setHistory);
    store.get('favs', []).then(setFavs);
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

  const go = (d) => {
    const list = queueRef.current;
    const cc = curRef.current;
    const i = cc ? list.findIndex((t) => t.id === cc.id) : -1;
    if (i < 0) return;
    const n = list[i + d];
    if (n) playRef.current(n);
  };

  // A failing song is never swapped for another: retry the same id, then say so.
  const play = async (t, list) => {
    if (list) { setQueue(list); queueRef.current = list; }
    const g = ++gen.current;
    setCur(t); curRef.current = t; setStatus('טוען...'); setPos(0); setDur(0);
    setHistory((h) => { const n = [t, ...h.filter((x) => x.id !== t.id)].slice(0, 60); store.set('history', n); return n; });
    for (let i = 0; i < 3; i++) {
      if (g !== gen.current) return;
      if (await player.load(t)) { if (g === gen.current) setStatus(''); return; }
    }
    if (g === gen.current) setStatus('השיר לא זמין כרגע במקורות הישירים. לא עברנו לשיר אחר.');
  };
  playRef.current = play;
  const isFav = (t) => favs.some((x) => x.id === t.id);
  const toggleFav = (t) => setFavs((f) => { const n = f.some((x) => x.id === t.id) ? f.filter((x) => x.id !== t.id) : [t, ...f]; store.set('favs', n); return n; });
  const open = (p) => setPages((x) => [...x, p]);
  const back = () => setPages((x) => x.slice(0, -1));
  const openArtist = async (name) => {
    try {
      const r = await searchCached(name);
      const m = r.filter((t) => norm(t.artist).includes(norm(name)));
      open({ title: name, items: m.length ? m : r });
    } catch (e) {}
  };
  const A = { cur, play, isFav, toggleFav, open, back, openArtist, history, favs };

  const seek = (e) => {
    if (!dur) return;
    player.seek(Math.max(0, Math.min(1, e.nativeEvent.locationX / barW.current)) * dur);
  };
  const page = pages[pages.length - 1];
  const nav = (k) => { setTab(k); setPages([]); };
  const titleOf = (TABS.find((x) => x.k === tab) || {}).t;

  const Badge = (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ backgroundColor: '#1db954', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{'v' + BUILD}</Text>
      </View>
      <Text style={{ color: c.sub, fontSize: 11, marginHorizontal: 6 }}>{VERSION}</Text>
    </View>
  );
  const content = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      {!!upd && (
        <Pressable onPress={() => Linking.openURL(upd.url)} style={{ backgroundColor: '#1db954', padding: 10, margin: 12, borderRadius: 10 }}>
          <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>{'גרסה חדשה v' + upd.n + ' זמינה - הקש להורדה'}</Text>
        </Pressable>
      )}
      {page ? <ListPage c={c} A={A} page={page} /> : (
        <View>
          <Text style={[s.large, { color: c.fg }]}>{titleOf}</Text>
          {tab === 'home' && <Home c={c} A={A} />}
          {tab === 'browse' && <Browse c={c} A={A} />}
          {tab === 'radio' && <Radio c={c} A={A} />}
          {tab === 'lib' && <Library c={c} A={A} />}
          {tab === 'search' && <SearchTab c={c} A={A} />}
        </View>
      )}
    </ScrollView>
  );

  const ctl = (big) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <Pressable onPress={() => go(-1)} style={s.skip}><Text style={{ color: c.fg, fontSize: big ? 30 : 20 }}>⏮</Text></Pressable>
      <Pressable onPress={() => player.toggle()} style={[s.play, big && { width: 64, height: 64, borderRadius: 32 }]}><Text style={{ color: '#fff', fontSize: big ? 28 : 20 }}>{playing ? '❚❚' : '▶'}</Text></Pressable>
      <Pressable onPress={() => go(1)} style={s.skip}><Text style={{ color: c.fg, fontSize: big ? 30 : 20 }}>⏭</Text></Pressable>
    </View>
  );
  const bar = (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ color: c.sub, width: 40 }}>{fmt(pos)}</Text>
      <Pressable onPress={seek} style={{ flex: 1, height: 28, justifyContent: 'center' }} onLayout={(e) => { barW.current = e.nativeEvent.layout.width || 1; }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: c.line }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: RED, width: (dur ? Math.min(100, (pos / dur) * 100) : 0) + '%' }} />
        </View>
      </Pressable>
      <Text style={{ color: c.sub, width: 40, textAlign: 'left' }}>{fmt(dur)}</Text>
    </View>
  );
  const mini = cur && (
    <View style={[s.player, { borderTopColor: c.line, backgroundColor: c.bg }]}>
      <Pressable onPress={() => setFull(true)} style={{ flexDirection: 'row', alignItems: 'center' }}>
        {cur.thumb ? <Image source={{ uri: cur.thumb }} style={s.thumb} /> : <View style={s.thumb} />}
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text numberOfLines={1} style={{ color: c.fg, fontWeight: '600', textAlign: 'right' }}>{cur.title}</Text>
          <Text numberOfLines={1} style={{ color: c.sub, textAlign: 'right' }}>{status || cur.artist}</Text>
        </View>
        {ctl(false)}
      </Pressable>
      {bar}
    </View>
  );

  const fullView = full && cur && (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: c.bg, padding: 20, paddingTop: Platform.OS === 'web' ? 20 : 48 }}>
      <Pressable onPress={() => setFull(false)} style={{ padding: 8 }}><Text style={{ color: c.sub, fontSize: 22, textAlign: 'center' }}>⌄</Text></Pressable>
      <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
        {cur.thumb ? <Image source={{ uri: cur.thumb }} style={{ width: 280, height: 280, borderRadius: 14, marginTop: 10 }} /> : null}
        <Text numberOfLines={2} style={{ color: c.fg, fontSize: 22, fontWeight: '800', marginTop: 18, textAlign: 'center' }}>{cur.title}</Text>
        <Pressable onPress={() => { setFull(false); openArtist(cur.artist.replace(/ - Topic$/i, '')); }}>
          <Text style={{ color: RED, fontSize: 16, marginTop: 4 }}>{cur.artist}</Text>
        </Pressable>
        {!!status && <Text style={{ color: c.sub, marginTop: 6, textAlign: 'center' }}>{status}</Text>}
        <View style={{ width: '100%', maxWidth: 420, marginTop: 16 }}>{bar}</View>
        <View style={{ marginTop: 6 }}>{ctl(true)}</View>
        <Pressable onPress={() => toggleFav(cur)} style={{ padding: 10 }}><Text style={{ color: isFav(cur) ? RED : c.sub, fontSize: 26 }}>{isFav(cur) ? '♥' : '♡'}</Text></Pressable>
        <Text style={[s.h2, { color: c.fg, alignSelf: 'flex-end', marginTop: 10 }]}>הבא בתור</Text>
        <View style={{ width: '100%' }}>
          {queue.slice(Math.max(0, queue.findIndex((t) => t.id === cur.id) + 1), 40).map((t) => <Row key={t.id} t={t} c={c} active={false} fav={isFav(t)} onFav={() => toggleFav(t)} onPress={() => play(t)} />)}
        </View>
      </ScrollView>
    </View>
  );

  return (
    <View style={[s.root, { backgroundColor: c.bg, direction: 'rtl' }]}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <View style={{ flex: 1, flexDirection: wideScreen ? 'row' : 'column' }}>
        {wideScreen && (
          <View style={{ width: 230, backgroundColor: c.card, paddingTop: 24, paddingHorizontal: 12 }}>
            <Text style={[s.title, { color: RED, marginBottom: 6 }]}>Avi Music</Text>
            <View style={{ marginBottom: 14 }}>{Badge}</View>
            {TABS.map((x) => (
              <Pressable key={x.k} onPress={() => nav(x.k)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, backgroundColor: tab === x.k ? c.line : 'transparent' }}>
                <Text style={{ color: tab === x.k ? RED : c.fg, fontSize: 18, width: 28 }}>{x.i}</Text>
                <Text style={{ color: tab === x.k ? RED : c.fg, fontSize: 16, fontWeight: '600' }}>{x.t}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setOverride(dark ? 'light' : 'dark')} style={{ padding: 10, marginTop: 'auto' }}>
              <Text style={{ color: c.fg, fontSize: 18 }}>{dark ? '☀️ בהיר' : '🌙 כהה'}</Text>
            </Pressable>
          </View>
        )}
        <View style={{ flex: 1 }}>
          {!wideScreen && (
            <View style={s.top}>
              <Text style={[s.title, { color: c.fg }]}>Avi Music</Text>
              {Badge}
              <Pressable onPress={() => setOverride(dark ? 'light' : 'dark')} style={s.theme}><Text style={{ color: c.fg, fontSize: 20 }}>{dark ? '☀️' : '🌙'}</Text></Pressable>
            </View>
          )}
          {content}
          {mini}
          {!wideScreen && (
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg }}>
              {TABS.map((x) => (
                <Pressable key={x.k} onPress={() => nav(x.k)} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
                  <Text style={{ color: tab === x.k ? RED : c.sub, fontSize: 20 }}>{x.i}</Text>
                  <Text style={{ color: tab === x.k ? RED : c.sub, fontSize: 11 }}>{x.t}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
      {fullView}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'web' || Platform.OS === 'windows' ? 0 : 36 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  title: { fontSize: 24, fontWeight: '800', flex: 1, textAlign: 'right' },
  large: { fontSize: 32, fontWeight: '800', paddingHorizontal: 16, paddingTop: 14, textAlign: 'right' },
  h2: { fontSize: 21, fontWeight: '700', marginHorizontal: 16, textAlign: 'right' },
  sechead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 0, marginBottom: 8 },
  theme: { padding: 6 },
  input: { margin: 12, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  thumb: { width: 52, height: 52, borderRadius: 6, backgroundColor: '#8884' },
  player: { padding: 10, borderTopWidth: 1 },
  skip: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
});
