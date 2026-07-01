import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            MapScreen()
                .tabItem { Label("Places", systemImage: "map") }
            CaptureView()
                .tabItem { Label("Capture", systemImage: "camera") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .background(Theme.bg)
    }
}

#Preview { ContentView().environmentObject(API.shared).environmentObject(LocationTracker.shared) }
