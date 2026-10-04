# Avi Music

One React Native (Expo) codebase for web, Android (APK) and iPhone. Free and open.
The older web app (avrahamyona/nagan-tzaf) is separate and untouched.

- Audio: the existing Cloudflare Worker (`/audio/<id>`), search through public Piped hosts.
- Rules: no ads, no YouTube embed, a failing song is never swapped for a different song.
- Builds: GitHub Actions publishes `AviMusic.apk` and `AviMusic-web.zip` on the Releases page.

## iPhone without a paid Apple developer account
Needs a Mac (an iOS build must be signed by Xcode). A free Apple ID signs an app for 7 days;
it must be re-signed weekly (AltStore/Sideloadly automate that). Not built yet.
