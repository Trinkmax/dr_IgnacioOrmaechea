import type { CSSProperties } from "react";

/** Paleta curada para tratamientos: tonos apagados que conviven con la porcelana. */
export const TREATMENT_COLORS = {
  rose: { name: "Rosa", solid: "#c8576f", soft: "#fbeef1", ink: "#7e2b3f", ring: "#efc9d2" },
  coral: { name: "Coral", solid: "#d56a4e", soft: "#fcefea", ink: "#843722", ring: "#f3cdc1" },
  amber: { name: "Ámbar", solid: "#c3861b", soft: "#fbf3e1", ink: "#6e4b0b", ring: "#eedaa9" },
  sand: { name: "Arena", solid: "#a67e4d", soft: "#f7f1e8", ink: "#5e4527", ring: "#e4d4bc" },
  olive: { name: "Oliva", solid: "#7b8733", soft: "#f3f5e6", ink: "#454c19", ring: "#d9dfb2" },
  sage: { name: "Salvia", solid: "#4d8b64", soft: "#ebf4ee", ink: "#285039", ring: "#c4ddcd" },
  teal: { name: "Turquesa", solid: "#228d88", soft: "#e6f4f3", ink: "#14514e", ring: "#bde0dd" },
  sky: { name: "Cielo", solid: "#3381bb", soft: "#e8f1f9", ink: "#1c4a6e", ring: "#c1d8ec" },
  indigo: { name: "Índigo", solid: "#5662c1", soft: "#edeffa", ink: "#2e377a", ring: "#cbd0ef" },
  violet: { name: "Violeta", solid: "#8256bb", soft: "#f3edfa", ink: "#4c2f75", ring: "#dacbee" },
  plum: { name: "Ciruela", solid: "#9b4682", soft: "#f8ecf4", ink: "#5e2550", ring: "#e8cade" },
  wine: { name: "Vino", solid: "#98384c", soft: "#f8ebee", ink: "#5c1d2b", ring: "#e7c5cd" },
  stone: { name: "Piedra", solid: "#82776b", soft: "#f3f1ee", ink: "#4a433b", ring: "#dbd5cd" },
  slate: { name: "Pizarra", solid: "#637387", soft: "#eef1f4", ink: "#36414f", ring: "#ced5de" },
} as const;

export type TreatmentColor = keyof typeof TREATMENT_COLORS;

export const COLOR_KEYS = Object.keys(TREATMENT_COLORS) as TreatmentColor[];

export function treatmentColor(key: string | null | undefined) {
  return TREATMENT_COLORS[(key as TreatmentColor) ?? "slate"] ?? TREATMENT_COLORS.slate;
}

/** Variables CSS para pintar componentes con el color del tratamiento. */
export function colorVars(key: string | null | undefined): CSSProperties {
  const c = treatmentColor(key);
  return {
    "--tc": c.solid,
    "--tc-soft": c.soft,
    "--tc-ink": c.ink,
    "--tc-ring": c.ring,
  } as CSSProperties;
}

/** Color estable para avatares a partir del nombre. */
const AVATAR_KEYS: TreatmentColor[] = ["rose", "coral", "amber", "sage", "teal", "sky", "indigo", "violet", "plum", "sand"];
export function avatarColor(seed: string | null | undefined) {
  let hash = 0;
  for (const ch of seed ?? "") hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return TREATMENT_COLORS[AVATAR_KEYS[Math.abs(hash) % AVATAR_KEYS.length]];
}
