import Foundation
import CoreLocation

/// Talks to the Node server (server/server.mjs). Every event gets its date
/// prefilled automatically; failed sends are queued and retried.
final class API: ObservableObject {
    static let shared = API()

    @AppStorage_Compat("endpoint") var endpoint: String = "https://git.now.lan"
    @Published var pendingCount: Int = 0
    @Published var lastError: String?

    private var queue: [[String: Any]] = [] {
        didSet { DispatchQueue.main.async { self.pendingCount = self.queue.count } }
    }
    private let queueURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("pending-events.json")

    private init() { loadQueue() }

    static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// Append one event. `ts` is stamped automatically if absent.
    func log(_ event: [String: Any]) {
        var e = event
        if e["ts"] == nil { e["ts"] = API.isoFormatter.string(from: Date()) }
        queue.append(e)
        saveQueue()
        flush()
    }

    func logPlace(name: String, coordinate: CLLocationCoordinate2D, kind: String, seconds: Int, arrival: Date) {
        log([
            "ts": API.isoFormatter.string(from: arrival),
            "type": "place",
            "name": name,
            "lat": coordinate.latitude,
            "lng": coordinate.longitude,
            "kind": kind,
            "secs": seconds,
            "source": "iphone",
        ])
    }

    /// Upload a photo/audio/video. Server writes the media file and appends the event.
    func upload(kind: String, ext: String, data: Data, caption: String,
                coordinate: CLLocationCoordinate2D? = nil,
                completion: @escaping (Bool) -> Void) {
        var body: [String: Any] = [
            "kind": kind,
            "ext": ext,
            "dataBase64": data.base64EncodedString(),
            "caption": caption,
            "ts": API.isoFormatter.string(from: Date()),   // auto date
            "source": "iphone-share",
        ]
        if let c = coordinate { body["lat"] = c.latitude; body["lng"] = c.longitude }
        post(path: "/upload", json: body) { ok in DispatchQueue.main.async { completion(ok) } }
    }

    func flush() {
        guard !queue.isEmpty else { return }
        let batch = queue
        post(path: "/log", json: batch) { ok in
            if ok {
                self.queue.removeAll { e in batch.contains { NSDictionary(dictionary: $0).isEqual(to: e) } }
                self.saveQueue()
            }
        }
    }

    /// Verify an endpoint is reachable (OPTIONS /log — cheap, no data written).
    /// Pass a candidate endpoint to test it before saving; nil tests the stored one.
    func testConnection(endpoint candidate: String? = nil, completion: @escaping (Bool, String) -> Void) {
        let base = (candidate ?? endpoint).trimmingCharacters(in: .whitespaces)
        guard let url = URL(string: base + "/log") else {
            completion(false, "invalid URL ✗"); return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "OPTIONS"
        req.timeoutInterval = 6
        URLSession.shared.dataTask(with: req) { _, resp, err in
            DispatchQueue.main.async {
                if err != nil { completion(false, "unreachable ✗"); return }
                let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                completion((200..<300).contains(code), (200..<300).contains(code) ? "connected ✓" : "HTTP \(code) ✗")
            }
        }.resume()
    }

    private func post(path: String, json: Any, completion: @escaping (Bool) -> Void) {
        guard let url = URL(string: endpoint + path),
              let data = try? JSONSerialization.data(withJSONObject: json) else { completion(false); return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        URLSession.shared.dataTask(with: req) { _, resp, err in
            let ok = (resp as? HTTPURLResponse)?.statusCode == 200 && err == nil
            DispatchQueue.main.async { self.lastError = ok ? nil : (err?.localizedDescription ?? "server error") }
            completion(ok)
        }.resume()
    }

    private func saveQueue() {
        if let d = try? JSONSerialization.data(withJSONObject: queue) { try? d.write(to: queueURL) }
    }
    private func loadQueue() {
        if let d = try? Data(contentsOf: queueURL),
           let q = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]] { queue = q }
    }
}

/// Minimal @AppStorage stand-in usable inside ObservableObject.
@propertyWrapper
struct AppStorage_Compat<T> {
    let key: String
    let defaultValue: T
    init(wrappedValue: T, _ key: String) { self.key = key; self.defaultValue = wrappedValue }
    var wrappedValue: T {
        get { UserDefaults.standard.object(forKey: key) as? T ?? defaultValue }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}
