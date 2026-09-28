import { db } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  conveningsTable,
  partnersTable,
  engagementsTable,
  speakersTable,
  speakerEngagementsTable,
  mediaConsentsTable,
  budgetsTable,
  workstreamsTable,
  tasksTable,
  portalUsersTable,
} from "@workspace/db";
import {
  agendaSessionsTable,
  agendaSessionSpeakersTable,
  serviceProvidersTable,
  providerBookingsTable,
  passTypeConfigsTable,
  delegatesTable,
} from "@workspace/db/schema";
import type { InsertSpeakerEngagement } from "@workspace/db";
import type { InsertMediaConsent } from "@workspace/db";
import type { InsertAgendaSessionSpeaker } from "@workspace/db/schema";

// ── Idempotent "ensure" helpers ─────────────────────────────────────────────
async function ensureSpeaker(name: string, title: string, gender: string) {
  const found = await db.query.speakersTable.findFirst({ where: (t, { eq }) => eq(t.name, name) });
  if (found) return found;
  const [created] = await db.insert(speakersTable).values({ name, title, gender, bioShort: title }).returning();
  return created;
}

async function ensurePartner(institutionName: string, potentialTier: string, industry?: string, partnerType?: string) {
  const found = await db.query.partnersTable.findFirst({ where: (t, { eq }) => eq(t.institutionName, institutionName) });
  if (found) return found;
  const [created] = await db.insert(partnersTable).values({
    institutionName,
    potentialTier: potentialTier as "Platinum" | "Gold" | "Silver" | "InKind" | "CredibilityOnly",
    historicalEngagement: "Partial",
    industry: industry ?? null,
    partnerType: (partnerType ?? "Institutional") as "GovernmentPolicy" | "DevelopmentPartner" | "DevelopmentFinance" | "BanksFinancial" | "PensionFunds" | "PensionBodies" | "CapitalMarkets" | "TelecomDigital" | "KnowledgeMedia" | "TourismHospitality" | "AviationLogistics" | "Media" | "Institutional",
  }).returning();
  return created;
}

async function ensureProvider(company: string, category: string) {
  const found = await db.query.serviceProvidersTable.findFirst({ where: (t, { eq }) => eq(t.company, company) });
  if (found) return found;
  const [created] = await db.insert(serviceProvidersTable).values({ company, category: category as "VenueHotel" | "AVStreaming" | "Stage" | "MediaPR" | "Catering" | "Security" | "TravelLogistics" | "Other" }).returning();
  return created;
}

async function ensureWorkstream(
  conveningId: string,
  name: string,
  extra?: { colorToken?: string; order?: number; targetDate?: string },
) {
  const found = await db.query.workstreamsTable.findFirst({
    where: (t, { eq, and }) => and(eq(t.conveningId, conveningId), eq(t.name, name)),
  });
  if (found) return found;
  const [created] = await db
    .insert(workstreamsTable)
    .values({ conveningId, name, ...extra })
    .onConflictDoNothing()
    .returning();
  return created;
}

