import SwiftUI

@main
struct LifeTrackerApp: App {
    @StateObject private var api = API.shared
    @StateObject private var location = LocationTracker.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(api)
                .environmentObject(location)
                .preferredColorScheme(.dark)
                .tint(Theme.gold)
                .onAppear {
                    location.start()
                    HealthSync.shared.requestAndSyncDaily()
                }
        }
    }
}

/// Matches the website / blog theme.
enum Theme {
    static let bg      = Color(red: 0x0F/255, green: 0x0C/255, blue: 0x09/255)
    static let card    = Color(red: 0x14/255, green: 0x10/255, blue: 0x0B/255)
    static let border  = Color(red: 0x2A/255, green: 0x22/255, blue: 0x18/255)
    static let gold    = Color(red: 0xD8/255, green: 0xA9/255, blue: 0x42/255)
    static let goldDim = Color(red: 0xB7/255, green: 0x8F/255, blue: 0x3A/255)
    static let ink     = Color(red: 0xEC/255, green: 0xE1/255, blue: 0xCF/255)
    static let body    = Color(red: 0xCD/255, green: 0xC1/255, blue: 0xAB/255)
    static let muted   = Color(red: 0x8C/255, green: 0x81/255, blue: 0x70/255)

    static func serif(_ size: CGFloat) -> Font { .system(size: size, weight: .medium, design: .serif).italic() }
    static func mono(_ size: CGFloat) -> Font { .system(size: size, design: .monospaced) }
}
