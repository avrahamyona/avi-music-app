import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Linking, Platform, ActivityIndicator } from 'react-native';
import * as acct from './account';

const RED = '#fa2d48';
const Btn = ({ onPress, children, disabled, ghost, c }) => (
  <Pressable onPress={onPress} disabled={disabled} style={{ backgroundColor: ghost ? 'transparent' : RED, borderWidth: ghost ? 1 : 0, borderColor: RED, borderRadius: 22, alignSelf: 'center', paddingHorizontal: 26, paddingVertical: 10, marginTop: 10, opacity: disabled ? 0.5 : 1 }}>
    <Text style={{ color: ghost ? RED : '#fff', fontWeight: '700' }}>{children}</Text>
  </Pressable>
);

// Full-screen lock: shown when the Google lock is on and the owner is not signed in.
export function LockScreen({ c, state, onDone }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(state === 'denied' ? 'החשבון הזה לא מורשה. התחבר עם החשבון של הבעלים.' : '');
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; }, []);
  const go = async () => {
    setBusy(true); setMsg(''); stop.current = false;
    try {
      const x = await acct.startDevice();
      setD(x);
      await acct.pollDevice(x, () => stop.current);
      const r = await acct.check();
      if (r.state === 'ok') { onDone(r); return; }
      setD(null); setMsg(r.state === 'denied' ? 'החשבון הזה לא מורשה.' : 'ההתחברות לא הושלמה, נסה שוב.');
    } catch (e) { setD(null); setMsg('ההתחברות נכשלה (' + String((e && e.message) || e).slice(0, 60) + '). נסה שוב.'); }
    setBusy(false);
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: c.fg, fontSize: 30, fontWeight: '800' }}>Avi Music</Text>
      <Text style={{ color: c.sub, marginTop: 8, textAlign: 'center' }}>האפליקציה פרטית. התחבר עם חשבון Google של הבעלים.</Text>
      {!d && <Btn onPress={go} disabled={busy}>{busy ? 'מתחבר...' : 'התחברות עם Google'}</Btn>}
      {!!d && (
        <View style={{ alignItems: 'center', marginTop: 18 }}>
          <Text style={{ color: c.sub, textAlign: 'center' }}>פתח את הקישור והכנס את הקוד:</Text>
          <Text selectable style={{ color: c.fg, fontSize: 34, fontWeight: '800', letterSpacing: 4, marginVertical: 10, writingDirection: 'ltr' }}>{d.user_code}</Text>
          <Text selectable style={{ color: RED, writingDirection: 'ltr' }}>{d.verification_url}</Text>
          <Btn onPress={() => Linking.openURL(d.verification_url).catch(() => {})}>פתיחת הקישור</Btn>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}><ActivityIndicator color={RED} /><Text style={{ color: c.sub, marginHorizontal: 8 }}>ממתין לאישור...</Text></View>
        </View>
      )}
      {!!msg && <Text style={{ color: '#ff6b6b', marginTop: 14, textAlign: 'center' }}>{msg}</Text>}
    </View>
  );
}

function pickFile() {
  return new Promise((res) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') { res(null); return; }
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = () => { const f = i.files && i.files[0]; if (!f) { res(null); return; } const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => res(null); r.readAsText(f); };
    i.click();
  });
}

const HOURS = (h) => (h === null || h === undefined ? '' : (h < 10 ? '0' : '') + h + ':00');

