import { useState, useMemo } from "react";
import { useConvening } from "@/contexts/ConveningContext";
import {
  useListBooths,
  useListExhibitors,
  useCreateBooth,
  useUpdateBooth,
  useDeleteBooth,
  useCreateExhibitor,
  useUpdateExhibitor,
  useDeleteExhibitor,
  getListBoothsQueryKey,
  getListExhibitorsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import {
  Store, Plus, Pencil, Trash2, LayoutGrid, Users,
  MapPin, ExternalLink, ChevronRight, FileSpreadsheet,
} from "lucide-react";
import { exportXlsx } from "@/lib/exportXlsx";
import type { Booth, Exhibitor } from "@workspace/api-client-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_DEFAULTS: Record<string, { sizeSqm: number; price: number }> = {
  Premium:  { sizeSqm: 24, price: 8000 },
  Standard: { sizeSqm: 12, price: 4000 },
  Startup:  { sizeSqm: 6,  price: 1500 },
};

const TIER_DIMS: Record<string, { width: number; height: number }> = {
  Premium:  { width: 180, height: 120 },
  Standard: { width: 140, height: 95  },
  Startup:  { width: 95,  height: 65  },
};

const SAMPLE_BOOTHS = [
  { code: "A1", zone: "Zone A", tier: "Premium"  as const, posX: 20,  posY: 50,  ...TIER_DIMS.Premium,  ...TIER_DEFAULTS.Premium  },
  { code: "A2", zone: "Zone A", tier: "Premium"  as const, posX: 220, posY: 50,  ...TIER_DIMS.Premium,  ...TIER_DEFAULTS.Premium  },
  { code: "A3", zone: "Zone A", tier: "Premium"  as const, posX: 20,  posY: 190, ...TIER_DIMS.Premium,  ...TIER_DEFAULTS.Premium  },
  { code: "A4", zone: "Zone A", tier: "Premium"  as const, posX: 220, posY: 190, ...TIER_DIMS.Premium,  ...TIER_DEFAULTS.Premium  },
  { code: "B1", zone: "Zone B", tier: "Standard" as const, posX: 20,  posY: 370, ...TIER_DIMS.Standard, ...TIER_DEFAULTS.Standard },
  { code: "B2", zone: "Zone B", tier: "Standard" as const, posX: 180, posY: 370, ...TIER_DIMS.Standard, ...TIER_DEFAULTS.Standard },
  { code: "B3", zone: "Zone B", tier: "Standard" as const, posX: 340, posY: 370, ...TIER_DIMS.Standard, ...TIER_DEFAULTS.Standard },
  { code: "B4", zone: "Zone B", tier: "Standard" as const, posX: 20,  posY: 485, ...TIER_DIMS.Standard, ...TIER_DEFAULTS.Standard },
  { code: "B5", zone: "Zone B", tier: "Standard" as const, posX: 180, posY: 485, ...TIER_DIMS.Standard, ...TIER_DEFAULTS.Standard },
  { code: "B6", zone: "Zone B", tier: "Standard" as const, posX: 340, posY: 485, ...TIER_DIMS.Standard, ...TIER_DEFAULTS.Standard },
  { code: "C1", zone: "Zone C", tier: "Startup"  as const, posX: 20,  posY: 640, ...TIER_DIMS.Startup,  ...TIER_DEFAULTS.Startup  },
  { code: "C2", zone: "Zone C", tier: "Startup"  as const, posX: 125, posY: 640, ...TIER_DIMS.Startup,  ...TIER_DEFAULTS.Startup  },
  { code: "C3", zone: "Zone C", tier: "Startup"  as const, posX: 230, posY: 640, ...TIER_DIMS.Startup,  ...TIER_DEFAULTS.Startup  },
  { code: "C4", zone: "Zone C", tier: "Startup"  as const, posX: 335, posY: 640, ...TIER_DIMS.Startup,  ...TIER_DEFAULTS.Startup  },
  { code: "C5", zone: "Zone C", tier: "Startup"  as const, posX: 20,  posY: 715, ...TIER_DIMS.Startup,  ...TIER_DEFAULTS.Startup  },
  { code: "C6", zone: "Zone C", tier: "Startup"  as const, posX: 125, posY: 715, ...TIER_DIMS.Startup,  ...TIER_DEFAULTS.Startup  },
  { code: "C7", zone: "Zone C", tier: "Startup"  as const, posX: 230, posY: 715, ...TIER_DIMS.Startup,  ...TIER_DEFAULTS.Startup  },
  { code: "C8", zone: "Zone C", tier: "Startup"  as const, posX: 335, posY: 715, ...TIER_DIMS.Startup,  ...TIER_DEFAULTS.Startup  },
];

// ── Tonal tokens ──────────────────────────────────────────────────────────────

const CONTRACT_TONAL: Record<string, { bg: string; color: string }> = {
  Prospect:   { bg: "#F1F5F9", color: "#475569" },
  Contracted: { bg: "#EFF6FF", color: "#1D4ED8" },
  Paid:       { bg: "#ECFDF5", color: "#059669" },
};

const TIER_TONAL: Record<string, { bg: string; color: string }> = {
  Premium:  { bg: "#FFFBEB", color: "#B45309" },
  Standard: { bg: "#EFF6FF", color: "#1D4ED8" },
  Startup:  { bg: "#F5F3FF", color: "#6D28D9" },
};

