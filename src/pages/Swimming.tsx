import { EnduranceSportPage } from "@/components/sport/EnduranceSportPage";

const SWIMMING_RECORDS = [
  { key: "1500m", label: "1 500 m", kind: "time" as const },
  { key: "3000m", label: "3 000 m", kind: "time" as const },
  { key: "longest", label: "Plus longue séance", kind: "distance" as const },
];

export default function Swimming() {
  return (
    <EnduranceSportPage
      title="Natation"
      sportType="swimming"
      themeColor="hsl(172, 66%, 42%)"
      accentColor="hsl(166, 72%, 45%)"
      records={SWIMMING_RECORDS}
    />
  );
}
