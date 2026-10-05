import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, Image, Pressable, StyleSheet, Animated, Easing,
  PanResponder, useColorScheme, Platform, Share, Modal, ActivityIndicator, StatusBar, Linking, ScrollView, useWindowDimensions, Dimensions,
} from 'react-native';
import * as player from './player';
import { bus } from './bus';
import * as store from './storage';
import { WORKER } from './config';
import { MOODS } from './moods';
import Icon from './Icon';

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
const clean = (list) => list.filter((t) => !BAD.test(t.title + ' ' + t.artist) && !(t.dur > 900));
const cache = new Map();
async function searchCached(q) {
  if (cache.has(q)) return cache.get(q);
  const r = clean(await searchTracks(q));
  if (r.length) cache.set(q, r);
  return r;
}
const GRADS = [['#fa2d48', '#ff7a45'], ['#5e5ce6', '#9a6bff'], ['#0a84ff', '#30d5c8'], ['#ff9f0a', '#ff453a'], ['#30b0c7', '#34c759']];

const TABS = [
  { k: 'home', t: 'בית', i: 'home' },
  { k: 'browse', t: 'חדש', i: 'browse' },
  { k: 'radio', t: 'רדיו', i: 'radio' },
  { k: 'lib', t: 'ספריה', i: 'library' },
  { k: 'search', t: 'חיפוש', i: 'search' },
];

function Card({ t, onPress, c, wide, sub }) {
  const w = wide ? 280 : 158;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: w, marginLeft: 14, opacity: pressed ? 0.7 : 1 })}>
      {t.thumb ? <Image source={{ uri: t.thumb }} style={{ width: w, height: wide ? 158 : 158, borderRadius: 8, backgroundColor: c.card }} />
        : <View style={{ width: w, height: 158, borderRadius: 8, backgroundColor: c.card }} />}
      <Text numberOfLines={1} style={{ color: c.fg, fontWeight: '600', marginTop: 6, textAlign: 'right' }}>{t.title}</Text>
      <Text numberOfLines={1} style={{ color: c.sub, fontSize: 13, textAlign: 'right' }}>{sub || t.artist}</Text>
    </Pressable>
  );
}

function FadeIn({ k, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { v.setValue(0); Animated.timing(v, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(); }, [k]);
  return <Animated.View style={{ flex: 1, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>{children}</Animated.View>;
}

function HScroll({ children, contentContainerStyle, ...rest }) {
  const ref = useRef(null);
  const off = useRef(0);
  const [w, setW] = useState(0);
  const web = Platform.OS === 'web';
  const step = (d) => { const n = ref.current && ref.current.getScrollableNode && ref.current.getScrollableNode(); if (n && n.scrollBy) n.scrollBy({ left: -d * Math.max(200, w * 0.8), behavior: 'smooth' }); };
  const arrow = (d, side) => (
    <Pressable onPress={() => step(d)} style={{ position: 'absolute', top: '40%', [side]: 6, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(40,40,44,0.85)', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{d < 0 ? '›' : '‹'}</Text>
    </Pressable>
  );
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={contentContainerStyle} scrollEventThrottle={16} onScroll={(e) => { off.current = e.nativeEvent.contentOffset.x; }} {...rest}>{children}</ScrollView>
      {web && w >= 700 && arrow(-1, 'right')}
      {web && w >= 700 && arrow(1, 'left')}
    </View>
  );
}

const mixc = (c, t, w) => Math.round(c * w + t * (1 - w));
function tintBg(t, dark, alpha) {
  if (!t) return null;
  const base = dark ? [49, 48, 50] : [244, 244, 246];
  const w = dark ? 0.4 : 0.5;
  return 'rgba(' + [0, 1, 2].map((i) => mixc(t[i], base[i], w)).join(',') + ',' + alpha + ')';
}

function PlayerArt({ uri, playing, size, wide }) {
  const v = useRef(new Animated.Value(playing ? 1 : 0.8)).current;
  useEffect(() => { Animated.timing(v, { toValue: playing ? 1 : 0.8, duration: 220, easing: Easing.bezier(0.25, 0.1, 0.25, 1), useNativeDriver: false }).start(); }, [playing]);
  return <Animated.Image source={{ uri }} style={{ width: size, height: size, borderRadius: wide ? 7 : 10, marginTop: 10, backgroundColor: '#8883', transform: [{ scale: v }] }} />;
}

const ptOf = (e) => (e && e.nativeEvent && e.nativeEvent.pageX != null ? { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } : null);
let swipeQueue = null;
function Row({ t, onPress, c, active, fav, onFav, onMore, num }) {
  const dx = useRef(new Animated.Value(0)).current;
  const [reveal, setReveal] = useState(false);
  const tr = useRef(t); tr.current = t;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (e, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
    onPanResponderGrant: () => setReveal(true),
    onPanResponderMove: (e, g) => dx.setValue(Math.max(-140, Math.min(140, g.dx))),
    onPanResponderRelease: (e, g) => {
      if (Math.abs(g.dx) >= 100 && swipeQueue) swipeQueue(tr.current);
      Animated.timing(dx, { toValue: 0, duration: 180, useNativeDriver: false }).start(() => setReveal(false));
    },
    onPanResponderTerminate: () => { Animated.timing(dx, { toValue: 0, duration: 180, useNativeDriver: false }).start(() => setReveal(false)); },
  })).current;
  return (
    <View>
      {reveal && <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#2a7de1', justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '700' }}>הבא בתור</Text></View>}
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: dx }], backgroundColor: c.bg }}>
    <Pressable onPress={onPress} onLongPress={(e) => onMore && onMore(ptOf(e))} style={({ pressed }) => [s.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#8884', opacity: pressed ? 0.6 : 1 }]}>
      {num ? <Text style={{ color: c.sub, fontSize: 15, width: 34, textAlign: 'center' }}>{num}</Text> : t.thumb ? <Image source={{ uri: t.thumb }} style={s.thumb} /> : <View style={s.thumb} />}
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text numberOfLines={1} style={{ color: active ? RED : c.fg, fontSize: 15, fontWeight: '500', textAlign: 'right' }}>{t.title}</Text>
        <Text numberOfLines={1} style={{ color: c.sub, fontSize: 13, marginTop: 1, textAlign: 'right' }}>{t.artist}</Text>
      </View>
      {!!t.dur && <Text style={{ color: c.sub, fontSize: 14, marginHorizontal: 6, writingDirection: 'ltr' }}>{fmt(t.dur)}</Text>}
      {!num && <Pressable onPress={onFav} style={{ padding: 8 }}><Icon name={fav ? 'heartfill' : 'heart'} size={18} color={fav ? RED : c.sub} /></Pressable>}
      {!!onMore && <Pressable onPress={(e) => onMore(ptOf(e))} style={{ padding: 8 }}><Icon name="dots" size={18} color={c.sub} /></Pressable>}
    </Pressable>
      </Animated.View>
    </View>
  );
}

// A shelf that loads one search and paints cards, like the website's home sections.
function Shelf({ title, query, c, A, wide, rows, limit = 12, hideIfEmpty }) {
  const [items, setItems] = useState(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    setItems(null);
    searchCached(query).then((r) => { if (live) setItems(r); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [query, tries]);
  if (items && !items.length && hideIfEmpty) return null;
  return (
    <View style={{ marginTop: 22 }}>
      <Pressable disabled={!items || !items.length} onPress={() => A.open({ title, items })} style={s.sechead}>
        <Text style={[s.h2, { color: c.fg }]}>{title}</Text>
        {!!items && items.length > limit && <Text style={{ color: c.sub }}>{'הכל ‹'}</Text>}
      </Pressable>
      {!items && <ActivityIndicator color={RED} style={{ margin: 14 }} />}
      {!!items && !items.length && <Pressable onPress={() => setTries((n) => n + 1)}><Text style={{ color: c.sub, textAlign: 'right', marginHorizontal: 16 }}>{'לא זמין כרגע. בדוק חיבור לאינטרנט · לחץ לנסות שוב'}</Text></Pressable>}
      {!!items && !!items.length && (rows ? items.slice(0, 8).map((t) => (
        <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onMore={(p) => A.sheet(t, p)} onPress={() => A.play(t, items)} />
      )) : (
        <HScroll showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {items.slice(0, limit).map((t) => <Card key={t.id} t={t} c={c} wide={wide} onPress={() => A.play(t, items)} />)}
        </HScroll>
      ))}
    </View>
  );
}

function Hero({ title, kicker, desc, img, grad, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ width: 270, height: 320, marginLeft: 14, borderRadius: 16, overflow: 'hidden', backgroundColor: grad[0] }}>
      {!!img && <Image source={{ uri: img }} style={{ position: 'absolute', width: 270, height: 320 }} />}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, backgroundColor: 'rgba(0,0,0,0.38)' }} />
      <View style={{ padding: 14, flex: 1, justifyContent: 'space-between' }}>
        <Text numberOfLines={3} style={{ color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'right' }}>{title}</Text>
        <View>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'right' }}>{kicker}</Text>
          {!!desc && <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'right' }}>{desc}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

