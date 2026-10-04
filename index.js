import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import App from './App';

if (Platform.OS !== 'web') {
  const TrackPlayer = require('react-native-track-player').default;
  TrackPlayer.registerPlaybackService(() => require('./service'));
}
registerRootComponent(App);
