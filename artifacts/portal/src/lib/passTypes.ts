// Shared pass-type constants — imported by both page components and sub-components.
// Keeps PASS_STYLE, category sets, and the ordered type list in one place.

export interface PassTypeStyle { bg: string; fg: string }

// Paying tier uses blue/green/amber family; Comp tier uses purple/grey/slate family.
export const PASS_STYLE: Record<string, PassTypeStyle> = {
  Paid:        { bg: "#E6F1FB", fg: "#0C447C" },
  EarlyBird:   { bg: "#E1F5EE", fg: "#0F6E56" },
  Standard:    { bg: "#EAF0FB", fg: "#2356A5" },
  Late:        { bg: "#FEF3E2", fg: "#B45309" },
  VIP:         { bg: "#FBF3E2", fg: "#8A6516" },
  FreeSponsor: { bg: "#EEE6F8", fg: "#5E35B1" },
  FreeComp:    { bg: "#F1EFE8", fg: "#5A6472" },
  Speaker:     { bg: "#E2F4F2", fg: "#0D6B5E" },
  Press:       { bg: "#EEF2F5", fg: "#3D5A73" },
  Official:    { bg: "#E8ECF4", fg: "#2B4070" },
};

export const PASS_STYLE_FALLBACK: PassTypeStyle = { bg: "#F1EFE8", fg: "#5A6472" };

export const PAYING_TYPES = new Set(["Paid", "EarlyBird", "Standard", "Late", "VIP"]);
export const COMP_TYPES   = new Set(["FreeSponsor", "FreeComp", "Speaker", "Press", "Official"]);

export const ALL_PASS_TYPES = [
  "Paid", "EarlyBird", "Standard", "Late", "VIP",
  "FreeSponsor", "FreeComp", "Speaker", "Press", "Official",
] as const;