// Account, YouTube import, Takeout import and taste summary.
export function AccountPanel({ c, A }) {
  const [me, setMe] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const [taste, setTaste] = useState(null);
  const [apple, setApple] = useState(null);
  useEffect(() => { acct.check().then(setMe).catch(() => {}); A.getTaste().then(setTaste).catch(() => {}); }, []);
  const signedIn = me && me.state === 'ok' && !!me.email;
  const doYt = async () => {
    setBusy(true); setMsg('מייבא...');
    try {
      const r = await acct.importYouTube((s) => setMsg('מייבא: ' + s));
      r.playlists.forEach((p) => A.addPlaylist(p));
      A.importFavs(r.liked);
      A.mergeTaste({ artists: r.subs.reduce((o, s) => { o[s.title] = (o[s.title] || 0) + 5; return o; }, {}), total: 0, topSongs: [], hours: [], months: {} });
      setMsg('יובאו ' + r.playlists.length + ' פלייליסטים, ' + r.liked.length + ' שירים שאהבת, ' + r.subs.length + ' מנויים');
    } catch (e) { setMsg('הייבוא נכשל. התחבר שוב ונסה שוב.'); }
    setBusy(false);
  };
  const doText = async (text) => {
    const t = acct.parseWatchHistory(text);
    if (!t || !t.total) { setMsg('לא נמצאו שמיעות מוזיקה בקובץ. ודא שזה watch-history.json של YouTube Music.'); return; }
    const n = await A.mergeTaste(t);
    setTaste(n); setMsg('יובאו ' + t.total + ' האזנות');
  };
  const doFile = async () => { const t = await pickFile(); if (t) await doText(t); };
  const doApple = async () => {
    const t = await pickFile(); if (!t) return;
    const d = acct.parseAppleExport(t);
    if (!d || !(d.playlists.length || d.library.length || d.recent.length)) { setMsg('הקובץ לא בפורמט הנכון.'); return; }
    setBusy(true); setApple(null);
    try {
      const r = await acct.importApple(d, A, (n, tot) => setMsg('מתאים שירים: ' + n + '/' + tot));
      setMsg('הותאמו ' + r.ok + ' מתוך ' + r.total + ' שירים'); setApple(r.miss.slice(0, 40));
    } catch (e) { setMsg('הייבוא נעצר. אפשר להריץ שוב, ההתאמות נשמרו.'); }
    setBusy(false);
  };
  const sm = acct.summarize(taste);
  return (
    <View style={{ padding: 12 }}>
      <Text style={{ color: c.fg, fontSize: 18, fontWeight: '700', textAlign: 'right' }}>חשבון וטעם מוזיקלי</Text>
      <Text style={{ color: c.sub, textAlign: 'right', marginTop: 4 }}>{acct.lockEnabled() ? (signedIn ? 'מחובר: ' + me.email : 'לא מחובר') : 'נעילת Google עדיין לא הופעלה'}</Text>
      {signedIn && <Btn onPress={doYt} disabled={busy} c={c}>ייבוא מ-YouTube (פלייליסטים, לייקים, מנויים)</Btn>}
      <Text style={{ color: c.fg, fontWeight: '700', textAlign: 'right', marginTop: 20 }}>היסטוריית האזנה (Google Takeout)</Text>
      <Text style={{ color: c.sub, textAlign: 'right', marginTop: 4 }}>בחר את הקובץ watch-history.json מתוך תיקיית Takeout. הכול נשאר רק במכשיר.</Text>
      {Platform.OS === 'web' ? <Btn onPress={doFile} disabled={busy} c={c}>בחירת קובץ</Btn> : (
        <View>
          <TextInput value={paste} onChangeText={setPaste} multiline placeholder="הדבק כאן את תוכן watch-history.json" placeholderTextColor={c.sub} style={{ backgroundColor: c.card, color: c.fg, borderRadius: 10, padding: 10, marginTop: 10, minHeight: 60, textAlign: 'left', writingDirection: 'ltr' }} />
          <Btn onPress={() => doText(paste)} disabled={busy || paste.length < 10} c={c}>ייבוא</Btn>
        </View>
      )}
      {Platform.OS === 'web' && (
        <View>
          <Text style={{ color: c.fg, fontWeight: '700', textAlign: 'right', marginTop: 20 }}>ייבוא מ-Apple Music</Text>
          <Text style={{ color: c.sub, textAlign: 'right', marginTop: 4 }}>בחר קובץ JSON עם פלייליסטים, ספרייה והאזנות אחרונות. כל שיר מותאם לאותו שיר ואותו אמן, בלי תחליפים.</Text>
          <Btn onPress={doApple} disabled={busy} c={c}>בחירת קובץ Apple Music</Btn>
        </View>
      )}
      {!!msg && <Text style={{ color: c.sub, textAlign: 'center', marginTop: 10 }}>{msg}</Text>}
      {!!apple && apple.length > 0 && <View style={{ marginTop: 8 }}><Text style={{ color: c.fg, textAlign: 'right', fontWeight: '700' }}>לא נמצאו:</Text>{apple.map((m) => <Text key={m} numberOfLines={1} style={{ color: c.sub, textAlign: 'right' }}>{m}</Text>)}</View>}
      {!!sm && sm.total > 0 && (
        <View style={{ marginTop: 18 }}>
          <Text style={{ color: c.fg, fontSize: 18, fontWeight: '700', textAlign: 'right' }}>הטעם שלך</Text>
          <Text style={{ color: c.sub, textAlign: 'right', marginTop: 4 }}>{sm.total + ' האזנות' + (sm.peakHour !== null ? ' · שעת שיא ' + HOURS(sm.peakHour) : '')}</Text>
          <Text style={{ color: c.fg, fontWeight: '700', textAlign: 'right', marginTop: 12 }}>אמנים מובילים</Text>
          {sm.topArtists.slice(0, 10).map((a) => (
            <Pressable key={a.name} onPress={() => A.openArtist(a.name)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
              <Text style={{ color: c.sub }}>{a.count}</Text>
              <Text style={{ color: c.fg }}>{a.name}</Text>
            </Pressable>
          ))}
          <Text style={{ color: c.fg, fontWeight: '700', textAlign: 'right', marginTop: 12 }}>שירים מובילים</Text>
          {sm.topSongs.slice(0, 10).map((s2) => (
            <View key={s2.title + s2.artist} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
              <Text style={{ color: c.sub }}>{s2.count}</Text>
              <Text numberOfLines={1} style={{ color: c.fg, flex: 1, textAlign: 'right', marginLeft: 12 }}>{s2.title + ' - ' + s2.artist}</Text>
            </View>
          ))}
        </View>
      )}
      {signedIn && <Btn ghost onPress={async () => { await acct.signOut(); setMe({ state: 'out' }); }} c={c}>התנתקות</Btn>}
    </View>
  );
      }
