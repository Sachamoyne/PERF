import { registerPlugin } from "@capacitor/core";

export interface NutritionPluginInterface {
  requestAuthorization(): Promise<{ granted: boolean }>;
  queryDietaryProtein(options: { days: number }): Promise<{
    samples: Array<{ startDate: string; value: number; unit: string }>;
  }>;
}

export const NutritionPlugin = registerPlugin<NutritionPluginInterface>("NutritionPlugin");