async function seed() {
  console.log("Seeding database…");

  // ── 1. Convenings ──────────────────────────────────────────────────────
  const [c1raw] = await db
    .insert(conveningsTable)
    .values({
      name: "Mkutano East Africa Summit 2026",
      slug: "mea-summit-2026",
      theme: "Financing Africa's Future: From Commitments to Capital",
      startDate: "2026-09-15",
      endDate: "2026-09-17",
      venueName: "Serena Hotel, Nairobi",
      venueConfirmed: true,
      status: "Active",
    })
    .onConflictDoNothing()
    .returning();

  const [c2raw] = await db
    .insert(conveningsTable)
    .values({
      name: "Mkutano West Africa Forum 2026",
      slug: "mwa-forum-2026",
      theme: "Trade, Infrastructure and the AfCFTA",
      startDate: "2026-11-20",
      endDate: "2026-11-21",
      venueName: "TBD, Lagos",
      venueConfirmed: false,
      status: "Planning",
    })
    .onConflictDoNothing()
    .returning();

  const [c3raw] = await db
    .insert(conveningsTable)
    .values({
      name: "ICT Mkutano 2027",
      slug: "ict-mkutano-2027",
      theme: "Digital Sovereignty: Building Africa's Technology Future",
      startDate: "2027-03-10",
      endDate: "2027-03-12",
      venueName: "Kampala Serena Hotel, Uganda",
      venueConfirmed: true,
      status: "Planning",
    })
    .onConflictDoNothing()
    .returning();

  const c1 = c1raw ?? (await db.query.conveningsTable.findFirst({ where: (t, { eq }) => eq(t.slug, "mea-summit-2026") }))!;
  const c2 = c2raw ?? (await db.query.conveningsTable.findFirst({ where: (t, { eq }) => eq(t.slug, "mwa-forum-2026") }))!;
  const c3 = c3raw ?? (await db.query.conveningsTable.findFirst({ where: (t, { eq }) => eq(t.slug, "ict-mkutano-2027") }))!;
  void c2; // referenced but only for completeness
  console.log("Convenings:", c1.id, c3.id);

  // ── 2. Partners ─────────────────────────────────────────────────────────
  const [p1] = await db.insert(partnersTable).values({
    institutionName: "African Development Bank",
    description: "Multilateral development finance institution focused on Africa's economic development.",
    location: "Abidjan, Côte d'Ivoire",
    principals: ["Dr. Akinwumi Adesina"],
    potentialTier: "Platinum",
    historicalEngagement: "Yes",
    fitWithThem: "Strong alignment on development finance and infrastructure.",
    historicalNotes: "Participated in 2024 summit as headline partner.",
    partnerType: "DevelopmentFinance",
    industry: "Finance",
  }).onConflictDoNothing().returning();

  const [p2] = await db.insert(partnersTable).values({
    institutionName: "Standard Bank Group",
    description: "Africa's largest bank by assets.",
    location: "Johannesburg, South Africa",
    principals: ["Sim Tshabalala"],
    potentialTier: "Gold",
    historicalEngagement: "Partial",
    fitWithThem: "Trade finance, infrastructure lending.",
    partnerType: "BanksFinancial",
    industry: "Banking",
  }).onConflictDoNothing().returning();

  const [p3] = await db.insert(partnersTable).values({
    institutionName: "Kenya Private Sector Alliance",
    description: "Apex body representing the private sector in Kenya.",
    location: "Nairobi, Kenya",
    principals: ["Carole Kariuki"],
    potentialTier: "Silver",
    historicalEngagement: "No",
    fitWithThem: "Local ecosystem support, SME representation.",
    partnerType: "BanksFinancial",
    industry: "Trade & Commerce",
  }).onConflictDoNothing().returning();

  const [p4] = await db.insert(partnersTable).values({
    institutionName: "MTN Group",
    description: "Pan-African telecommunications and fintech leader with 280M+ subscribers.",
    location: "Johannesburg, South Africa",
    principals: ["Ralph Mupita", "Serigne Dioum"],
    potentialTier: "Platinum",
    historicalEngagement: "Yes",
    fitWithThem: "Digital infrastructure, fintech, connectivity — perfectly aligned with theme.",
    historicalNotes: "Title sponsor at Mkutano 2025. Relationship warm.",
    partnerType: "TelecomDigital",
    industry: "Telecommunications",
  }).onConflictDoNothing().returning();

  const [p5] = await db.insert(partnersTable).values({
    institutionName: "Google Africa",
    description: "Google's Africa regional hub driving digital skills and cloud adoption.",
    location: "Lagos, Nigeria",
    principals: ["Nitin Gajria"],
    potentialTier: "Gold",
    historicalEngagement: "Partial",
    fitWithThem: "AI for Africa, cloud infrastructure, digital talent.",
    partnerType: "TelecomDigital",
    industry: "Digital & FinTech",
  }).onConflictDoNothing().returning();

  const [p6] = await db.insert(partnersTable).values({
    institutionName: "Uganda Investment Authority",
    description: "Government agency promoting investment in Uganda.",
    location: "Kampala, Uganda",
    principals: ["Winifred Tarinyeba Kiryabwire"],
    potentialTier: "Silver",
    historicalEngagement: "No",
    fitWithThem: "Host country facilitation, local policy linkages.",
    partnerType: "GovernmentPolicy",
    industry: "Government & Public Sector",
  }).onConflictDoNothing().returning();

  console.log("Partners seeded");

  // ── 3. Engagements ──────────────────────────────────────────────────────
  await db.insert(engagementsTable).values([
    { conveningId: c1.id, partnerId: p1?.id ?? "", responsiblePerson: "Amara Diallo", status: "Onboarded", natureOfResponse: "Interested", commitmentType: "Financial", commitmentDetails: "Title sponsorship + 2 keynote speakers", financialAmount: "150000", currency: "USD", invoiceSent: true, invoicePaid: true, finalTier: "Platinum", delegatePassesAllocated: 10 },
    { conveningId: c1.id, partnerId: p2?.id ?? "", responsiblePerson: "Kofi Mensah", status: "ContractSigned", natureOfResponse: "Negotiating", commitmentType: "Financial", financialAmount: "75000", currency: "USD", invoiceSent: true, invoicePaid: false, finalTier: "Gold", delegatePassesAllocated: 5 },
    { conveningId: c1.id, partnerId: p3?.id ?? "", responsiblePerson: "Wanjiku Kamau", status: "Negotiation", natureOfResponse: "Interested", commitmentType: "InKind", commitmentDetails: "Local venue facilitation and ground transport", financialAmount: "0", currency: "USD" },
  ]).onConflictDoNothing();

  await db.insert(engagementsTable).values([
    { conveningId: c3.id, partnerId: p4?.id ?? "", responsiblePerson: "Amara Diallo", status: "Onboarded", natureOfResponse: "Interested", commitmentType: "Financial", commitmentDetails: "Title sponsor — branded main stage + networking dinner", financialAmount: "200000", currency: "USD", invoiceSent: true, invoicePaid: true, finalTier: "Platinum", delegatePassesAllocated: 15 },
    { conveningId: c3.id, partnerId: p5?.id ?? "", responsiblePerson: "Kofi Mensah", status: "ContractSigned", natureOfResponse: "Negotiating", commitmentType: "Financial", commitmentDetails: "AI lab + startup pitch session sponsorship", financialAmount: "80000", currency: "USD", invoiceSent: true, invoicePaid: false, finalTier: "Gold", delegatePassesAllocated: 8 },
    { conveningId: c3.id, partnerId: p6?.id ?? "", responsiblePerson: "Wanjiku Kamau", status: "Negotiation", natureOfResponse: "Interested", commitmentType: "InKind", commitmentDetails: "Government facilitation + delegate transport", financialAmount: "0", currency: "USD" },
  ]).onConflictDoNothing();

  console.log("Engagements seeded");

  // ── 4. Speakers ─────────────────────────────────────────────────────────
  const [s1] = await db.insert(speakersTable).values({ name: "Dr. Ngozi Okonjo-Iweala", title: "Director-General, World Trade Organization", gender: "Female", expertise: ["Trade Policy", "Development Economics"], bioShort: "First woman and first African to lead the WTO.", email: "ngozi@wto.org", preferredContactMethod: "Email", timezone: "CET", whatsappCapable: true }).onConflictDoNothing().returning();
  const [s2] = await db.insert(speakersTable).values({ name: "Strive Masiyiwa", title: "Founder & Executive Chairman, Econet Group", gender: "Male", expertise: ["Entrepreneurship", "Telecoms"], bioShort: "Built Econet Wireless against state opposition.", email: "office@econet.com", preferredContactMethod: "Email", timezone: "GMT", whatsappCapable: true }).onConflictDoNothing().returning();
  const [s3] = await db.insert(speakersTable).values({ name: "Vera Songwe", title: "Non-Resident Senior Fellow, Brookings Institution", gender: "Female", expertise: ["Macroeconomics", "Climate Finance"], bioShort: "Economist and former UN Under-Secretary-General.", email: "vsongwe@brookings.edu", preferredContactMethod: "Email", timezone: "EST", whatsappCapable: false }).onConflictDoNothing().returning();

  // ICT Mkutano 2027 speakers — gender-diverse
  const [s4] = await db.insert(speakersTable).values({ name: "Dr. Amina Mohammed", title: "UN Deputy Secretary-General", gender: "Female", expertise: ["Digital Governance", "Climate Policy"], bioShort: "Leading voice on Africa's role in global digital governance.", email: "amina@un.org", preferredContactMethod: "Email", timezone: "EST", whatsappCapable: true }).onConflictDoNothing().returning();
  const [s5] = await db.insert(speakersTable).values({ name: "Selassie Tay", title: "Chief Technology Officer, Interswitch Group", gender: "Male", expertise: ["Fintech", "Payment Infrastructure"], bioShort: "Architect of Interswitch's pan-African payments infrastructure.", email: "stay@interswitch.com", preferredContactMethod: "WhatsApp", timezone: "WAT", whatsappCapable: true }).onConflictDoNothing().returning();
  const [s6] = await db.insert(speakersTable).values({ name: "Lydia Muthoni", title: "Founder, Africa Data Science Society", gender: "Female", expertise: ["Data Science", "AI Ethics", "Women in STEM"], bioShort: "Pioneering AI literacy and inclusive data science across Africa.", email: "lydia@africadss.org", preferredContactMethod: "Email", timezone: "EAT", whatsappCapable: true }).onConflictDoNothing().returning();
  const [s7] = await db.insert(speakersTable).values({ name: "Kwame Boateng", title: "CEO, Kofa Energy", gender: "Male", expertise: ["Energy Access", "Cleantech"], bioShort: "Building Africa's EV charging and battery-swap infrastructure.", email: "kwame@kofaenergy.com", preferredContactMethod: "WhatsApp", timezone: "GMT", whatsappCapable: true }).onConflictDoNothing().returning();
  const [s8] = await db.insert(speakersTable).values({ name: "Aida Otieno", title: "Director, Digital Economy — African Union Commission", gender: "Female", expertise: ["Digital Policy", "e-Government"], bioShort: "Shaping the AU's Digital Transformation Strategy 2030.", email: "aotieno@africa-union.org", preferredContactMethod: "Email", timezone: "EAT", whatsappCapable: false }).onConflictDoNothing().returning();
  const [s9] = await db.insert(speakersTable).values({ name: "Nana Asante-Ofori", title: "Partner, Novastar Ventures", gender: "Female", expertise: ["Venture Capital", "Impact Investing"], bioShort: "Backs founders solving Africa's most critical infrastructure gaps.", email: "nasante@novastar.vc", preferredContactMethod: "Email", timezone: "EAT", whatsappCapable: true }).onConflictDoNothing().returning();

  console.log("Speakers seeded");

  // ── 5. Speaker Engagements ──────────────────────────────────────────────
  const seRows: InsertSpeakerEngagement[] = [];
  if (s1?.id) seRows.push({ conveningId: c1.id, speakerId: s1.id, sessionType: "Keynote", sessionTitle: "Financing Africa's Green Transition", invitationStatus: "Confirmed", invitationResponse: "Accepted", briefingDocsSent: true, logisticsConfirmed: true, honorariumAmount: "15000", responsiblePerson: "Amara Diallo" });
  if (s2?.id) seRows.push({ conveningId: c1.id, speakerId: s2.id, sessionType: "Panelist", sessionTitle: "Digital Infrastructure as Trade Enabler", invitationStatus: "Invited", invitationResponse: "Negotiating", briefingDocsSent: false, logisticsConfirmed: false, honorariumAmount: "0", responsiblePerson: "Kofi Mensah" });
  if (s3?.id) seRows.push({ conveningId: c1.id, speakerId: s3.id, sessionType: "Chair", sessionTitle: "Sovereign Debt and the African Credit Paradox", invitationStatus: "Identified", invitationResponse: "NoResponse", briefingDocsSent: false, logisticsConfirmed: false, honorariumAmount: "0", responsiblePerson: "Wanjiku Kamau" });
  if (s4?.id) seRows.push({ conveningId: c3.id, speakerId: s4.id, sessionType: "Keynote", sessionTitle: "Digital Sovereignty — Africa's Moment", invitationStatus: "Confirmed", invitationResponse: "Accepted", briefingDocsSent: true, logisticsConfirmed: true, honorariumAmount: "20000", responsiblePerson: "Amara Diallo" });
  if (s5?.id) seRows.push({ conveningId: c3.id, speakerId: s5.id, sessionType: "Panelist", sessionTitle: "Payments Infrastructure Panel", invitationStatus: "Confirmed", invitationResponse: "Accepted", briefingDocsSent: true, logisticsConfirmed: false, honorariumAmount: "8000", responsiblePerson: "Kofi Mensah" });
  if (s6?.id) seRows.push({ conveningId: c3.id, speakerId: s6.id, sessionType: "WorkshopLead", sessionTitle: "AI Ethics and the African Data Governance Gap", invitationStatus: "Confirmed", invitationResponse: "Accepted", briefingDocsSent: true, logisticsConfirmed: true, honorariumAmount: "5000", responsiblePerson: "Amara Diallo" });
  if (s7?.id) seRows.push({ conveningId: c3.id, speakerId: s7.id, sessionType: "Panelist", sessionTitle: "Clean Energy + Digital Infrastructure Panel", invitationStatus: "Invited", invitationResponse: "Negotiating", briefingDocsSent: false, logisticsConfirmed: false, honorariumAmount: "5000", responsiblePerson: "Wanjiku Kamau" });
  if (s8?.id) seRows.push({ conveningId: c3.id, speakerId: s8.id, sessionType: "Chair", sessionTitle: "AU Digital Policy Fireside", invitationStatus: "Confirmed", invitationResponse: "Accepted", briefingDocsSent: true, logisticsConfirmed: true, honorariumAmount: "0", responsiblePerson: "Amara Diallo" });
  if (s9?.id) seRows.push({ conveningId: c3.id, speakerId: s9.id, sessionType: "Panelist", sessionTitle: "Venture Capital for African Tech", invitationStatus: "Identified", invitationResponse: "NoResponse", briefingDocsSent: false, logisticsConfirmed: false, honorariumAmount: "0", responsiblePerson: "Kofi Mensah" });
  if (seRows.length) await db.insert(speakerEngagementsTable).values(seRows).onConflictDoNothing();

  console.log("Speaker engagements seeded");

  // ── 6. Media Consents ───────────────────────────────────────────────────
  const consentRows: InsertMediaConsent[] = [];
  if (s1?.id) consentRows.push({ speakerId: s1.id, conveningId: c1.id, status: "Granted", photographyConsent: true, videoRecordingConsent: true, liveStreamConsent: true, nameAndBioPublication: true, socialMediaUse: true, thirdPartyMediaSharing: false, capturedVia: "SelfService", capturedAt: new Date() });
  if (s2?.id) consentRows.push({ speakerId: s2.id, conveningId: c1.id, status: "Pending", photographyConsent: false, videoRecordingConsent: false, liveStreamConsent: false, nameAndBioPublication: false, socialMediaUse: false, thirdPartyMediaSharing: false });
  if (s3?.id) consentRows.push({ speakerId: s3.id, conveningId: c1.id, status: "NotRequested", photographyConsent: false, videoRecordingConsent: false, liveStreamConsent: false, nameAndBioPublication: false, socialMediaUse: false, thirdPartyMediaSharing: false });
  if (s4?.id) consentRows.push({ speakerId: s4.id, conveningId: c3.id, status: "Granted", photographyConsent: true, videoRecordingConsent: true, liveStreamConsent: true, nameAndBioPublication: true, socialMediaUse: true, thirdPartyMediaSharing: true, capturedVia: "SelfService", capturedAt: new Date() });
  if (s5?.id) consentRows.push({ speakerId: s5.id, conveningId: c3.id, status: "Pending", photographyConsent: false, videoRecordingConsent: false, liveStreamConsent: false, nameAndBioPublication: false, socialMediaUse: false, thirdPartyMediaSharing: false });
  if (s6?.id) consentRows.push({ speakerId: s6.id, conveningId: c3.id, status: "Granted", photographyConsent: true, videoRecordingConsent: true, liveStreamConsent: true, nameAndBioPublication: true, socialMediaUse: true, thirdPartyMediaSharing: false, capturedVia: "AdminRecorded", capturedAt: new Date() });
  if (s7?.id) consentRows.push({ speakerId: s7.id, conveningId: c3.id, status: "NotRequested", photographyConsent: false, videoRecordingConsent: false, liveStreamConsent: false, nameAndBioPublication: false, socialMediaUse: false, thirdPartyMediaSharing: false });
  if (s8?.id) consentRows.push({ speakerId: s8.id, conveningId: c3.id, status: "Granted", photographyConsent: true, videoRecordingConsent: false, liveStreamConsent: false, nameAndBioPublication: true, socialMediaUse: false, thirdPartyMediaSharing: false, capturedVia: "AdminRecorded", capturedAt: new Date() });
  for (const consent of consentRows) {
    if (!consent.conveningId) continue;
    const [existing] = await db
      .select({ id: mediaConsentsTable.id })
      .from(mediaConsentsTable)
      .where(and(
        eq(mediaConsentsTable.speakerId, consent.speakerId),
        eq(mediaConsentsTable.conveningId, consent.conveningId),
      ))
      .limit(1);
    if (!existing) await db.insert(mediaConsentsTable).values(consent);
  }

  console.log("Consents seeded");

  // ── 7. Budgets ──────────────────────────────────────────────────────────
  await db.insert(budgetsTable).values([
    { conveningId: c1.id, category: "Venue",       committedAmount: "45000", actualAmount: "42000" },
    { conveningId: c1.id, category: "Catering",    committedAmount: "28000", actualAmount: "15000" },
    { conveningId: c1.id, category: "AV",          committedAmount: "18000", actualAmount: "18000" },
    { conveningId: c1.id, category: "Travel",      committedAmount: "35000", actualAmount: "22000" },
    { conveningId: c1.id, category: "Marketing",   committedAmount: "12000", actualAmount: "9500"  },
    { conveningId: c1.id, category: "Operations",  committedAmount: "8000",  actualAmount: "3200"  },
    { conveningId: c1.id, category: "Contingency", committedAmount: "10000", actualAmount: "0"     },
  ]).onConflictDoNothing();

  await db.insert(budgetsTable).values([
    { conveningId: c1.id, type: "Income", category: "Sponsorships",   lineItemName: "Title Sponsorship — Standard Bank", units: 1,   unitCost: 150000, committedAmount: "150000", actualAmount: "150000" },
    { conveningId: c1.id, type: "Income", category: "Sponsorships",   lineItemName: "Gold Sponsorship — KEPSA",          units: 1,   unitCost: 75000,  committedAmount: "75000",  actualAmount: "75000"  },
    { conveningId: c1.id, type: "Income", category: "DelegatePasses", lineItemName: "Delegate Registration Passes",      units: 200, unitCost: 1200,   committedAmount: "240000", actualAmount: "228000" },
    { conveningId: c1.id, type: "Income", category: "Origination",    lineItemName: "Exhibition Booths",                 units: 12,  unitCost: 5000,   committedAmount: "60000",  actualAmount: "55000"  },
  ]).onConflictDoNothing();

  await db.insert(budgetsTable).values([
    { conveningId: c3.id, category: "Venue",       committedAmount: "55000", actualAmount: "0",    notes: "Kampala Serena — deposit pending"              },
    { conveningId: c3.id, category: "Catering",    committedAmount: "32000", actualAmount: "0",    notes: "3-day F&B for 250 delegates"                   },
    { conveningId: c3.id, category: "AV",          committedAmount: "25000", actualAmount: "8000", notes: "4K streaming + AI demo stations"               },
    { conveningId: c3.id, category: "Travel",      committedAmount: "48000", actualAmount: "12000",notes: "Speaker flights, accommodation, visa support"   },
    { conveningId: c3.id, category: "Marketing",   committedAmount: "18000", actualAmount: "6500", notes: "Social, press releases, brand assets"           },
    { conveningId: c3.id, category: "Operations",  committedAmount: "10000", actualAmount: "2000", notes: "On-ground logistics, staff"                     },
    { conveningId: c3.id, category: "Contingency", committedAmount: "12000", actualAmount: "0"                                                            },
  ]).onConflictDoNothing();

  await db.insert(budgetsTable).values([
    { conveningId: c3.id, type: "Income", category: "Sponsorships",   lineItemName: "Title Sponsorship — MTN Africa",    units: 1,   unitCost: 200000, committedAmount: "200000", actualAmount: "200000" },
    { conveningId: c3.id, type: "Income", category: "Sponsorships",   lineItemName: "AI Lab Sponsorship — Safaricom",    units: 1,   unitCost: 80000,  committedAmount: "80000",  actualAmount: "0"      },
    { conveningId: c3.id, type: "Income", category: "DelegatePasses", lineItemName: "Delegate Registration Passes",      units: 250, unitCost: 1500,   committedAmount: "375000", actualAmount: "120000" },
    { conveningId: c3.id, type: "Income", category: "Origination",    lineItemName: "Exhibition Booths",                 units: 20,  unitCost: 6000,   committedAmount: "120000", actualAmount: "36000"  },
  ]).onConflictDoNothing();

  console.log("Budgets seeded");

  // ── 8. Workstreams ──────────────────────────────────────────────────────
  const ws1 = await ensureWorkstream(c1.id, "Programme & Content");
  const ws2 = await ensureWorkstream(c1.id, "Partnerships & Sponsorship");
  const ws3 = await ensureWorkstream(c1.id, "Logistics & Operations");

  const ws4 = await ensureWorkstream(c3.id, "Programme & Content", { colorToken: "#6366F1", order: 1, targetDate: "2027-01-31" });
  const ws5 = await ensureWorkstream(c3.id, "Speakers & VIP Relations", { colorToken: "#FF1267", order: 2, targetDate: "2027-02-14" });
  const ws6 = await ensureWorkstream(c3.id, "Partnerships & Sponsorship", { colorToken: "#F59E0B", order: 3, targetDate: "2026-12-31" });
  const ws7 = await ensureWorkstream(c3.id, "Logistics & Venue", { colorToken: "#14B8A6", order: 4, targetDate: "2027-02-28" });
  const ws8 = await ensureWorkstream(c3.id, "Marketing & Comms", { colorToken: "#EC4899", order: 5, targetDate: "2027-02-01" });

  // ── 9. Tasks ────────────────────────────────────────────────────────────
  if (ws1?.id) await db.insert(tasksTable).values([
    { conveningId: c1.id, workstreamId: ws1.id, title: "Finalise keynote speaker brief", assignee: "Amara Diallo", status: "Completed" },
    { conveningId: c1.id, workstreamId: ws1.id, title: "Draft session themes for each plenary", assignee: "Kofi Mensah", status: "Completed" },
    { conveningId: c1.id, workstreamId: ws1.id, title: "Confirm panel moderators for Day 2", assignee: "Wanjiku Kamau", status: "InProgress" },
    { conveningId: c1.id, workstreamId: ws1.id, title: "Collect speaker bios and photos", assignee: "Amara Diallo", status: "InProgress" },
    { conveningId: c1.id, workstreamId: ws1.id, title: "Review and sign off programme booklet", assignee: "Kofi Mensah", status: "NotStarted" },
  ]).onConflictDoNothing();

  if (ws2?.id) await db.insert(tasksTable).values([
    { conveningId: c1.id, workstreamId: ws2.id, title: "Send invoice to Standard Bank", assignee: "Kofi Mensah", status: "InProgress" },
    { conveningId: c1.id, workstreamId: ws2.id, title: "Follow up KEPSA on in-kind commitment", assignee: "Wanjiku Kamau", status: "NotStarted" },
    { conveningId: c1.id, workstreamId: ws2.id, title: "Draft sponsor benefit delivery report", assignee: "Amara Diallo", status: "NotStarted" },
    { conveningId: c1.id, workstreamId: ws2.id, title: "Identify 2 additional Tier 3 partners", assignee: "Kofi Mensah", status: "Blocked" },
  ]).onConflictDoNothing();

  if (ws3?.id) await db.insert(tasksTable).values([
    { conveningId: c1.id, workstreamId: ws3.id, title: "Confirm hotel room block allocation", assignee: "Wanjiku Kamau", status: "Completed" },
    { conveningId: c1.id, workstreamId: ws3.id, title: "Arrange airport transfers for keynote speakers", assignee: "Wanjiku Kamau", status: "InProgress" },
    { conveningId: c1.id, workstreamId: ws3.id, title: "Procure badge lanyards and signage", assignee: "Amara Diallo", status: "NotStarted" },
    { conveningId: c1.id, workstreamId: ws3.id, title: "Brief security and registration teams", assignee: "Wanjiku Kamau", status: "NotStarted" },
  ]).onConflictDoNothing();

  // ICT 2027 — tasks with startDate + dueDate + progressPct for Gantt
  if (ws4?.id) await db.insert(tasksTable).values([
    { conveningId: c3.id, workstreamId: ws4.id, title: "Define programme structure + track themes", assignee: "Amara Diallo", status: "Completed", startDate: "2026-10-01", dueDate: "2026-10-31", progressPct: 100 },
    { conveningId: c3.id, workstreamId: ws4.id, title: "Confirm keynote + fireside session briefs", assignee: "Kofi Mensah", status: "Completed", startDate: "2026-11-01", dueDate: "2026-11-30", progressPct: 100 },
    { conveningId: c3.id, workstreamId: ws4.id, title: "Script and agenda run-of-show draft", assignee: "Wanjiku Kamau", status: "InProgress", startDate: "2026-12-01", dueDate: "2027-01-15", progressPct: 55 },
    { conveningId: c3.id, workstreamId: ws4.id, title: "Finalise breakaway group topics", assignee: "Amara Diallo", status: "InProgress", startDate: "2026-12-15", dueDate: "2027-01-31", progressPct: 30 },
    { conveningId: c3.id, workstreamId: ws4.id, title: "Sign off programme booklet copy", assignee: "Kofi Mensah", status: "NotStarted", startDate: "2027-02-01", dueDate: "2027-02-15", progressPct: 0, isMilestone: true },
  ]).onConflictDoNothing();

  if (ws5?.id) await db.insert(tasksTable).values([
    { conveningId: c3.id, workstreamId: ws5.id, title: "Send invitations to confirmed speakers", assignee: "Amara Diallo", status: "Completed", startDate: "2026-10-15", dueDate: "2026-11-15", progressPct: 100 },
    { conveningId: c3.id, workstreamId: ws5.id, title: "Coordinate speaker travel and accommodation", assignee: "Wanjiku Kamau", status: "InProgress", startDate: "2026-12-01", dueDate: "2027-02-01", progressPct: 40 },
    { conveningId: c3.id, workstreamId: ws5.id, title: "Distribute speaker briefing packs", assignee: "Amara Diallo", status: "InProgress", startDate: "2027-01-01", dueDate: "2027-01-31", progressPct: 60 },
    { conveningId: c3.id, workstreamId: ws5.id, title: "Collect media consent forms from all speakers", assignee: "Kofi Mensah", status: "NotStarted", startDate: "2027-01-15", dueDate: "2027-02-14", progressPct: 0 },
    { conveningId: c3.id, workstreamId: ws5.id, title: "VIP dinner and bilateral meeting schedule", assignee: "Amara Diallo", status: "NotStarted", startDate: "2027-02-01", dueDate: "2027-02-28", progressPct: 0, isMilestone: true },
  ]).onConflictDoNothing();

  if (ws6?.id) await db.insert(tasksTable).values([
    { conveningId: c3.id, workstreamId: ws6.id, title: "Close MTN title sponsorship contract", assignee: "Amara Diallo", status: "Completed", startDate: "2026-09-01", dueDate: "2026-10-15", progressPct: 100, isMilestone: true },
    { conveningId: c3.id, workstreamId: ws6.id, title: "Negotiate Google Africa activation package", assignee: "Kofi Mensah", status: "InProgress", startDate: "2026-10-01", dueDate: "2026-11-30", progressPct: 70 },
    { conveningId: c3.id, workstreamId: ws6.id, title: "Send invoices to all signed sponsors", assignee: "Kofi Mensah", status: "InProgress", startDate: "2026-11-01", dueDate: "2026-12-15", progressPct: 50 },
    { conveningId: c3.id, workstreamId: ws6.id, title: "Identify 3 SME exhibition partners", assignee: "Wanjiku Kamau", status: "Blocked", startDate: "2026-11-15", dueDate: "2027-01-15", progressPct: 10 },
    { conveningId: c3.id, workstreamId: ws6.id, title: "Sponsor benefit delivery tracker", assignee: "Amara Diallo", status: "NotStarted", startDate: "2027-01-01", dueDate: "2027-02-28", progressPct: 0 },
  ]).onConflictDoNothing();

  if (ws7?.id) await db.insert(tasksTable).values([
    { conveningId: c3.id, workstreamId: ws7.id, title: "Site visit — Kampala Serena Hotel", assignee: "Wanjiku Kamau", status: "Completed", startDate: "2026-09-15", dueDate: "2026-09-30", progressPct: 100 },
    { conveningId: c3.id, workstreamId: ws7.id, title: "Sign venue contract and pay deposit", assignee: "Amara Diallo", status: "Completed", startDate: "2026-10-01", dueDate: "2026-10-31", progressPct: 100, isMilestone: true },
    { conveningId: c3.id, workstreamId: ws7.id, title: "Engage AV & streaming production partner", assignee: "Wanjiku Kamau", status: "InProgress", startDate: "2026-11-01", dueDate: "2027-01-15", progressPct: 65 },
    { conveningId: c3.id, workstreamId: ws7.id, title: "Arrange visa support letters for delegates", assignee: "Kofi Mensah", status: "NotStarted", startDate: "2027-01-01", dueDate: "2027-02-01", progressPct: 0 },
    { conveningId: c3.id, workstreamId: ws7.id, title: "Finalise ground transport and hotel block", assignee: "Wanjiku Kamau", status: "NotStarted", startDate: "2027-01-15", dueDate: "2027-02-28", progressPct: 0 },
  ]).onConflictDoNothing();

  if (ws8?.id) await db.insert(tasksTable).values([
    { conveningId: c3.id, workstreamId: ws8.id, title: "Launch save-the-date and website", assignee: "Kofi Mensah", status: "Completed", startDate: "2026-10-01", dueDate: "2026-11-01", progressPct: 100, isMilestone: true },
    { conveningId: c3.id, workstreamId: ws8.id, title: "Publish speaker announcement series", assignee: "Amara Diallo", status: "InProgress", startDate: "2026-12-01", dueDate: "2027-02-01", progressPct: 45 },
    { conveningId: c3.id, workstreamId: ws8.id, title: "Media partnership outreach — 5 outlets", assignee: "Wanjiku Kamau", status: "InProgress", startDate: "2026-11-15", dueDate: "2027-01-31", progressPct: 30 },
    { conveningId: c3.id, workstreamId: ws8.id, title: "Produce promotional video (60 sec)", assignee: "Kofi Mensah", status: "NotStarted", startDate: "2027-01-01", dueDate: "2027-02-15", progressPct: 0 },
  ]).onConflictDoNothing();

  console.log("Workstreams and tasks seeded");

  // ── 10. Agenda sessions — ICT Mkutano 2027 ─────────────────────────────
  const DAY1 = "2027-03-10";
  const DAY2 = "2027-03-11";
  const DAY3 = "2027-03-12";

  const insertedSessions = await db
    .insert(agendaSessionsTable)
    .values([
      // Day 1
      { conveningId: c3.id, day: DAY1, track: "Main Stage", startTime: "08:30", endTime: "09:00", title: "Registration & Morning Coffee", format: "Break", status: "Confirmed", order: 1 },
      { conveningId: c3.id, day: DAY1, track: "Main Stage", startTime: "09:00", endTime: "09:20", title: "Opening Remarks — Host & MTN Group", format: "Presentation", status: "Confirmed", theme: "Welcome", order: 2 },
      { conveningId: c3.id, day: DAY1, track: "Main Stage", startTime: "09:20", endTime: "10:10", title: "Keynote: Digital Sovereignty — Africa's Moment", format: "StandAlone", status: "Confirmed", theme: "Digital Sovereignty", description: "Opening keynote setting the strategic framing for the three-day convening.", order: 3 },
      { conveningId: c3.id, day: DAY1, track: "Main Stage", startTime: "10:10", endTime: "11:00", title: "AU Digital Policy Fireside", format: "Fireside", status: "Confirmed", theme: "Policy", order: 4 },
      { conveningId: c3.id, day: DAY1, track: "Main Stage", startTime: "11:00", endTime: "11:20", title: "Networking Break", format: "Break", status: "Confirmed", order: 5 },
      { conveningId: c3.id, day: DAY1, track: "Main Stage", startTime: "11:20", endTime: "12:30", title: "Panel: Payments Infrastructure — Who Controls the Rails?", format: "Panel", status: "Confirmed", theme: "Fintech", order: 6 },
      { conveningId: c3.id, day: DAY1, track: "Main Stage", startTime: "12:30", endTime: "14:00", title: "Lunch", format: "Break", status: "Confirmed", order: 7 },
      { conveningId: c3.id, day: DAY1, track: "Main Stage", startTime: "14:00", endTime: "14:50", title: "Panel: Clean Energy + Digital Infrastructure", format: "Panel", status: "Tentative", theme: "Infrastructure", order: 8 },
      { conveningId: c3.id, day: DAY1, track: "Innovation Lab", startTime: "14:00", endTime: "15:30", title: "AI Ethics Workshop: Governing Data for Africa's Benefit", format: "Breakaway", status: "Confirmed", theme: "AI & Data", order: 9 },
      { conveningId: c3.id, day: DAY1, track: "Main Stage", startTime: "15:00", endTime: "15:50", title: "Presentation: Google Africa's AI for Social Good", format: "Presentation", status: "Confirmed", theme: "AI & Data", order: 10 },
      { conveningId: c3.id, day: DAY1, track: "Main Stage", startTime: "16:00", endTime: "17:00", title: "Day 1 Roundtable — Key Themes & Actions", format: "StandAlone", status: "Tentative", order: 11 },
      { conveningId: c3.id, day: DAY1, track: "Main Stage", startTime: "19:00", endTime: "21:00", title: "Welcome Dinner (MTN Sponsored)", format: "Break", status: "Confirmed", order: 12 },
      // Day 2
      { conveningId: c3.id, day: DAY2, track: "Main Stage", startTime: "09:00", endTime: "09:50", title: "Fireside: Venture Capital for African Tech", format: "Fireside", status: "Confirmed", theme: "Investment", order: 1 },
      { conveningId: c3.id, day: DAY2, track: "Main Stage", startTime: "09:50", endTime: "10:50", title: "Panel: Bridging the Connectivity Gap — Last Mile Solutions", format: "Panel", status: "Confirmed", theme: "Infrastructure", order: 2 },
      { conveningId: c3.id, day: DAY2, track: "Main Stage", startTime: "11:00", endTime: "11:20", title: "Break", format: "Break", status: "Confirmed", order: 3 },
      { conveningId: c3.id, day: DAY2, track: "Main Stage", startTime: "11:20", endTime: "12:30", title: "Presentation: National Digital Economy Strategies", format: "Presentation", status: "Confirmed", theme: "Policy", order: 4 },
      { conveningId: c3.id, day: DAY2, track: "Innovation Lab", startTime: "11:00", endTime: "12:30", title: "Breakaway: Digital ID & e-Government Implementation", format: "Breakaway", status: "Confirmed", theme: "Governance", order: 5 },
      { conveningId: c3.id, day: DAY2, track: "Main Stage", startTime: "12:30", endTime: "14:00", title: "Lunch & Startup Exhibition", format: "Break", status: "Confirmed", order: 6 },
      { conveningId: c3.id, day: DAY2, track: "Main Stage", startTime: "14:00", endTime: "15:30", title: "Panel: Women & Non-binary Leaders in Africa's Digital Economy", format: "Panel", status: "Confirmed", theme: "Inclusion", order: 7 },
      { conveningId: c3.id, day: DAY2, track: "Innovation Lab", startTime: "14:00", endTime: "15:30", title: "Workshop: Data Localisation — Compliance vs. Innovation", format: "Breakaway", status: "Tentative", theme: "AI & Data", order: 8 },
      { conveningId: c3.id, day: DAY2, track: "Main Stage", startTime: "16:00", endTime: "17:00", title: "Plenary: Announcing the Kampala Digital Compact", format: "StandAlone", status: "Proposed", theme: "Outcomes", order: 9 },
      // Day 3
      { conveningId: c3.id, day: DAY3, track: "Main Stage", startTime: "09:00", endTime: "10:00", title: "Breakaway: Policy Drafting Workshops (4 tracks)", format: "Breakaway", status: "Confirmed", theme: "Policy", order: 1 },
      { conveningId: c3.id, day: DAY3, track: "Main Stage", startTime: "10:00", endTime: "10:50", title: "Panel: Financing Africa's Digital Infrastructure", format: "Panel", status: "Confirmed", theme: "Finance", order: 2 },
      { conveningId: c3.id, day: DAY3, track: "Main Stage", startTime: "11:00", endTime: "11:20", title: "Break", format: "Break", status: "Confirmed", order: 3 },
      { conveningId: c3.id, day: DAY3, track: "Main Stage", startTime: "11:20", endTime: "12:30", title: "Closing Plenary: Commitments and Next Steps", format: "StandAlone", status: "Confirmed", theme: "Outcomes", order: 4 },
      { conveningId: c3.id, day: DAY3, track: "Main Stage", startTime: "12:30", endTime: "13:00", title: "Closing Remarks & Lunch", format: "Break", status: "Confirmed", order: 5 },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`Agenda sessions seeded: ${insertedSessions.length}`);

  // ── 11. Session speakers ────────────────────────────────────────────────
  const sessionByTitle = new Map(insertedSessions.map((s) => [s.title, s.id]));
  const ssRows: InsertAgendaSessionSpeaker[] = [];

  const link = (title: string, speakerId: string | undefined, role: InsertAgendaSessionSpeaker["role"], status: InsertAgendaSessionSpeaker["status"], order: number) => {
    const sid = sessionByTitle.get(title);
    if (sid && speakerId) ssRows.push({ sessionId: sid, speakerId, role, status, order });
  };

  link("Keynote: Digital Sovereignty — Africa's Moment", s4?.id, "Speaker", "Confirmed", 1);
  link("AU Digital Policy Fireside", s8?.id, "Chair", "Confirmed", 1);
  link("Panel: Payments Infrastructure — Who Controls the Rails?", s5?.id, "Panelist", "Confirmed", 1);
  link("AI Ethics Workshop: Governing Data for Africa's Benefit", s6?.id, "Moderator", "Confirmed", 1);
  link("Panel: Clean Energy + Digital Infrastructure", s7?.id, "Panelist", "Proposed", 1);
  link("Fireside: Venture Capital for African Tech", s9?.id, "Speaker", "Confirmed", 1);

  if (ssRows.length) await db.insert(agendaSessionSpeakersTable).values(ssRows).onConflictDoNothing();

  console.log("Session speakers seeded");

  // ── 10. Service Providers (global directory) ────────────────────────────
  const providerDefs = [
    { company: "Kampala Serena Hotel", category: "VenueHotel", contactPerson: "Charles Mwesigwa", contactPhone: "+256 414 309 000", contactEmail: "events@serena.co.ug", url: "https://www.serenahotels.com/kampala" },
    { company: "Proficient Audio Visual", category: "AVStreaming", contactPerson: "James Otieno", contactPhone: "+256 772 345 678", contactEmail: "james@proficientav.co.ug", url: null },
    { company: "Soundcraft Events", category: "Sound", contactPerson: "David Ssekiziyivu", contactPhone: "+256 701 234 567", contactEmail: null, url: null },
    { company: "Lighting Solutions Uganda", category: "Lighting", contactPerson: "Anne Namukasa", contactPhone: "+256 752 890 123", contactEmail: null, url: null },
    { company: "Crested Crane Catering", category: "Catering", contactPerson: "Grace Namutebi", contactPhone: "+256 414 567 890", contactEmail: "grace@crestedcrane.co.ug", url: null },
    { company: "Safeguard Security Services", category: "Security", contactPerson: "Robert Okello", contactPhone: "+256 782 111 222", contactEmail: null, url: null },
    { company: "MTN Uganda Business", category: "InternetIT", contactPerson: "Sarah Nambooze", contactPhone: "+256 800 000 100", contactEmail: "business@mtn.co.ug", url: "https://www.mtn.co.ug" },
    { company: "Printfast Uganda", category: "PrintSignage", contactPerson: "Paul Mugisha", contactPhone: "+256 701 999 888", contactEmail: null, url: null },
    { company: "Dynamic Photographers", category: "PhotoVideo", contactPerson: "Kevin Ssembuusi", contactPhone: "+256 772 654 321", contactEmail: "kevin@dynphoto.ug", url: null },
    { company: "Nile Special Furniture Hire", category: "FurnitureDecor", contactPerson: "Lydia Apiyo", contactPhone: "+256 414 789 000", contactEmail: null, url: null },
    { company: "FlexPower Generators", category: "Power", contactPerson: "Tom Wafula", contactPhone: "+256 712 333 444", contactEmail: null, url: null },
    { company: "Pearl of Africa Transport", category: "TravelLogistics", contactPerson: "Monica Nalubwama", contactPhone: "+256 392 001 555", contactEmail: null, url: null },
    { company: "Interpretation International", category: "Interpretation", contactPerson: "Fatima Osman", contactPhone: "+256 714 567 890", contactEmail: "fatima@iinterp.com", url: null },
    { company: "Nation Media Group Events", category: "MediaPR", contactPerson: "Benedict Oduya", contactPhone: "+256 414 302 100", contactEmail: "events@nmg.com", url: "https://www.nationmedia.com" },
    { company: "Smile Identity Payments", category: "Payments", contactPerson: "Irene Acayo", contactPhone: "+256 800 123 456", contactEmail: null, url: null },
  ] as const;

  const insertedProviders = [];
  for (const p of providerDefs) {
    const existing = await db.query.serviceProvidersTable.findFirst({
      where: (table, { eq }) => eq(table.company, p.company),
    });
    if (existing) {
      insertedProviders.push(existing);
      continue;
    }
    const [created] = await db
      .insert(serviceProvidersTable)
      .values({
        company: p.company,
        category: p.category as typeof providerDefs[number]["category"],
        contactPerson: p.contactPerson ?? null,
        contactPhone: p.contactPhone ?? null,
        contactEmail: p.contactEmail ?? null,
        url: p.url ?? null,
        notes: null,
      })
      .returning();
    insertedProviders.push(created);
  }

  console.log(`Service providers seeded: ${insertedProviders.length}`);

  // ── 11. Provider Bookings for ICT Mkutano 2027 ──────────────────────────
  if (c3raw?.id && insertedProviders.length > 0) {
    const pByCompany = new Map(insertedProviders.map((p) => [p.company, p.id]));
    const bookingDefs: Array<{
      serviceProviderCompany: string;
      procurementStatus: "Identified" | "Shortlisted" | "Quoted" | "Contracted" | "Paid" | "Completed" | "OnHold";
      estimatedCost: number;
      currency: string;
      responsiblePerson: string;
    }> = [
      { serviceProviderCompany: "Kampala Serena Hotel", procurementStatus: "Contracted", estimatedCost: 45000, currency: "USD", responsiblePerson: "Ops Lead" },
      { serviceProviderCompany: "Proficient Audio Visual", procurementStatus: "Contracted", estimatedCost: 18000, currency: "USD", responsiblePerson: "AV Coordinator" },
      { serviceProviderCompany: "Crested Crane Catering", procurementStatus: "Quoted", estimatedCost: 22000, currency: "USD", responsiblePerson: "Ops Lead" },
      { serviceProviderCompany: "Safeguard Security Services", procurementStatus: "Shortlisted", estimatedCost: 5000, currency: "USD", responsiblePerson: "Ops Lead" },
      { serviceProviderCompany: "Soundcraft Events", procurementStatus: "Quoted", estimatedCost: 8000, currency: "USD", responsiblePerson: "AV Coordinator" },
      { serviceProviderCompany: "Printfast Uganda", procurementStatus: "Identified", estimatedCost: 3000, currency: "USD", responsiblePerson: "Comms Team" },
      { serviceProviderCompany: "Dynamic Photographers", procurementStatus: "Contracted", estimatedCost: 7500, currency: "USD", responsiblePerson: "Media Lead" },
      { serviceProviderCompany: "MTN Uganda Business", procurementStatus: "Contracted", estimatedCost: 4000, currency: "USD", responsiblePerson: "Tech Lead" },
      { serviceProviderCompany: "Pearl of Africa Transport", procurementStatus: "Shortlisted", estimatedCost: 12000, currency: "USD", responsiblePerson: "Delegate Coordinator" },
      { serviceProviderCompany: "Nation Media Group Events", procurementStatus: "Contracted", estimatedCost: 9500, currency: "USD", responsiblePerson: "Press Manager" },
    ];

    const bookingRows = bookingDefs
      .map((b) => {
        const spId = pByCompany.get(b.serviceProviderCompany);
        if (!spId) return null;
        return {
          conveningId: c3raw.id,
          serviceProviderId: spId,
          procurementStatus: b.procurementStatus,
          estimatedCost: b.estimatedCost,
          currency: b.currency,
          responsiblePerson: b.responsiblePerson,
        };
      })
      .filter(Boolean) as Array<{
        conveningId: string;
        serviceProviderId: string;
        procurementStatus: "Identified" | "Shortlisted" | "Quoted" | "Contracted" | "Paid" | "Completed" | "OnHold";
        estimatedCost: number;
        currency: string;
        responsiblePerson: string;
      }>;

    if (bookingRows.length) {
      for (const booking of bookingRows) {
        const [existing] = await db
          .select({ id: providerBookingsTable.id })
          .from(providerBookingsTable)
          .where(and(
            eq(providerBookingsTable.conveningId, booking.conveningId),
            eq(providerBookingsTable.serviceProviderId, booking.serviceProviderId),
          ))
          .limit(1);
        if (!existing) await db.insert(providerBookingsTable).values(booking);
      }
      console.log(`Provider bookings seeded: ${bookingRows.length}`);
    }
  }

  // ── Pass type configs ──────────────────────────────────────────────────
  // c1 — East Africa Summit 2026
  const c1PassConfigs = [
    { conveningId: c1.id, passType: "EarlyBird" as const, label: "Early Bird",    price: "800",  capacity: 80  },
    { conveningId: c1.id, passType: "Standard"  as const, label: "Standard",      price: "1200", capacity: 120 },
    { conveningId: c1.id, passType: "Late"      as const, label: "Late",          price: "1500", capacity: 50  },
    { conveningId: c1.id, passType: "Speaker"   as const, label: "Speaker Pass",  price: "0",    capacity: 30  },
    { conveningId: c1.id, passType: "Press"     as const, label: "Press Pass",    price: "0",    capacity: 15  },
    { conveningId: c1.id, passType: "VIP"       as const, label: "VIP Pass",      price: "0",    capacity: 20  },
    { conveningId: c1.id, passType: "Official"  as const, label: "Official Pass", price: "0",    capacity: 10  },
  ];
  await db.insert(passTypeConfigsTable).values(c1PassConfigs).onConflictDoNothing();

  // c3 — ICT Mkutano 2027
  const c3PassConfigs = [
    { conveningId: c3.id, passType: "EarlyBird"  as const, label: "Early Bird",       price: "1000", capacity: 100 },
    { conveningId: c3.id, passType: "Standard"   as const, label: "Standard",         price: "1500", capacity: 200 },
    { conveningId: c3.id, passType: "Late"        as const, label: "Late Registration",price: "1800", capacity: 60  },
    { conveningId: c3.id, passType: "Speaker"    as const, label: "Speaker Pass",     price: "0",    capacity: 40  },
    { conveningId: c3.id, passType: "Press"      as const, label: "Press Pass",       price: "0",    capacity: 20  },
    { conveningId: c3.id, passType: "VIP"        as const, label: "VIP Pass",         price: "0",    capacity: 25  },
    { conveningId: c3.id, passType: "Official"   as const, label: "Official Pass",    price: "0",    capacity: 15  },
    { conveningId: c3.id, passType: "FreeSponsor" as const, label: "Sponsor Comp",    price: "0",    capacity: 30  },
  ];
  await db.insert(passTypeConfigsTable).values(c3PassConfigs).onConflictDoNothing();
  console.log("Pass type configs seeded");

  // Update compPassCap for convenings that have comp passes configured
  await db.update(conveningsTable).set({ compPassCap: 75 }).where(eq(conveningsTable.id, c1.id));
  await db.update(conveningsTable).set({ compPassCap: 130 }).where(eq(conveningsTable.id, c3.id));

  // ── Sample delegates ───────────────────────────────────────────────────
  const c1Delegates = [
    { conveningId: c1.id, name: "Aisha Kamara",     email: "aisha.kamara@example.com",    organisation: "KCB Group",              passType: "EarlyBird" as const, status: "Confirmed" as const },
    { conveningId: c1.id, name: "David Osei",        email: "david.osei@example.com",      organisation: "Stanbic Bank",           passType: "EarlyBird" as const, status: "Confirmed" as const },
    { conveningId: c1.id, name: "Fatima Al-Rashid",  email: "fatima.rashid@example.com",   organisation: "IFC",                    passType: "Standard"  as const, status: "Confirmed" as const },
    { conveningId: c1.id, name: "Joseph Mwangi",     email: "joseph.mwangi@example.com",   organisation: "Safaricom",              passType: "Standard"  as const, status: "Confirmed" as const },
    { conveningId: c1.id, name: "Ngozi Adeyemi",     email: "ngozi.adeyemi@example.com",   organisation: "Access Bank",            passType: "Late"      as const, status: "Confirmed" as const },
    { conveningId: c1.id, name: "Prof. James Kato",  email: "james.kato@university.ac.ug", organisation: "Makerere University",    passType: "Speaker"   as const, status: "Confirmed" as const },
    { conveningId: c1.id, name: "Sarah Wanjiku",     email: "swanjiku@pressroom.ke",       organisation: "Daily Nation",           passType: "Press"     as const, status: "Confirmed" as const },
    { conveningId: c1.id, name: "H.E. Ambassador Ali", email: "ali.embassy@example.com",  organisation: "Embassy of Ethiopia",    passType: "Official"  as const, status: "Confirmed" as const },
    { conveningId: c1.id, name: "Michael Chen",      email: "mchen@globalfund.org",        organisation: "Global Development Fund",passType: "VIP"       as const, status: "Confirmed" as const },
    { conveningId: c1.id, name: "Amina Toure",       email: "atoure@ecowas.int",           organisation: "ECOWAS",                 passType: "VIP"       as const, status: "Confirmed" as const },
    { conveningId: c1.id, name: "Lena Schmidt",      email: "lschmidt@giz.de",             organisation: "GIZ",                    passType: "FreeSponsor" as const, status: "Confirmed" as const },
  ];
  await db.insert(delegatesTable).values(c1Delegates).onConflictDoNothing();

  const c3Delegates = [
    { conveningId: c3.id, name: "Emmanuel Okonkwo",  email: "e.okonkwo@mtn.com",           organisation: "MTN Group",              passType: "EarlyBird" as const, status: "Confirmed" as const },
    { conveningId: c3.id, name: "Grace Akello",      email: "grace.akello@example.com",    organisation: "Airtel Africa",          passType: "EarlyBird" as const, status: "Confirmed" as const },
    { conveningId: c3.id, name: "Tariq Al-Hassan",   email: "tariq@techstartup.io",        organisation: "AfriTech Labs",          passType: "Standard"  as const, status: "Confirmed" as const },
    { conveningId: c3.id, name: "Blessing Nwosu",    email: "bnwosu@nlng.com",             organisation: "Nigeria LNG",            passType: "Standard"  as const, status: "Confirmed" as const },
    { conveningId: c3.id, name: "Dr. Amara Diallo",  email: "adiallo@africanunion.org",    organisation: "African Union",          passType: "Speaker"   as const, status: "Confirmed" as const },
    { conveningId: c3.id, name: "Chioma Eze",        email: "ceze@guardian.ng",            organisation: "The Guardian Nigeria",   passType: "Press"     as const, status: "Confirmed" as const },
    { conveningId: c3.id, name: "Pierre Nkurunziza", email: "pierre@cedeao.org",           organisation: "ECOWAS Commission",      passType: "Official"  as const, status: "Confirmed" as const },
    { conveningId: c3.id, name: "Sylvia Owino",      email: "sowino@google.com",           organisation: "Google Africa",          passType: "VIP"       as const, status: "Confirmed" as const },
    { conveningId: c3.id, name: "Tendai Moyo",       email: "tmoyo@meta.com",              organisation: "Meta Africa",            passType: "VIP"       as const, status: "Confirmed" as const },
    { conveningId: c3.id, name: "Hadija Uwera",      email: "huwera@mict.go.ug",           organisation: "Uganda MoICT",           passType: "FreeSponsor" as const, status: "Confirmed" as const },
    { conveningId: c3.id, name: "Samuel Asante",     email: "sasante@example.com",         organisation: "Ghana Revenue Authority",passType: "Late"      as const, status: "Confirmed" as const },
  ];
  await db.insert(delegatesTable).values(c3Delegates).onConflictDoNothing();
  console.log("Sample delegates seeded");

  await seedAaps();
  console.log("✅ Database seeding complete.");
}

async function seedAaps() {
  console.log("Seeding AAPS 2027…");

  // ── Convening ────────────────────────────────────────────────────────────
  const [aRaw] = await db.insert(conveningsTable).values({
    name: "All Africa Pension Summit 2027",
    slug: "aaps-2027",
    theme: "Let's Do Business. Over US$1 Trillion+ — from dialogue, to commitment, to construction",
    startDate: "2027-03-18",
    endDate: "2027-03-20",
    venueName: "Kampala, Uganda",
    venueConfirmed: true,
    status: "Active",
    timezone: "Africa/Kampala",
    usdToUgxRate: 3800,
    whiteLabel: true,
    brandPrimaryColor: "#009444",
    brandAccentColor: "#FDB913",
  }).onConflictDoNothing().returning();
  const aConv = aRaw ?? (await db.query.conveningsTable.findFirst({ where: (t, { eq }) => eq(t.slug, "aaps-2027") }))!;
  // Always apply branding fields (safe to re-run)
  await db.update(conveningsTable).set({
    whiteLabel: true,
    brandPrimaryColor: "#009444",
    brandAccentColor: "#FDB913",
  }).where(eq(conveningsTable.id, aConv.id));
  const cid = aConv.id;

  // ── Speakers (13) ────────────────────────────────────────────────────────
  type SRow = [string, string, string, string];
  const speakerRows: SRow[] = [
    ["Patrick Ayota",                          "Managing Director, NSSF Uganda",                      "Male",   "Confirmed"],
    ["Aliko Dangote",                           "Chairman, Dangote Group",                             "Male",   "Identified"],
    ["Amina J. Mohammed",                       "Deputy Secretary-General, United Nations",            "Female", "Invited"],
    ["Tidjane Thiam",                           "African finance leader",                              "Male",   "Invited"],
    ["Donald Kaberuka",                         "Advisory Board Chair (fmr AfDB President)",           "Male",   "Identified"],
    ["Vera Songwe",                             "Liquidity & Sustainability Facility",                 "Female", "Confirmed"],
    ["Samaila Zubairu",                         "CEO, Africa Finance Corporation",                     "Male",   "Invited"],
    ["Dr Benedict Oramah",                      "President, Afreximbank",                             "Male",   "Confirmed"],
    ["Sithabile Mabanga",                       "BPOPF, Botswana",                                    "Female", "Invited"],
    ["Hon. Lt. Gen. Henry Tumukunde Kakurugu",  "Minister, Uganda",                                   "Male",   "Confirmed"],
    ["Aisha Dahir-Umar",                        "Director-General, PenCom, Nigeria",                  "Female", "Invited"],
    ["Kenneth Matomola",                        "CEO, NAMFISA, Namibia",                              "Male",   "Identified"],
    ["Dr Leila Fourie",                         "CEO, Johannesburg Stock Exchange",                   "Female", "Invited"],
  ];
  const sid: Record<string, string> = {};
  for (const [name, title, gender, invStatus] of speakerRows) {
    const sp = await ensureSpeaker(name, title, gender);
    if (sp) {
      sid[name] = sp.id;
      await db.insert(speakerEngagementsTable).values({
        conveningId: cid,
        speakerId: sp.id,
        sessionType: "Keynote",
        sourceType: "External",
        invitationStatus: invStatus as "Confirmed" | "Identified" | "Invited",
        invitationResponse: "NoResponse",
      }).onConflictDoNothing();
    }
  }
  const S = (n: string) => sid[n] ?? null;
  console.log(`AAPS speakers: ${Object.keys(sid).length}`);

  // ── Partners + engagements ────────────────────────────────────────────────
  type PRow = [string, string, string, number, string, string, string];
  const partnerRows: PRow[] = [
    ["NSSF Uganda",                   "CredibilityOnly", "Onboarded",    0,     "Convening Authority", "Finance",                      "PensionFunds"],
    ["Trade & Development Bank (TDB)", "Platinum",       "Negotiation",  0,     "Deal Room Partner",   "Finance",                      "DevelopmentFinance"],
    ["AfDB / Africa50",               "Platinum",        "Negotiation",  30000, "Platinum",            "Infrastructure",               "DevelopmentFinance"],
    ["IFC / World Bank",              "Gold",            "Negotiation",  25000, "Gold",                "Finance",                      "DevelopmentFinance"],
    ["Afreximbank",                   "Gold",            "ContractSigned", 25000, "Gold",              "Banking",                      "DevelopmentFinance"],
    ["Africa Finance Corporation",    "Gold",            "Prospect",     25000, "Gold",                "Capital Markets",              "CapitalMarkets"],
    ["FSD Africa",                    "Silver",          "Prospect",     10000, "Silver",              "Social Impact & Philanthropy", "DevelopmentPartner"],
    ["CNBC Africa",                   "InKind",          "ContractSigned", 0,   "Media",               "Media & Communications",       "KnowledgeMedia"],
  ];
  for (const [name, tier, status, amount, finalTier, industry, partnerType] of partnerRows) {
    const p = await ensurePartner(name, tier, industry, partnerType);
    if (p) {
      await db.insert(engagementsTable).values({
        conveningId: cid,
        partnerId: p.id,
        status: status as "Prospect" | "Negotiation" | "ContractSigned" | "Onboarded",
        financialAmount: String(amount),
        currency: "USD",
        finalTier,
        delegatePassesAllocated: tier === "Platinum" || tier === "Government" ? 6 : tier === "Gold" ? 4 : tier === "Silver" ? 2 : 0,
      }).onConflictDoNothing();
    }
  }
  console.log("AAPS partners seeded");

  // ── Budget ────────────────────────────────────────────────────────────────
  await db.insert(budgetsTable).values([
    { conveningId: cid, category: "Venue",       committedAmount: "120000", actualAmount: "40000" },
    { conveningId: cid, category: "AV",          committedAmount: "90000",  actualAmount: "20000" },
    { conveningId: cid, category: "Catering",    committedAmount: "80000",  actualAmount: "0"     },
    { conveningId: cid, category: "Marketing",   committedAmount: "70000",  actualAmount: "15000" },
    { conveningId: cid, category: "Travel",      committedAmount: "60000",  actualAmount: "8000"  },
    { conveningId: cid, category: "Operations",  committedAmount: "50000",  actualAmount: "10000" },
    { conveningId: cid, category: "Contingency", committedAmount: "30000",  actualAmount: "0"     },
  ]).onConflictDoNothing();

  await db.insert(budgetsTable).values([
    { conveningId: cid, type: "Income", category: "Sponsorships",   lineItemName: "Title Sponsorship",            units: 1,   unitCost: 300000, committedAmount: "300000", actualAmount: "150000" },
    { conveningId: cid, type: "Income", category: "Sponsorships",   lineItemName: "Gold Sponsorship (×2)",        units: 2,   unitCost: 100000, committedAmount: "200000", actualAmount: "0"      },
    { conveningId: cid, type: "Income", category: "DelegatePasses", lineItemName: "Delegate Registration Passes", units: 500, unitCost: 800,    committedAmount: "400000", actualAmount: "120000" },
    { conveningId: cid, type: "Income", category: "Origination",    lineItemName: "Exhibition Booths",            units: 30,  unitCost: 8000,   committedAmount: "240000", actualAmount: "80000"  },
  ]).onConflictDoNothing();
  console.log("AAPS budget seeded");

  // ── Workstreams + tasks ──────────────────────────────────────────────────
  type TaskRow = [string, string, string, number, string, boolean?];
  const wsData: { name: string; color: string; tasks: TaskRow[] }[] = [
    { name: "Governance & Secretariat", color: "#009444", tasks: [
      ["Formalise Steering & Working Committees",   "2026-04-01", "2026-06-30", 100, "Completed"],
      ["Presidential & PM engagement",              "2026-05-01", "2026-08-31",  60, "InProgress"],
    ]},
    { name: "Programme & Curation", color: "#FF1267", tasks: [
      ["Frame tracks A–D & panels",                 "2026-06-01", "2026-09-30",  40, "InProgress"],
      ["Final agenda & panel curation",             "2027-01-05", "2027-02-28",   0, "NotStarted"],
    ]},
    { name: "Speakers & Keynotes", color: "#534AB7", tasks: [
      ["Pursue headliner (target)",                 "2026-06-01", "2026-11-30",  25, "InProgress"],
      ["Speaker courting & confirmations",          "2026-10-01", "2027-02-15",   0, "NotStarted"],
    ]},
    { name: "Partnerships & Sponsorship", color: "#1D9E75", tasks: [
      ["Partner & sponsor close",                   "2026-09-01", "2026-12-20",  30, "InProgress"],
      ["Deal Room Partner (TDB) close",             "2026-07-01", "2026-10-31",  55, "Blocked"],
    ]},
    { name: "Deal Room & Pipeline", color: "#9333EA", tasks: [
      ["Name vehicle; Nsimbe master-plan",          "2026-05-01", "2026-09-30",  70, "InProgress"],
      ["Nsimbe anchor MOUs",                        "2026-10-01", "2026-12-31",  10, "InProgress"],
      ["Deal Room pipeline curation",               "2027-01-05", "2027-03-10",   0, "NotStarted"],
    ]},
    { name: "Digital (Tukutane)", color: "#0EA5E9", tasks: [
      ["Tukutane app build",                        "2026-10-01", "2027-02-18",   0, "NotStarted"],
      ["App live & tested (1 month out)",           "2027-02-18", "2027-02-18",   0, "NotStarted", true],
    ]},
    { name: "Marketing & Media", color: "#D85A30", tasks: [
      ["Public launch at ISSA gathering",           "2026-10-01", "2026-11-30",   0, "NotStarted"],
      ["Media push & delegate registration",        "2027-01-05", "2027-03-15",   0, "NotStarted"],
    ]},
    { name: "Analytics & Intelligence", color: "#0F766E", tasks: [
      ["Contract dedicated analytics resource",     "2026-07-01", "2026-09-30",  20, "InProgress"],
    ]},
    { name: "Logistics, Venue & Production", color: "#CA8A04", tasks: [
      ["Procure venue, production, curation",       "2026-05-01", "2026-08-31",  80, "InProgress"],
    ]},
    { name: "Finance & Procurement", color: "#6B7280", tasks: [
      ["Budget approval & procurement plan",        "2026-04-15", "2026-06-15", 100, "Completed"],
    ]},
  ];

  for (let i = 0; i < wsData.length; i++) {
    const w = wsData[i];
    const [wsRow] = await db.insert(workstreamsTable).values({
      conveningId: cid, name: w.name, order: i, colorToken: w.color,
    }).onConflictDoNothing().returning();
    const wsId = wsRow?.id ?? (await db.query.workstreamsTable.findFirst({
      where: (t, { and, eq }) => and(eq(t.conveningId, cid), eq(t.name, w.name)),
    }))?.id;
    if (!wsId) continue;
    for (const [title, startDate, dueDate, progressPct, status, isMilestone = false] of w.tasks) {
      await db.insert(tasksTable).values({
        conveningId: cid, workstreamId: wsId, title,
        startDate, dueDate,
        progressPct, isMilestone,
        status: status as "NotStarted" | "InProgress" | "Completed" | "Blocked",
      }).onConflictDoNothing();
    }
  }
  console.log("AAPS workstreams & tasks seeded");

  // ── Agenda sessions ──────────────────────────────────────────────────────
  const D1 = "2027-03-18", D2 = "2027-03-19", D3 = "2027-03-20";
  // [day, track, startTime, endTime, title, format, status, chair|null, isSponsored, theme|null, speakerNames[], targetSpeakers]
  type SessRow = [string, string, string, string, string, string, string, string | null, boolean, string | null, string[], number];
  const sessionRows: SessRow[] = [
    [D1,"Plenary",    "08:00","09:00","Registration & networking",                          "Break",        "Confirmed", null,                    false, null,                   [],                                                 0],
    [D1,"Plenary",    "09:00","10:30","Presidential Roundtable & headline keynote",         "Presentation", "Confirmed", "Patrick Ayota",          false, "Open & Mobilise",     ["Patrick Ayota"],                                  2],
    [D1,"Plenary",    "10:30","11:00","Progress report on the 2025 Kampala Declaration",    "Presentation", "Confirmed", "Patrick Ayota",          false, null,                   ["Patrick Ayota"],                                  1],
    [D1,"Plenary",    "11:00","11:20","Tea break",                                          "Break",        "Confirmed", null,                    false, null,                   [],                                                 0],
    [D1,"Track A",    "11:20","12:30","Regulatory Harmonisation",                           "Panel",        "Confirmed", "Aisha Dahir-Umar",      false, "Policy & Regulation",  ["Aisha Dahir-Umar","Kenneth Matomola"],            3],
    [D1,"Track B",    "11:20","12:30","Infrastructure Co-Investment",                       "Panel",        "Confirmed", "Samaila Zubairu",        false, "Investment & Infra",   ["Samaila Zubairu","Dr Benedict Oramah"],           4],
    [D1,"Plenary",    "12:30","13:30","Lunch",                                              "Break",        "Confirmed", null,                    false, null,                   [],                                                 0],
    [D1,"Track C",    "13:30","14:45","Inclusion & Social Impact",                          "Panel",        "Proposed",  "Sithabile Mabanga",     false, "Inclusion",            ["Sithabile Mabanga"],                              3],
    [D1,"Track D",    "13:30","16:00","Deal Room — project showcase opens",                 "Breakaway",    "Confirmed", null,                    false, "The Deal Room",        [],                                                 0],
    [D1,"Plenary",    "18:00","20:00","Welcome reception & exhibition",                     "Intermission", "Confirmed", null,                    true,  null,                   [],                                                 0],

    [D2,"Plenary",    "09:00","10:00","Global keynote",                                     "Presentation", "Proposed",  "Amina J. Mohammed",     false, "Deepen & Match",      ["Amina J. Mohammed"],                              1],
    [D2,"Plenary",    "10:00","11:00","Capital is ready — thematic plenary",                "Panel",        "Confirmed", "Vera Songwe",            false, null,                   ["Vera Songwe","Sithabile Mabanga"],                4],
    [D2,"Plenary",    "11:00","11:20","Tea break",                                          "Break",        "Confirmed", null,                    false, null,                   [],                                                 0],
    [D2,"Track A",    "11:20","12:30","Coverage & Patient Capital",                         "Panel",        "Confirmed", "Patrick Ayota",          false, null,                   ["Patrick Ayota"],                                  3],
    [D2,"Track B",    "11:20","12:30","Blended Finance & De-risking",                       "Panel",        "Proposed",  "Dr Benedict Oramah",    false, null,                   ["Dr Benedict Oramah"],                             4],
    [D2,"Plenary",    "12:30","13:30","Lunch",                                              "Break",        "Confirmed", null,                    false, null,                   [],                                                 0],
    [D2,"Track D",    "13:30","15:00","Deal Room — pre-scheduled bilateral meetings",        "Breakaway",    "Confirmed", null,                    false, null,                   [],                                                 0],
    [D2,"Boardroom",  "15:00","16:30","Business Circle & Convenor's Boardroom",             "Breakaway",    "Confirmed", null,                    false, null,                   [],                                                 0],
    [D2,"Plenary",    "19:00","22:00","Gala dinner & awards",                               "Intermission", "Confirmed", null,                    true,  null,                   [],                                                 0],

    [D3,"Plenary",    "09:00","10:30","Deal Room — commitment session & LOI signing",        "StandAlone",   "Confirmed", null,                    true,  "Commit & Construct",  [],                                                 0],
    [D3,"Plenary",    "10:30","11:00","Announcement of the infrastructure investment vehicle","Presentation", "Confirmed", "Patrick Ayota",         false, null,                   ["Patrick Ayota"],                                  1],
    [D3,"Plenary",    "11:00","12:00","Signing ceremony & Kampala Declaration 2027",         "StandAlone",   "Confirmed", null,                    false, null,                   [],                                                 0],
    [D3,"Plenary",    "12:00","12:30","Advisory Board launch",                               "Presentation", "Proposed",  "Donald Kaberuka",       false, null,                   ["Donald Kaberuka"],                                1],
    [D3,"Offsite",    "14:00","17:00","Project site visits & excursions",                    "Break",        "Confirmed", null,                    false, null,                   [],                                                 0],
  ];

  const ssRows: InsertAgendaSessionSpeaker[] = [];
  let sessOrder = 0;
  for (const [day, track, startTime, endTime, title, format, status, chair, isSponsored, theme, spkNames, targetSpeakers] of sessionRows) {
    const [sessRow] = await db.insert(agendaSessionsTable).values({
      conveningId: cid, day, track, startTime, endTime, title,
      theme: theme ?? undefined,
      format: format as "StandAlone" | "Fireside" | "Panel" | "Presentation" | "Breakaway" | "Break" | "Intermission",
      status: status as "Proposed" | "Tentative" | "Confirmed",
      isSponsored,
      chairSpeakerId: chair ? S(chair) : undefined,
      targetSpeakers,
      order: sessOrder++,
    }).onConflictDoNothing().returning();
    if (!sessRow) continue;
    spkNames.forEach((name, i) => {
      const spkId = S(name);
      if (spkId) ssRows.push({
        sessionId: sessRow.id,
        speakerId: spkId,
        role: format === "Panel" ? "Panelist" : "Speaker",
        status: status === "Confirmed" ? "Confirmed" : "Proposed",
        order: i,
      });
    });
  }
  if (ssRows.length) await db.insert(agendaSessionSpeakersTable).values(ssRows).onConflictDoNothing();
  console.log(`AAPS agenda sessions seeded: ${sessOrder}, speakers linked: ${ssRows.length}`);

  // ── Service providers + bookings ─────────────────────────────────────────
  type ProcStatus = "Identified" | "Shortlisted" | "Quoted" | "Contracted" | "Paid" | "Completed" | "OnHold";
  type ProvRow = [string, string, ProcStatus];
  const providerRows: ProvRow[] = [
    ["Summit Venue (Kampala)",              "VenueHotel",       "Quoted"],
    ["Stage & Set Production",              "Stage",            "Contracted"],
    ["AV & Live-Streaming Co.",             "AVStreaming",       "Quoted"],
    ["CNBC Africa",                         "MediaPR",          "Contracted"],
    ["Tukutane (AI convening platform)",    "Other",            "Contracted"],
    ["Analytics & Intelligence Partner",    "Other",            "Identified"],
    ["Conference Catering",                 "Catering",         "Identified"],
    ["Event Security",                      "Security",         "Identified"],
    ["DMC & Travel",                        "TravelLogistics",  "Identified"],
  ];
  for (const [company, category, procStatus] of providerRows) {
    const sp = await ensureProvider(company, category);
    if (sp) {
      await db.insert(providerBookingsTable).values({
        conveningId: cid,
        serviceProviderId: sp.id,
        procurementStatus: procStatus,
        currency: "USD",
      }).onConflictDoNothing();
    }
  }
  console.log("AAPS service providers & bookings seeded");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
