// Windows fallback: symbol glyphs (react-native-svg is not part of the Windows build).
import React from 'react';
import { Text } from 'react-native';

const G = {
  home: '⌂', browse: '▦', radio: '◉', library: '♫', search: '⌕', heart: '♡', heartfill: '♥', dots: '⋯',
  play: '▶', pause: '❚❚', prev: '⏮', next: '⏭', shuffle: '⇄', repeat: '⟲', chevdown: '⌄',
};
export default function Icon({ name, size = 22, color = '#000' }) {
  return <Text style={{ color, fontSize: size * 0.9, lineHeight: size + 2, textAlign: 'center' }}>{G[name] || '•'}</Text>;
}
