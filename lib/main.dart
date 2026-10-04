import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:media_kit/media_kit.dart';
import 'package:smtc_windows/smtc_windows.dart';
import 'package:window_manager/window_manager.dart';

const String kAppVersion = '0.1.0';
const String kBuild = String.fromEnvironment('BUILD', defaultValue: 'dev');
const String kWorker = 'https://avi-music-audio.avi-music.workers.dev';
const List<String> kPiped = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.leptons.xyz',
];

class Track {
  final String id, title, artist, thumb;
  final int dur;
  Track(this.id, this.title, this.artist, this.thumb, this.dur);
}

String fmt(Duration d) {
  final m = d.inMinutes, s = d.inSeconds % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}

String norm(String s) => s
    .toLowerCase()
    .replaceAll(RegExp(r'[\u0591-\u05C7]'), '')
    .replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), ' ')
    .trim();

String? _piped;
Future<dynamic> pipedGet(String path) async {
  final hosts = [if (_piped != null) _piped!, ...kPiped.where((h) => h != _piped)];
  Object? last;
  for (final h in hosts) {
    try {
      final r = await http.get(Uri.parse(h + path)).timeout(const Duration(seconds: 8));
      if (r.statusCode != 200) throw 'http ${r.statusCode}';
      final j = jsonDecode(utf8.decode(r.bodyBytes));
      _piped = h;
      return j;
    } catch (e) {
      last = e;
    }
  }
  throw last ?? 'no host';
}

Future<List<Track>> searchTracks(String q) async {
  Future<List<Track>> one(String f) async {
    final j = await pipedGet('/search?q=${Uri.encodeQueryComponent(q)}&filter=$f');
    final out = <Track>[];
    for (final it in (j['items'] as List? ?? [])) {
      if (it['type'] != 'stream') continue;
      final m = RegExp(r'v=([A-Za-z0-9_-]{11})').firstMatch('${it['url']}');
      if (m == null) continue;
      out.add(Track(m.group(1)!, '${it['title'] ?? ''}', '${it['uploaderName'] ?? ''}',
          '${it['thumbnail'] ?? ''}', (it['duration'] is int && it['duration'] > 0) ? it['duration'] : 0));
    }
    return out;
  }

  final rs = await Future.wait([
    one('music_songs').catchError((_) => <Track>[]),
    one('videos').catchError((_) => <Track>[]),
  ]);
  final seen = <String>{};
  final out = <Track>[];
  for (final l in rs) {
    for (final t in l) {
      if (seen.add(t.id)) out.add(t);
    }
  }
  return out;
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  try {
    await windowManager.ensureInitialized();
    await windowManager.setTitle('Avi Music');
  } catch (_) {}
  runApp(const AviApp());
}

class AviApp extends StatefulWidget {
  const AviApp({super.key});
  @override
  State<AviApp> createState() => _AviAppState();
}

class _AviAppState extends State<AviApp> {
  ThemeMode mode = ThemeMode.system;
  @override
  Widget build(BuildContext context) {
    const red = Color(0xFFFA2D48);
    return MaterialApp(
      title: 'Avi Music',
      debugShowCheckedModeBanner: false,
      themeMode: mode,
      theme: ThemeData(colorSchemeSeed: red, brightness: Brightness.light, useMaterial3: true),
      darkTheme: ThemeData(colorSchemeSeed: red, brightness: Brightness.dark, useMaterial3: true),
      builder: (c, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
      home: HomePage(
        mode: mode,
        onToggleTheme: () => setState(() {
          final dark = Theme.of(context).brightness == Brightness.dark;
          mode = dark ? ThemeMode.light : ThemeMode.dark;
        }),
      ),
    );
  }
}

class HomePage extends StatefulWidget {
  final ThemeMode mode;
  final VoidCallback onToggleTheme;
  const HomePage({super.key, required this.mode, required this.onToggleTheme});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final player = Player();
  final ctl = TextEditingController();
  List<Track> results = [];
  bool searching = false;
  String? searchErr;
  Track? current;
  String status = '';
  bool playing = false;
  Duration pos = Duration.zero, dur = Duration.zero;
  bool seeking = false;
  double seekVal = 0;
  int _gen = 0;
  SMTCWindows? smtc;
  final subs = <StreamSubscription>[];

  @override
  void initState() {
    super.initState();
    subs.add(player.stream.playing.listen((p) {
      setState(() => playing = p);
      _smtcStatus();
    }));
    subs.add(player.stream.position.listen((p) {
      if (!seeking) setState(() => pos = p);
    }));
    subs.add(player.stream.duration.listen((d) => setState(() => dur = d)));
    subs.add(player.stream.error.listen((e) => _onError(e)));
    _initSmtc();
  }

  Future<void> _initSmtc() async {
    try {
      await SMTCWindows.initialize();
      smtc = SMTCWindows(
        metadata: const MusicMetadata(title: 'Avi Music', artist: ''),
        config: const SMTCConfig(
          playEnabled: true,
          pauseEnabled: true,
          nextEnabled: false,
          prevEnabled: false,
          stopEnabled: false,
          fastForwardEnabled: false,
          rewindEnabled: false,
        ),
      );
      subs.add(smtc!.buttonPressStream.listen((b) {
        if (b == PressedButton.play) player.play();
        if (b == PressedButton.pause) player.pause();
      }));
    } catch (_) {
      smtc = null;
    }
  }

