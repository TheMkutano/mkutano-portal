export interface Sector {
  value: string;
  label: string;
  regulated: boolean;
}

export const SECTORS: Sector[] = [
  { value: "Energy",           label: "Energy & Power",                regulated: true  },
  { value: "FinancialServices",label: "Financial Services",            regulated: true  },
  { value: "Banking",          label: "Banking",                        regulated: true  },
  { value: "Insurance",        label: "Insurance",                      regulated: true  },
  { value: "PensionFunds",     label: "Pensions & Asset Management",   regulated: true  },
  { value: "Telecoms",         label: "Telecoms & ICT",                 regulated: true  },
  { value: "Mining",           label: "Mining & Extractives",           regulated: true  },
  { value: "Pharmaceuticals",  label: "Pharmaceuticals",                regulated: true  },
  { value: "Aviation",         label: "Aviation & Transport",           regulated: true  },
  { value: "Water",            label: "Water & Sanitation",             regulated: true  },
  { value: "Agriculture",      label: "Agriculture & Agri-processing",  regulated: false },
  { value: "Manufacturing",    label: "Manufacturing",                   regulated: false },
  { value: "RealEstate",       label: "Real Estate & Construction",     regulated: false },
  { value: "Technology",       label: "Technology",                      regulated: false },
  { value: "Tourism",          label: "Tourism & Hospitality",          regulated: false },
  { value: "Education",        label: "Education",                       regulated: false },
  { value: "Healthcare",       label: "Healthcare (non-pharma)",        regulated: false },
  { value: "Retail",           label: "Retail & FMCG",                  regulated: false },
  { value: "Infrastructure",   label: "Infrastructure",                  regulated: false },
  { value: "Climate",          label: "Climate & Environment",          regulated: false },
  { value: "Other",            label: "Other",                           regulated: false },
];

export const REGULATED_SECTOR_VALUES = new Set(
  SECTORS.filter((s) => s.regulated).map((s) => s.value)
);

export function isRegulated(sector: string | null | undefined): boolean {
  if (!sector) return false;
  return REGULATED_SECTOR_VALUES.has(sector);
}

export function sectorLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return SECTORS.find((s) => s.value === value)?.label ?? value;
}
