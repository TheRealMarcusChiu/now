import SwiftUI
import MapKit

/// Google-Maps-style view of everywhere you've been: pins per place with visit
/// duration, plus a recency-weighted heatmap overlay of recent places.
struct MapScreen: View {
    @EnvironmentObject var location: LocationTracker
    @State private var heatOn = true

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                HeatMapView(visits: location.recentVisits, heatOn: heatOn)
                    .ignoresSafeArea(edges: .top)

                VStack(spacing: 10) {
                    Toggle(isOn: $heatOn) {
                        Text("HEATMAP — RECENCY WEIGHTED")
                            .font(Theme.mono(10)).kerning(1.5)
                            .foregroundStyle(Theme.goldDim)
                    }
                    .toggleStyle(.switch)
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Theme.card.opacity(0.95), in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border))

                    if let latest = location.recentVisits.first {
                        HStack {
                            Circle().fill(Theme.gold).frame(width: 8, height: 8)
                            Text(latest.name).font(Theme.serif(17)).foregroundStyle(Theme.ink)
                            Spacer()
                            Text("\(latest.seconds / 60)m").font(Theme.mono(12)).foregroundStyle(Theme.goldDim)
                        }
                        .padding(14)
                        .background(Theme.card.opacity(0.95), in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border))
                    }
                }
                .padding(16)
            }
            .navigationTitle("Places")
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
    }
}

/// MKMapView wrapper: pin per visit + MKOverlay heat circles weighted by recency.
struct HeatMapView: UIViewRepresentable {
    let visits: [LocationTracker.Visit]
    let heatOn: Bool

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.pointOfInterestFilter = .excludingAll
        map.overrideUserInterfaceStyle = .dark
        map.showsUserLocation = true
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        map.removeAnnotations(map.annotations.filter { !($0 is MKUserLocation) })
        map.removeOverlays(map.overlays)

        for v in visits {
            let pin = MKPointAnnotation()
            pin.coordinate = v.coordinate
            pin.title = v.name
            pin.subtitle = "\(v.seconds / 60) min"
            map.addAnnotation(pin)
        }

        if heatOn {
            let now = Date()
            for v in visits {
                let ageDays = now.timeIntervalSince(v.departure ?? v.arrival) / 86_400
                let weight = max(0.15, 1.0 - ageDays / 35.0)      // recency → intensity
                let radius = 120.0 + Double(min(v.seconds, 7200)) / 30.0 // duration → size
                let circle = HeatCircle(center: v.coordinate, radius: radius)
                circle.weight = weight
                map.addOverlay(circle)
            }
        }

        if !visits.isEmpty && !context.coordinator.didFit {
            context.coordinator.didFit = true
            let coords = visits.map(\.coordinate)
            var rect = MKMapRect.null
            for c in coords { rect = rect.union(MKMapRect(origin: MKMapPoint(c), size: .init(width: 1, height: 1))) }
            map.setVisibleMapRect(rect, edgePadding: .init(top: 80, left: 60, bottom: 160, right: 60), animated: false)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class HeatCircle: MKCircle { var weight: Double = 0.5 }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var didFit = false

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let c = overlay as? HeatCircle else { return MKOverlayRenderer(overlay: overlay) }
            let r = MKCircleRenderer(circle: c)
            // gold heat, brighter = more recent (matches the website palette)
            r.fillColor = UIColor(red: 0xD8/255, green: 0xA9/255, blue: 0x42/255, alpha: 0.14 + 0.30 * c.weight)
            r.strokeColor = .clear
            return r
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard !(annotation is MKUserLocation) else { return nil }
            let id = "visit"
            let v = mapView.dequeueReusableAnnotationView(withIdentifier: id) as? MKMarkerAnnotationView
                ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: id)
            v.annotation = annotation
            v.markerTintColor = UIColor(red: 0xD8/255, green: 0xA9/255, blue: 0x42/255, alpha: 1)
            v.glyphImage = UIImage(systemName: "mappin")
            return v
        }
    }
}
