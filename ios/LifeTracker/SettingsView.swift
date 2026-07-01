import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var api: API
    @EnvironmentObject var location: LocationTracker
    @State private var endpoint: String = API.shared.endpoint
    @State private var testMessage: String?
    @State private var testOK = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("http://your-server:8787", text: $endpoint)
                        .font(Theme.mono(14))
                        .autocapitalization(.none)
                        .keyboardType(.URL)
                        .onSubmit { api.endpoint = endpoint }
                    Button("Test connection") {
                        testMessage = "testing…"
                        api.testConnection(endpoint: endpoint) { ok, msg in
                            testOK = ok
                            testMessage = msg
                        }
                    }.foregroundStyle(Theme.gold)
                    if let msg = testMessage {
                        Text(msg)
                            .font(Theme.mono(12))
                            .foregroundStyle(msg == "testing…" ? Theme.muted : (testOK ? Color.green : Color.red))
                    }
                    Button("Save & retry queue") {
                        api.endpoint = endpoint
                        api.flush()
                    }.foregroundStyle(Theme.gold)
                } header: {
                    Text("SERVER ENDPOINT").font(Theme.mono(10)).kerning(1.5)
                } footer: {
                    Text("The Node server from your repo (node server/server.mjs). Use your machine's LAN IP or a Tailscale address so the phone can reach it.")
                }

                Section("Status") {
                    LabeledContent("Location authorized", value: location.authorized ? "always ✓" : "no")
                    LabeledContent("Last visit", value: location.lastVisitDescription)
                    LabeledContent("Pending events", value: "\(api.pendingCount)")
                    if let err = api.lastError {
                        Text(err).font(Theme.mono(11)).foregroundStyle(.red)
                    }
                }

                Section {
                    Text("Everything sent is append-only: the server only ever adds lines to data/events.jsonl. Dates are always stamped automatically.")
                        .font(Theme.mono(11)).foregroundStyle(Theme.muted)
                }
            }
            .navigationTitle("Settings")
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
        }
    }
}
