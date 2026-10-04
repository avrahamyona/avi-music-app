# Avi Music for Windows

A native Windows 11 app (Flutter, not a WebView) for the Avi Music ad-free player. Free and open.
The web version lives in a separate repo (avrahamyona/nagan-tzaf) and is untouched.

- Build: GitHub Actions on a Windows runner, output is a zip on the Releases page.
- Audio: the existing Cloudflare Worker (`/audio/<id>`), search through public Piped hosts.
- Rules: no ads, no YouTube embed, a failing song is never swapped for a different song.

## Auto-update design (not built yet)
Each CI build publishes a Release (`build-N`). The app will check the latest release through
the public GitHub API, compare the build number, download the zip and replace itself on restart.
