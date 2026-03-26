import { EnduranceSportPage } from "@/components/sport/EnduranceSportPage";

const CYCLING_RECORDS = [
  { key: "20km", label: "20 km", kind: "time" as const },
  { key: "50km", label: "50 km", kind: "time" as const },
  { key: "100km", label: "100 km", kind: "time" as const },
  { key: "longest", label: "Plus longue sortie", kind: "distance" as const },
];

export default function Cycling() {
  return (
    <EnduranceSportPage
      title="Vélo"
      sportType="cycling"
      themeColor="hsl(205, 82%, 47%)"
      accentColor="hsl(197, 78%, 52%)"
      records={CYCLING_RECORDS}
    />
  );
}
