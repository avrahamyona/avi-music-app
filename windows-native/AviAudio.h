#pragma once
#include "NativeModules.h"
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.h>
#include <winrt/Windows.Media.Core.h>
#include <winrt/Windows.Media.Playback.h>
#include <winrt/Windows.Storage.h>
#include <fstream>
#include <iterator>
#include <memory>
#include <mutex>
#include <string>

// Native audio for Avi Music on Windows: Windows.Media.Playback.MediaPlayer.
// It plugs into the system media overlay / media keys (SMTC) automatically.
REACT_MODULE(AviAudio)
struct AviAudio {
  REACT_INIT(Init)
  void Init(winrt::Microsoft::ReactNative::ReactContext const &ctx) noexcept { m_ctx = ctx; }

  REACT_METHOD(Load, L"load")
  void Load(std::string url, std::string title, std::string artist,
            winrt::Microsoft::ReactNative::ReactPromise<bool> &&result) noexcept {
    try {
      Ensure();
      {
        std::lock_guard<std::mutex> g(m_mu);
        if (m_pending) { m_pending->Resolve(false); }
        m_pending = std::make_shared<winrt::Microsoft::ReactNative::ReactPromise<bool>>(std::move(result));
        m_ended = false;
      }
      using namespace winrt::Windows::Media;
      auto src = Core::MediaSource::CreateFromUri(winrt::Windows::Foundation::Uri(winrt::to_hstring(url)));
      Playback::MediaPlaybackItem item(src);
      auto props = item.GetDisplayProperties();
      props.Type(MediaPlaybackType::Music);
      props.MusicProperties().Title(winrt::to_hstring(title));
      props.MusicProperties().Artist(winrt::to_hstring(artist));
      item.ApplyDisplayProperties(props);
      m_player.Source(item);
      m_player.Play();
    } catch (...) {
      Settle(false);
    }
  }

  REACT_METHOD(Toggle, L"toggle")
  void Toggle() noexcept {
    try {
      if (!m_player) return;
      using namespace winrt::Windows::Media::Playback;
      if (m_player.PlaybackSession().PlaybackState() == MediaPlaybackState::Playing) m_player.Pause();
      else m_player.Play();
    } catch (...) {}
  }

  REACT_METHOD(Seek, L"seek")
  void Seek(double sec) noexcept {
    try {
      if (!m_player) return;
      m_player.PlaybackSession().Position(std::chrono::duration_cast<winrt::Windows::Foundation::TimeSpan>(
          std::chrono::duration<double>(sec)));
    } catch (...) {}
  }

  REACT_METHOD(SetVolume, L"setVolume")
  void SetVolume(double v) noexcept {
    try {
      Ensure();
      if (v < 0) v = 0;
      if (v > 1) v = 1;
      m_vol = v;
      m_player.Volume(v);
    } catch (...) {}
  }

  REACT_METHOD(GetItem, L"getItem")
  void GetItem(std::string key, winrt::Microsoft::ReactNative::ReactPromise<std::string> &&result) noexcept {
    try {
      auto p = winrt::to_string(winrt::Windows::Storage::ApplicationData::Current().LocalFolder().Path()) + "\\avi-" + key + ".json";
      std::ifstream f(p, std::ios::binary);
      std::string s((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
      result.Resolve(s);
    } catch (...) { result.Resolve(std::string()); }
  }

  REACT_METHOD(SetItem, L"setItem")
  void SetItem(std::string key, std::string value) noexcept {
    try {
      auto p = winrt::to_string(winrt::Windows::Storage::ApplicationData::Current().LocalFolder().Path()) + "\\avi-" + key + ".json";
      std::ofstream f(p, std::ios::binary | std::ios::trunc);
      f << value;
    } catch (...) {}
  }

  REACT_METHOD(GetProgress, L"getProgress")
  void GetProgress(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
    double pos = 0, dur = 0;
    bool playing = false;
    try {
      if (m_player) {
        using namespace winrt::Windows::Media::Playback;
        auto s = m_player.PlaybackSession();
        pos = std::chrono::duration<double>(s.Position()).count();
        dur = std::chrono::duration<double>(s.NaturalDuration()).count();
        playing = s.PlaybackState() == MediaPlaybackState::Playing;
      }
    } catch (...) {}
    winrt::Microsoft::ReactNative::JSValueObject o;
    o["pos"] = pos;
    o["dur"] = dur;
    o["playing"] = playing;
    o["ended"] = m_ended.load();
    result.Resolve(std::move(o));
  }

 private:
  void Settle(bool ok) noexcept {
    std::shared_ptr<winrt::Microsoft::ReactNative::ReactPromise<bool>> p;
    {
      std::lock_guard<std::mutex> g(m_mu);
      p = std::move(m_pending);
    }
    if (p) p->Resolve(ok);
  }

  void Ensure() {
    if (m_player) return;
    using namespace winrt::Windows::Media::Playback;
    m_player = MediaPlayer();
    m_player.AutoPlay(false);
    m_player.Volume(m_vol);
    m_player.MediaOpened([this](auto &&, auto &&) { Settle(true); });
    m_player.MediaFailed([this](auto &&, auto &&) { Settle(false); });
    m_player.MediaEnded([this](auto &&, auto &&) { m_ended = true; });
  }

  winrt::Microsoft::ReactNative::ReactContext m_ctx;
  double m_vol{1.0};
  winrt::Windows::Media::Playback::MediaPlayer m_player{nullptr};
  std::mutex m_mu;
  std::shared_ptr<winrt::Microsoft::ReactNative::ReactPromise<bool>> m_pending;
  std::atomic<bool> m_ended{false};
};
