import { useHealthMetrics } from "@/hooks/useHealthData";
import { format } from "date-fns";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function MetricsHistory() {
  const { data: metrics = [] } = useHealthMetrics(30);

  const sorted = [...metrics].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Accordion type="single" collapsible className="glass-card">
      <AccordionItem value="history" className="border-b-0">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <span className="font-display font-semibold text-sm text-foreground">
            Historique des métriques ({sorted.length})
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-right py-2 px-3">Valeur</th>
                  <th className="text-right py-2 px-3">Unité</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 50).map((m) => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="py-2 px-3 text-foreground">{format(new Date(m.date), "dd/MM/yyyy")}</td>
                    <td className="py-2 px-3 text-foreground uppercase text-xs font-medium">{m.metric_type}</td>
                    <td className="py-2 px-3 text-right text-foreground">{m.value.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{m.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
