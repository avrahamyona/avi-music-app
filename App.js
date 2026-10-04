import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, Image, Pressable, StyleSheet,
  useColorScheme, Platform, ActivityIndicator, StatusBar, Linking, ScrollView, useWindowDimensions,
} from 'react-native';
import * as player from './player';
import { bus } from './bus';
import * as store from './storage';
import { WORKER } from './config';
import { MOODS } from './moods';

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
          ch: ((/\/channel\/(UC[A-Za-z0-9_-]{22})/.exec(it.uploaderUrl || '')) || [])[1] || '',
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
                img={byArtist(a) && byArtist(a).thumb} onPress={() => A.openArtist(a, byArtist(a) && byArtist(a).ch)} />
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
      <Text style={[s.h2, { color: c.fg, marginTop: 22, marginBottom: 8 }]}>מצבי רוח ואווירה</Text>
      <MoodTiles c={c} A={A} />
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
      <Text style={[s.h2, { color: c.fg, marginTop: 14, marginBottom: 8 }]}>מצבי רוח ואווירה</Text>
      <MoodTiles c={c} A={A} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 18 }}>
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
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const list = sec === 'fav' ? A.favs : A.history;
  const importPl = async () => {
    const m = /[?&]list=([A-Za-z0-9_-]{10,100})/.exec(url) || /^([A-Za-z0-9_-]{10,100})$/.exec(url.trim());
    if (!m) { setMsg('הדבק קישור לפלייליסט ציבורי של יוטיוב (עם list=)'); return; }
    setBusy(true); setMsg('');
    try {
      const j = await wjson('/playlist/' + m[1]);
      const tracks = clean((j.tracks || []).map((t) => ({ id: t.id, title: t.title, artist: String(t.artist || '').replace(/ - Topic$/i, ''), thumb: ytThumb(t.id), dur: t.dur || 0, ch: t.ch || '' })));
      if (!tracks.length) setMsg('הפלייליסט ריק או פרטי');
      else { A.addPlaylist({ id: m[1], name: j.title || 'פלייליסט', tracks }); setUrl(''); setMsg('יובאו ' + tracks.length + ' שירים' + (j.skipped ? ' (' + j.skipped + ' לא זמינים דולגו)' : '')); }
    } catch (e) { setMsg('הייבוא נכשל. ייתכן שהפלייליסט פרטי.'); }
    setBusy(false);
  };
  const stats = A.stats || {};
  const month = new Date().toISOString().slice(0, 7);
  const top = Object.entries(stats.artists || {}).sort((x, y) => y[1] - x[1]).slice(0, 10);
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, marginTop: 8 }}>
        {[['fav', 'מועדפים'], ['hist', 'הושמעו לאחרונה'], ['pls', 'פלייליסטים'], ['stats', 'סטטיסטיקה']].map(([k, n]) => (
          <Pressable key={k} onPress={() => setSec(k)} style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, marginLeft: 8, backgroundColor: sec === k ? RED : c.card }}>
            <Text style={{ color: sec === k ? '#fff' : c.fg, fontWeight: '600' }}>{n}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {(sec === 'fav' || sec === 'hist') && !list.length && <Text style={{ color: c.sub, textAlign: 'center', marginTop: 40 }}>{sec === 'fav' ? 'עוד אין מועדפים. הקש על הלב ליד שיר.' : 'עוד לא הושמע כלום.'}</Text>}
      {(sec === 'fav' || sec === 'hist') && list.map((t) => <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onPress={() => A.play(t, list)} />)}
      {sec === 'pls' && (
        <View>
          <TextInput value={url} onChangeText={setUrl} onSubmitEditing={importPl} placeholder="הדבק קישור לפלייליסט ציבורי של יוטיוב" placeholderTextColor={c.sub}
            style={[s.input, { backgroundColor: c.card, color: c.fg, textAlign: 'right' }]} />
          <Pressable onPress={importPl} disabled={busy} style={{ backgroundColor: RED, borderRadius: 20, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'מייבא...' : 'ייבוא פלייליסט'}</Text>
          </Pressable>
          {!!msg && <Text style={{ color: c.sub, textAlign: 'center', margin: 10 }}>{msg}</Text>}
          {A.playlists.map((p) => (
            <Pressable key={p.id} onPress={() => A.open({ title: p.name, items: p.tracks })} style={s.row}>
              {p.tracks[0] && p.tracks[0].thumb ? <Image source={{ uri: p.tracks[0].thumb }} style={s.thumb} /> : <View style={s.thumb} />}
              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <Text numberOfLines={1} style={{ color: c.fg, fontWeight: '600', textAlign: 'right' }}>{p.name}</Text>
                <Text style={{ color: c.sub, textAlign: 'right' }}>{p.tracks.length + ' שירים'}</Text>
              </View>
              <Pressable onPress={() => A.removePlaylist(p.id)} style={{ padding: 8 }}><Text style={{ color: c.sub, fontSize: 16 }}>✕</Text></Pressable>
            </Pressable>
          ))}
        </View>
      )}
      {sec === 'stats' && (
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <Text style={{ color: c.fg, fontSize: 18, fontWeight: '700', textAlign: 'right' }}>{'השמעות מאז ההתקנה: ' + (stats.total || 0)}</Text>
          <Text style={{ color: c.sub, textAlign: 'right', marginTop: 4 }}>{'החודש (' + month + '): ' + ((stats.months || {})[month] || 0)}</Text>
          <Text style={[s.h2, { color: c.fg, marginHorizontal: 0, marginTop: 18 }]}>האמנים המושמעים ביותר</Text>
          {!top.length && <Text style={{ color: c.sub, textAlign: 'right', marginTop: 8 }}>עוד אין נתונים.</Text>}
          {top.map(([n, k], i) => (
            <View key={n} style={{ flexDirection: 'row', paddingVertical: 6 }}>
              <Text style={{ color: c.sub, width: 28, textAlign: 'right' }}>{i + 1}</Text>
              <Text style={{ color: c.fg, flex: 1, textAlign: 'right', marginHorizontal: 8 }}>{n}</Text>
              <Text style={{ color: c.sub }}>{k}</Text>
            </View>
          ))}
        </View>
      )}
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


async function wjson(path) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(WORKER + path); if (r.ok) return await r.json(); last = new Error('http ' + r.status); } catch (e) { last = e; }
  }
  throw last;
}
const ytThumb = (id) => 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';

