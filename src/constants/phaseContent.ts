import type { TrainingPhaseKey } from "@/hooks/useActivePhase";

export const WEIGHT_PHASE_CONTENT: Record<
  TrainingPhaseKey,
  { info: string; targetRow: string }
> = {
  lean_bulk: {
    info: "Dans le cadre d'un lean bulk, une prise de 0,5 à 1 kg/mois est idéale — assez pour construire du muscle sans accumuler trop de gras. Une prise trop rapide (>1,5 kg/mois) signifie souvent trop de gras. Trop lente (<0,2 kg/mois) peut indiquer un déficit calorique.",
    targetRow: "+0,5 à +1 kg/mois",
  },
  bulk_total: {
    info: "En bulk total, l'objectif est une prise rapide de masse. Une progression de 1 à 2 kg/mois est attendue. Une partie sera du gras — c'est acceptable. L'essentiel est de maximiser le volume musculaire sur la période.",
    targetRow: "+1 à +2 kg/mois",
  },
  maintenance: {
    info: "En maintenance, le poids doit rester stable à ±0,5 kg près sur le mois. Des fluctuations journalières de 1 à 2 kg sont normales (eau, digestion). Surveiller la tendance sur 4 semaines plutôt que les variations quotidiennes.",
    targetRow: "0 kg/mois (±0,5 toléré)",
  },
  cut: {
    info: "En sèche, une perte de 0,5 à 1 kg/mois préserve mieux le muscle qu'une perte rapide. Une perte trop rapide (>1,5 kg/mois) indique souvent une dégradation musculaire. Peser à jeun le matin pour minimiser la variabilité.",
    targetRow: "-0,5 à -1 kg/mois",
  },
  race_prep: {
    info: "En préparation course, le poids doit rester stable ou baisser légèrement. Les fluctuations liées à l'hydratation sont plus importantes avec le volume de course élevé. Ne pas chercher à perdre du poids — privilégier la performance.",
    targetRow: "stable (0 à -0,5 kg/mois)",
  },
};

export const CALORIES_PHASE_INFO: Record<TrainingPhaseKey, string> = {
  lean_bulk:
    "Les calories pilotent ton bilan énergétique. En lean bulk, un surplus de 200-400 kcal/jour est optimal pour construire du muscle sans excès de gras.",
  bulk_total:
    "En bulk total, un surplus de 500-700 kcal/jour accélère la prise de masse. Accepte une légère prise de gras — elle sera adressée lors d'une phase de sèche.",
  maintenance:
    "En maintenance, l'objectif est l'équilibre. Manger à hauteur de ta dépense énergétique totale pour maintenir ta composition corporelle.",
  cut:
    "En sèche, un déficit de 300-500 kcal/jour permet une perte de gras progressive tout en préservant le muscle. Ne pas descendre sous 1 800 kcal/jour.",
  race_prep:
    "En préparation course, les glucides sont prioritaires pour alimenter les longues sorties. Un léger surplus les jours de grosse sortie est normal et souhaitable.",
};

export const STEPS_PHASE_INFO: Record<TrainingPhaseKey, string> = {
  lean_bulk:
    "10 000 pas/jour représente ~500-600 kcal de dépense supplémentaire par semaine sans impact sur la récupération musculaire. C'est l'activité NEAT idéale pour rester lean pendant un lean bulk.",
  bulk_total:
    "En bulk total, maintenir un bon volume de pas aide à limiter la prise de gras tout en gardant un surplus calorique élevé pour progresser en masse.",
  maintenance:
    "En maintenance, un niveau de pas stable permet de garder une dépense énergétique constante et d'éviter les variations de poids liées au NEAT.",
  cut:
    "En sèche, les pas quotidiens augmentent la dépense sans fatiguer le système nerveux comme une séance cardio intense, ce qui aide à préserver le muscle.",
  race_prep:
    "En préparation course, les pas restent utiles pour le NEAT, mais la priorité reste la qualité des séances de course et de récupération.",
};
