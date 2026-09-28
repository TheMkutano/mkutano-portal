import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useGetMe,
  useListConvenings,
  useCreateConvening,
  getListConveningsQueryKey,
  type Convening,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useConvening } from "@/contexts/ConveningContext";
import { projectObjectUrl } from "@/lib/projectObjectUrl";
import { useBranding } from "@/contexts/BrandingContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard,
  Users,
  Mic,
  CheckSquare,
  Wallet,
  Settings,
  LogOut,
  CalendarDays,
  Truck,
  Handshake,
  Target,
  FolderOpen,
  ClipboardList,
  Store,
  UserCircle2,
  ScrollText,
  Trash2,
  ChevronDown,
  Check,
  Plus,
  Settings2,
  Flag,
} from "lucide-react";

// ── Convening switcher ────────────────────────────────────────────────────────

function toSlug(n: string) {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Active:    { bg: "#ECFDF5", color: "#059669" },
  Planning:  { bg: "#EFF6FF", color: "#1D4ED8" },
  Completed: { bg: "#F1F5F9", color: "#475569" },
  Archived:  { bg: "#FFF1F2", color: "#BE123C" },
};

function ConveningSwitcher({
  convenings,
  activeConvening,
  setActiveConveningId,
  isAdmin,
  primaryColor,
}: {
  convenings: Convening[];
  activeConvening: Convening | null;
  setActiveConveningId: (id: string) => void;
  isAdmin: boolean;
  primaryColor: string;
}) {
  const [popOpen, setPopOpen]     = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName]           = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const qc             = useQueryClient();
  const createConvening = useCreateConvening();

  async function handleCreate() {
    if (!name.trim()) return;
    setCreateError(null);
    try {
      const created = await createConvening.mutateAsync({
        data: {
          name: name.trim(),
          slug: toSlug(name.trim()),
          startDate: startDate || undefined,
          endDate:   endDate   || undefined,
        },
      });
      // Selection is validated against the cached list by ConveningProvider.
      // Add the new project first, then switch; invalidation alone can race it.
      qc.setQueryData<Convening[]>(getListConveningsQueryKey(), (previous) =>
        previous?.some((c) => c.id === created.id) ? previous : [...(previous ?? []), created]);
      setActiveConveningId(created.id);
      void qc.invalidateQueries({ queryKey: getListConveningsQueryKey() });
      setDialogOpen(false);
      setName(""); setStartDate(""); setEndDate("");
    } catch (err) {
      const data = (err as { data?: { error?: string } })?.data;
      setCreateError(data?.error ?? (err instanceof Error ? err.message : "Could not create project. Try again."));
    }
  }

  const HL = "1px solid var(--brand-border)";

  return (
    <>
      <Popover open={popOpen} onOpenChange={setPopOpen}>
        <PopoverTrigger asChild>
          <button
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--brand-tint)] transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--brand-text-secondary)] leading-none mb-0.5">
                Project
              </p>
              <p className="text-[13px] font-semibold text-[var(--brand-ink)] truncate leading-tight">
                {activeConvening?.name ?? "Select project…"}
              </p>
            </div>
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 text-[var(--brand-text-secondary)] transition-transform"
              style={{ transform: popOpen ? "rotate(180deg)" : "none" }}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-64 p-1.5" align="start" sideOffset={2}>
          {convenings.length === 0 ? (
            <p className="px-3 py-4 text-center text-[12px] text-[var(--brand-text-secondary)]">
              No projects yet.
            </p>
          ) : (
            <div className="space-y-0.5 max-h-56 overflow-y-auto">
              {convenings.map((c) => {
                const isActive = c.id === activeConvening?.id;
                const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.Planning;
                return (
                  <button
                    key={c.id}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[13px] text-left hover:bg-[var(--brand-tint)] transition-colors"
                    onClick={() => { setActiveConveningId(c.id); setPopOpen(false); }}
                  >
                    <Check
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: isActive ? primaryColor : "transparent" }}
                    />
                    <span
                      className="flex-1 truncate"
                      style={{
                        color: isActive ? "var(--brand-ink)" : "var(--brand-text-secondary)",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {c.name}
                    </span>
                    <span
                      className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                      style={{ background: st.bg, color: st.color }}
                    >
                      {c.status}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {isAdmin && (
            <>
              <div className="my-1.5" style={{ borderTop: HL }} />
              <div className="space-y-0.5">
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-[var(--brand-text-secondary)] hover:bg-[var(--brand-tint)] hover:text-[var(--brand-ink)] transition-colors"
                  onClick={() => { setPopOpen(false); setDialogOpen(true); }}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  New project
                </button>
                <Link
                  href="/settings?section=convenings"
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-[var(--brand-text-secondary)] hover:bg-[var(--brand-tint)] hover:text-[var(--brand-ink)] transition-colors"
                  onClick={() => setPopOpen(false)}
                >
                  <Settings2 className="h-3.5 w-3.5 shrink-0" />
                  Manage all projects
                </Link>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Quick-create dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setCreateError(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-[var(--brand-ink)]">
              New project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] block mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mkutano Africa 2026"
                className="h-9 text-[13px]"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              />
              {name.trim() && (
                <p className="text-[11px] text-[var(--brand-text-secondary)] mt-1">
                  Slug: <code className="font-mono bg-gray-100 px-1 rounded">{toSlug(name.trim())}</code>
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] block mb-1">
                  Start date
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9 text-[13px]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--brand-text-secondary)] block mb-1">
                  End date
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9 text-[13px]"
                />
              </div>
            </div>
            <p className="text-[11px] text-[var(--brand-text-secondary)]">
              You can add venue, theme, and branding later under Settings → Convening details.
            </p>
            {createError && <p role="alert" className="text-xs text-red-600">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!name.trim() || createConvening.isPending}
              onClick={() => void handleCreate()}
            >
              {createConvening.isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { data: profile } = useGetMe();
  const { activeConvening, setActiveConveningId } = useConvening();
  const { primaryColor, logoUrl, isWhiteLabel } = useBranding();
  const { data: convenings = [] } = useListConvenings({
    query: { queryKey: getListConveningsQueryKey() },
  });

  const isAdmin = profile?.role === "Admin";

  const navItems = [
    { href: "/dashboard",         label: "Dashboard",         icon: LayoutDashboard },
    { href: "/partners",          label: "Partners",          icon: Users },
    { href: "/speakers",          label: "Speakers",          icon: Mic },
    { href: "/agenda",            label: "Agenda",            icon: CalendarDays },
    { href: "/tasks",             label: "Tasks",             icon: CheckSquare },
    { href: "/roadmap",           label: "Roadmap",           icon: Flag },
    { href: "/team",              label: "Team",              icon: UserCircle2 },
    { href: "/budget",            label: "Budget",            icon: Wallet },
    { href: "/service-providers", label: "Service providers", icon: Truck },
    { href: "/delegates",         label: "Delegates",         icon: ClipboardList },
    { href: "/exhibition",        label: "Exhibition",        icon: Store },
    { href: "/deal-room",         label: "Deal Room",         icon: Handshake },
    { href: "/outcomes",          label: "Outcomes",          icon: Target },
    { href: "/documents",         label: "Documents",         icon: FolderOpen },
  ];

  if (isAdmin) {
    navItems.push({ href: "/settings", label: "Settings",  icon: Settings  });
    navItems.push({ href: "/audit",    label: "Audit Log", icon: ScrollText });
    navItems.push({ href: "/trash",    label: "Trash",     icon: Trash2     });
  }

  return (
    <div
      className="w-56 border-r flex flex-col h-screen shrink-0 sticky top-0 bg-white"
      style={{ borderColor: "var(--brand-border)" }}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b" style={{ borderColor: "var(--brand-border)" }}>
        {isWhiteLabel && logoUrl ? (
          <img src={projectObjectUrl(logoUrl, activeConvening?.id)} alt="Logo" className="h-7 object-contain" />
        ) : (
          <div className="flex items-center gap-2.5">
            <img
              src="/mkutano-icon.png"
              alt="Mkutano"
              className="h-7 w-7 rounded-full shrink-0 object-cover"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-black tracking-[0.14em] uppercase leading-tight text-[var(--brand-navy)]">
                Mkutano
              </p>
              <p className="text-[8.5px] font-semibold tracking-[0.06em] uppercase leading-tight text-[var(--brand-text-secondary)] whitespace-nowrap">
                Convening Management Portal
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Convening switcher */}
      <div className="border-b" style={{ borderColor: "var(--brand-border)" }}>
        <ConveningSwitcher
          convenings={convenings}
          activeConvening={activeConvening}
          setActiveConveningId={setActiveConveningId}
          isAdmin={isAdmin}
          primaryColor={primaryColor}
        />
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-3 px-2">
        <nav className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              location === item.href || location.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
                  isActive
                    ? "text-white"
                    : "text-[var(--brand-text-secondary)] hover:bg-[var(--brand-tint)] hover:text-[var(--brand-ink)]"
                }`}
                style={isActive ? { backgroundColor: primaryColor } : {}}
              >
                <item.icon
                  className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-white" : "text-[var(--brand-text-secondary)]"}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User footer */}
      <div
        className="p-3 border-t flex items-center justify-between gap-2"
        style={{ borderColor: "var(--brand-border)", background: "var(--brand-tint)/30" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{
              backgroundColor: `${primaryColor}20`,
              color: primaryColor,
            }}
          >
            {profile?.name.charAt(0) ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[var(--brand-ink)] truncate">
              {profile?.name}
            </p>
            <p className="text-[10px] text-[var(--brand-text-secondary)] truncate">
              {profile?.role}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="p-1.5 rounded text-[var(--brand-text-secondary)] hover:text-[var(--brand-ink)] hover:bg-[var(--brand-border)] transition-colors shrink-0"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
