import Capacitor
import HealthKit

@objc(NutritionPlugin)
public class NutritionPlugin: CAPPlugin {

    private let healthStore = HKHealthStore()

    @objc override public func load() {
        CAPLog.print("⚡️ NutritionPlugin loaded")
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false])
            return
        }
        guard let proteinType = HKQuantityType.quantityType(forIdentifier: .dietaryProtein) else {
            call.resolve(["granted": false])
            return
        }
        healthStore.requestAuthorization(toShare: [], read: [proteinType]) { success, _ in
            call.resolve(["granted": success])
        }
    }

    @objc func queryDietaryProtein(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let proteinType = HKQuantityType.quantityType(forIdentifier: .dietaryProtein)
        else {
            call.resolve(["samples": []])
            return
        }
        let days = call.getInt("days") ?? 90
        let startDate = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: Date())
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(
            sampleType: proteinType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [sort]
        ) { _, results, _ in
            let fmt = ISO8601DateFormatter()
            let output: [[String: Any]] = (results as? [HKQuantitySample] ?? []).map { s in
                [
                    "startDate": fmt.string(from: s.startDate),
                    "value": s.quantity.doubleValue(for: HKUnit.gram()),
                    "unit": "g"
                ]
            }
            call.resolve(["samples": output])
        }
        self.healthStore.execute(query)
    }
}
