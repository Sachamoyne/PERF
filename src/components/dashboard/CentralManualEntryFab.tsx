import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLatestMetrics } from "@/hooks/useHealthMetrics";
import { useUpsertHealthMetric } from "@/hooks/useUpsertHealthMetric";
import {
  consumeManualEntryOpenFlag,
  ensureManualEntryNotificationListener,
  getManualEntryOpenEventName,
  syncManualEntryReminderSchedule,
} from "@/services/manualEntryReminder";

const toLocalDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const formatNum = (value?: number | null) => (typeof value === "number" ? String(Math.round(value * 10) / 10) : "");

export function CentralManualEntryFab({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const [hrv, setHrv] = useState("");
  const [vo2max, setVo2max] = useState("");

  const { data: latestMetrics = {} } = useLatestMetrics();

  const upsertHealthMetric = useUpsertHealthMetric();

  const placeholders = useMemo(() => {
    return {
      hrv: formatNum(latestMetrics?.hrv?.value),
      vo2max: formatNum(latestMetrics?.vo2max?.value),
    };
  }, [latestMetrics]);

  useEffect(() => {
    void ensureManualEntryNotificationListener();
    void syncManualEntryReminderSchedule(undefined, { requestPermissions: false });
  }, []);

  useEffect(() => {
    const openFromUrl = new URLSearchParams(window.location.search).get("openManualEntry") === "1";
    const openFromFlag = consumeManualEntryOpenFlag();
    if (openFromUrl || openFromFlag) {
      setOpen(true);
      if (openFromUrl) {
        const url = new URL(window.location.href);
        url.searchParams.delete("openManualEntry");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }
  }, []);

  useEffect(() => {
    const eventName = getManualEntryOpenEventName();
    const handler = () => setOpen(true);
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, []);

  const anyPending = upsertHealthMetric.isPending;

  const parseOptionalPositiveNumber = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const resetFields = () => {
    setHrv("");
    setVo2max("");
  };

  const handleSaveAll = async () => {
    const hrvV = parseOptionalPositiveNumber(hrv);
    const vo2maxV = parseOptionalPositiveNumber(vo2max);

    if ([hrvV, vo2maxV].includes(null)) {
      toast.error("Certaines valeurs sont invalides");
      return;
    }

    const tasks: Promise<unknown>[] = [];

    if (hrvV !== undefined) {
      tasks.push(
        upsertHealthMetric.mutateAsync({
          date,
          metric_type: "hrv",
          value: hrvV,
          unit: "ms",
        })
      );
    }

    if (vo2maxV !== undefined) {
      tasks.push(
        upsertHealthMetric.mutateAsync({
          date,
          metric_type: "vo2max",
          value: vo2maxV,
          unit: "ml/kg/min",
        })
      );
    }

    if (tasks.length === 0) {
      toast.info("Renseigne au moins un champ");
      return;
    }

    try {
      await Promise.all(tasks);
      toast.success("Données enregistrées ✓");
      resetFields();
      setOpen(false);
    } catch (error: any) {
      toast.error(error?.message ?? "Impossible d'enregistrer les données");
    }
  };

  return (
    <div className="fixed right-6 z-[70] bottom-[calc(80px+env(safe-area-inset-bottom,0px))] md:bottom-6">
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button
            className="h-12 px-5 rounded-full bg-primary text-[#0A0A0A] shadow-[0_4px_20px_rgba(0,230,118,0.30)] font-semibold"
            aria-label="Saisir des données"
          >
            <Pencil className="h-4 w-4 mr-2" />
            Saisir
          </Button>
        </DrawerTrigger>
        <DrawerContent className="bg-card border-border max-h-[46vh]">
          <DrawerHeader>
            <DrawerTitle>Saisie rapide du jour ({date || toLocalDateStr(new Date())})</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-2 grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <Label>HRV (ms)</Label>
              <Input type="number" step="0.1" value={hrv} onChange={(e) => setHrv(e.target.value)} placeholder={placeholders.hrv || "ex: 62"} />
            </div>
            <div className="space-y-1">
              <Label>VO2Max (ml/kg/min)</Label>
              <Input type="number" step="0.1" value={vo2max} onChange={(e) => setVo2max(e.target.value)} placeholder={placeholders.vo2max || "ex: 50"} />
            </div>
          </div>
          <DrawerFooter>
            <Button onClick={handleSaveAll} disabled={anyPending}>
              {anyPending ? "Enregistrement..." : "Enregistrer tout"}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">Annuler</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
