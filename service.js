import TrackPlayer, { Event } from 'react-native-track-player';
import { bus } from './bus';

module.exports = async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => TrackPlayer.seekTo(e.position));
  TrackPlayer.addEventListener(Event.RemoteNext, () => bus.emit('next'));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => bus.emit('prev'));
};
