// Vector icons (web, Android, iPhone) drawn with react-native-svg. Windows uses Icon.windows.js.
import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Rect, G } from 'react-native-svg';

const P = {
  ff: 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z',
  rw: 'M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z',
  back10: 'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z',
  fwd10: 'M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z',
  share: 'M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z',
  cast: 'M6 22h12l-6-6-6 6zM21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4v-2H3V5h18v12h-4v2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z',
  lyrics: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z',
  queue: 'M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z',
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  browse: 'M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z',
  radio: 'M3.24 6.15C2.51 6.43 2 7.17 2 8v12c0 1.1.89 2 2 2h16c1.11 0 2-.9 2-2V8c0-1.11-.89-2-2-2H8.3l8.26-3.34L15.88 1 3.24 6.15zM7 20c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-8h-2v-2h-2v2H4V8h16v4z',
  library: 'M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z',
  search: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  heart: 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
  heartfill: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  vol0: 'M7 9v6h4l5 5V4l-5 5H7z',
  vol1: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  dots: 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  play: 'M8 5v14l11-7z',
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  prev: 'M6 6h2v12H6zm3.5 6l8.5 6V6z',
  next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
  clock: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  playc: 'M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
  shuffle: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  chevdown: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z',
};

export default function Icon({ name, size = 22, color = '#000' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={P[name] || P.dots} fill={color} />
    </Svg>
  );
}

// Line illustrations for the mood shelf (own drawings), one per mood kind, over a two-colour gradient.
const PAL = { sun: ['#ef6439', '#ffcb66'], cup: ['#583e72', '#d4a67f'], bolt: ['#573bec', '#e0ff61'], path: ['#21498d', '#8dd8f5'], book: ['#164f55', '#7ddab6'], wave: ['#235080', '#6dd5e3'], spark: ['#8034b0', '#fa78b7'], moon: ['#202952', '#9d9bfa'], rain: ['#243755', '#8eb4d8'], heart: ['#972548', '#ff8e9c'], candle: ['#614924', '#f8ce7c'], record: ['#75432e', '#ffc985'], hill: ['#2f6550', '#c5df8e'] };
export const MOOD_KIND = { 'מזרחי דיכאון': 'rain', 'מזרחי שמח': 'sun', 'מזרחי טורקי': 'wave', 'פופ שמח': 'spark', 'אהבה': 'heart', 'שקט של ערב': 'moon', 'געגוע': 'rain', 'מסיבה': 'spark', 'נסיעה': 'path', 'שבת': 'candle', 'נוסטלגיה מזרחית': 'record', 'ארץ ישראל': 'hill' };
const ART = {
  sun: 'M50 30a16 16 0 1 0 0.1 0zM50 12v10M50 78v10M12 50h10M78 50h10M23 23l7 7M70 70l7 7M77 23l-7 7M30 70l-7 7',
  moon: 'M62 22a30 30 0 1 0 16 46A24 24 0 0 1 62 22zM76 20v8M72 24h8',
  rain: 'M30 52a14 14 0 0 1 4-27 18 18 0 0 1 34 4 12 12 0 0 1 0 23zM36 62l-4 10M50 62l-4 10M64 62l-4 10',
  heart: 'M50 78C20 56 22 30 40 30c8 0 10 6 10 6s2-6 10-6c18 0 20 26-10 48z',
  spark: 'M50 16l7 25 25 7-25 7-7 25-7-25-25-7 25-7zM78 20v10M73 25h10',
  wave: 'M14 44q9-14 18 0t18 0 18 0 18 0M14 62q9-14 18 0t18 0 18 0 18 0',
  path: 'M30 82L44 20M70 82L56 20M50 80V68M50 56V44M50 32V24',
  candle: 'M40 46h20v34H40zM50 46V38M50 22c7 8 5 13 0 16-5-3-7-8 0-16z',
  record: 'M50 22a28 28 0 1 0 0.1 0zM50 44a6 6 0 1 0 0.1 0zM30 50a20 20 0 0 1 8-16',
  hill: 'M12 76q22-36 44-8 14-18 32 8zM72 28a9 9 0 1 0 0.1 0z',
  book: 'M18 28h30v48H18zM48 28h34v48H48zM26 40h14M26 50h14',
  cup: 'M32 40h30v22a15 15 0 0 1-30 0zM62 46h8a8 8 0 0 1 0 16h-8M34 82h28',
  bolt: 'M58 14L32 54h16l-4 32 26-44H54z',
};
export function MoodArt({ kind }) {
  const pal = PAL[kind] || PAL.spark;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      <Defs><LinearGradient id={'mg' + kind} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={pal[0]} /><Stop offset="1" stopColor={pal[1]} /></LinearGradient></Defs>
      <Rect x="0" y="0" width="100" height="100" fill={'url(#mg' + kind + ')'} />
      <G transform="translate(0,-14)"><Path d={ART[kind] || ART.spark} fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></G>
    </Svg>
  );
}