function Home({ c, A }) {
  const seeds = [];
  for (const t of A.history) { const a = t.artist.replace(/ - Topic$/i, ''); if (a && !seeds.includes(a)) seeds.push(a); if (seeds.length >= 6) break; }
  const mix = useMemo(() => [...A.history, ...(A.favs || [])].filter((t, i, l) => l.findIndex((x) => x.id === t.id) === i).sort(() => Math.random() - 0.5).slice(0, 12), [A.history.length, (A.favs || []).length]);
  const byArtist = (a) => A.history.find((t) => t.artist.replace(/ - Topic$/i, '') === a);
  return (
    <View>
      {!!seeds.length && (
        <View style={{ marginTop: 18 }}>
          <Text style={[s.h2, { color: c.fg, marginHorizontal: 16, textAlign: 'right' }]}>בחירות מובילות עבורך</Text>
          <HScroll showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10 }}>
            {seeds.map((a, i) => (
              <Hero key={a} title={'שירים של ' + a} kicker="במיוחד עבורך" desc={'עוד שירים של ' + a} grad={GRADS[i % GRADS.length]}
                img={byArtist(a) && byArtist(a).thumb} onPress={async () => { try { const ch = byArtist(a) && byArtist(a).ch; const r = (await searchCached(a)).filter((t) => norm(String(t.artist).replace(/ - Topic$/i, '')) === norm(a) && (!ch || !t.ch || t.ch === ch)); if (!r.length) { A.openArtist(a, ch); return; } const q = r.slice(); for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; } A.play(q[0], q); } catch (e) { A.openArtist(a); } }} />
            ))}
          </HScroll>
        </View>
      )}
      {A.history.length > 3 && (
        <View style={{ marginTop: 22 }}>
          <Text style={[s.h2, { color: c.fg, marginHorizontal: 16, textAlign: 'right' }]}>המיקס שלך</Text>
          <HScroll showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10 }}>
            {mix.map((t) => <Card key={t.id} t={t} c={c} onPress={() => A.play(t, mix)} />)}
          </HScroll>
        </View>
      )}
      <View style={{ marginTop: 22 }}>
        <Text style={[s.h2, { color: c.fg, marginHorizontal: 16, textAlign: 'right' }]}>הושמעו לאחרונה</Text>
        {A.history.length ? (
          <HScroll showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10 }}>
            {A.history.slice(0, 12).map((t) => <Card key={t.id} t={t} c={c} onPress={() => A.play(t, A.history)} />)}
          </HScroll>
        ) : <Text style={{ color: c.sub, textAlign: 'right', marginHorizontal: 16, marginTop: 8 }}>נגן משהו ונתחיל להכיר את הטעם שלך.</Text>}
      </View>
      <Text style={[s.h2, { color: c.fg, marginTop: 22, marginBottom: 8 }]}>אווירה ומצב רוח</Text>
      <MoodTiles c={c} A={A} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 18 }}>
        {ACTIVITIES.map((t) => <Topic key={t[0]} t={t} c={c} A={A} />)}
      </View>
      {!!seeds.length && <Shelf title="עוד מהאמנים שלך" query={seeds[0] + ' שירים'} c={c} A={A} />}
      {seeds.length > 1 && <Shelf title="עוד שירים בשבילך" query={seeds[1] + ' להיטים'} c={c} A={A} />}
      <Shelf title="השירים החדשים הטובים ביותר" query="שירים חדשים ישראל" c={c} A={A} rows />
      <Shelf title="מוזיקה חדשה" query="שירים פופולריים ישראל" c={c} A={A} />
      <Shelf title="כולם מקשיבים ל..." query="להיטים ישראלים" c={c} A={A} wide />
    </View>
  );
}

