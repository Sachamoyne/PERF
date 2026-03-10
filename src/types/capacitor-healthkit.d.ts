// Type stubs for Capacitor native plugins (installed locally for iOS builds)
declare module "@nicklassvendsrud/capacitor-healthkit" {
  export const CapacitorHealthkit: {
    requestAuthorization(options: {
      all: string[];
      read: string[];
      write: string[];
    }): Promise<void>;
    queryHKitSampleType(options: {
      sampleName: string;
      startDate: string;
      endDate: string;
      limit: number;
    }): Promise<{ resultData: Array<{ startDate: string; value: number }> }>;
  };
}
