import { cn } from "@/lib/utils";
import { label as toLabel } from "@/lib/labels";

type BadgeVariant = {
  bg: string;
  text: string;
  border: string;
};

const STATUS_MAP: Record<string, BadgeVariant> = {
  // Partner pipeline
  Prospect:       { bg: "bg-gray-100",          text: "text-gray-600",         border: "border-gray-200" },
  Negotiation:    { bg: "bg-amber-50",           text: "text-amber-800",        border: "border-amber-200" },
  ContractSigned: { bg: "bg-blue-50",            text: "text-blue-700",         border: "border-blue-100" },
  Onboarded:      { bg: "bg-emerald-50",         text: "text-emerald-700",      border: "border-emerald-200" },
  PostEvent:      { bg: "bg-gray-100",           text: "text-gray-500",         border: "border-gray-200" },

  // Speaker invitation
  Identified:     { bg: "bg-gray-100",           text: "text-gray-600",         border: "border-gray-200" },
  Invited:        { bg: "bg-blue-50",            text: "text-blue-700",         border: "border-blue-100" },
  Confirmed:      { bg: "bg-emerald-50",         text: "text-emerald-700",      border: "border-emerald-200" },
  Briefed:        { bg: "bg-teal-50",            text: "text-teal-700",         border: "border-teal-100" },
  Ready:          { bg: "bg-teal-50",            text: "text-teal-700",         border: "border-teal-100" },
  Attended:       { bg: "bg-purple-50",          text: "text-purple-700",       border: "border-purple-100" },
  Thanked:        { bg: "bg-gray-100",           text: "text-gray-500",         border: "border-gray-200" },

  // Consent
  Granted:          { bg: "bg-emerald-50",       text: "text-emerald-700",      border: "border-emerald-200" },
  Pending:          { bg: "bg-amber-50",         text: "text-amber-800",        border: "border-amber-200" },
  PartiallyGranted: { bg: "bg-amber-50",         text: "text-amber-700",        border: "border-amber-200" },
  Declined:         { bg: "bg-red-50",           text: "text-red-700",          border: "border-red-100" },
  Withdrawn:        { bg: "bg-red-50",           text: "text-red-700",          border: "border-red-100" },
  NotRequested:     { bg: "bg-gray-100",         text: "text-gray-500",         border: "border-gray-200" },

  // Delegate
  Registered:  { bg: "bg-blue-50",              text: "text-blue-700",          border: "border-blue-200" },
  Waitlisted:  { bg: "bg-amber-50",             text: "text-amber-700",         border: "border-amber-200" },
  Cancelled:   { bg: "bg-red-50",              text: "text-red-700",            border: "border-red-100" },

  // Delegate pass
  Paid:          { bg: "bg-[var(--brand-tint)]", text: "text-[var(--brand-primary)]", border: "border-blue-100" },
  FreeSponsor:   { bg: "bg-purple-50",           text: "text-purple-700",       border: "border-purple-100" },
  FreeComp:      { bg: "bg-gray-100",            text: "text-gray-600",         border: "border-gray-200" },

  // Convening status
  Planning:    { bg: "bg-amber-50",              text: "text-amber-800",         border: "border-amber-200" },
  Active:      { bg: "bg-emerald-50",            text: "text-emerald-700",      border: "border-emerald-200" },
  Completed:   { bg: "bg-gray-100",             text: "text-gray-600",          border: "border-gray-200" },
  Archived:    { bg: "bg-gray-100",             text: "text-gray-400",          border: "border-gray-200" },

  // Budget type
  Income:      { bg: "bg-emerald-50",            text: "text-emerald-700",      border: "border-emerald-200" },
  Expense:     { bg: "bg-red-50",               text: "text-red-700",           border: "border-red-100" },

  // Contract / exhibitor
  Contracted:  { bg: "bg-blue-50",              text: "text-blue-700",          border: "border-blue-200" },

  // Partner tier
  Platinum:    { bg: "bg-[#EEF1F6]",            text: "text-[#0A2F5C]",        border: "border-[#D2DAE8]" },
  Gold:        { bg: "bg-[#FBF3E2]",            text: "text-[#8A6516]",        border: "border-[#E8D9B0]" },
  Silver:      { bg: "bg-[#F0F2F4]",            text: "text-[#5A6472]",        border: "border-[#D8DCE2]" },
  Bronze:      { bg: "bg-[#F5EDE4]",            text: "text-[#7A4C2C]",        border: "border-[#E0CEBC]" },
  CredibilityOnly: { bg: "bg-gray-100",         text: "text-gray-500",         border: "border-gray-200" },
  InKind:      { bg: "bg-purple-50",            text: "text-purple-700",        border: "border-purple-100" },

  // Booth tier
  Premium:     { bg: "bg-amber-50",             text: "text-amber-700",         border: "border-amber-200" },
  Standard:    { bg: "bg-blue-50",              text: "text-blue-700",          border: "border-blue-200" },
  Startup:     { bg: "bg-purple-50",            text: "text-purple-700",        border: "border-purple-100" },

  // Procurement
  Contracted_proc: { bg: "bg-blue-50",          text: "text-blue-700",          border: "border-blue-200" },
  Negotiating: { bg: "bg-amber-50",             text: "text-amber-800",         border: "border-amber-200" },
  Evaluating:  { bg: "bg-sky-50",               text: "text-sky-700",           border: "border-sky-200" },
};

const FALLBACK: BadgeVariant = { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" };

interface StatusBadgeProps {
  status: string;
  displayLabel?: string;
  size?: "xs" | "sm";
  className?: string;
}

export function StatusBadge({ status, displayLabel, size = "xs", className }: StatusBadgeProps) {
  const v = STATUS_MAP[status] ?? FALLBACK;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        v.bg, v.text, v.border,
        className,
      )}
    >
      {displayLabel ?? toLabel(status)}
    </span>
  );
}