  void _smtcStatus() {
    try {
      smtc?.setPlaybackStatus(playing ? PlaybackStatus.playing : PlaybackStatus.paused);
    } catch (_) {}
  }

  Future<void> doSearch() async {
    final q = ctl.text.trim();
    if (q.isEmpty) return;
    setState(() {
      searching = true;
      searchErr = null;
    });
    try {
      final r = await searchTracks(q);
      setState(() => results = r);
      if (r.isEmpty) searchErr = 'לא נמצאו תוצאות';
    } catch (e) {
      searchErr = 'החיפוש נכשל, נסה שוב';
    }
    setState(() => searching = false);
  }

  // Never swap a failing song for a different song: retry the same id, then
  // other recordings of the same title/artist, then say plainly it's unavailable.
  Future<void> playTrack(Track t) async {
    final gen = ++_gen;
    setState(() {
      current = t;
      status = 'טוען...';
      pos = Duration.zero;
      dur = Duration.zero;
    });
    try {
      smtc?.updateMetadata(MusicMetadata(title: t.title, artist: t.artist, thumbnail: t.thumb.isEmpty ? null : t.thumb));
    } catch (_) {}
    final tried = <String>{};
    Future<bool> attempt(String id) async {
      tried.add(id);
      try {
        await player.open(Media('$kWorker/audio/$id'), play: true);
        await player.stream.duration
            .firstWhere((d) => d > Duration.zero)
            .timeout(const Duration(seconds: 8));
        return gen == _gen;
      } catch (_) {
        return false;
      }
    }

    for (var i = 0; i < 2; i++) {
      if (gen != _gen) return;
      if (await attempt(t.id)) {
        if (gen == _gen) setState(() => status = '');
        return;
      }
    }
    if (gen != _gen) return;
    setState(() => status = 'מחפש הקלטה אחרת');
    try {
      final alts = await searchTracks('${t.title} ${t.artist}');
      final nt = norm(t.title);
      final cands = alts.where((a) => !tried.contains(a.id) && norm(a.title).contains(nt)).take(6);
      for (final a in cands) {
        if (gen != _gen) return;
        if (await attempt(a.id)) {
          if (gen == _gen) setState(() => status = '');
          return;
        }
      }
    } catch (_) {}
    if (gen == _gen) {
      await player.stop();
      setState(() => status = 'השיר לא זמין כרגע במקורות הישירים. לא עברנו לשיר אחר.');
    }
  }

  void _onError(String e) {}

  @override
  void dispose() {
    for (final s in subs) {
      s.cancel();
    }
    player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Avi Music', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          Center(child: Text('גרסה $kAppVersion (build $kBuild)', style: Theme.of(context).textTheme.bodySmall)),
          IconButton(
            tooltip: 'מצב כהה/בהיר',
            icon: Icon(dark ? Icons.light_mode : Icons.dark_mode),
            onPressed: widget.onToggleTheme,
          ),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: ctl,
            onSubmitted: (_) => doSearch(),
            decoration: InputDecoration(
              hintText: 'חפש שירים, אמנים...',
              prefixIcon: const Icon(Icons.search),
              filled: true,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
        ),
        if (searching) const LinearProgressIndicator(),
        if (searchErr != null) Padding(padding: const EdgeInsets.all(8), child: Text(searchErr!)),
        Expanded(
          child: ListView.builder(
            itemCount: results.length,
            itemBuilder: (c, i) {
              final t = results[i];
              final sel = current?.id == t.id;
              return ListTile(
                selected: sel,
                leading: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: SizedBox(
                    width: 52,
                    height: 52,
                    child: t.thumb.isEmpty
                        ? const Icon(Icons.music_note)
                        : Image.network(t.thumb, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const Icon(Icons.music_note)),
                  ),
                ),
                title: Text(t.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text(t.artist, maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: Text(t.dur > 0 ? fmt(Duration(seconds: t.dur)) : ''),
                onTap: () => playTrack(t),
              );
            },
          ),
        ),
        Container(
          color: cs.surfaceContainerHighest,
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              Expanded(
                child: Text(current?.title ?? 'בחר שיר מהתוצאות',
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
              IconButton.filled(
                iconSize: 30,
                icon: Icon(playing ? Icons.pause : Icons.play_arrow),
                onPressed: current == null ? null : () => player.playOrPause(),
              ),
            ]),
            if (status.isNotEmpty) Align(alignment: Alignment.centerRight, child: Text(status)),
            Row(children: [
              Text(fmt(pos)),
              Expanded(
                child: Slider(
                  value: dur.inMilliseconds == 0
                      ? 0
                      : (seeking ? seekVal : pos.inMilliseconds.toDouble()).clamp(0, dur.inMilliseconds.toDouble()),
                  max: dur.inMilliseconds == 0 ? 1 : dur.inMilliseconds.toDouble(),
                  onChangeStart: (v) => setState(() {
                    seeking = true;
                    seekVal = v;
                  }),
                  onChanged: (v) => setState(() => seekVal = v),
                  onChangeEnd: (v) async {
                    await player.seek(Duration(milliseconds: v.toInt()));
                    setState(() {
                      seeking = false;
                      pos = Duration(milliseconds: v.toInt());
                    });
                  },
                ),
              ),
              Text(fmt(dur)),
            ]),
          ]),
        ),
      ]),
    );
  }
}
