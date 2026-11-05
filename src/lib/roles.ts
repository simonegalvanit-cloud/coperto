import type { MemberRole } from "@/db/schema";

export type { MemberRole };

export const ROLE_LABEL: Record<MemberRole, string> = { owner: "Titolare", manager: "Responsabile", staff: "Sala" };

export const ROLE_HINT: Record<MemberRole, string> = {
  owner: "Tutto, compresi abbonamento, team ed eliminazione dell’account.",
  manager: "Tutto il lavoro del ristorante: prenotazioni, sala, ospiti, orari, regole, pianta e personale di sala.",
  staff: "Prenotazioni, sala, lista d’attesa e schede degli ospiti. Niente impostazioni.",
};

/**
 * What each role can do beyond the daily work (bookings, room, waitlist, guest profiles), which every member has.
 * - settings: opening hours, booking rules, closures, the floor plan editor, the restaurant's details
 * - guests: export guests, delete profiles
 * - team: invite and remove team members
 * - account: terms, deleting the restaurant, handing over ownership
 */
const PERMISSIONS = {
  settings: ["owner", "manager"],
  guests: ["owner", "manager"],
  team: ["owner", "manager"],
  account: ["owner"],
} as const satisfies Record<string, readonly MemberRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: MemberRole, permission: Permission) => (PERMISSIONS[permission] as readonly MemberRole[]).includes(role);

/** Roles someone may give when inviting or changing a member: a manager hires staff, only the owner hires managers. */
export const assignableRoles = (role: MemberRole): MemberRole[] =>
  role === "owner" ? ["manager", "staff"] : role === "manager" ? ["staff"] : [];
