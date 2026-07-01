# LifeTracker iOS — setup

SwiftUI sources for the whereabouts app: map of everywhere you've been (pins with
visit durations), a recency-weighted heatmap, camera/library photo sharing with
auto-filled date + optional description, and a daily Apple Health summary.

## Create the Xcode project

1. Xcode → New Project → iOS App → name **LifeTracker**, interface SwiftUI, language Swift.
2. Delete the generated `ContentView.swift` / `LifeTrackerApp.swift`, then drag every
   `.swift` file from this folder into the project.
3. Replace the generated `Assets.xcassets` with the one in this folder (it contains
   the gold live-ping app icon — a single 1024px universal icon, Xcode 14+ style).
4. Minimum deployment target: **iOS 16**.

## Capabilities & Info.plist

Signing & Capabilities → add:
- **Background Modes** → check *Location updates*
- **HealthKit**

Info.plist keys (all required at runtime):

| Key | Suggested value |
|---|---|
| `NSLocationAlwaysAndWhenInUseUsageDescription` | Logs the places you visit and for how long. |
| `NSLocationWhenInUseUsageDescription` | Shows your position on the map. |
| `NSCameraUsageDescription` | Share photos straight into your activity log. |
| `NSPhotoLibraryUsageDescription` | Pick photos to append to your log. |
| `NSHealthShareUsageDescription` | Reads steps and sleep for the daily summary. |

Transport security: the endpoint default is `https://git.now.lan` (self-signed).
A self-signed cert is a TLS **trust** issue, not an ATS one — no Info.plist key
bypasses it. Install your CA/cert on the iPhone instead: AirDrop the `.crt` →
Settings → Profile Downloaded → Install → then Settings → General → About →
Certificate Trust Settings → enable full trust. Verify in Safari on the phone
(`https://git.now.lan/events` should load without warning). The cert needs
`subjectAltName: DNS:git.now.lan` and ≤825-day validity or iOS refuses it.
(Only if you ever fall back to plain `http://` on the LAN would you add
`NSAppTransportSecurity` → `NSAllowsLocalNetworking` = YES.)

## Point it at your server

Settings tab → enter the endpoint (e.g. `http://192.168.1.20:8787`). The phone
must be able to reach the machine running `node server/server.mjs` — same Wi-Fi,
or better, a [Tailscale](https://tailscale.com) address so it works anywhere.

## How tracking works

- **CLVisit monitoring** — iOS itself detects "you arrived / you left" with almost
  zero battery. On departure the visit is reverse-geocoded and logged as a
  `place` event with duration.
- **Significant location changes** keep a coarse trail between visits.
- **Health** — once per day, yesterday's steps + sleep are appended as one `health` event.
- **Capture tab** — camera or library photo → uploaded with auto date, optional
  description, and current coordinates.

Events that can't be sent (server unreachable) queue on-device and retry — nothing
is lost, and the log stays append-only.
