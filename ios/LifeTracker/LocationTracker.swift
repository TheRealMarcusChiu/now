import Foundation
import Combine
import CoreLocation

/// Whereabouts tracking with almost no battery cost:
///  - CLVisit monitoring gives arrive/depart pairs → place + duration (the good stuff)
///  - Significant location changes keep a coarse trail between visits
/// Each departed visit is reverse-geocoded and logged as a `place` event.
final class LocationTracker: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = LocationTracker()

    @Published var authorized = false
    @Published var paused = UserDefaults.standard.bool(forKey: "trackingPaused")
    @Published var lastVisitDescription: String = "—"
    @Published var recentVisits: [Visit] = []

    struct Visit: Identifiable {
        let id = UUID()
        let name: String
        let coordinate: CLLocationCoordinate2D
        let arrival: Date
        let departure: Date?
        var seconds: Int { Int((departure ?? Date()).timeIntervalSince(arrival)) }
    }

    private let manager = CLLocationManager()
    private let geocoder = CLGeocoder()

    func start() {
        manager.delegate = self
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = true
        manager.requestAlwaysAuthorization()
        if !paused { startMonitors() }
    }

    private func startMonitors() {
        manager.startMonitoringVisits()
        manager.startMonitoringSignificantLocationChanges()
    }

    /// Pause/resume all automatic location logging. Persisted across launches.
    func setPaused(_ p: Bool) {
        paused = p
        UserDefaults.standard.set(p, forKey: "trackingPaused")
        if p {
            manager.stopMonitoringVisits()
            manager.stopMonitoringSignificantLocationChanges()
        } else {
            startMonitors()
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorized = manager.authorizationStatus == .authorizedAlways
    }

    var currentCoordinate: CLLocationCoordinate2D? { manager.location?.coordinate }

    // MARK: visits → place events
    func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
        guard !paused else { return } // paused: drop even late-delivered visits
        // departureDate == distantFuture means we just ARRIVED; log on departure.
        guard visit.departureDate != Date.distantFuture,
              visit.arrivalDate != Date.distantPast else { return }
        let secs = Int(visit.departureDate.timeIntervalSince(visit.arrivalDate))
        guard secs >= 120 else { return } // ignore drive-bys

        let loc = CLLocation(latitude: visit.coordinate.latitude, longitude: visit.coordinate.longitude)
        geocoder.reverseGeocodeLocation(loc) { placemarks, _ in
            let pm = placemarks?.first
            let name = pm?.name ?? pm?.thoroughfare ?? "Unknown place"
            let kind = pm?.areasOfInterest?.first != nil ? "poi" : "street"
            DispatchQueue.main.async {
                self.lastVisitDescription = "\(name) · \(secs / 60)m"
                self.recentVisits.insert(
                    Visit(name: name, coordinate: visit.coordinate, arrival: visit.arrivalDate, departure: visit.departureDate),
                    at: 0)
                self.recentVisits = Array(self.recentVisits.prefix(50))
            }
            API.shared.logPlace(name: name, coordinate: visit.coordinate, kind: kind,
                                seconds: secs, arrival: visit.arrivalDate)
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // significant-change trail: kept in memory for the map; visits are what get logged
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { }
}
