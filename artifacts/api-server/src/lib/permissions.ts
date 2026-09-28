export type Permission =
  | "partners:read"   | "partners:write"
  | "speakers:read"   | "speakers:write"
  | "budget:read"     | "budget:write"     | "budget:export"
  | "delegates:read"  | "delegates:write"  | "delegates:export"
  | "deal:read"       | "deal:write"
  | "exhibition:read" | "exhibition:write"
  | "tasks:read"      | "tasks:write"
  | "sessions:read"   | "sessions:write"
  | "outcomes:read"   | "outcomes:write"
  | "documents:read"  | "documents:write"
  | "passTypes:write"
  | "settings:manage"
  | "audit:read"
  | "trash:restore"   | "trash:hardDelete";

type Role =
  | "Admin" | "Curator" | "Finance" | "PartnerLead"
  | "SpeakerLead" | "Ops" | "PressManager" | "Advisor" | "Client";

const ALL: Permission[] = [
  "partners:read", "partners:write",
  "speakers:read", "speakers:write",
  "budget:read", "budget:write", "budget:export",
  "delegates:read", "delegates:write", "delegates:export",
  "deal:read", "deal:write",
  "exhibition:read", "exhibition:write",
  "tasks:read", "tasks:write",
  "sessions:read", "sessions:write",
  "outcomes:read", "outcomes:write",
  "documents:read", "documents:write",
  "passTypes:write",
  "settings:manage",
  "audit:read",
  "trash:restore", "trash:hardDelete",
];

const READ_ONLY: Permission[] = [
  "partners:read", "speakers:read", "budget:read",
  "delegates:read", "deal:read", "exhibition:read",
  "tasks:read", "sessions:read", "outcomes:read", "documents:read",
];

const MATRIX: Record<Role, Permission[]> = {
  Admin: ALL,

  Curator: [
    "partners:read",
    "speakers:read", "speakers:write",
    "budget:read",
    "delegates:read", "delegates:write",
    "deal:read",
    "exhibition:read",
    "tasks:read", "tasks:write",
    "sessions:read", "sessions:write",
    "outcomes:read", "outcomes:write",
    "documents:read", "documents:write",
  ],

  Finance: [
    "partners:read",
    "speakers:read",
    "budget:read", "budget:write", "budget:export",
    "delegates:read", "delegates:export",
    "deal:read",
    "sessions:read",
    "outcomes:read",
    "passTypes:write",
  ],

  PartnerLead: [
    "partners:read", "partners:write",
    "speakers:read",
    "budget:read",
    "delegates:read",
    "deal:read",
    "sessions:read",
    "outcomes:read",
    "documents:read",
  ],

  SpeakerLead: [
    "speakers:read", "speakers:write",
    "partners:read",
    "sessions:read", "sessions:write",
    "budget:read",
    "outcomes:read",
    "documents:read",
  ],

  Ops: [
    "tasks:read", "tasks:write",
    "delegates:read", "delegates:write", "delegates:export",
    "sessions:read", "sessions:write",
    "exhibition:read", "exhibition:write",
    "speakers:read",
    "partners:read",
    "documents:read",
    "outcomes:read",
    "deal:read",
    "passTypes:write",
  ],

  PressManager: [
    "speakers:read",
    "sessions:read",
    "partners:read",
    "outcomes:read",
  ],

  Advisor: READ_ONLY,

  // Client has NO default permissions — access must be explicitly granted
  // per-convening via the invite flow (see routes/invites.ts).
  Client: [],
};

export function hasPermission(role: string, permission: Permission): boolean {
  return (MATRIX[role as Role] ?? []).includes(permission);
}

export function getPermissions(role: string): Permission[] {
  return MATRIX[role as Role] ?? [];
}