// Subtle tinted fill for each zone band
const ZONE_BAND: Record<string, { fill: string; stroke: string; label: string }> = {
  "Zone A": { fill: "#EFF6FF", stroke: "#BFDBFE", label: "#1D4ED8" },
  "Zone B": { fill: "#FFFBEB", stroke: "#FDE68A", label: "#B45309" },
  "Zone C": { fill: "#F5F3FF", stroke: "#DDD6FE", label: "#6D28D9" },
};

// ── Tonal badge ────────────────────────────────────────────────────────────────

function TonalBadge({ label, tonal }: { label: string; tonal?: { bg: string; color: string } }) {
  return (
    <span
      style={{
        background:   tonal?.bg    ?? "#F1F5F9",
        color:        tonal?.color ?? "#475569",
        fontSize:     11,
        fontWeight:   600,
        padding:      "2px 8px",
        borderRadius: 6,
        display:      "inline-block",
        lineHeight:   1.6,
        whiteSpace:   "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ── DS form label ──────────────────────────────────────────────────────────────

function FL({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] mb-1">
      {children}
    </label>
  );
}

// ── Hairline helpers ───────────────────────────────────────────────────────────

const HL = "0.5px solid #E3E8EE";

// ── SVG colour helpers ────────────────────────────────────────────────────────

function boothFill(status: string) {
  if (status === "Booked")   return "#E1F5EE";
  if (status === "Reserved") return "#FAEEDA";
  return "transparent";
}
function boothStroke(status: string) {
  if (status === "Booked")   return "#1D9E75";
  if (status === "Reserved") return "#BA7517";
  return "#CBD5E1";
}
function boothTextColor(status: string) {
  if (status === "Booked")   return "#1D9E75";
  if (status === "Reserved") return "#BA7517";
  return "#94A3B8";
}

// ── Form data types ────────────────────────────────────────────────────────────

type BoothFormData = {
  code: string; zone: string; tier: string;
  sizeSqm: string; price: string; status: string;
  posX: string; posY: string; width: string; height: string;
};

function emptyBoothForm(): BoothFormData {
  return { code: "", zone: "Zone A", tier: "Standard", sizeSqm: "12", price: "4000",
    status: "Available", posX: "0", posY: "0", width: "140", height: "95" };
}

type ExhibitorFormData = {
  company: string; sector: string; contactPerson: string;
  contactEmail: string; contactPhone: string; url: string;
  description: string; contractStatus: string; feeAmount: string;
};

function emptyExhibitorForm(): ExhibitorFormData {
  return { company: "", sector: "", contactPerson: "", contactEmail: "",
    contactPhone: "", url: "", description: "", contractStatus: "Prospect", feeAmount: "" };
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────

function SkeletonRows({ cols = 6, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} style={{ height: 44, borderBottom: HL }}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4">
              <div className="h-3.5 rounded bg-[#E3E8EE] animate-pulse" style={{ width: j === 0 ? "60%" : "40%" }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Floor plan SVG ────────────────────────────────────────────────────────────

function FloorPlan({
  booths,
  exhibitors,
  onBoothClick,
}: {
  booths: Booth[];
  exhibitors: Exhibitor[];
  onBoothClick: (booth: Booth) => void;
}) {
  const exhibitorMap = useMemo(() => {
    const m: Record<string, Exhibitor> = {};
    exhibitors.forEach(e => { m[e.id] = e; });
    return m;
  }, [exhibitors]);

  if (booths.length === 0) return null;

  const PAD = 36;
  const allX = booths.flatMap(b => [b.posX, b.posX + b.width]);
  const allY = booths.flatMap(b => [b.posY, b.posY + b.height]);
  const minX = Math.min(...allX) - PAD;
  const minY = Math.min(...allY) - PAD;
  const maxX = Math.max(...allX) + PAD;
  const maxY = Math.max(...allY) + PAD;
  const W = maxX - minX;
  const H = maxY - minY;

  // Zone bounding boxes
  const zones = Array.from(new Set(booths.map(b => b.zone)));
  const zoneBounds: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {};
  zones.forEach(z => {
    const zb = booths.filter(b => b.zone === z);
    const zPad = 10;
    zoneBounds[z] = {
      x1: Math.min(...zb.map(b => b.posX)) - zPad,
      y1: Math.min(...zb.map(b => b.posY)) - zPad,
      x2: Math.max(...zb.map(b => b.posX + b.width))  + zPad,
      y2: Math.max(...zb.map(b => b.posY + b.height)) + zPad,
    };
  });

  return (
    <div
      className="overflow-auto"
      style={{
        background: "#F6F8FB",
        border: HL,
        borderRadius: 10,
        padding: 16,
      }}
    >
      <svg
        viewBox={`${minX} ${minY} ${W} ${H}`}
        width={Math.min(W, 620)}
        height={H}
        className="mx-auto block"
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        {/* Zone band backgrounds */}
        {zones.map(zone => {
          const b = zoneBounds[zone];
          const band = ZONE_BAND[zone] ?? ZONE_BAND["Zone A"];
          return (
            <g key={zone}>
              <rect
                x={b.x1} y={b.y1}
                width={b.x2 - b.x1} height={b.y2 - b.y1}
                rx={8} ry={8}
                fill={band.fill}
                stroke={band.stroke}
                strokeWidth={0.75}
                opacity={0.5}
              />
              {/* Zone pill label */}
              <rect
                x={b.x1} y={b.y1 - 18}
                width={56} height={16}
                rx={4}
                fill={band.fill}
                stroke={band.stroke}
                strokeWidth={0.75}
              />
              <text
                x={b.x1 + 28} y={b.y1 - 6}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill={band.label}
                letterSpacing={0.6}
              >
                {zone.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* Booth rectangles */}
        {booths.map(booth => {
          const fill      = boothFill(booth.status);
          const stroke    = boothStroke(booth.status);
          const textClr   = boothTextColor(booth.status);
          const isAvail   = booth.status === "Available";
          const exName    = booth.exhibitorId ? (exhibitorMap[booth.exhibitorId]?.company ?? "") : "";
          const mainLabel = booth.status === "Booked" && exName
            ? exName
            : booth.status === "Reserved"
            ? "Reserved"
            : booth.code;
          const maxLabelChars = Math.floor(booth.width / 7);

          return (
            <g key={booth.id} onClick={() => onBoothClick(booth)} style={{ cursor: "pointer" }}>
              {/* Shadow rect */}
              <rect
                x={booth.posX + 1.5} y={booth.posY + 1.5}
                width={booth.width} height={booth.height}
                rx={5} ry={5}
                fill="rgba(15,31,51,0.06)"
              />
              <rect
                x={booth.posX} y={booth.posY}
                width={booth.width} height={booth.height}
                rx={5} ry={5}
                fill={fill}
                stroke={stroke}
                strokeWidth={isAvail ? 1 : 1.5}
                strokeDasharray={isAvail ? "4 3" : undefined}
              />
              {/* Booth code top-left */}
              <text
                x={booth.posX + 6} y={booth.posY + 14}
                fontSize={8} fontWeight={700}
                fill={isAvail ? "#94A3B8" : stroke}
                opacity={0.9}
              >
                {booth.code}
              </text>
              {/* Main label centered */}
              {booth.height > 40 && (
                <text
                  x={booth.posX + booth.width / 2}
                  y={booth.posY + booth.height / 2 + (isAvail ? 2 : 4)}
                  textAnchor="middle"
                  fontSize={Math.min(10, booth.width / 9)}
                  fill={textClr}
                  fontWeight={booth.status === "Booked" ? 600 : 400}
                >
                  {mainLabel.length > maxLabelChars
                    ? mainLabel.slice(0, maxLabelChars - 1) + "…"
                    : mainLabel}
                </text>
              )}
              {/* Price for available booths */}
              {isAvail && booth.height > 50 && (
                <text
                  x={booth.posX + booth.width / 2}
                  y={booth.posY + booth.height - 7}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#94A3B8"
                >
                  ${(Number(booth.price) / 1000).toFixed(0)}k
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-4 px-1 pb-0.5">
        {([
          { label: "Booked",    fill: "#E1F5EE", stroke: "#1D9E75", dashed: false },
          { label: "Reserved",  fill: "#FAEEDA", stroke: "#BA7517", dashed: false },
          { label: "Available", fill: "transparent", stroke: "#CBD5E1", dashed: true },
        ] as const).map(({ label, fill, stroke, dashed }) => (
          <div key={label} className="flex items-center gap-1.5">
            <svg width={14} height={14}>
              <rect x={1} y={1} width={12} height={12} rx={2.5}
                fill={fill} stroke={stroke} strokeWidth={1.5}
                strokeDasharray={dashed ? "3 2" : undefined}
              />
            </svg>
            <span className="text-[11px] text-[var(--brand-text-secondary)]">{label}</span>
          </div>
        ))}
        <span className="ml-auto text-[11px] text-[var(--brand-text-secondary)]">
          Click a booth to assign or release an exhibitor
        </span>
      </div>
    </div>
  );
}

// ── Booth detail / assign / edit dialog ───────────────────────────────────────

type BoothDialogMode = "view" | "edit";

function BoothDetailDialog({
  booth,
  exhibitors,
  onClose,
  onAssign,
  onRelease,
  onEdit,
  onDelete,
  loading,
}: {
  booth: Booth | null;
  exhibitors: Exhibitor[];
  onClose: () => void;
  onAssign: (boothId: string, exhibitorId: string) => void;
  onRelease: (boothId: string) => void;
  onEdit: (boothId: string, data: BoothFormData) => void;
  onDelete: (boothId: string) => void;
  loading: boolean;
}) {
  const [mode, setMode] = useState<BoothDialogMode>("view");
  const [selectedExhibitorId, setSelectedExhibitorId] = useState("");
  const [editForm, setEditForm] = useState<BoothFormData>(emptyBoothForm());

  if (!booth) return null;

  const isBooked = booth.status === "Booked";
  const currentExhibitor = exhibitors.find(e => e.id === booth.exhibitorId);
  const unassigned = exhibitors.filter(e => !booth.exhibitorId || e.id !== booth.exhibitorId);
  const tierTonal = TIER_TONAL[booth.tier] ?? TIER_TONAL.Standard;

  function openEdit() {
    if (!booth) return;
    setEditForm({
      code: booth.code, zone: booth.zone, tier: booth.tier,
      sizeSqm: String(booth.sizeSqm), price: String(booth.price),
      status: booth.status,
      posX: String(booth.posX), posY: String(booth.posY),
      width: String(booth.width), height: String(booth.height),
    });
    setMode("edit");
  }

  function setEField(k: keyof BoothFormData, v: string) {
    setEditForm(f => {
      const next = { ...f, [k]: v };
      if (k === "tier") {
        const def = TIER_DEFAULTS[v];
        const dim = TIER_DIMS[v];
        if (def) { next.sizeSqm = String(def.sizeSqm); next.price = String(def.price); }
        if (dim) { next.width = String(dim.width); next.height = String(dim.height); }
      }
      return next;
    });
  }

  function handleClose() {
    setMode("view");
    setSelectedExhibitorId("");
    onClose();
  }

  return (
    <Dialog open={!!booth} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[15px] font-semibold text-[var(--brand-ink)]">
              Booth {booth.code}
            </DialogTitle>
            <TonalBadge label={booth.tier} tonal={tierTonal} />
          </div>
        </DialogHeader>

        {mode === "view" ? (
          <>
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--brand-text-secondary)] pb-1">
              <span>{booth.zone}</span>
              <span>·</span>
              <span>{booth.sizeSqm} m²</span>
              <span>·</span>
              <span className="font-medium text-[var(--brand-ink)]">
                {formatMoney(Number(booth.price), "USD")}
              </span>
            </div>

            {/* Assigned / assign section */}
            {isBooked ? (
              <div
                className="rounded-lg p-4"
                style={{ background: "#E1F5EE", border: "1px solid #B7EED9" }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#1D9E75] mb-1">
                  Booked by
                </p>
                <p className="font-semibold text-[var(--brand-ink)]">
                  {currentExhibitor?.company ?? "—"}
                </p>
                {currentExhibitor?.contactEmail && (
                  <p className="text-[12px] text-[var(--brand-text-secondary)] mt-0.5">
                    {currentExhibitor.contactEmail}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <FL>Assign to exhibitor</FL>
                <Select value={selectedExhibitorId} onValueChange={setSelectedExhibitorId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select exhibitor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {unassigned.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.company}{e.sector ? ` — ${e.sector}` : ""}
                      </SelectItem>
                    ))}
                    {unassigned.length === 0 && (
                      <div className="px-3 py-2 text-xs text-[var(--brand-text-secondary)]">
                        No exhibitors yet — add one first.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter className="mt-2 flex-col gap-1.5 sm:flex-row">
              <button
                onClick={openEdit}
                className="text-[12px] text-[var(--brand-text-secondary)] hover:text-[var(--brand-ink)] transition-colors mr-auto flex items-center gap-1"
              >
                <Pencil className="h-3 w-3" />
                Edit details
              </button>
              <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
              {isBooked ? (
                <Button size="sm" variant="destructive"
                  onClick={() => onRelease(booth.id)} disabled={loading}>
                  Release booth
                </Button>
              ) : (
                <Button size="sm"
                  onClick={() => selectedExhibitorId && onAssign(booth.id, selectedExhibitorId)}
                  disabled={!selectedExhibitorId || loading}>
                  Assign
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Edit form */}
            <div className="grid grid-cols-2 gap-3 py-1">
              <div>
                <FL>Code *</FL>
                <Input className="h-9 text-sm" value={editForm.code}
                  onChange={e => setEField("code", e.target.value)} />
              </div>
              <div>
                <FL>Zone *</FL>
                <Input className="h-9 text-sm" value={editForm.zone}
                  onChange={e => setEField("zone", e.target.value)} />
              </div>
              <div>
                <FL>Tier</FL>
                <Select value={editForm.tier} onValueChange={v => setEField("tier", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Premium">Premium</SelectItem>
                    <SelectItem value="Standard">Standard</SelectItem>
                    <SelectItem value="Startup">Startup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FL>Status</FL>
                <Select value={editForm.status} onValueChange={v => setEField("status", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Available">Available</SelectItem>
                    <SelectItem value="Reserved">Reserved</SelectItem>
                    <SelectItem value="Booked">Booked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FL>Size (m²)</FL>
                <Input className="h-9 text-sm" type="number" value={editForm.sizeSqm}
                  onChange={e => setEField("sizeSqm", e.target.value)} />
              </div>
              <div>
                <FL>Price (USD)</FL>
                <Input className="h-9 text-sm" type="number" value={editForm.price}
                  onChange={e => setEField("price", e.target.value)} />
              </div>
              <div>
                <FL>Pos X</FL>
                <Input className="h-9 text-sm" type="number" value={editForm.posX}
                  onChange={e => setEField("posX", e.target.value)} />
              </div>
              <div>
                <FL>Pos Y</FL>
                <Input className="h-9 text-sm" type="number" value={editForm.posY}
                  onChange={e => setEField("posY", e.target.value)} />
              </div>
              <div>
                <FL>Width (px)</FL>
                <Input className="h-9 text-sm" type="number" value={editForm.width}
                  onChange={e => setEField("width", e.target.value)} />
              </div>
              <div>
                <FL>Height (px)</FL>
                <Input className="h-9 text-sm" type="number" value={editForm.height}
                  onChange={e => setEField("height", e.target.value)} />
              </div>
            </div>

            <DialogFooter className="mt-2 flex-col gap-1.5 sm:flex-row">
              <button
                onClick={() => {
                  if (confirm("Delete this booth? This cannot be undone.")) {
                    onDelete(booth.id);
                    handleClose();
                  }
                }}
                className="text-[12px] text-red-500 hover:text-red-700 transition-colors mr-auto flex items-center gap-1"
                disabled={loading}
              >
                <Trash2 className="h-3 w-3" />
                Delete booth
              </button>
              <Button variant="outline" size="sm" onClick={() => setMode("view")}>Back</Button>
              <Button size="sm"
                onClick={() => { onEdit(booth.id, editForm); setMode("view"); }}
                disabled={!editForm.code || !editForm.zone || loading}>
                Save changes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Add booth dialog ───────────────────────────────────────────────────────────

function AddBoothDialog({
  open, onClose, onSave, loading,
}: {
  open: boolean; onClose: () => void;
  onSave: (data: BoothFormData) => void; loading: boolean;
}) {
  const [form, setForm] = useState<BoothFormData>(emptyBoothForm());

  function setField(k: keyof BoothFormData, v: string) {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === "tier") {
        const def = TIER_DEFAULTS[v];
        const dim = TIER_DIMS[v];
        if (def) { next.sizeSqm = String(def.sizeSqm); next.price = String(def.price); }
        if (dim) { next.width = String(dim.width); next.height = String(dim.height); }
      }
      return next;
    });
  }

  function handleSave() {
    if (!form.code || !form.zone) return;
    onSave(form);
    setForm(emptyBoothForm());
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-[var(--brand-ink)]">
            Add Booth
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-1">
          <div>
            <FL>Code *</FL>
            <Input className="h-9 text-sm" placeholder="e.g. A1"
              value={form.code} onChange={e => setField("code", e.target.value)} />
          </div>
          <div>
            <FL>Zone *</FL>
            <Input className="h-9 text-sm" placeholder="e.g. Zone A"
              value={form.zone} onChange={e => setField("zone", e.target.value)} />
          </div>
          <div>
            <FL>Tier</FL>
            <Select value={form.tier} onValueChange={v => setField("tier", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Premium">Premium — 24 m² / $8k</SelectItem>
                <SelectItem value="Standard">Standard — 12 m² / $4k</SelectItem>
                <SelectItem value="Startup">Startup — 6 m² / $1.5k</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <FL>Status</FL>
            <Select value={form.status} onValueChange={v => setField("status", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Available">Available</SelectItem>
                <SelectItem value="Reserved">Reserved</SelectItem>
                <SelectItem value="Booked">Booked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <FL>Size (m²)</FL>
            <Input className="h-9 text-sm" type="number" value={form.sizeSqm}
              onChange={e => setField("sizeSqm", e.target.value)} />
          </div>
          <div>
            <FL>Price (USD)</FL>
            <Input className="h-9 text-sm" type="number" value={form.price}
              onChange={e => setField("price", e.target.value)} />
          </div>
          <div>
            <FL>Pos X</FL>
            <Input className="h-9 text-sm" type="number" value={form.posX}
              onChange={e => setField("posX", e.target.value)} />
          </div>
          <div>
            <FL>Pos Y</FL>
            <Input className="h-9 text-sm" type="number" value={form.posY}
              onChange={e => setField("posY", e.target.value)} />
          </div>
          <div>
            <FL>Width (px)</FL>
            <Input className="h-9 text-sm" type="number" value={form.width}
              onChange={e => setField("width", e.target.value)} />
          </div>
          <div>
            <FL>Height (px)</FL>
            <Input className="h-9 text-sm" type="number" value={form.height}
              onChange={e => setField("height", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave}
            disabled={!form.code || !form.zone || loading}>
            Add booth
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add / Edit exhibitor dialog ────────────────────────────────────────────────

function ExhibitorDialog({
  open, initial, onClose, onSave, loading,
}: {
  open: boolean;
  initial?: ExhibitorFormData;
  onClose: () => void;
  onSave: (data: ExhibitorFormData) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<ExhibitorFormData>(initial ?? emptyExhibitorForm());

  function setField(k: keyof ExhibitorFormData, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function handleSave() {
    if (!form.company) return;
    onSave(form);
    setForm(emptyExhibitorForm());
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-[var(--brand-ink)]">
            {initial ? "Edit Exhibitor" : "Add Exhibitor"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-1">
          <div className="col-span-2">
            <FL>Company *</FL>
            <Input className="h-9 text-sm" placeholder="Company name"
              value={form.company} onChange={e => setField("company", e.target.value)} />
          </div>
          <div>
            <FL>Sector</FL>
            <Input className="h-9 text-sm" placeholder="e.g. Fintech"
              value={form.sector} onChange={e => setField("sector", e.target.value)} />
          </div>
          <div>
            <FL>Contract status</FL>
            <Select value={form.contractStatus} onValueChange={v => setField("contractStatus", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Prospect">Prospect</SelectItem>
                <SelectItem value="Contracted">Contracted</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <FL>Contact person</FL>
            <Input className="h-9 text-sm" value={form.contactPerson}
              onChange={e => setField("contactPerson", e.target.value)} />
          </div>
          <div>
            <FL>Contact email</FL>
            <Input className="h-9 text-sm" type="email" value={form.contactEmail}
              onChange={e => setField("contactEmail", e.target.value)} />
          </div>
          <div>
            <FL>Phone</FL>
            <Input className="h-9 text-sm" value={form.contactPhone}
              onChange={e => setField("contactPhone", e.target.value)} />
          </div>
          <div>
            <FL>Fee (USD)</FL>
            <Input className="h-9 text-sm" type="number" placeholder="0"
              value={form.feeAmount} onChange={e => setField("feeAmount", e.target.value)} />
          </div>
          <div className="col-span-2">
            <FL>Website</FL>
            <Input className="h-9 text-sm" placeholder="https://…"
              value={form.url} onChange={e => setField("url", e.target.value)} />
          </div>
          <div className="col-span-2">
            <FL>Description</FL>
            <Input className="h-9 text-sm"
              value={form.description} onChange={e => setField("description", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave}
            disabled={!form.company || loading}>
            {initial ? "Save changes" : "Add exhibitor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Exhibition() {
  const { activeConveningId } = useConvening();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"floor" | "directory">("floor");

  const [selectedBooth,    setSelectedBooth]    = useState<Booth | null>(null);
  const [addBoothOpen,     setAddBoothOpen]     = useState(false);
  const [addExhibitorOpen, setAddExhibitorOpen] = useState(false);
  const [editExhibitor,    setEditExhibitor]    = useState<Exhibitor | null>(null);
  const [generatingFloor,  setGeneratingFloor]  = useState(false);

  const params  = { conveningId: activeConveningId ?? "" };
  const enabled = !!activeConveningId;

  const { data: booths     = [], isLoading: boothsLoading     } = useListBooths(params,     { query: { enabled, queryKey: getListBoothsQueryKey(params)     } });
  const { data: exhibitors = [], isLoading: exhibitorsLoading } = useListExhibitors(params, { query: { enabled, queryKey: getListExhibitorsQueryKey(params) } });

  const createBooth     = useCreateBooth();
  const updateBooth     = useUpdateBooth();
  const deleteBooth     = useDeleteBooth();
  const createExhibitor = useCreateExhibitor();
  const updateExhibitor = useUpdateExhibitor();
  const deleteExhibitor = useDeleteExhibitor();

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListBoothsQueryKey(params) });
    qc.invalidateQueries({ queryKey: getListExhibitorsQueryKey(params) });
  }

  // ── Rollup ─────────────────────────────────────────────────────────────────

  const bookedBooths  = booths.filter(b => b.status === "Booked");
  const reservedBooths = booths.filter(b => b.status === "Reserved");
  const occupancyPct  = booths.length > 0 ? Math.round((bookedBooths.length / booths.length) * 100) : 0;
  const bookedRevenue = bookedBooths.reduce((s, b) => s + Number(b.price), 0);

  // ── Floor plan generation ──────────────────────────────────────────────────

  async function generateFloorPlan() {
    if (!activeConveningId) return;
    setGeneratingFloor(true);
    try {
      for (const booth of SAMPLE_BOOTHS) {
        await createBooth.mutateAsync({ data: { conveningId: activeConveningId, status: "Available", ...booth } });
      }
      invalidate();
    } finally {
      setGeneratingFloor(false);
    }
  }

  // ── Booth mutations ─────────────────────────────────────────────────────────

  async function handleAddBooth(form: BoothFormData) {
    if (!activeConveningId) return;
    await createBooth.mutateAsync({
      data: {
        conveningId: activeConveningId,
        code: form.code, zone: form.zone,
        tier: form.tier as "Premium" | "Standard" | "Startup",
        sizeSqm: parseFloat(form.sizeSqm),
        price: parseFloat(form.price),
        status: form.status as "Available" | "Reserved" | "Booked",
        posX: parseFloat(form.posX), posY: parseFloat(form.posY),
        width: parseFloat(form.width), height: parseFloat(form.height),
      },
    });
    setAddBoothOpen(false);
    invalidate();
  }

  async function handleEditBooth(boothId: string, form: BoothFormData) {
    await updateBooth.mutateAsync({
      id: boothId,
      data: {
        code: form.code, zone: form.zone,
        tier: form.tier as "Premium" | "Standard" | "Startup",
        sizeSqm: parseFloat(form.sizeSqm),
        price: parseFloat(form.price),
        status: form.status as "Available" | "Reserved" | "Booked",
        posX: parseFloat(form.posX), posY: parseFloat(form.posY),
        width: parseFloat(form.width), height: parseFloat(form.height),
      },
    });
    setSelectedBooth(null);
    invalidate();
  }

  async function handleAssign(boothId: string, exhibitorId: string) {
    await updateBooth.mutateAsync({ id: boothId, data: { exhibitorId, status: "Booked" } });
    setSelectedBooth(null);
    invalidate();
  }

  async function handleRelease(boothId: string) {
    await updateBooth.mutateAsync({ id: boothId, data: { exhibitorId: null, status: "Available" } });
    setSelectedBooth(null);
    invalidate();
  }

  async function handleDeleteBooth(boothId: string) {
    await deleteBooth.mutateAsync({ id: boothId });
    invalidate();
  }

  // ── Exhibitor mutations ─────────────────────────────────────────────────────

  async function handleAddExhibitor(form: ExhibitorFormData) {
    if (!activeConveningId) return;
    await createExhibitor.mutateAsync({
      data: {
        conveningId: activeConveningId,
        company: form.company,
        sector: form.sector || undefined,
        contactPerson: form.contactPerson || undefined,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        url: form.url || undefined,
        description: form.description || undefined,
        contractStatus: form.contractStatus as "Prospect" | "Contracted" | "Paid",
        feeAmount: form.feeAmount ? parseFloat(form.feeAmount) : undefined,
      },
    });
    setAddExhibitorOpen(false);
    invalidate();
  }

  async function handleEditExhibitor(form: ExhibitorFormData) {
    if (!editExhibitor) return;
    await updateExhibitor.mutateAsync({
      id: editExhibitor.id,
      data: {
        company: form.company,
        sector: form.sector || undefined,
        contactPerson: form.contactPerson || undefined,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        url: form.url || undefined,
        description: form.description || undefined,
        contractStatus: form.contractStatus as "Prospect" | "Contracted" | "Paid",
        feeAmount: form.feeAmount ? parseFloat(form.feeAmount) : undefined,
      },
    });
    setEditExhibitor(null);
    invalidate();
  }

  async function handleDeleteExhibitor(id: string) {
    if (!confirm("Delete this exhibitor? Their booth will be released.")) return;
    await deleteExhibitor.mutateAsync({ id });
    invalidate();
  }

  // ── Derived maps ────────────────────────────────────────────────────────────

  const boothByExhibitorId = useMemo(() => {
    const m: Record<string, Booth> = {};
    booths.forEach(b => { if (b.exhibitorId) m[b.exhibitorId] = b; });
    return m;
  }, [booths]);

  const mutationLoading =
    createBooth.isPending || updateBooth.isPending || deleteBooth.isPending ||
    createExhibitor.isPending || updateExhibitor.isPending || deleteExhibitor.isPending;

  const isLoading = boothsLoading || exhibitorsLoading;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--brand-ink)]">
            Exhibition
          </h1>
          <p className="text-[13px] text-[var(--brand-text-secondary)] mt-0.5">
            Floor plan, booth assignments, and exhibitor directory
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"
            onClick={() => exportXlsx(
              exhibitors.map((e) => ({
                "Company":          e.company,
                "Sector":           e.sector ?? "",
                "Contact Person":   e.contactPerson ?? "",
                "Contact Email":    e.contactEmail ?? "",
                "Contact Phone":    e.contactPhone ?? "",
                "Contract Status":  e.contractStatus ?? "",
                "Fee Amount":       e.feeAmount ?? "",
                "Description":      e.description ?? "",
              })),
              "exhibitors"
            )}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export XLSX
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddExhibitorOpen(true)}>
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Add exhibitor
          </Button>
          <Button size="sm" onClick={() => setAddBoothOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add booth
          </Button>
        </div>
      </div>

      {/* ── Rollup KPIs ── */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label="Booths booked"
          value={`${bookedBooths.length} / ${booths.length}`}
          sub={booths.length === 0 ? "No booths yet" : `${reservedBooths.length} reserved`}
        />
        <MetricCard
          label="Occupancy"
          value={`${occupancyPct}%`}
          sub={`${booths.length - bookedBooths.length} available`}
        />
        <MetricCard
          label="Booked revenue"
          value={bookedRevenue > 0 ? formatMoney(bookedRevenue, "USD") : "—"}
          sub={`${bookedBooths.length} booked booth${bookedBooths.length !== 1 ? "s" : ""}`}
        />
      </div>

      {/* ── Tab switcher ── */}
      <div style={{ borderBottom: HL }} className="flex items-center gap-1">
        {([
          { id: "floor"     as const, label: "Floor Plan",   icon: LayoutGrid },
          { id: "directory" as const, label: "Exhibitors",   icon: Users      },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-[var(--brand-ink)] text-[var(--brand-ink)]"
                : "border-transparent text-[var(--brand-text-secondary)] hover:text-[var(--brand-ink)]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {id === "directory" && exhibitors.length > 0 && (
              <span
                className="ml-0.5 text-[10px] font-bold rounded-full px-1.5 py-px"
                style={{ background: "#EEF3F9", color: "var(--brand-text-secondary)" }}
              >
                {exhibitors.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {tab === "floor" && (
        <>
          {isLoading ? (
            /* Floor plan skeleton */
            <div
              className="animate-pulse rounded-[10px]"
              style={{ background: "#F6F8FB", border: HL, height: 400 }}
            />
          ) : booths.length === 0 ? (
            /* Floor plan empty state */
            <div className="py-20 flex flex-col items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-[#EEF3F9] flex items-center justify-center">
                <Store className="h-7 w-7 text-[var(--brand-text-secondary)]" />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-medium text-[var(--brand-ink)]">No booths yet</p>
                <p className="text-[13px] text-[var(--brand-text-secondary)] mt-1">
                  Add booths manually or generate a sample A / B / C zone layout.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={generateFloorPlan} disabled={generatingFloor}>
                  {generatingFloor ? "Generating…" : "Generate sample floor plan"}
                </Button>
                <Button onClick={() => setAddBoothOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add booth
                </Button>
              </div>
            </div>
          ) : (
            <FloorPlan
              booths={booths}
              exhibitors={exhibitors}
              onBoothClick={setSelectedBooth}
            />
          )}
        </>
      )}

      {tab === "directory" && (
        <>
          {exhibitors.length === 0 && !isLoading ? (
            /* Directory empty state */
            <div className="py-20 flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#EEF3F9] flex items-center justify-center">
                <Users className="h-7 w-7 text-[var(--brand-text-secondary)]" />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-medium text-[var(--brand-ink)]">No exhibitors yet</p>
                <p className="text-[13px] text-[var(--brand-text-secondary)] mt-1">
                  Add your first exhibitor to populate the directory.
                </p>
              </div>
              <Button onClick={() => setAddExhibitorOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add exhibitor
              </Button>
            </div>
          ) : (
            <div
              className="overflow-hidden"
              style={{ border: HL, borderRadius: 10 }}
            >
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ height: 36, borderBottom: HL, background: "#F6F8FB" }}>
                    {["Company", "Sector", "Contact", "Status", "Fee", "Booth", ""].map((h, i) => (
                      <th
                        key={i}
                        className={`px-4 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] ${i >= 4 ? "text-right" : "text-left"} ${i === 6 ? "w-16" : ""}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <SkeletonRows cols={7} rows={5} />
                  ) : (
                    exhibitors.map((ex, i) => {
                      const assignedBooth = boothByExhibitorId[ex.id];
                      const contractTonal = CONTRACT_TONAL[ex.contractStatus] ?? CONTRACT_TONAL.Prospect;
                      const isLast = i === exhibitors.length - 1;
                      return (
                        <tr
                          key={ex.id}
                          className="group transition-colors"
                          style={{
                            height: 44,
                            borderBottom: isLast ? "none" : HL,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#EEF3F9")}
                          onMouseLeave={e => (e.currentTarget.style.background = "")}
                        >
                          {/* Company */}
                          <td className="px-4">
                            <div className="font-medium text-[var(--brand-ink)]">
                              {ex.company}
                            </div>
                          </td>

                          {/* Sector */}
                          <td className="px-4 text-[var(--brand-text-secondary)]">
                            {ex.sector ?? "—"}
                          </td>

                          {/* Contact */}
                          <td className="px-4">
                            {ex.contactPerson ? (
                              <div>
                                <div className="text-[var(--brand-ink)]">{ex.contactPerson}</div>
                                {ex.contactEmail && (
                                  <div className="text-[11px] text-[var(--brand-text-secondary)]">
                                    {ex.contactEmail}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[var(--brand-text-secondary)] opacity-40">—</span>
                            )}
                          </td>

                          {/* Contract status */}
                          <td className="px-4">
                            <TonalBadge label={ex.contractStatus} tonal={contractTonal} />
                          </td>

                          {/* Fee */}
                          <td className="px-4 text-right tabular-nums text-[var(--brand-ink)] font-medium">
                            {Number(ex.feeAmount) > 0
                              ? formatMoney(Number(ex.feeAmount), "USD")
                              : <span className="text-[var(--brand-text-secondary)] opacity-40">—</span>}
                          </td>

                          {/* Booth assignment */}
                          <td className="px-4 text-right">
                            {assignedBooth ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <MapPin className="h-3 w-3 text-[#1D9E75]" />
                                <span className="font-medium text-[var(--brand-ink)]">
                                  {assignedBooth.code}
                                </span>
                                <TonalBadge
                                  label={assignedBooth.tier}
                                  tonal={TIER_TONAL[assignedBooth.tier]}
                                />
                              </div>
                            ) : (
                              <span className="text-[11px] text-[var(--brand-text-secondary)] opacity-40">
                                Unassigned
                              </span>
                            )}
                          </td>

                          {/* Row actions */}
                          <td className="px-3">
                            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {ex.url && (
                                <a
                                  href={ex.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-[var(--brand-ink)] hover:bg-white transition-colors"
                                  title="Open website"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                              <button
                                onClick={() => setEditExhibitor(ex)}
                                className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-[var(--brand-ink)] hover:bg-white transition-colors"
                                title="Edit exhibitor"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteExhibitor(ex.id)}
                                className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-red-600 hover:bg-white transition-colors"
                                title="Delete exhibitor"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Dialogs ── */}
      <BoothDetailDialog
        booth={selectedBooth}
        exhibitors={exhibitors}
        onClose={() => setSelectedBooth(null)}
        onAssign={handleAssign}
        onRelease={handleRelease}
        onEdit={handleEditBooth}
        onDelete={handleDeleteBooth}
        loading={mutationLoading}
      />
      <AddBoothDialog
        open={addBoothOpen}
        onClose={() => setAddBoothOpen(false)}
        onSave={handleAddBooth}
        loading={mutationLoading}
      />
      <ExhibitorDialog
        open={addExhibitorOpen}
        onClose={() => setAddExhibitorOpen(false)}
        onSave={handleAddExhibitor}
        loading={mutationLoading}
      />
      {editExhibitor && (
        <ExhibitorDialog
          key={editExhibitor.id}
          open={!!editExhibitor}
          initial={{
            company:        editExhibitor.company,
            sector:         editExhibitor.sector         ?? "",
            contactPerson:  editExhibitor.contactPerson  ?? "",
            contactEmail:   editExhibitor.contactEmail   ?? "",
            contactPhone:   editExhibitor.contactPhone   ?? "",
            url:            editExhibitor.url            ?? "",
            description:    editExhibitor.description    ?? "",
            contractStatus: editExhibitor.contractStatus,
            feeAmount:      editExhibitor.feeAmount ? String(editExhibitor.feeAmount) : "",
          }}
          onClose={() => setEditExhibitor(null)}
          onSave={handleEditExhibitor}
          loading={mutationLoading}
        />
      )}
    </div>
  );
}
