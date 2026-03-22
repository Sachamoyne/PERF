#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@capgo",
  "capacitor-health",
  "ios",
  "Sources",
  "HealthPlugin",
  "Health.swift"
);

if (!fs.existsSync(filePath)) {
  console.error(`[patch] Fichier introuvable: ${filePath}`);
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (
  content.includes("case dietaryProtein") &&
  content.includes("case dietaryCarbohydrates") &&
  content.includes("case dietaryFat")
) {
  console.log("[patch] Health.swift déjà patché — skip");
  process.exit(0);
}

const replaceStrict = (source, needle, replacement, stepName) => {
  if (!source.includes(needle)) {
    throw new Error(`[patch] Échec ${stepName}: motif introuvable`);
  }
  return source.replace(needle, replacement);
};

try {
  // 1) Enum HealthDataType
  content = replaceStrict(
    content,
    "    case bodyFat\n",
    "    case bodyFat\n    case dietaryProtein\n    case dietaryCarbohydrates\n    case dietaryFat\n",
    "enum cases"
  );

  // 2) Mapping quantityType -> HKQuantityTypeIdentifier
  content = replaceStrict(
    content,
    "        case .bodyFat:\n            identifier = .bodyFatPercentage\n",
    "        case .bodyFat:\n            identifier = .bodyFatPercentage\n        case .dietaryProtein:\n            identifier = .dietaryProtein\n        case .dietaryCarbohydrates:\n            identifier = .dietaryCarbohydrates\n        case .dietaryFat:\n            identifier = .dietaryFatTotal\n",
    "quantityType mapping"
  );

  // 3) defaultUnit switch exhaustif
  content = replaceStrict(
    content,
    "        case .bodyFat:\n            return HKUnit.percent()\n",
    "        case .bodyFat:\n            return HKUnit.percent()\n        case .dietaryProtein, .dietaryCarbohydrates, .dietaryFat:\n            return HKUnit.gram()\n",
    "defaultUnit mapping"
  );

  // 4) unitIdentifier switch exhaustif
  content = replaceStrict(
    content,
    "        case .bodyFat:\n            return \"percent\"\n",
    "        case .bodyFat:\n            return \"percent\"\n        case .dietaryProtein, .dietaryCarbohydrates, .dietaryFat:\n            return \"gram\"\n",
    "unitIdentifier mapping"
  );
} catch (err) {
  console.error(String(err));
  process.exit(1);
}

fs.writeFileSync(filePath, content, "utf8");
console.log("[patch] Health.swift patché avec succès — dietaryProtein, dietaryCarbohydrates, dietaryFat ajoutés");
