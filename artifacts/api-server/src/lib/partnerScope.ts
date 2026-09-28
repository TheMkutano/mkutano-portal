import { projectProfile } from "./projectProfile";
/** Directory records are shared; only active engagement rows belong in an event list. */
export function scopedPartnerRows<P extends { id: string; partnerType: string }, E extends { conveningId: string; partnerId: string; deletedAt: Date | null; partnerProfile?: P | null }>(
  partners: P[], engagements: E[], conveningId: string, partnerType?: string,
): Array<P & { engagement: E }> {
  const byId = new Map(partners.map(p => [p.id, p]));
  return engagements.flatMap(engagement => {
    const partner = byId.get(engagement.partnerId);
    const profile = partner ? projectProfile(partner, engagement.partnerProfile) : undefined;
    return engagement.conveningId === conveningId && !engagement.deletedAt && partner &&
      (!partnerType || profile?.partnerType === partnerType)
      ? [{ ...profile, engagement } as P & { engagement: E }] : [];
  });
}

export function matchingInstitutions<P extends { institutionName: string }>(partners: P[], name: string): P[] {
  return partners.filter(p => p.institutionName.trim().toLowerCase() === name.trim().toLowerCase());
}