const ACTIVITIES = [
  ['בוקר טוב', 'להתעורר עם שיר', 'שירים לבוקר ישראל'], ['קפה של בוקר', 'רגוע ונעים', 'שירים לקפה של בוקר'],
  ['ריצה', 'קצב לריצה', 'שירים לריצה'], ['הליכה', 'קצב נוח', 'שירים להליכה'], ['מוטיבציה', 'להתחזק', 'שירי מוטיבציה ישראל'],
  ['עבודה', 'להתרכז', 'מוזיקה לעבודה'], ['לימודים', 'שקט ומרוכז', 'מוזיקה ללימודים'],
  ['נרגעים', 'להוריד הילוך', 'שירים להירגע'], ['מבשלים', 'מוזיקה למטבח', 'שירים לבישול'], ['ארוחת ערב', 'אווירה נעימה', 'שירים לארוחת ערב'], ['מארחים', 'לאורחים', 'שירים לאירוח'],
  ['עם חברים', 'שירים משותפים', 'שירים לחברים ישראל'], ['מתארגנים לצאת', 'לפני הערב', 'שירי מסיבה ישראל'],
  ['סוף שבוע', 'מצב שישי', 'שירים לסוף שבוע'], ['לילה מאוחר', 'שירי לילה', 'שירי לילה ישראל'], ['יום גשום', 'גשם בחוץ', 'שירים ליום גשום'], ['לב שבור', 'שירי פרידה', 'שירי פרידה ישראל'],
];
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
      <Text style={[s.h2, { color: c.fg, marginTop: 14, marginBottom: 8 }]}>אווירה ומצב רוח</Text>
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
  const mine = topArtists(A.stats).slice(0, 6);
  const playQ = async (q, mix) => { try { const r = await searchCached(q); if (r.length) { const l = [r[0], ...r.slice(1).sort(() => Math.random() - 0.5)]; A.play(l[0], l); } } catch (e) {} };
  const card = (title, sub, onPress, i) => (
    <Pressable key={title + i} onPress={onPress} style={{ height: 96, borderRadius: 14, marginHorizontal: 16, marginTop: 12, backgroundColor: GRADS[i % GRADS.length][0], justifyContent: 'flex-end', padding: 14 }}>
      <Text style={{ color: '#fff', opacity: 0.85, fontSize: 12, fontWeight: '700', textAlign: 'right' }}>{sub}</Text>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'right' }}>{title}</Text>
    </Pressable>
  );
  return (
    <View>
      {!!mine.length && <Text style={[s.h2, { color: c.fg, marginTop: 6 }]}>תחנות לפי ההאזנה שלך</Text>}
      {mine.slice(0, 3).map((n, i) => card(n, 'התחנה של ' + n, () => playQ(n + ' שירים'), i))}
      {(!!(A.favs || []).length || !!(A.history || []).length) && <Text style={[s.h2, { color: c.fg, marginTop: 18 }]}>תחנה אישית</Text>}
      {(!!(A.favs || []).length || !!(A.history || []).length) && card('הרדיו שלך', 'שירים שאתה אוהב ועוד כמוהם', () => { const base = (A.favs && A.favs.length ? A.favs : A.history).slice(0, 12); const l = base.sort(() => Math.random() - 0.5); if (l.length) A.play(l[0], l); }, 3)}
      <Text style={[s.h2, { color: c.fg, marginTop: 18 }]}>תחנות</Text>
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
  const [sec, setSec] = useState(null);
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const list = (sec === 'fav' ? A.favs : A.history) || [];
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
      {!sec ? (
        <View style={{ marginTop: 8 }}>
          {[['fav', 'שירים אהובים (' + (A.favs || []).length + ')'], ['hist', 'הושמע לאחרונה (' + (A.history || []).length + ')'], ['artists', 'אמנים (' + ((A.follows || {}).artists || []).length + ')'], ['albums', 'אלבומים (' + ((A.follows || {}).albums || []).length + ')'], ['stats', 'ההאזנה שלך · יום, שבוע, חודש והכול'], ['pls', 'ייבוא פלייליסט מיוטיוב'], ['pls', 'רשימות (' + (A.playlists || []).length + ')']].map(([k, n], i) => (
            <Pressable key={n} onPress={() => setSec(k)} style={{ flexDirection: 'row', direction: 'ltr', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#8884' }}>
              <Text style={{ color: c.sub, fontSize: 20 }}>‹</Text>
              <Text style={{ flex: 1, color: c.fg, fontSize: 16, textAlign: 'right' }}>{n}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Pressable onPress={() => setSec(null)} style={{ paddingHorizontal: 16, paddingVertical: 10 }}><Text style={{ color: RED, fontSize: 16, textAlign: 'right' }}>{'ספריה ›'}</Text></Pressable>
      )}
      {(sec === 'fav' || sec === 'hist') && !list.length && <Text style={{ color: c.sub, textAlign: 'center', marginTop: 40 }}>{sec === 'fav' ? 'עוד אין מועדפים. הקש על הלב ליד שיר.' : 'עוד לא הושמע כלום.'}</Text>}
      {(sec === 'fav' || sec === 'hist') && list.map((t) => <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onMore={(p) => A.sheet(t, p)} onPress={() => A.play(t, list)} />)}
      {sec === 'artists' && (((A.follows || {}).artists || []).length ? A.follows.artists.map((a) => (
        <Pressable key={a.ch || a.title} onPress={() => A.openArtist(a.title, a.ch)} style={s.row}>
          {a.thumb ? <Image source={{ uri: a.thumb }} style={[s.thumb, { borderRadius: 22 }]} /> : <View style={[s.thumb, { borderRadius: 22 }]} />}
          <Text style={{ flex: 1, marginHorizontal: 12, color: c.fg, fontSize: 16, fontWeight: '600', textAlign: 'right' }}>{a.title}</Text>
        </Pressable>)) : <Text style={{ color: c.sub, textAlign: 'center', marginTop: 40 }}>עוד לא עקבת אחרי אמנים. הקש על עקוב בדף אמן.</Text>)}
      {sec === 'albums' && (((A.follows || {}).albums || []).length ? A.follows.albums.map((a) => (
        <Pressable key={a.plId} onPress={() => A.openAlbum({ title: a.title, plId: a.plId, thumb: a.thumb, artistName: a.artist })} style={s.row}>
          {a.thumb ? <Image source={{ uri: a.thumb }} style={s.thumb} /> : <View style={s.thumb} />}
          <View style={{ flex: 1, marginHorizontal: 12 }}><Text numberOfLines={1} style={{ color: c.fg, fontWeight: '600', textAlign: 'right' }}>{a.title}</Text><Text numberOfLines={1} style={{ color: c.sub, textAlign: 'right' }}>{a.artist}</Text></View>
        </Pressable>)) : <Text style={{ color: c.sub, textAlign: 'center', marginTop: 40 }}>עוד לא שמרת אלבומים.</Text>)}
      {sec === 'pls' && (
        <View>
          <TextInput value={url} onChangeText={setUrl} onSubmitEditing={importPl} placeholder="הדבק קישור לפלייליסט ציבורי של יוטיוב" placeholderTextColor={c.sub}
            style={[s.input, { backgroundColor: c.card, color: c.fg, textAlign: 'right' }]} />
          <Pressable onPress={importPl} disabled={busy} style={{ backgroundColor: RED, borderRadius: 20, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'מייבא...' : 'ייבוא פלייליסט'}</Text>
          </Pressable>
          {!!msg && <Text style={{ color: c.sub, textAlign: 'center', margin: 10 }}>{msg}</Text>}
          <Pressable onPress={() => A.newPlaylist('פלייליסט חדש')} style={{ alignSelf: 'center', marginTop: 10 }}><Text style={{ color: RED, fontWeight: '700' }}>+ פלייליסט חדש</Text></Pressable>
          {A.playlists.map((p) => (
            <Pressable key={p.id} onPress={() => A.open({ title: p.name, items: p.tracks, pid: p.id })} style={s.row}>
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
          {(() => {
            const sc = stats.sec || {}; const days = sc.days || {};
            const today = new Date(); const key = (d) => d.toISOString().slice(0, 10);
            const wk = new Date(today); wk.setDate(wk.getDate() - 6);
            const sum = (f) => Object.entries(days).filter(([k]) => f(k)).reduce((a, [, v]) => a + v, 0);
            const mins = (v) => Math.round(v / 60) + ' דק׳';
            const allT = Object.values(sc.months || {}).reduce((a, v) => a + v, 0);
            const rows = [['היום', sum((k) => k === key(today))], ['7 ימים אחרונים', sum((k) => k >= key(wk))], ['החודש', (sc.months || {})[month] || 0], ['מאז ההתקנה', allT]];
            const songs = Object.values(sc.songs || {}).sort((a, b) => b.seconds - a.seconds).slice(0, 10);
            return (
              <View style={{ marginTop: 14 }}>
                <Text style={[s.h2, { color: c.fg, marginHorizontal: 0 }]}>זמן האזנה בפועל</Text>
                {rows.map(([n, v]) => (<View key={n} style={{ flexDirection: 'row', paddingVertical: 4 }}><Text style={{ color: c.fg, flex: 1, textAlign: 'right' }}>{n}</Text><Text style={{ color: c.sub }}>{mins(v)}</Text></View>))}
                <Text style={[s.h2, { color: c.fg, marginHorizontal: 0, marginTop: 14 }]}>השירים המושמעים ביותר</Text>
                {songs.map((x, i) => (<View key={x.id} style={{ flexDirection: 'row', paddingVertical: 4 }}><Text style={{ color: c.sub, width: 28, textAlign: 'right' }}>{i + 1}</Text><Text numberOfLines={1} style={{ color: c.fg, flex: 1, textAlign: 'right', marginHorizontal: 8 }}>{x.title}</Text><Text style={{ color: c.sub }}>{mins(x.seconds)}</Text></View>))}
              </View>
            );
          })()}
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
const GENRES = [['מוזיקה עברית', 'מוזיקה עברית להיטים'], ['מזרחית', 'מזרחית להיטים'], ['מוזיקה פופ - ים תיכונית', 'פופ ים תיכוני'], ['מוזיקה יהודית', 'מוזיקה יהודית'], ['הופעות', 'הופעה חיה'], ['מוזיקה ערבית אמיתית', 'מוזיקה ערבית'], ['מוזיקה ערבית ישראלית', 'ערבית ישראלית'], ['מוזיקה חדשה', 'שירים חדשים']];
const topArtists = (st) => Object.entries((st && st.artists) || {}).sort((x, y) => y[1] - x[1]).map((e) => e[0]);
function SearchTab({ c, A }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pill, setPill] = useState('all');
  const [recent, setRecent] = useState([]);
  const [albums, setAlbums] = useState(null);
  const [done, setDone] = useState('');
  useEffect(() => { store.get('recent', []).then(setRecent); }, []);
  const go = async (text) => {
    const x = String(text !== undefined ? text : q).trim(); if (!x) return;
    setQ(x); setBusy(true); setErr(''); setAlbums(null); setDone(x);
    setRecent((r) => { const n = [x, ...r.filter((y) => y !== x)].slice(0, 8); store.set('recent', n); return n; });
    try { const r = await searchCached(x); setRes(r); if (!r.length) setErr('לא נמצאו תוצאות'); } catch (e) { setErr('החיפוש נכשל, נסה שוב'); }
    setBusy(false);
  };
  useEffect(() => {
    if (pill !== 'albums' || !res.length || albums) return;
    const ch = (res.find((t) => t.ch) || {}).ch;
    if (!ch) { setAlbums([]); return; }
    wjson('/music-artist/' + ch).then((j) => setAlbums((j.releases || []).filter((r) => r.plId))).catch(() => setAlbums([]));
  }, [pill, res]);
  const artists = [];
  const seen = new Set();
  for (const t of res) { const k = t.ch || norm(t.artist); if (!seen.has(k)) { seen.add(k); artists.push(t); } }
  return (
    <View>
      <TextInput value={q} onChangeText={setQ} onSubmitEditing={() => go()} returnKeyType="search" placeholder="חפש שירים, אמנים..." placeholderTextColor={c.sub}
        style={[s.input, { backgroundColor: c.card, color: c.fg, textAlign: 'right' }]} />
      {!done && (
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {GENRES.map(([n, qq], i) => (
              <Pressable key={n} onPress={async () => { try { const r = await searchCached(qq); A.open({ title: n, items: r }); } catch (e) {} }}
                style={{ width: '48.5%', height: 76, borderRadius: 12, marginBottom: 10, backgroundColor: GRADS[i % GRADS.length][0], justifyContent: 'flex-end', padding: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, textAlign: 'right' }}>{n}</Text>
              </Pressable>
            ))}
          </View>
          {!!(A.history || []).length && <Text style={[s.h2, { color: c.fg, marginHorizontal: 0, marginTop: 8 }]}>הושמעו לאחרונה</Text>}
          {(A.history || []).slice(0, 3).map((t) => <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onMore={(pt) => A.sheet(t, pt)} onPress={() => A.play(t, A.history)} />)}
          {!!topArtists(A.stats).length && <Text style={[s.h2, { color: c.fg, marginHorizontal: 0, marginTop: 14 }]}>אמנים שהאזנת להם</Text>}
          {topArtists(A.stats).slice(0, 8).map((n) => (
            <Pressable key={n} onPress={() => go(n)} style={{ paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#8884' }}>
              <Text style={{ color: c.fg, fontSize: 16, textAlign: 'right' }}>{n}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {!done && !!recent.length && (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={[s.h2, { color: c.fg, marginHorizontal: 0, marginBottom: 8 }]}>חיפושים אחרונים</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {recent.map((r) => (
              <Pressable key={r} onPress={() => go(r)} style={{ backgroundColor: c.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginLeft: 8, marginBottom: 8 }}>
                <Text style={{ color: c.fg }}>{r}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {!!done && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 6 }}>
          {[['all', 'תוצאות מובילות'], ['songs', 'שירים'], ['artists', 'אמנים'], ['albums', 'אלבומים']].map(([k, n]) => (
            <Pressable key={k} onPress={() => setPill(k)} style={{ paddingVertical: 5, paddingHorizontal: 14, borderRadius: 16, marginLeft: 8, backgroundColor: pill === k ? RED : c.card }}>
              <Text style={{ color: pill === k ? '#fff' : c.fg, fontWeight: '600' }}>{n}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {busy && <ActivityIndicator color={RED} style={{ margin: 6 }} />}
      {!!err && <Text style={{ color: c.sub, textAlign: 'center', margin: 8 }}>{err}</Text>}
      {(pill === 'all' || pill === 'artists') && !!res.length && (
        <View>
          {pill === 'all' && <Text style={[s.h2, { color: c.fg, marginVertical: 8 }]}>אמנים</Text>}
          {artists.slice(0, pill === 'all' ? 3 : 20).map((t) => (
            <Pressable key={t.ch || t.artist} onPress={() => A.openArtist(t.artist, t.ch)} style={s.row}>
              {t.thumb ? <Image source={{ uri: t.thumb }} style={{ width: 52, height: 52, borderRadius: 26 }} /> : <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.card }} />}
              <Text style={{ color: c.fg, fontWeight: '600', flex: 1, marginHorizontal: 12, textAlign: 'right' }}>{String(t.artist).replace(/ - Topic$/i, '')}</Text>
              <Text style={{ color: c.sub }}>{'‹'}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {pill === 'albums' && (
        <View>
          {!albums && <ActivityIndicator color={RED} style={{ margin: 14 }} />}
          {!!albums && !albums.length && <Text style={{ color: c.sub, textAlign: 'center', margin: 14 }}>לא נמצאו אלבומים</Text>}
          {!!albums && albums.map((al) => (
            <Pressable key={al.plId} onPress={() => A.openAlbum(al)} style={s.row}>
              {al.thumb ? <Image source={{ uri: al.thumb }} style={s.thumb} /> : <View style={s.thumb} />}
              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <Text numberOfLines={1} style={{ color: c.fg, fontWeight: '600', textAlign: 'right' }}>{al.title}</Text>
                <Text style={{ color: c.sub, textAlign: 'right' }}>{al.releaseYear || ''}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {(pill === 'all' || pill === 'songs') && (pill === 'all' && !!res.length ? <Text style={[s.h2, { color: c.fg, marginVertical: 8 }]}>שירים</Text> : null)}
      {(pill === 'all' || pill === 'songs') && res.map((t) => <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onMore={(p) => A.sheet(t, p)} onPress={() => A.play(t, res)} />)}
    </View>
  );
}
function ListPage({ c, A, page }) {
  const pl = page.pid ? A.playlists.find((p) => p.id === page.pid) : null;
  const items = pl ? pl.tracks : page.items;
  const [nm, setNm] = useState(page.title);
  const circ = { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(120,120,128,0.28)', alignItems: 'center', justifyContent: 'center' };
  const pill = { flex: 1, height: 44, borderRadius: 12, backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' };
  const doShuffle = () => { if (!tracks || !tracks.length) return; const l = tracks.slice(); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } A.play(l[0], l); };
  return (
    <View style={{ maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-start', padding: 14 }}>
        <Pressable onPress={A.back} style={circ}><Text style={{ color: c.fg, fontSize: 18 }}>{'→'}</Text></Pressable>
      </View>
      <View style={{ alignItems: 'center', paddingHorizontal: 16 }}>
        {page.thumb ? <Image source={{ uri: page.thumb }} style={{ width: wideScreenX() ? 268 : 280, height: wideScreenX() ? 268 : 280, borderRadius: 12, backgroundColor: c.card }} /> : null}
        <Text style={{ color: c.fg, fontSize: 22, fontWeight: '800', marginTop: 16, textAlign: 'center' }}>{page.title}</Text>
        {!!page.artist && <Pressable onPress={() => A.openArtist(page.artist)}><Text style={{ color: RED, fontSize: 16, fontWeight: '700', marginTop: 4 }}>{page.artist}</Text></Pressable>}
        {!!tracks && !!tracks.length && <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>{tracks.length + ' שירים'}</Text>}
        <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: 18, marginBottom: 8 }}>
          <Pressable disabled={!tracks || !tracks.length} onPress={() => A.play(tracks[0], tracks)} style={[pill, { marginRight: 5 }]}><Icon name="play" size={16} color={RED} /><Text style={{ color: RED, fontWeight: '700', fontSize: 16, marginHorizontal: 8 }}>{'נגן'}</Text></Pressable>
          <Pressable disabled={!tracks || !tracks.length} onPress={doShuffle} style={[pill, { marginLeft: 5 }]}><Icon name="shuffle" size={16} color={RED} /><Text style={{ color: RED, fontWeight: '700', fontSize: 16, marginHorizontal: 8 }}>{'ערבוב'}</Text></Pressable>
        </View>
        {(() => { const fo = { title: page.title, plId: page.plId, thumb: page.thumb, artist: page.artist }; const on = (A.follows.albums || []).some((x) => x.plId === fo.plId); return (
          <Pressable onPress={() => A.toggleFollow('albums', fo)} style={{ paddingVertical: 4 }}><Text style={{ color: on ? RED : c.sub, fontWeight: '700', fontSize: 13 }}>{on ? 'נשמר בספריה ✓' : '+ שמור בספריה'}</Text></Pressable>); })()}
      </View>
      {!tracks && <ActivityIndicator color={RED} style={{ margin: 14 }} />}
      {!!err && <Text style={{ color: c.sub, textAlign: 'center', margin: 14 }}>{err}</Text>}
      {!!tracks && tracks.map((t, i) => <Row key={t.id} t={t} num={i + 1} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onMore={(p) => A.sheet(t, p)} onPress={() => A.play(t, tracks)} />)}
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
  const modes = state.lines ? [['sync', 'מתואם'], ['karaoke', 'קריוקי'], ['plain', 'מילים רגילות']] : [];
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
      <Text style={{ color: c.sub, fontSize: 12, textAlign: 'center', marginBottom: 6 }}>{(m === 'sync' ? 'מילים מתואמות' : m === 'karaoke' ? 'קריוקי' : 'גלילה עצמאית') + ' · LRCLIB'}</Text>
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
    <HScroll showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
      {MOODS.map((m, i) => (
        <Pressable key={m.name} onPress={() => A.open({ kind: 'mood', mood: m, color: MOOD_COLORS[i % MOOD_COLORS.length], title: m.name })}
          style={{ width: 150, height: 110, borderRadius: 12, marginLeft: 12, padding: 12, justifyContent: 'flex-end', backgroundColor: MOOD_COLORS[i % MOOD_COLORS.length] }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'right' }}>{m.name}</Text>
          <Text numberOfLines={1} style={{ color: '#fff', opacity: 0.85, fontSize: 12, textAlign: 'right' }}>{m.desc}</Text>
        </Pressable>
      ))}
    </HScroll>
  );
}
function MoodPage({ c, A, page }) {
  const [tracks, setTracks] = useState(null);
  useEffect(() => { let live = true; resolveMood(page.mood).then((r) => live && setTracks(r)).catch(() => live && setTracks([])); return () => { live = false; }; }, [page.title]);
  const [albums, setAlbums] = useState([]);
  useEffect(() => {
    if (!tracks || !tracks.length) return;
    let live = true;
    const chs = [];
    for (const t of tracks) if (t.ch && !chs.includes(t.ch)) chs.push(t.ch);
    Promise.all(chs.slice(0, 4).map((ch) => wjson('/music-artist/' + ch).then((j) => (j.releases || []).filter((r) => r.plId).slice(0, 4)).catch(() => [])))
      .then((all) => { if (live) { const seen = new Set(); setAlbums(all.flat().filter((a) => !seen.has(a.plId) && seen.add(a.plId)).slice(0, 12)); } });
    return () => { live = false; };
  }, [tracks]);
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
      <HScroll showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {artists.map((n) => (
          <Pressable key={n} onPress={() => A.openArtist(n)} style={{ width: 96, alignItems: 'center', marginLeft: 12 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{(() => { const m = tracks && tracks.find((t) => String(t.artist || '').includes(n)); return m && m.thumb ? <Image source={{ uri: m.thumb }} style={{ width: 80, height: 80 }} /> : <Text style={{ color: RED, fontSize: 28, fontWeight: '800' }}>{n.slice(0, 1)}</Text>; })()}</View>
            <Text numberOfLines={1} style={{ color: c.fg, marginTop: 6 }}>{n}</Text>
          </Pressable>
        ))}
      </HScroll>
      {!!albums.length && (
        <View>
          <Text style={[s.h2, { color: c.fg, marginTop: 22, marginBottom: 6 }]}>אלבומים מומלצים</Text>
          <HScroll showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {albums.map((al) => <Card key={al.plId} t={{ title: al.title, thumb: al.thumb, artist: al.releaseYear || '' }} c={c} onPress={() => A.openAlbum(al)} />)}
          </HScroll>
        </View>
      )}
      <Text style={[s.h2, { color: c.fg, marginTop: 22, marginBottom: 6 }]}>שירים</Text>
      {!tracks && <ActivityIndicator color={RED} style={{ margin: 14 }} />}
      {!!tracks && !tracks.length && <Text style={{ color: c.sub, textAlign: 'center', margin: 14 }}>לא נמצאו שירים מאומתים כרגע. נסה שוב בעוד רגע.</Text>}
      {!!tracks && tracks.map((t) => <Row key={t.id} t={t} c={c} active={A.cur && A.cur.id === t.id} fav={A.isFav(t)} onFav={() => A.toggleFav(t)} onMore={(p) => A.sheet(t, p)} onPress={() => A.play(t, tracks)} />)}
    </View>
  );
}

function AppInner() {
  const system = useColorScheme();
  const { width, height } = useWindowDimensions();
  const wideScreen = width >= 900;
  const [override, setOverride] = useState(null);
  const dark = (override || system) === 'dark';
  const c = dark
    ? { bg: '#111114', fg: '#fff', sub: 'rgba(235,235,245,0.6)', card: '#252529', card2: '#303035', line: 'rgba(255,255,255,0.13)', side: '#1a1a1e' }
    : { bg: '#ffffff', fg: '#000', sub: 'rgba(60,60,67,0.6)', card: '#f2f2f4', card2: '#e9e9eb', line: 'rgba(0,0,0,0.08)', side: '#fafafa' };

  const [upd, setUpd] = useState(null);
  useEffect(() => {
    const pre = Platform.OS === 'windows' ? 'win-' : Platform.OS === 'android' ? 'app-' : Platform.OS === 'ios' ? 'ios-' : null;
    const mine = parseInt(BUILD, 10);
    if (!pre || !mine) return;
    fetch('https://api.github.com/repos/avrahamyona/avi-music-app/releases?per_page=30')
      .then((r) => r.json())
      .then((list) => {
        let best = null;
        for (const rel of list || []) {
          if (!rel.tag_name || rel.tag_name.indexOf(pre) !== 0) continue;
          const n = parseInt(rel.tag_name.slice(pre.length), 10);
          const asset = (rel.assets || []).find((x) => /\.(apk|exe|ipa)$/i.test(x.name));
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
  const [tint, setTint] = useState(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !cur || !cur.thumb) { setTint(null); return; }
    let live = true;
    try {
      const im = new window.Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => {
        try {
          const cv = document.createElement('canvas'); cv.width = cv.height = 24;
          const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, 24, 24);
          const d = cx.getImageData(0, 0, 24, 24).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
          if (live && n) setTint([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
        } catch (e) { if (live) setTint(null); }
      };
      im.onerror = () => { if (live) setTint(null); };
      im.src = cur.thumb;
    } catch (e) {}
    return () => { live = false; };
  }, [cur && cur.id]);
  const [status, setStatus] = useState('');
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [full, setFull] = useState(false);
  const [showLyr, setShowLyr] = useState(false);
  const [showQ, setShowQ] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');
  const [sheet, setSheet] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [follows, setFollows] = useState({ artists: [], albums: [] });
  const swp = useRef(null);
  const [pick, setPick] = useState(null);
  const shuffleRef = useRef(false);
  const repeatRef = useRef('off');
  shuffleRef.current = shuffle;
  repeatRef.current = repeat;
  const [history, setHistory] = useState([]);
  const [favs, setFavs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [stats, setStats] = useState({});
  const gen = useRef(0);
  const barW = useRef(1);
  const volW = useRef(1);
  const [vol, setVol] = useState(1);
  const setVolume = (e) => { const v = Math.max(0, Math.min(1, e.nativeEvent.locationX / volW.current)); setVol(v); player.setVolume && player.setVolume(v); };
  const queueRef = useRef([]);
  const autoBusy = useRef(false);
  const curRef = useRef(null);
  const playRef = useRef(null);
  queueRef.current = queue;
  curRef.current = cur;

  useEffect(() => {
    store.get('history', []).then(setHistory);
    store.get('favs', []).then(setFavs);
    store.get('playlists', []).then(setPlaylists);
    store.get('follows', { artists: [], albums: [] }).then((f) => setFollows({ artists: f.artists || [], albums: f.albums || [] }));
    store.get('stats', {}).then(setStats);
    player.init().catch(() => {});
    const off = player.on((st) => {
      if (st.playing !== undefined) setPlaying(st.playing);
      if (st.pos !== undefined) { setPos(st.pos); setDur(st.dur || 0); }
      if (st.ended) go(1, true);
    });
    const o1 = bus.on('next', () => go(1));
    const o2 = bus.on('prev', () => go(-1));
    player.setHandlers({ next: () => go(1), prev: () => go(-1) });
    return () => { off(); o1(); o2(); };
  }, []);

  // Listened time: counted only while audio is actually playing (like the website's monthly stats).
  useEffect(() => {
    const iv = setInterval(() => {
      if (!playingRef.current || !curRef.current) return;
      const t = curRef.current;
      const d = new Date(); const mo = d.toISOString().slice(0, 7); const day = d.toISOString().slice(0, 10);
      setStats((st) => {
        const sec = { ...(st.sec || {}) };
        sec.months = { ...(sec.months || {}), [mo]: ((sec.months || {})[mo] || 0) + 5 };
        sec.days = { ...(sec.days || {}), [day]: ((sec.days || {})[day] || 0) + 5 };
        const sg = { ...(sec.songs || {}) }; const o = sg[t.id] || { id: t.id, title: t.title, artist: t.artist, seconds: 0 };
        sg[t.id] = { ...o, seconds: o.seconds + 5 }; sec.songs = sg;
        const n = { ...st, sec }; store.set('stats', n); return n;
      });
    }, 5000);
    return () => clearInterval(iv);
  }, []);
  const posRef = useRef(0);
  const durRef = useRef(0);
  const playingRef = useRef(false);
  posRef.current = pos; durRef.current = dur; playingRef.current = playing;
  const holdRef = useRef(null);
  const finishHold = (commit) => {
    const h = holdRef.current;
    if (!h) return;
    holdRef.current = null;
    clearTimeout(h.delay); clearInterval(h.interval);
    if (h.long) { player.seek(h.cur); if (h.wasPlaying) player.toggle(); }
    else if (commit) h.tap();
  };
  // Tap = normal action. Hold 200 ms = scrub (8x, then 16x after 2 s), release resumes.
  const hold = (dir, tap) => ({
    onPressIn: () => {
      finishHold(false);
      const h = { dir, tap, long: false };
      holdRef.current = h;
      h.delay = setTimeout(() => {
        if (holdRef.current !== h) return;
        h.long = true; h.start = posRef.current; h.cur = h.start; h.wasPlaying = playingRef.current; h.at = Date.now();
        if (h.wasPlaying) player.toggle();
        h.interval = setInterval(() => {
          const el = (Date.now() - h.at) / 1000;
          const d = Math.min(el, 2) * 8 + Math.max(0, el - 2) * 16;
          h.cur = Math.max(0, Math.min(durRef.current || 1e9, h.start + dir * d));
          player.seek(h.cur); setPos(h.cur);
        }, 120);
      }, 200);
    },
    onPressOut: () => finishHold(true),
  });
  const go = (d, auto) => {
    if (d < 0 && !auto && posRef.current >= 3 && curRef.current) { player.seek(0); setPos(0); return; }
    const list = queueRef.current;
    const cc = curRef.current;
    const i = cc ? list.findIndex((t) => t.id === cc.id) : -1;
    if (i < 0) return;
    if (auto && repeatRef.current === 'one') { playRef.current(cc); return; }
    if (shuffleRef.current && d > 0 && list.length > 1) {
      let k = i;
      while (k === i) k = Math.floor(Math.random() * list.length);
      playRef.current(list[k]); return;
    }
    let n = list[i + d];
    if (!n && repeatRef.current === 'all' && d > 0) n = list[0];
    if (n) { playRef.current(n); return; }
    if (auto && d > 0 && !autoBusy.current) {
      autoBusy.current = true;
      const an = String(cc.artist || '').replace(/ - Topic$/i, '');
      searchTracks(an + ' songs').then((r) => {
        const seen = new Set(queueRef.current.map((x) => x.id));
        const more = clean(r).filter((x) => !seen.has(x.id)).slice(0, 15);
        if (more.length) { const nq = [...queueRef.current, ...more]; setQueue(nq); queueRef.current = nq; playRef.current(more[0]); }
      }).catch(() => {}).finally(() => { autoBusy.current = false; });
    }
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
  const toggleFollow = (kind, o) => setFollows((f) => {
    const key = kind === 'artists' ? (x) => (x.ch || x.title) === (o.ch || o.title) : (x) => x.plId === o.plId;
    const has = f[kind].some(key);
    const n = { ...f, [kind]: has ? f[kind].filter((x) => !key(x)) : [o, ...f[kind]] };
    store.set('follows', n); return n;
  });
  const addPlaylist = (p) => setPlaylists((x) => { const n = [p, ...x.filter((y) => y.id !== p.id)]; store.set('playlists', n); return n; });
  const removePlaylist = (id) => setPlaylists((x) => { const n = x.filter((y) => y.id !== id); store.set('playlists', n); return n; });
  const queueNext = (t) => setQueue((q) => { const cc = curRef.current; const base = q.filter((x) => x.id !== t.id); const i = cc ? base.findIndex((x) => x.id === cc.id) : -1; base.splice(i + 1, 0, t); queueRef.current = base; return base; });
  swipeQueue = (t) => { if (!curRef.current) return; queueNext(t); };
  const moveQ = (id, d) => setQueue((q) => { const i = q.findIndex((x) => x.id === id); const j = i + d; if (i < 0 || j < 0 || j >= q.length) return q; const n = [...q]; const tmp = n[i]; n[i] = n[j]; n[j] = tmp; queueRef.current = n; return n; });
  const queueLast = (t) => setQueue((q) => { const n = [...q.filter((x) => x.id !== t.id), t]; queueRef.current = n; return n; });
  const addToPlaylist = (pid, t) => setPlaylists((x) => { const n = x.map((p) => (p.id === pid && !p.tracks.some((y) => y.id === t.id) ? { ...p, tracks: [...p.tracks, t] } : p)); store.set('playlists', n); return n; });
  const newPlaylist = (name, t) => setPlaylists((x) => { const p = { id: 'u' + Date.now(), name: name || 'פלייליסט חדש', tracks: t ? [t] : [], mine: true }; const n = [p, ...x]; store.set('playlists', n); return n; });
  const renamePlaylist = (id, name) => setPlaylists((x) => { const n = x.map((p) => (p.id === id ? { ...p, name } : p)); store.set('playlists', n); return n; });
  const station = async (t) => {
    try {
      const r = await searchCached(String(t.artist).replace(/ - Topic$/i, ''));
      const list = [t, ...r.filter((x) => x.id !== t.id).sort(() => Math.random() - 0.5)];
      play(t, list);
    } catch (e) {}
  };
  const share = (t) => { try { Share.share({ message: t.title + ' - ' + t.artist + ' https://youtu.be/' + t.id }); } catch (e) {} };
  const open = (p) => setPages((x) => [...x, p]);
  const back = () => setPages((x) => x.slice(0, -1));
  const openArtist = (name, ch) => open({ kind: 'artist', title: String(name).replace(/ - Topic$/i, ''), ch: ch || '' });
  const openAlbum = (al) => open({ kind: 'album', title: al.title, plId: al.plId, thumb: al.thumb, artist: al.artistName || '' });
  const A = { share, follows, toggleFollow, sheet: (t, p) => { setAnchor(p || null); setSheet(t); }, cur, play, isFav, toggleFav, open, back, openArtist, openAlbum, history, favs, playlists, stats, addPlaylist, removePlaylist, newPlaylist, renamePlaylist };

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
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 110, alignItems: 'center' }}>
      <View onTouchStart={(e) => { swp.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; }} onTouchEnd={(e) => { const a = swp.current; swp.current = null; if (!a || !page || wideScreen) return; const dx = e.nativeEvent.pageX - a.x, dy = Math.abs(e.nativeEvent.pageY - a.y); if (a.x >= width - 28 && -dx > 70 && -dx > dy * 2 || a.x <= 28 && dx > 70 && dx > dy * 2) back(); }} style={{ width: '100%', maxWidth: wideScreen ? 940 : undefined }}>
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
      </View>
    </ScrollView>
  );

  const ctl = (big) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', direction: 'ltr' }}>
      <Pressable {...hold(-1, () => go(-1))} style={s.skip}><Icon name="prev" size={big ? 34 : 22} color={c.fg} /></Pressable>
      <Pressable onPress={() => player.toggle()} style={[s.play, big && { width: 64, height: 64, borderRadius: 32 }]}><Icon name={playing ? 'pause' : 'play'} size={big ? 34 : 24} color="#fff" /></Pressable>
      <Pressable {...hold(1, () => go(1))} style={s.skip}><Icon name="next" size={big ? 34 : 22} color={c.fg} /></Pressable>
    </View>
  );
  const bar = (
    <View style={{ direction: 'ltr' }}>
      <Pressable onPress={seek} style={{ height: 18, justifyContent: 'center' }} onLayout={(e) => { barW.current = e.nativeEvent.layout.width || 1; }}>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden' }}>
          <View style={{ height: 5, backgroundColor: c.fg, width: (dur ? Math.min(100, (pos / dur) * 100) : 0) + '%' }} />
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', direction: 'ltr', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ color: c.sub, fontSize: 11.5 }}>{fmt(pos)}</Text>
        <Text style={{ color: c.sub, fontSize: 11.5 }}>{'-' + fmt(Math.max(0, (dur || 0) - pos))}</Text>
      </View>
    </View>
  );
  const mini = cur && (
    <View style={{ position: 'absolute', bottom: wideScreen ? 18 : 78, alignSelf: 'center', width: wideScreen ? 520 : '94%', borderRadius: 14, backgroundColor: c.card, ...(Platform.OS === 'web' ? { backgroundColor: tintBg(tint, dark, 0.78) || (dark ? 'rgba(37,37,41,0.62)' : 'rgba(242,242,244,0.62)'), backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)' } : null), borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
      <Pressable onPress={() => setFull(true)} style={{ flexDirection: 'row', alignItems: 'center' }}>
        {cur.thumb ? <Image source={{ uri: cur.thumb }} style={{ width: 44, height: 44, borderRadius: 6 }} /> : <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: c.card2 }} />}
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text numberOfLines={1} style={{ color: c.fg, fontWeight: '600', textAlign: 'right' }}>{cur.title}</Text>
          <Text numberOfLines={1} style={{ color: c.sub, fontSize: 13, textAlign: 'right' }}>{status || cur.artist}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', direction: 'ltr' }}>
          <Pressable onPress={() => setSheet(cur)} style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="dots" size={22} color={c.fg} /></Pressable>
          <Pressable {...hold(1, () => go(1))} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="next" size={22} color={c.fg} /></Pressable>
          <Pressable onPress={() => player.toggle()} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name={playing ? 'pause' : 'play'} size={24} color={c.fg} /></Pressable>
        </View>
      </Pressable>
    </View>
  );

  const fullView = full && cur && (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: wideScreen ? 'rgba(0,0,0,0.55)' : c.bg, alignItems: 'center', justifyContent: 'center' }}>
      {wideScreen && <Pressable onPress={() => setFull(false)} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />}
      <View style={{ width: wideScreen ? 500 : '100%', height: '100%', maxHeight: wideScreen ? 655 : '100%', backgroundColor: (Platform.OS === 'web' && tintBg(tint, dark, 1)) || c.bg, borderRadius: wideScreen ? 24 : 0, borderWidth: wideScreen ? 1 : 0, borderColor: c.line, padding: 20, paddingTop: Platform.OS === 'web' || Platform.OS === 'windows' || wideScreen ? 20 : 48 }}>
      <Pressable onPress={() => setFull(false)} style={{ height: 41, alignSelf: 'center', width: 70, alignItems: 'center', justifyContent: 'center' }}><Icon name="chevdown" size={26} color={c.sub} /></Pressable>
      {!wideScreen && <Text style={{ position: 'absolute', top: 10, right: 12, color: c.sub, fontSize: 10 }}>{'v' + BUILD + ' · ' + (status || (playing ? 'מנגן' : 'מושהה'))}</Text>}
      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingHorizontal: wideScreen ? 13 : 0 }}>
        <View style={{ height: wideScreen ? 257 : Math.min(448, height * 0.53), alignItems: 'center', justifyContent: 'center' }}>
          {cur.thumb ? <PlayerArt uri={cur.thumb} playing={playing} wide={wideScreen} size={wideScreen ? 257 : Math.min(width - 64, height * 0.42)} /> : null}
        </View>
        <View style={{ flexDirection: 'row', direction: 'ltr', alignItems: 'center', width: '100%', maxWidth: 434, marginTop: 14 }}>
          <Pressable onPress={() => setSheet(cur)} style={{ width: 37, height: 37, alignItems: 'center', justifyContent: 'center' }}><Icon name="dots" size={22} color={c.fg} /></Pressable>
          <Pressable onPress={() => toggleFav(cur)} style={{ width: 37, height: 37, alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}><Icon name={isFav(cur) ? 'heartfill' : 'heart'} size={22} color={isFav(cur) ? RED : c.fg} /></Pressable>
          <View style={{ flex: 1, direction: 'rtl', marginLeft: 12 }}>
            <Text numberOfLines={1} style={{ color: c.fg, fontSize: 19, fontWeight: '700', textAlign: 'right' }}>{cur.title}</Text>
            <Pressable onPress={() => { setFull(false); openArtist(cur.artist, cur.ch); }}><Text numberOfLines={1} style={{ color: RED, fontSize: 16, textAlign: 'right' }}>{cur.artist}</Text></Pressable>
          </View>
        </View>
        <View style={{ width: '100%', maxWidth: 434, marginTop: 22 }}>{bar}</View>
        <View style={{ flexDirection: 'row', direction: 'ltr', alignItems: 'center', justifyContent: wideScreen ? 'space-between' : 'space-evenly', width: '100%', maxWidth: 434, marginTop: wideScreen ? 24 : 30 }}>
          {wideScreen ? <Pressable onPress={() => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))} style={{ width: 35, height: 35, alignItems: 'center', justifyContent: 'center' }}><View><Icon name="repeat" size={20} color={repeat === 'off' ? c.fg : RED} />{repeat === 'one' && <Text style={{ position: 'absolute', right: -2, top: -2, color: RED, fontSize: 9, fontWeight: '800' }}>1</Text>}</View></Pressable> : null}
          <Pressable {...hold(-1, () => go(-1))} style={{ width: 58, height: 64, alignItems: 'center', justifyContent: 'center' }}><Icon name="rw" size={36} color={c.fg} /></Pressable>
          <Pressable onPress={() => player.toggle()} style={{ width: 68, height: 68, alignItems: 'center', justifyContent: 'center' }}><Icon name={playing ? 'pause' : 'play'} size={48} color={c.fg} /></Pressable>
          <Pressable {...hold(1, () => go(1))} style={{ width: 58, height: 64, alignItems: 'center', justifyContent: 'center' }}><Icon name="ff" size={36} color={c.fg} /></Pressable>
          {wideScreen ? <Pressable onPress={() => setShuffle((v) => !v)} style={{ width: 35, height: 35, alignItems: 'center', justifyContent: 'center' }}><Icon name="shuffle" size={20} color={shuffle ? RED : c.fg} /></Pressable> : null}
        </View>
        <View style={{ display: wideScreen ? 'flex' : 'none', flexDirection: 'row', direction: 'ltr', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
          <Pressable {...hold(1, () => player.seek(Math.min(durRef.current || posRef.current + 10, posRef.current + 10)))} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginHorizontal: 30 }}><Icon name="fwd10" size={22} color={c.fg} /></Pressable>
          <Pressable {...hold(-1, () => player.seek(Math.max(0, posRef.current - 10)))} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginHorizontal: 30 }}><Icon name="back10" size={22} color={c.fg} /></Pressable>
        </View>
        {wideScreen ? <Text style={{ color: c.sub, fontSize: 11, marginTop: 8, textAlign: 'center' }}>{'v' + BUILD + ' · ' + (status || (playing ? 'מנגן' : 'מושהה'))}</Text> : null}
        <View style={{ flexDirection: 'row', direction: 'ltr', alignItems: 'center', width: '100%', maxWidth: 434, marginTop: 16 }}>
          <Icon name="vol0" size={16} color={c.sub} />
          <Pressable onPress={setVolume} style={{ flex: 1, height: 28, justifyContent: 'center', marginHorizontal: 12 }} onLayout={(e) => { volW.current = e.nativeEvent.layout.width || 1; }}>
            <View style={{ height: 7, borderRadius: 4, backgroundColor: c.line }}><View style={{ height: 7, borderRadius: 4, backgroundColor: c.fg, width: Math.round(vol * 100) + '%' }} /></View>
          </Pressable>
          <Icon name="vol1" size={16} color={c.sub} />
        </View>
        <View style={{ flexDirection: 'row', direction: 'ltr', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 434, marginTop: 14, paddingHorizontal: 8 }}>
          <Pressable onPress={() => setShowLyr((v) => !v)} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}><Icon name="lyrics" size={24} color={showLyr ? RED : c.fg} /></Pressable>
          {wideScreen ? <Pressable onPress={() => share(cur)} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}><Icon name="share" size={24} color={c.fg} /></Pressable> : null}
          <Pressable onPress={() => setShowQ((v) => !v)} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}><Icon name="queue" size={24} color={showQ ? RED : c.fg} /></Pressable>
        </View>
        {showLyr && <View style={{ width: '100%', maxWidth: 520 }}><Lyrics c={c} cur={cur} pos={pos} dur={dur} />
          {wideScreen && <View style={{ flexDirection: 'row', direction: 'ltr', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, marginTop: 6, borderTopWidth: 1, borderTopColor: c.line }}>
            <Pressable onPress={() => go(-1)} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginHorizontal: 9 }}><Icon name="prev" size={19} color={c.fg} /></Pressable>
            <Pressable onPress={() => player.toggle()} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginHorizontal: 9 }}><Icon name={playing ? 'pause' : 'play'} size={19} color={c.fg} /></Pressable>
            <Pressable onPress={() => go(1)} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginHorizontal: 9 }}><Icon name="next" size={19} color={c.fg} /></Pressable>
          </View>}
        </View>}
        {showQ && <View style={{ flexDirection: 'row', direction: 'ltr', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 12 }}><Pressable onPress={() => setShuffle((v) => !v)} style={{ padding: 8 }}><Icon name="shuffle" size={20} color={shuffle ? RED : c.fg} /></Pressable><Pressable onPress={() => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))} style={{ padding: 8 }}><Icon name="repeat" size={20} color={repeat === 'off' ? c.fg : RED} /></Pressable><Text style={[s.h2, { color: c.fg, flex: 1, textAlign: 'right' }]}>הבא בתור</Text></View>}
        {showQ && <View style={{ width: '100%' }}>
          {queue.slice(Math.max(0, queue.findIndex((t) => t.id === cur.id) + 1), 40).map((t) => <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Row t={t} c={c} active={false} fav={isFav(t)} onFav={() => toggleFav(t)} onMore={() => setSheet(t)} onPress={() => play(t)} /></View><View><Pressable onPress={() => moveQ(t.id, -1)} style={{ padding: 6 }}><Text style={{ color: c.sub, fontSize: 14 }}>▲</Text></Pressable><Pressable onPress={() => moveQ(t.id, 1)} style={{ padding: 6 }}><Text style={{ color: c.sub, fontSize: 14 }}>▼</Text></Pressable></View></View>)}
        </View>}
      </ScrollView>
      </View>
    </View>
  );

  const closeSheet = () => { setSheet(null); setPick(null); };
  const popup = !!(sheet && wideScreen && anchor && !pick);
  const sheetView = sheet && (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: popup ? 'transparent' : 'rgba(0,0,0,0.5)', justifyContent: popup ? 'flex-start' : 'flex-end', alignItems: 'center' }}>
      <Pressable onPress={closeSheet} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
      <View style={popup ? { position: 'absolute', left: Math.max(8, Math.min(width - 288, anchor.x - 20)), top: Math.max(8, Math.min(height - 380, anchor.y + 6)), width: 280, backgroundColor: c.card || c.bg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.line, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, elevation: 12 } : { width: '100%', maxWidth: 520, backgroundColor: c.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 28 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          {sheet.thumb ? <Image source={{ uri: sheet.thumb }} style={s.thumb} /> : <View style={s.thumb} />}
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text numberOfLines={1} style={{ color: c.fg, fontWeight: '700', textAlign: 'right' }}>{sheet.title}</Text>
            <Text numberOfLines={1} style={{ color: c.sub, textAlign: 'right' }}>{sheet.artist}</Text>
          </View>
        </View>
        {!pick ? [
          ['ניגון הבא', () => { queueNext(sheet); closeSheet(); }],
          ['הוספה לסוף התור', () => { queueLast(sheet); closeSheet(); }],
          ['הוספה לפלייליסט', () => setPick({ name: '' })],
          [isFav(sheet) ? 'הסרה מהמועדפים' : 'הוספה למועדפים', () => { toggleFav(sheet); closeSheet(); }],
          ['התחל תחנה מהשיר', () => { const t = sheet; closeSheet(); station(t); }],
          ['מעבר לאמן', () => { const t = sheet; closeSheet(); setFull(false); openArtist(t.artist, t.ch); }],
          ['שיתוף', () => { share(sheet); closeSheet(); }],
        ].map(([n, f]) => (
          <Pressable key={n} onPress={f} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line }}>
            <Text style={{ color: c.fg, fontSize: 16, textAlign: 'right' }}>{n}</Text>
          </Pressable>
        )) : (
          <View>
            <TextInput value={pick.name} onChangeText={(v) => setPick({ name: v })} placeholder="פלייליסט חדש - שם" placeholderTextColor={c.sub}
              onSubmitEditing={() => { newPlaylist(pick.name, sheet); closeSheet(); }}
              style={[s.input, { backgroundColor: c.card, color: c.fg, textAlign: 'right', marginHorizontal: 0 }]} />
            <Pressable onPress={() => { newPlaylist(pick.name, sheet); closeSheet(); }} style={{ paddingVertical: 10 }}><Text style={{ color: RED, fontWeight: '700', textAlign: 'right' }}>+ צור והוסף</Text></Pressable>
            {playlists.map((p) => (
              <Pressable key={p.id} onPress={() => { addToPlaylist(p.id, sheet); closeSheet(); }} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line }}>
                <Text style={{ color: c.fg, fontSize: 16, textAlign: 'right' }}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={[s.root, { backgroundColor: c.bg, direction: 'rtl' }]}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <View style={{ flex: 1, flexDirection: wideScreen ? 'row' : 'column' }}>
        {wideScreen && (
          <View style={{ width: 230, backgroundColor: c.side, borderLeftWidth: 1, borderLeftColor: c.line, paddingTop: 24, paddingHorizontal: 12 }}>
            <Text style={[s.title, { color: RED, marginBottom: 6 }]}>Avi Music</Text>
            <View style={{ marginBottom: 14 }}>{Badge}</View>
            {TABS.map((x) => (
              <Pressable key={x.k} onPress={() => nav(x.k)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, backgroundColor: tab === x.k ? c.card2 : 'transparent' }}>
                <View style={{ width: 28 }}><Icon name={x.i} size={20} color={tab === x.k ? RED : c.sub} /></View>
                <Text style={{ color: tab === x.k ? RED : c.sub, fontSize: 16, fontWeight: '600' }}>{x.t}</Text>
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
              <View style={{ flex: 1 }} />
              {Badge}
              <Pressable onPress={() => setOverride(dark ? 'light' : 'dark')} style={s.theme}><Text style={{ color: c.fg, fontSize: 20 }}>{dark ? '☀️' : '🌙'}</Text></Pressable>
            </View>
          )}
          <FadeIn k={tab + '|' + pages.length + '|' + (page && (page.title || page.kind))}>{content}</FadeIn>
          {mini}
          {!wideScreen && (
            <View style={{ paddingHorizontal: 10, paddingBottom: 6, paddingTop: 4, backgroundColor: c.bg }}>
            <View style={{ flexDirection: 'row', height: 56, borderRadius: 20, backgroundColor: c.card, ...(Platform.OS === 'web' ? { backgroundColor: dark ? 'rgba(37,37,41,0.62)' : 'rgba(242,242,244,0.62)', backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)' } : null), borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
              {TABS.map((x) => (
                <Pressable key={x.k} onPress={() => nav(x.k)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', margin: 5, borderRadius: 15, gap: 3, backgroundColor: tab === x.k ? c.card2 : 'transparent' }}>
                  <Icon name={x.i} size={24} color={tab === x.k ? RED : c.sub} />
                  <Text style={{ color: tab === x.k ? RED : c.sub, fontSize: 10, fontWeight: '500' }}>{x.t}</Text>
                </Pressable>
              ))}
            </View>
            </View>
          )}
        </View>
      </View>
      {fullView}
      {sheetView}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'web' || Platform.OS === 'windows' ? 0 : 36 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  title: { fontSize: 24, fontWeight: '800', flex: 1, textAlign: 'right' },
  large: { fontSize: 34, fontWeight: '800', paddingHorizontal: 16, paddingTop: 36, paddingBottom: 6, letterSpacing: -0.5, textAlign: 'right' },
  h2: { fontSize: 21, fontWeight: '700', marginHorizontal: 16, textAlign: 'right' },
  sechead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 0, marginBottom: 8 },
  theme: { padding: 6 },
  input: { margin: 12, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 6 },
  thumb: { width: 48, height: 48, borderRadius: 5, backgroundColor: '#8884' },
  player: { padding: 10, borderTopWidth: 1 },
  skip: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
});

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111114', padding: 24 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>משהו השתבש</Text>
        <Pressable onPress={() => this.setState({ err: false })} style={{ marginTop: 16, backgroundColor: RED, borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>נסה שוב</Text>
        </Pressable>
      </View>
    );
  }
}

export default function App() { return <Boundary><AppInner /></Boundary>; }
