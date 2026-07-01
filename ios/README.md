# LifeTracker iOS — setup

SwiftUI sources for the whereabouts app: map of everywhere you've been (pins with
visit durations), a recency-weighted heatmap, camera/library photo sharing with
auto-filled date + optional description, and a daily Apple Health summary.

## Create the Xcode project

1. Xcode → New Project → iOS App → name **LifeTracker**, interface SwiftUI, language Swift.
2. Delete the generated `ContentView.swift` / `LifeTrackerApp.swift`, then drag every
   `.swift` file from this folder into the project.
3. Minimum deployment target: **iOS 16**.

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

App Transport Security: if your server is plain `http://` on your LAN, add
`NSAppTransportSecurity` → `NSAllowsLocalNetworking` = YES (or use HTTPS/Tailscale).

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
