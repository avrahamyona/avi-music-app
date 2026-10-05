// Windows fallback: symbol glyphs (react-native-svg is not part of the Windows build).
import React from 'react';
import { Text, View } from 'react-native';

const G = {
  home: '⌂', browse: '▦', radio: '◉', library: '♫', search: '⌕', heart: '♡', heartfill: '♥', dots: '⋯', vol0: '🔈', vol1: '🔊',
  play: '▶', pause: '❚❚', prev: '⏮', next: '⏭', shuffle: '⇄', clock: '◔', playc: '▶', repeat: '⟲', chevdown: '⌄', ff: '⏩', rw: '⏪', back10: '↺', fwd10: '↻', share: '⤴', lyrics: '💬', cast: '⎙', queue: '☰',
};
export default function Icon({ name, size = 22, color = '#000' }) {
  return <Text style={{ color, fontSize: size * 0.9, lineHeight: size + 2, textAlign: 'center' }}>{G[name] || '•'}</Text>;
}

const WPAL = { sun: ['#ef6439', '☀'], cup: ['#583e72', '☕'], bolt: ['#573bec', '⚡'], path: ['#21498d', '➶'], book: ['#164f55', '📖'], wave: ['#235080', '〰'], spark: ['#8034b0', '✦'], moon: ['#202952', '☾'], rain: ['#243755', '☂'], heart: ['#972548', '♡'], candle: ['#614924', '🕯'], record: ['#75432e', '◉'], hill: ['#2f6550', '⛰'] };
export const MOOD_KIND = { 'מזרחי דיכאון': 'rain', 'מזרחי שמח': 'sun', 'מזרחי טורקי': 'wave', 'פופ שמח': 'spark', 'אהבה': 'heart', 'שקט של ערב': 'moon', 'געגוע': 'rain', 'מסיבה': 'spark', 'נסיעה': 'path', 'שבת': 'candle', 'נוסטלגיה מזרחית': 'record', 'ארץ ישראל': 'hill' };
export function MoodArt({ kind }) {
  const p = WPAL[kind] || WPAL.spark;
  return <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: p[0], alignItems: 'center', justifyContent: 'flex-start', paddingTop: 14 }}><Text style={{ color: '#fff', opacity: 0.85, fontSize: 54 }}>{p[1]}</Text></View>;
}