function ArtistPage({ c, A, page }) {
  const [songs, setSongs] = useState(null);
  const [albums, setAlbums] = useState(null);
  const [similar, setSimilar] = useState(null);
  const [ch, setCh] = useState(page.ch);
  useEffect(() => {
    let live = true;
    (async () => {
      let found = [];
      try { found = await searchCached(page.title); } catch (e) {}
      const mine = found.filter((t) => (page.ch ? t.ch === page.ch : norm(t.artist).includes(norm(page.title))));
      if (!live) return;
      setSongs(mine.length ? mine : found);
      const id = page.ch || (mine[0] && mine[0].ch) || (found[0] && found[0].ch);
      if (id) {
        setCh(id);
        wjson('/music-artist/' + id).then((j) => live && setAlbums((j.releases || []).filter((r) => r.plId))).catch(() => live && setAlbums([]));
        wjson('/similar-artists/' + id).then((j) => live && setSimilar(j.artists || [])).catch(() => live && setSimilar([]));
      } else { setAlbums([]); setSimilar([]); }
    })();
    return () => { live = false; };
  }, [page.title, page.ch]);
  const cover = songs && songs[0];
  return (
    <View>
      <Pressable onPress={A.back} style={{ padding: 16 }}><Text style={{ color: RED, fontSize: 16, textAlign: 'right' }}>{'› חזרה'}</Text></Pressable>
      <View style={{ alignItems: 'center', paddingHorizontal: 16 }}>
        {cover ? <Image source={{ uri: cover.thumb }} style={{ width: 160, height: 160, borderRadius: 80, backgroundColor: c.card }} /> : <View style={{ width: 160, height: 160, borderRadius: 80, backgroundColor: c.card }} />}
        <Text style={{ color: c.fg, fontSize: 28, fontWeight: '800', marginTop: 12 }}>{page.title}</Text>
        <Pressable disabled={!songs || !songs.length} onPress={() => A.play(songs[0], songs)} style={{ backgroundColor: RED, borderRadius: 20, paddingHorizontal: 28, paddingVertical: 8, marginTop: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{'▶ נגן'}</Text>
        </Pressable>
      </View>
      <Text style={[s.h2, { color: c.fg, marginTop: 22, marginBottom: 6 }]}>שירים</Text>
      {!songs && <ActivityIndicator color={RED} style={{ margin: 14 }} />}
      {!!songs && !songs.length && <Text style={{ color: c.sub, textAlign: 'center' }}>לא נמצאו שירים</Text>}
      {!!songs && songs.slice(0, 10).map((t) => <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onPress={() => A.play(t, songs)} />)}
      {!!albums && !!albums.length && (
        <View style={{ marginTop: 22 }}>
          <Text style={[s.h2, { color: c.fg, marginBottom: 8 }]}>אלבומים וסינגלים</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {albums.slice(0, 20).map((al) => (
              <Card key={al.plId} t={{ title: al.title, thumb: al.thumb, artist: al.releaseYear || '' }} c={c} onPress={() => A.openAlbum(al)} />
            ))}
          </ScrollView>
        </View>
      )}
      {!!similar && !!similar.length && (
        <View style={{ marginTop: 22 }}>
          <Text style={[s.h2, { color: c.fg, marginBottom: 8 }]}>אמנים דומים</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {similar.slice(0, 15).map((ar) => (
              <Pressable key={ar.id} onPress={() => A.openArtist(ar.name, ar.id)} style={{ width: 110, alignItems: 'center', marginLeft: 12 }}>
                {ar.avatar ? <Image source={{ uri: ar.avatar }} style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: c.card }} /> : <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: c.card }} />}
                <Text numberOfLines={1} style={{ color: c.fg, marginTop: 6 }}>{ar.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function AlbumPage({ c, A, page }) {
  const [tracks, setTracks] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    wjson('/album/' + page.plId).then((j) => {
      if (!live) return;
      const list = clean((j.tracks || []).map((t) => ({ id: t.id, title: t.title, artist: t.artist || page.artist, thumb: page.thumb || ytThumb(t.id), dur: 0, ch: '' })));
      setTracks(list);
      if (!list.length) setErr('האלבום ריק');
    }).catch(() => { if (live) { setTracks([]); setErr('האלבום לא זמין כרגע'); } });
    return () => { live = false; };
  }, [page.plId]);
  return (
    <View>
      <Pressable onPress={A.back} style={{ padding: 16 }}><Text style={{ color: RED, fontSize: 16, textAlign: 'right' }}>{'› חזרה'}</Text></Pressable>
      <View style={{ alignItems: 'center' }}>
        {page.thumb ? <Image source={{ uri: page.thumb }} style={{ width: 200, height: 200, borderRadius: 10, backgroundColor: c.card }} /> : null}
        <Text style={{ color: c.fg, fontSize: 24, fontWeight: '800', marginTop: 12, textAlign: 'center', paddingHorizontal: 16 }}>{page.title}</Text>
        <Text style={{ color: c.sub }}>{page.artist}</Text>
        <Pressable disabled={!tracks || !tracks.length} onPress={() => A.play(tracks[0], tracks)} style={{ backgroundColor: RED, borderRadius: 20, paddingHorizontal: 28, paddingVertical: 8, marginTop: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{'▶ נגן'}</Text>
        </Pressable>
      </View>
      {!tracks && <ActivityIndicator color={RED} style={{ margin: 14 }} />}
      {!!err && <Text style={{ color: c.sub, textAlign: 'center', margin: 14 }}>{err}</Text>}
      {!!tracks && tracks.map((t) => <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onPress={() => A.play(t, tracks)} />)}
    </View>
  );
}

const lq = (s) => String(s || '').normalize('NFKC').replace(/[\u05F3\u2018\u2019\u0060\u00B4]/g, "'").replace(/[\u05F4\u201C\u201D]/g, '"')
  .replace(/\s*[-–—]\s*(?:topic|הערוץ הרשמי|official(?: music)? (?:video|audio))\s*$/i, '')
  .replace(/\s*\((?:official(?: music)? (?:video|audio)|audio only|lyrics?)\)\s*$/i, '').trim();
const lkey = (s) => norm(lq(s));
function lmatch(x, t, d) {
  const title = lkey(t.title), artist = lkey(t.artist);
  const xt = lkey(x.trackName || x.name), xa = lkey(x.artistName);
  if (!title || !xt || !(xt === title || (xt.includes(title) && title.length > 6))) return false;
  if (artist && xa && xa !== artist && !xa.includes(artist) && !artist.includes(xa)) return false;
  if (d && x.duration && Math.abs(x.duration - d) > 8) return false;
  return !!(x.syncedLyrics || x.plainLyrics || x.instrumental);
}
function parseLRC(s) {
  const out = [];
  const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
  for (const row of s.split('\n')) {
    const txt = row.replace(re, '').trim();
    if (!txt) continue;
    re.lastIndex = 0;
    let m; while ((m = re.exec(row))) out.push({ t: +m[1] * 60 + +m[2], text: txt });
  }
  return out.sort((a, b) => a.t - b.t);
}
async function lget(url) {
  for (let i = 0; i < 2; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); if (r.status !== 429 && r.status !== 503) return null; } catch (e) {}
    await new Promise((r) => setTimeout(r, 450));
  }
  return null;
}
const lcache = new Map();
async function fetchLyrics(t, d) {
  const title = lq(t.title), artist = lq(t.artist);
  const key = title + '|' + artist;
  if (lcache.has(key)) return lcache.get(key);
  const qs = 'track_name=' + encodeURIComponent(title) + '&artist_name=' + encodeURIComponent(artist) + (d ? '&duration=' + Math.round(d) : '');
  let j = await lget('https://lrclib.net/api/get?' + qs);
  if (j && lmatch(j, t, d)) { lcache.set(key, j); return j; }
  const neutral = title.replace(/[\u05F3'\u2018\u2019\u0060\u00B4]/g, '');
  const urls = ['https://lrclib.net/api/search?track_name=' + encodeURIComponent(title) + '&artist_name=' + encodeURIComponent(artist),
    'https://lrclib.net/api/search?q=' + encodeURIComponent([neutral, artist].filter(Boolean).join(' '))];
  for (const u of urls) {
    const arr = await lget(u);
    if (!Array.isArray(arr)) continue;
    const m = arr.filter((x) => lmatch(x, t, d));
    if (m.length) { j = m.sort((x, y) => Number(!!y.syncedLyrics) - Number(!!x.syncedLyrics))[0]; lcache.set(key, j); return j; }
  }
  return null;
}
function Lyrics({ c, cur, pos, dur }) {
  const [state, setState] = useState({ load: true });
  const ys = useRef({});
  const sv = useRef(null);
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState('sync');
  useEffect(() => {
    let live = true;
    setState({ load: true });
    fetchLyrics(cur, cur.dur || dur).then((j) => {
      if (!live) return;
      if (!j) return setState({ none: true });
      if (j.instrumental) return setState({ instr: true });
      const lines = j.syncedLyrics ? parseLRC(j.syncedLyrics) : [];
      setState(lines.length ? { lines } : { plain: String(j.plainLyrics || '').split('\n') });
    }).catch(() => live && setState({ none: true }));
    return () => { live = false; };
  }, [cur.id, tick]);
  let idx = 0;
  if (state.lines) for (let i = 0; i < state.lines.length; i++) { if (state.lines[i].t <= pos + 0.2) idx = i; else break; }
  useEffect(() => {
    const y = ys.current[idx];
    if (state.lines && mode === 'sync' && sv.current && y !== undefined) sv.current.scrollTo({ y: Math.max(0, y - 120), animated: true });
  }, [idx, state.lines, mode]);
  if (state.load) return <ActivityIndicator color={RED} style={{ margin: 20 }} />;
  if (state.instr) return <Text style={{ color: c.sub, textAlign: 'center', margin: 20 }}>שיר אינסטרומנטלי</Text>;
  if (state.none) return (
    <View style={{ alignItems: 'center', margin: 20 }}>
      <Text style={{ color: c.sub, textAlign: 'center' }}>אין מילים מאומתות לשיר הזה כרגע</Text>
      <Pressable onPress={() => setTick((n) => n + 1)} style={{ marginTop: 8 }}><Text style={{ color: RED }}>נסה שוב</Text></Pressable>
    </View>
  );
  const texts = state.lines ? state.lines.map((l) => l.text) : state.plain;
  const modes = state.lines ? [['sync', 'מסונכרן'], ['karaoke', 'קריוקי'], ['plain', 'טקסט']] : [];
  const m = state.lines ? mode : 'plain';
  return (
    <View style={{ width: '100%' }}>
      {!!modes.length && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 6 }}>
          {modes.map(([k, n]) => (
            <Pressable key={k} onPress={() => setMode(k)} style={{ paddingVertical: 4, paddingHorizontal: 12, borderRadius: 14, marginHorizontal: 4, backgroundColor: mode === k ? RED : c.card }}>
              <Text style={{ color: mode === k ? '#fff' : c.fg, fontWeight: '600' }}>{n}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {m === 'karaoke' ? (
        <View style={{ height: 300, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 }}>
          <Text style={{ color: c.sub, fontSize: 18, textAlign: 'center', opacity: 0.6 }}>{texts[idx - 1] || ' '}</Text>
          <Text style={{ color: RED, fontSize: 34, fontWeight: '800', textAlign: 'center', marginVertical: 14 }}>{texts[idx] || ' '}</Text>
          <Text style={{ color: c.sub, fontSize: 18, textAlign: 'center', opacity: 0.6 }}>{texts[idx + 1] || ' '}</Text>
        </View>
      ) : (
        <ScrollView ref={sv} style={{ height: 300, width: '100%' }}>
          {texts.map((tx, i) => (
            <Text key={i} onLayout={(e) => { ys.current[i] = e.nativeEvent.layout.y; }}
              onPress={state.lines ? () => player.seek(state.lines[i].t) : undefined}
              style={{ color: m === 'sync' ? (i === idx ? c.fg : c.sub) : c.fg, fontSize: m === 'sync' && i === idx ? 24 : 20, fontWeight: '800', textAlign: 'right', paddingVertical: 6, opacity: m === 'sync' && i < idx ? 0.5 : 1 }}>
              {tx || ' '}
            </Text>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const MOOD_COLORS = ['#c0392b', '#e67e22', '#8e44ad', '#e84393', '#d63031', '#2d3436', '#6c5ce7', '#00b894', '#0984e3', '#b8860b', '#a0522d', '#27ae60'];
async function resolveMood(m) {
  const out = [];
  const seen = new Set();
  await Promise.all(m.songs.map(async ([ar, ti], i) => {
    try {
      const r = await searchCached(ar + ' ' + ti);
      const tk = lkey(ti), ak = norm(ar);
      const hit = r.find((t) => { const k = lkey(t.title); return (k === tk || k.includes(tk)) && (norm(t.artist).includes(ak) || norm(t.title).includes(ak)); });
      if (hit) out[i] = hit;
    } catch (e) {}
  }));
  return out.filter((t) => t && !seen.has(t.id) && seen.add(t.id));
}
function MoodTiles({ c, A }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
      {MOODS.map((m, i) => (
        <Pressable key={m.name} onPress={() => A.open({ kind: 'mood', mood: m, color: MOOD_COLORS[i % MOOD_COLORS.length], title: m.name })}
          style={{ width: 150, height: 110, borderRadius: 12, marginLeft: 12, padding: 12, justifyContent: 'flex-end', backgroundColor: MOOD_COLORS[i % MOOD_COLORS.length] }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'right' }}>{m.name}</Text>
          <Text numberOfLines={1} style={{ color: '#fff', opacity: 0.85, fontSize: 12, textAlign: 'right' }}>{m.desc}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
function MoodPage({ c, A, page }) {
  const [tracks, setTracks] = useState(null);
  useEffect(() => { let live = true; resolveMood(page.mood).then((r) => live && setTracks(r)).catch(() => live && setTracks([])); return () => { live = false; }; }, [page.title]);
  const artists = [];
  for (const [a] of page.mood.songs) if (!artists.includes(a)) artists.push(a);
  return (
    <View>
      <Pressable onPress={A.back} style={{ padding: 16 }}><Text style={{ color: RED, fontSize: 16, textAlign: 'right' }}>{'› חזרה'}</Text></Pressable>
      <View style={{ marginHorizontal: 16, borderRadius: 16, padding: 20, backgroundColor: page.color, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>{page.title}</Text>
        <Text style={{ color: '#fff', opacity: 0.9, marginTop: 4 }}>{page.mood.desc}</Text>
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <Pressable disabled={!tracks || !tracks.length} onPress={() => A.play(tracks[0], tracks)} style={{ backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 22, paddingVertical: 8, marginHorizontal: 5 }}>
            <Text style={{ color: page.color, fontWeight: '800' }}>{'▶ התחל'}</Text>
          </Pressable>
          <Pressable disabled={!tracks || !tracks.length} onPress={() => { const sh = tracks.slice().sort(() => Math.random() - 0.5); A.play(sh[0], sh); }} style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 20, paddingHorizontal: 22, paddingVertical: 8, marginHorizontal: 5 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{'ערבוב'}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[s.h2, { color: c.fg, marginTop: 22, marginBottom: 6 }]}>אמנים בתחום</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {artists.map((n) => (
          <Pressable key={n} onPress={() => A.openArtist(n)} style={{ width: 96, alignItems: 'center', marginLeft: 12 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: RED, fontSize: 28, fontWeight: '800' }}>{n.slice(0, 1)}</Text></View>
            <Text numberOfLines={1} style={{ color: c.fg, marginTop: 6 }}>{n}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={[s.h2, { color: c.fg, marginTop: 22, marginBottom: 6 }]}>שירים</Text>
      {!tracks && <ActivityIndicator color={RED} style={{ margin: 14 }} />}
      {!!tracks && !tracks.length && <Text style={{ color: c.sub, textAlign: 'center', margin: 14 }}>לא נמצאו שירים מאומתים כרגע. נסה שוב בעוד רגע.</Text>}
      {!!tracks && tracks.map((t) => <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onPress={() => A.play(t, tracks)} />)}
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
  const [showLyr, setShowLyr] = useState(false);
  const [history, setHistory] = useState([]);
  const [favs, setFavs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [stats, setStats] = useState({});
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
    store.get('playlists', []).then(setPlaylists);
    store.get('stats', {}).then(setStats);
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
    setStats((st) => {
      const mo = new Date().toISOString().slice(0, 7);
      const an = String(t.artist || '').replace(/ - Topic$/i, '');
      const n = { total: (st.total || 0) + 1, months: { ...(st.months || {}), [mo]: ((st.months || {})[mo] || 0) + 1 }, artists: { ...(st.artists || {}), [an]: ((st.artists || {})[an] || 0) + 1 } };
      store.set('stats', n); return n;
    });
    for (let i = 0; i < 3; i++) {
      if (g !== gen.current) return;
      if (await player.load(t)) { if (g === gen.current) setStatus(''); return; }
    }
    if (g === gen.current) setStatus('השיר לא זמין כרגע במקורות הישירים. לא עברנו לשיר אחר.');
  };
  playRef.current = play;
  const isFav = (t) => favs.some((x) => x.id === t.id);
  const toggleFav = (t) => setFavs((f) => { const n = f.some((x) => x.id === t.id) ? f.filter((x) => x.id !== t.id) : [t, ...f]; store.set('favs', n); return n; });
  const addPlaylist = (p) => setPlaylists((x) => { const n = [p, ...x.filter((y) => y.id !== p.id)]; store.set('playlists', n); return n; });
  const removePlaylist = (id) => setPlaylists((x) => { const n = x.filter((y) => y.id !== id); store.set('playlists', n); return n; });
  const open = (p) => setPages((x) => [...x, p]);
  const back = () => setPages((x) => x.slice(0, -1));
  const openArtist = (name, ch) => open({ kind: 'artist', title: String(name).replace(/ - Topic$/i, ''), ch: ch || '' });
  const openAlbum = (al) => open({ kind: 'album', title: al.title, plId: al.plId, thumb: al.thumb, artist: al.artistName || '' });
  const A = { cur, play, isFav, toggleFav, open, back, openArtist, openAlbum, history, favs, playlists, stats, addPlaylist, removePlaylist };

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
      {page ? (page.kind === 'artist' ? <ArtistPage c={c} A={A} page={page} /> : page.kind === 'album' ? <AlbumPage c={c} A={A} page={page} /> : page.kind === 'mood' ? <MoodPage c={c} A={A} page={page} /> : <ListPage c={c} A={A} page={page} />) : (
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
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: wideScreen ? 'rgba(0,0,0,0.55)' : c.bg, alignItems: 'center', justifyContent: 'center' }}>
      {wideScreen && <Pressable onPress={() => setFull(false)} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />}
      <View style={{ width: wideScreen ? 560 : '100%', height: '100%', maxHeight: wideScreen ? '92%' : '100%', backgroundColor: c.bg, borderRadius: wideScreen ? 18 : 0, padding: 20, paddingTop: Platform.OS === 'web' || Platform.OS === 'windows' || wideScreen ? 20 : 48 }}>
      <Pressable onPress={() => setFull(false)} style={{ padding: 8 }}><Text style={{ color: c.sub, fontSize: 22, textAlign: 'center' }}>⌄</Text></Pressable>
      <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
        {cur.thumb ? <Image source={{ uri: cur.thumb }} style={{ width: 280, height: 280, borderRadius: 14, marginTop: 10 }} /> : null}
        <Text numberOfLines={2} style={{ color: c.fg, fontSize: 22, fontWeight: '800', marginTop: 18, textAlign: 'center' }}>{cur.title}</Text>
        <Pressable onPress={() => { setFull(false); openArtist(cur.artist, cur.ch); }}>
          <Text style={{ color: RED, fontSize: 16, marginTop: 4 }}>{cur.artist}</Text>
        </Pressable>
        {!!status && <Text style={{ color: c.sub, marginTop: 6, textAlign: 'center' }}>{status}</Text>}
        <View style={{ width: '100%', maxWidth: 420, marginTop: 16 }}>{bar}</View>
        <View style={{ marginTop: 6 }}>{ctl(true)}</View>
        <View style={{ flexDirection: 'row' }}>
          <Pressable onPress={() => toggleFav(cur)} style={{ padding: 10 }}><Text style={{ color: isFav(cur) ? RED : c.sub, fontSize: 26 }}>{isFav(cur) ? '♥' : '♡'}</Text></Pressable>
          <Pressable onPress={() => setShowLyr((v) => !v)} style={{ padding: 10 }}><Text style={{ color: showLyr ? RED : c.sub, fontSize: 18, fontWeight: '700' }}>מילים</Text></Pressable>
        </View>
        {showLyr && <View style={{ width: '100%', maxWidth: 520 }}><Lyrics c={c} cur={cur} pos={pos} dur={dur} /></View>}
        <Text style={[s.h2, { color: c.fg, alignSelf: 'flex-end', marginTop: 10 }]}>הבא בתור</Text>
        <View style={{ width: '100%' }}>
          {queue.slice(Math.max(0, queue.findIndex((t) => t.id === cur.id) + 1), 40).map((t) => <Row key={t.id} t={t} c={c} active={false} fav={isFav(t)} onFav={() => toggleFav(t)} onPress={() => play(t)} />)}
        </View>
      </ScrollView>
      </View>
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
