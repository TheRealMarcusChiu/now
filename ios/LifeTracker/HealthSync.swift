import Foundation
import HealthKit

/// Daily Apple Health summary → one `health` event per day (steps + sleep).
final class HealthSync {
    static let shared = HealthSync()
    private let store = HKHealthStore()
    private let lastSyncKey = "healthLastSyncDay"

    func requestAndSyncDaily() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let read: Set<HKObjectType> = [
            HKQuantityType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
        ]
        store.requestAuthorization(toShare: nil, read: read) { ok, _ in
            guard ok else { return }
            self.syncYesterdayIfNeeded()
        }
    }

    /// Logs yesterday's summary once per day (append-only friendly).
    private func syncYesterdayIfNeeded() {
        guard !UserDefaults.standard.bool(forKey: "trackingPaused") else { return } // paused
        let cal = Calendar.current
        let todayKey = ISO8601DateFormatter.string(from: cal.startOfDay(for: Date()),
                                                   timeZone: .current, formatOptions: [.withFullDate])
        guard UserDefaults.standard.string(forKey: lastSyncKey) != todayKey else { return }

        let end = cal.startOfDay(for: Date())
        let start = cal.date(byAdding: .day, value: -1, to: end)!
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)

        let stepsType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
        let stepsQuery = HKStatisticsQuery(quantityType: stepsType, quantitySamplePredicate: predicate,
                                           options: .cumulativeSum) { _, stats, _ in
            let steps = Int(stats?.sumQuantity()?.doubleValue(for: .count()) ?? 0)
            self.fetchSleep(start: start, end: end) { sleepHrs in
                API.shared.log([
                    "ts": API.isoFormatter.string(from: end),
                    "type": "health",
                    "steps": steps,
                    "sleepHrs": (sleepHrs * 10).rounded() / 10,
                    "source": "Apple Health",
                ])
                UserDefaults.standard.set(todayKey, forKey: self.lastSyncKey)
            }
        }
        store.execute(stepsQuery)
    }

    private func fetchSleep(start: Date, end: Date, completion: @escaping (Double) -> Void) {
        let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        let predicate = HKQuery.predicateForSamples(withStart: start.addingTimeInterval(-6 * 3600), end: end)
        let q = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit,
                              sortDescriptors: nil) { _, samples, _ in
            let asleep = (samples as? [HKCategorySample] ?? []).filter {
                if #available(iOS 16.0, *) {
                    return HKCategoryValueSleepAnalysis.allAsleepValues.map(\.rawValue).contains($0.value)
                }
                return $0.value == HKCategoryValueSleepAnalysis.asleep.rawValue
            }
            let secs = asleep.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
            completion(secs / 3600)
        }
        store.execute(q)
    }
}
