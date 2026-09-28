import { db } from "@workspace/db";
import {
  conveningsTable,
  partnersTable,
  engagementsTable,
  speakersTable,
  speakerEngagementsTable,
  mediaConsentsTable,
  agendaSessionsTable,
  tasksTable,
  workstreamsTable,
  delegatesTable,
  budgetsTable,
  commitmentsTable,
  dealProjectsTable,
  dealCommitmentsTable,
  exhibitorsTable,
  boothsTable,
  portalUsersTable,
} from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { notDeleted } from "./softDelete";
import { logger } from "./logger";
import { appsScriptPost, GoogleSheetsNotConfiguredError } from "./sheetsClient";
import { writeAudit } from "./audit";

export { GoogleSheetsNotConfiguredError };

export interface SheetsSyncResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetsLastSyncedAt: string;
  tabCounts: Array<{ title: string; rows: number }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function bool(v: boolean | null | undefined): string {
  if (v == null) return "";
  return v ? "Yes" : "No";
}

type ColDef<T> = { header: string; get: (row: T) => unknown };
function buildRows<T>(cols: ColDef<T>[], data: T[]): string[][] {
  return [
    cols.map((c) => c.header),
    ...data.map((row) => cols.map((c) => fmt(c.get(row)))),
  ];
}

// ── Tab definitions ────────────────────────────────────────────────────────────

async function buildTabs(conveningId: string): Promise<{ title: string; values: string[][] }[]> {
  const [
    partners,
    speakers,
    sessions,
    workstreams,
    tasks,
    delegates,
    budgetRows,
    commitmentRows,
    dealProjects,
    dealCommitments,
    exhibitors,
  ] = await Promise.all([

    // Partners — full partner + engagement data
    db.select({
      id:                      partnersTable.id,
      partnerProfile:          engagementsTable.partnerProfile,
      institutionName:         partnersTable.institutionName,
      partnerType:             partnersTable.partnerType,
      sector:                  partnersTable.sector,
      industry:                partnersTable.industry,
      location:                partnersTable.location,
      logoUrl:                 partnersTable.logoUrl,
      description:             partnersTable.description,
      principals:              partnersTable.principals,
      fitWithThem:             partnersTable.fitWithThem,
      historicalNotes:         partnersTable.historicalNotes,
      contactName:             partnersTable.contactName,
      contactTitle:            partnersTable.contactTitle,
      contactEmail:            partnersTable.contactEmail,
      contactPhone:            partnersTable.contactPhone,
      status:                  engagementsTable.status,
      natureOfResponse:        engagementsTable.natureOfResponse,
      commitmentType:          engagementsTable.commitmentType,
      commitmentDetails:       engagementsTable.commitmentDetails,
      packageName:             engagementsTable.packageName,
      packageType:             engagementsTable.packageType,
      packageBenefits:         engagementsTable.packageBenefits,
      financialAmount:         engagementsTable.financialAmount,
      currency:                engagementsTable.currency,
      paymentStatus:           engagementsTable.paymentStatus,
      invoiceSent:             engagementsTable.invoiceSent,
      invoicePaid:             engagementsTable.invoicePaid,
      paymentDueDate:          engagementsTable.paymentDueDate,
      finalTier:               engagementsTable.finalTier,
      delegatePassesAllocated: engagementsTable.delegatePassesAllocated,
      brandingAssetsReceived:  engagementsTable.brandingAssetsReceived,
      responsiblePerson:       engagementsTable.responsiblePerson,
      followUpRequired:        engagementsTable.followUpRequired,
      followUpDate:            engagementsTable.followUpDate,
      followUpAction:          engagementsTable.followUpAction,
    })
      .from(engagementsTable)
      .innerJoin(partnersTable, and(
        eq(engagementsTable.partnerId, partnersTable.id),
        notDeleted(partnersTable),
      ))
      .where(and(
        eq(engagementsTable.conveningId, conveningId),
        notDeleted(engagementsTable),
      ))
      .orderBy(engagementsTable.status, partnersTable.institutionName),

    // Speakers — full speaker + engagement + consent data
    db.select({
      id:                      speakersTable.id,
      speakerProfile:          speakerEngagementsTable.speakerProfile,
      name:                    speakersTable.name,
      title:                   speakersTable.title,
      location:                speakersTable.location,
      email:                   speakersTable.email,
      phone:                   speakersTable.phone,
      gender:                  speakersTable.gender,
      expertise:               speakersTable.expertise,
      speakerCategory:         speakersTable.speakerCategory,
      affiliationType:         speakersTable.affiliationType,
      sessionType:             speakerEngagementsTable.sessionType,
      sessionTitle:            speakerEngagementsTable.sessionTitle,
      sessionTheme:            speakerEngagementsTable.sessionTheme,
      invitationStatus:        speakerEngagementsTable.invitationStatus,
      invitationResponse:      speakerEngagementsTable.invitationResponse,
      responsiblePerson:       speakerEngagementsTable.responsiblePerson,
      briefingDocsSent:        speakerEngagementsTable.briefingDocsSent,
      logisticsConfirmed:      speakerEngagementsTable.logisticsConfirmed,
      flightBookingRequired:   speakerEngagementsTable.flightBookingRequired,
      accommodationRequired:   speakerEngagementsTable.accommodationRequired,
      groundTransportRequired: speakerEngagementsTable.groundTransportRequired,
      honorariumAmount:        speakerEngagementsTable.honorariumAmount,
      honorariumPaid:          speakerEngagementsTable.honorariumPaid,
      thankYouSent:            speakerEngagementsTable.thankYouSent,
      consentStatus:           mediaConsentsTable.status,
    })
      .from(speakerEngagementsTable)
      .innerJoin(speakersTable, and(
        eq(speakerEngagementsTable.speakerId, speakersTable.id),
        notDeleted(speakersTable),
      ))
      .leftJoin(mediaConsentsTable, and(
        eq(mediaConsentsTable.speakerId, speakersTable.id),
        eq(mediaConsentsTable.conveningId, conveningId),
      ))
      .where(and(
        eq(speakerEngagementsTable.conveningId, conveningId),
        notDeleted(speakerEngagementsTable),
      ))
      .orderBy(speakerEngagementsTable.invitationStatus, speakersTable.name),

    // Agenda
    db.select({
      day:       agendaSessionsTable.day,
      startTime: agendaSessionsTable.startTime,
      endTime:   agendaSessionsTable.endTime,
      title:     agendaSessionsTable.title,
      theme:     agendaSessionsTable.theme,
      format:    agendaSessionsTable.format,
      status:    agendaSessionsTable.status,
      track:     agendaSessionsTable.track,
      description: agendaSessionsTable.description,
      speakers:  sql<string>`
        coalesce(
          (
            select string_agg(coalesce(se.speaker_profile->>'name', sp.name), ', ' order by ass."order")
            from agenda_session_speakers ass
            join speakers sp on sp.id = ass.speaker_id
            left join speaker_engagements se on se.speaker_id = sp.id
              and se.convening_id = ${conveningId} and se.deleted_at is null
            where ass.session_id = "agenda_sessions"."id"
          ),
          ''
        )
      `,
    })
      .from(agendaSessionsTable)
      .where(and(
        eq(agendaSessionsTable.conveningId, conveningId),
        notDeleted(agendaSessionsTable),
      ))
      .orderBy(agendaSessionsTable.day, agendaSessionsTable.startTime),

    // Workstreams (for task name lookup)
    db.select({ id: workstreamsTable.id, name: workstreamsTable.name })
      .from(workstreamsTable)
      .where(eq(workstreamsTable.conveningId, conveningId)),

    // Tasks — all fields
    db.select({
      workstreamId: tasksTable.workstreamId,
      title:        tasksTable.title,
      description:  tasksTable.description,
      status:       tasksTable.status,
      priority:     tasksTable.priority,
      assignee:     tasksTable.assignee,
      startDate:    tasksTable.startDate,
      dueDate:      tasksTable.dueDate,
      progressPct:  tasksTable.progressPct,
      isMilestone:  tasksTable.isMilestone,
    })
      .from(tasksTable)
      .where(eq(tasksTable.conveningId, conveningId))
      .orderBy(tasksTable.workstreamId, tasksTable.status),

    // Delegates — all fields
    db.select({
      name:                delegatesTable.name,
      jobTitle:            delegatesTable.jobTitle,
      organization:        delegatesTable.organization,
      country:             delegatesTable.country,
      segment:             delegatesTable.segment,
      gender:              delegatesTable.gender,
      ageBand:             delegatesTable.ageBand,
      passType:            delegatesTable.passType,
      status:              delegatesTable.status,
      email:               delegatesTable.email,
      aum:                 delegatesTable.aum,
      dietaryRequirements: delegatesTable.dietaryRequirements,
      accessNeeds:         delegatesTable.accessNeeds,
      notes:               delegatesTable.notes,
    })
      .from(delegatesTable)
      .where(and(
        eq(delegatesTable.conveningId, conveningId),
        notDeleted(delegatesTable),
      ))
      .orderBy(delegatesTable.status, delegatesTable.name),

    // Budget — all fields
    db.select({
      type:            budgetsTable.type,
      category:        budgetsTable.category,
      lineItemName:    budgetsTable.lineItemName,
      units:           budgetsTable.units,
      unitCost:        budgetsTable.unitCost,
      committedAmount: budgetsTable.committedAmount,
      actualAmount:    budgetsTable.actualAmount,
      notes:           budgetsTable.notes,
    })
      .from(budgetsTable)
      .where(eq(budgetsTable.conveningId, conveningId))
      .orderBy(budgetsTable.type, budgetsTable.category),

    // Commitments — ALL (no filter), all fields
    db.select({
      title:               commitmentsTable.title,
      description:         commitmentsTable.description,
      category:            commitmentsTable.category,
      ownerName:           commitmentsTable.ownerName,
      ownerOrg:            commitmentsTable.ownerOrg,
      source:              commitmentsTable.source,
      status:              commitmentsTable.status,
      dueDate:             commitmentsTable.dueDate,
      progressNote:        commitmentsTable.progressNote,
      inAideMemoire:       commitmentsTable.inAideMemoire,
      publishedToScorecard: commitmentsTable.publishedToScorecard,
      originEdition:       commitmentsTable.originEdition,
    })
      .from(commitmentsTable)
      .where(eq(commitmentsTable.conveningId, conveningId))
      .orderBy(commitmentsTable.category, commitmentsTable.status),

    // Deal projects — all fields
    db.select({
      name:               dealProjectsTable.name,
      side:               dealProjectsTable.side,
      sector:             dealProjectsTable.sector,
      stage:              dealProjectsTable.stage,
      projectStage:       dealProjectsTable.projectStage,
      ticketSizeMin:      dealProjectsTable.ticketSizeMin,
      ticketSizeMax:      dealProjectsTable.ticketSizeMax,
      currency:           dealProjectsTable.currency,
      bankabilityScore:   dealProjectsTable.bankabilityScore,
      contactPerson:      dealProjectsTable.contactPerson,
      contactEmail:       dealProjectsTable.contactEmail,
      originator:         dealProjectsTable.originator,
      description:        dealProjectsTable.description,
      registrationStatus: dealProjectsTable.registrationStatus,
      licensingStatus:    dealProjectsTable.licensingStatus,
    })
      .from(dealProjectsTable)
      .where(and(
        eq(dealProjectsTable.conveningId, conveningId),
        notDeleted(dealProjectsTable),
      ))
      .orderBy(dealProjectsTable.stage, dealProjectsTable.name),

    // Deal commitments (LOIs, MoUs, etc.)
    db.select({
      title:       dealCommitmentsTable.title,
      type:        dealCommitmentsTable.type,
      value:       dealCommitmentsTable.value,
      currency:    dealCommitmentsTable.currency,
      partiesText: dealCommitmentsTable.partiesText,
      signedAt:    dealCommitmentsTable.signedAt,
    })
      .from(dealCommitmentsTable)
      .where(and(
        eq(dealCommitmentsTable.conveningId, conveningId),
        notDeleted(dealCommitmentsTable),
      ))
      .orderBy(dealCommitmentsTable.type),

    // Exhibitors — all fields
    db.select({
      company:        exhibitorsTable.company,
      sector:         exhibitorsTable.sector,
      boothCode:      boothsTable.code,
      boothZone:      boothsTable.zone,
      boothTier:      boothsTable.tier,
      contactPerson:  exhibitorsTable.contactPerson,
      contactEmail:   exhibitorsTable.contactEmail,
      contactPhone:   exhibitorsTable.contactPhone,
      url:            exhibitorsTable.url,
      feeAmount:      exhibitorsTable.feeAmount,
      contractStatus: exhibitorsTable.contractStatus,
      description:    exhibitorsTable.description,
    })
      .from(exhibitorsTable)
      .leftJoin(boothsTable, and(
        eq(boothsTable.exhibitorId, exhibitorsTable.id),
        isNull(boothsTable.deletedAt),
      ))
      .where(and(
        eq(exhibitorsTable.conveningId, conveningId),
        notDeleted(exhibitorsTable),
      ))
      .orderBy(exhibitorsTable.contractStatus, exhibitorsTable.company),
  ]);

  const workstreamById = new Map(workstreams.map((w) => [w.id, w.name]));
  // A non-null snapshot owns all profile fields, including explicit nulls.
  // The shared directory is only the fallback for pre-snapshot engagements.
  const projectedPartners = partners.map((r) => ({ ...r, ...r.partnerProfile, id: r.id }));
  const projectedSpeakers = speakers.map((r) => ({ ...r, ...r.speakerProfile, id: r.id }));

  return [
    {
      title: "Partners",
      values: buildRows<typeof partners[0]>([
        { header: "Institution",          get: (r) => r.institutionName         },
        { header: "Type",                 get: (r) => r.partnerType             },
        { header: "Sector",               get: (r) => r.sector                  },
        { header: "Industry",             get: (r) => r.industry                },
        { header: "Location",             get: (r) => r.location                },
        { header: "Logo URL",             get: (r) => r.logoUrl                 },
        { header: "Description",          get: (r) => r.description             },
        { header: "Additional Contacts",  get: (r) => {
          const raw = r.principals as Array<{ name?: string; title?: string; email?: string; phone?: string; linkedin?: string }> | null;
          if (!raw || !Array.isArray(raw) || raw.length === 0) return "";
          return raw.map((p) => [p.name, p.title, p.email, p.phone, p.linkedin].filter(Boolean).join(" · ")).join(" | ");
        }},
        { header: "Why this partner?",    get: (r) => r.fitWithThem             },
        { header: "Historical notes",     get: (r) => r.historicalNotes         },
        { header: "Contact Name",         get: (r) => r.contactName             },
        { header: "Contact Title",        get: (r) => r.contactTitle            },
        { header: "Contact Email",        get: (r) => r.contactEmail            },
        { header: "Contact Phone",        get: (r) => r.contactPhone            },
        { header: "Stage",                get: (r) => r.status                  },
        { header: "Nature of Response",   get: (r) => r.natureOfResponse        },
        { header: "Commitment Type",      get: (r) => r.commitmentType          },
        { header: "Commitment Details",   get: (r) => r.commitmentDetails       },
        { header: "Package Name",         get: (r) => r.packageName             },
        { header: "Package Type",         get: (r) => r.packageType             },
        { header: "Package Benefits",     get: (r) => r.packageBenefits         },
        { header: "Financial Amount",     get: (r) => r.financialAmount         },
        { header: "Currency",             get: (r) => r.currency                },
        { header: "Payment Status",       get: (r) => r.paymentStatus           },
        { header: "Invoice Sent",         get: (r) => bool(r.invoiceSent)       },
        { header: "Invoice Paid",         get: (r) => bool(r.invoicePaid)       },
        { header: "Payment Due Date",     get: (r) => r.paymentDueDate          },
        { header: "Final Tier",           get: (r) => r.finalTier               },
        { header: "Delegate Passes",      get: (r) => r.delegatePassesAllocated },
        { header: "Branding Assets",      get: (r) => bool(r.brandingAssetsReceived) },
        { header: "Responsible Person",   get: (r) => r.responsiblePerson       },
        { header: "Follow Up Required",   get: (r) => bool(r.followUpRequired)  },
        { header: "Follow Up Date",       get: (r) => r.followUpDate            },
        { header: "Follow Up Action",     get: (r) => r.followUpAction          },
      ], projectedPartners),
    },
    {
      title: "Speakers",
      values: buildRows<typeof speakers[0]>([
        { header: "Name",                   get: (r) => r.name                    },
        { header: "Title / Role",           get: (r) => r.title                   },
        { header: "Location",               get: (r) => r.location                },
        { header: "Email",                  get: (r) => r.email                   },
        { header: "Phone",                  get: (r) => r.phone                   },
        { header: "Gender",                 get: (r) => r.gender                  },
        { header: "Expertise",              get: (r) => r.expertise               },
        { header: "Category",               get: (r) => r.speakerCategory         },
        { header: "Affiliation Type",       get: (r) => r.affiliationType         },
        { header: "Session Type",           get: (r) => r.sessionType             },
        { header: "Session Title",          get: (r) => r.sessionTitle            },
        { header: "Session Theme",          get: (r) => r.sessionTheme            },
        { header: "Invitation Status",      get: (r) => r.invitationStatus        },
        { header: "Invitation Response",    get: (r) => r.invitationResponse      },
        { header: "Responsible Person",     get: (r) => r.responsiblePerson       },
        { header: "Briefing Docs Sent",     get: (r) => bool(r.briefingDocsSent)  },
        { header: "Logistics Confirmed",    get: (r) => bool(r.logisticsConfirmed) },
        { header: "Flight Required",        get: (r) => bool(r.flightBookingRequired) },
        { header: "Accommodation Required", get: (r) => bool(r.accommodationRequired) },
        { header: "Ground Transport",       get: (r) => bool(r.groundTransportRequired) },
        { header: "Honorarium Amount",      get: (r) => r.honorariumAmount        },
        { header: "Honorarium Paid",        get: (r) => bool(r.honorariumPaid)    },
        { header: "Thank You Sent",         get: (r) => bool(r.thankYouSent)      },
        { header: "Media Consent",          get: (r) => r.consentStatus ?? "NotRequested" },
      ], projectedSpeakers),
    },
    {
      title: "Agenda",
      values: buildRows<typeof sessions[0]>([
        { header: "Day",         get: (r) => r.day         },
        { header: "Start",       get: (r) => r.startTime   },
        { header: "End",         get: (r) => r.endTime     },
        { header: "Title",       get: (r) => r.title       },
        { header: "Theme",       get: (r) => r.theme       },
        { header: "Format",      get: (r) => r.format      },
        { header: "Status",      get: (r) => r.status      },
        { header: "Track",       get: (r) => r.track       },
        { header: "Speakers",    get: (r) => r.speakers    },
        { header: "Description", get: (r) => r.description },
      ], sessions),
    },
    {
      title: "Tasks",
      values: buildRows<{ workstream: string; title: string; description: string | null; status: string; priority: string | null; assignee: string | null; startDate: string | null; dueDate: string | null; progressPct: number; isMilestone: boolean }>([
        { header: "Workstream",  get: (r) => r.workstream             },
        { header: "Title",       get: (r) => r.title                  },
        { header: "Status",      get: (r) => r.status                 },
        { header: "Priority",    get: (r) => r.priority               },
        { header: "Assignee",    get: (r) => r.assignee               },
        { header: "Start Date",  get: (r) => r.startDate              },
        { header: "Due Date",    get: (r) => r.dueDate                },
        { header: "Progress %",  get: (r) => r.progressPct            },
        { header: "Milestone",   get: (r) => bool(r.isMilestone)      },
        { header: "Description", get: (r) => r.description            },
      ], tasks.map((t) => ({
        workstream:  workstreamById.get(t.workstreamId) ?? "",
        title:       t.title,
        description: t.description,
        status:      t.status,
        priority:    t.priority,
        assignee:    t.assignee,
        startDate:   t.startDate,
        dueDate:     t.dueDate,
        progressPct: t.progressPct,
        isMilestone: t.isMilestone,
      }))),
    },
    {
      title: "Delegates",
      values: buildRows<typeof delegates[0]>([
        { header: "Name",                 get: (r) => r.name                },
        { header: "Job Title",            get: (r) => r.jobTitle            },
        { header: "Organisation",         get: (r) => r.organization        },
        { header: "Country",              get: (r) => r.country             },
        { header: "Segment",              get: (r) => r.segment             },
        { header: "Gender",               get: (r) => r.gender              },
        { header: "Age Band",             get: (r) => r.ageBand             },
        { header: "Pass Type",            get: (r) => r.passType            },
        { header: "Status",               get: (r) => r.status              },
        { header: "Email",                get: (r) => r.email               },
        { header: "AUM",                  get: (r) => r.aum                 },
        { header: "Dietary Requirements", get: (r) => r.dietaryRequirements },
        { header: "Access Needs",         get: (r) => r.accessNeeds         },
        { header: "Notes",                get: (r) => r.notes               },
      ], delegates),
    },
    {
      title: "Budget",
      values: buildRows<typeof budgetRows[0] & { variance: string }>([
        { header: "Type",      get: (r) => r.type                    },
        { header: "Category",  get: (r) => r.category                },
        { header: "Line Item", get: (r) => r.lineItemName            },
        { header: "Units",     get: (r) => r.units                   },
        { header: "Unit Cost", get: (r) => r.unitCost                },
        { header: "Committed", get: (r) => r.committedAmount         },
        { header: "Actual",    get: (r) => r.actualAmount            },
        { header: "Variance",  get: (r) => r.variance                },
        { header: "Notes",     get: (r) => r.notes                   },
      ], budgetRows.map((b) => ({
        ...b,
        variance: String(
          parseFloat(b.committedAmount ?? "0") - parseFloat(b.actualAmount ?? "0"),
        ),
      }))),
    },
    {
      title: "Commitments",
      values: buildRows<typeof commitmentRows[0]>([
        { header: "Title",             get: (r) => r.title                },
        { header: "Description",       get: (r) => r.description          },
        { header: "Category",          get: (r) => r.category             },
        { header: "Owner Name",        get: (r) => r.ownerName            },
        { header: "Owner Org",         get: (r) => r.ownerOrg             },
        { header: "Source",            get: (r) => r.source               },
        { header: "Status",            get: (r) => r.status               },
        { header: "Due Date",          get: (r) => r.dueDate              },
        { header: "Progress Note",     get: (r) => r.progressNote         },
        { header: "In Aide Memoire",   get: (r) => bool(r.inAideMemoire)  },
        { header: "On Scorecard",      get: (r) => bool(r.publishedToScorecard) },
        { header: "Origin Edition",    get: (r) => r.originEdition        },
      ], commitmentRows),
    },
    {
      title: "Deal Room",
      values: buildRows<typeof dealProjects[0]>([
        { header: "Project",             get: (r) => r.name               },
        { header: "Side",                get: (r) => r.side               },
        { header: "Sector",              get: (r) => r.sector             },
        { header: "Deal Stage",          get: (r) => r.stage              },
        { header: "Project Stage",       get: (r) => r.projectStage       },
        { header: "Ticket Size Min",     get: (r) => r.ticketSizeMin      },
        { header: "Ticket Size Max",     get: (r) => r.ticketSizeMax      },
        { header: "Currency",            get: (r) => r.currency           },
        { header: "Bankability Score",   get: (r) => r.bankabilityScore   },
        { header: "Contact Person",      get: (r) => r.contactPerson      },
        { header: "Contact Email",       get: (r) => r.contactEmail       },
        { header: "Originator",          get: (r) => r.originator         },
        { header: "Registration Status", get: (r) => r.registrationStatus },
        { header: "Licensing Status",    get: (r) => r.licensingStatus    },
        { header: "Description",         get: (r) => r.description        },
      ], dealProjects),
    },
    {
      title: "Deal Commitments",
      values: buildRows<typeof dealCommitments[0]>([
        { header: "Title",       get: (r) => r.title       },
        { header: "Type",        get: (r) => r.type        },
        { header: "Value",       get: (r) => r.value       },
        { header: "Currency",    get: (r) => r.currency    },
        { header: "Parties",     get: (r) => r.partiesText },
        { header: "Signed Date", get: (r) => r.signedAt    },
      ], dealCommitments),
    },
    {
      title: "Exhibition",
      values: buildRows<typeof exhibitors[0]>([
        { header: "Company",         get: (r) => r.company        },
        { header: "Sector",          get: (r) => r.sector         },
        { header: "Booth",           get: (r) => r.boothCode      },
        { header: "Booth Zone",      get: (r) => r.boothZone      },
        { header: "Booth Tier",      get: (r) => r.boothTier      },
        { header: "Contact Person",  get: (r) => r.contactPerson  },
        { header: "Contact Email",   get: (r) => r.contactEmail   },
        { header: "Contact Phone",   get: (r) => r.contactPhone   },
        { header: "Website",         get: (r) => r.url            },
        { header: "Fee Amount",      get: (r) => r.feeAmount      },
        { header: "Contract Status", get: (r) => r.contractStatus },
        { header: "Description",     get: (r) => r.description    },
      ], exhibitors),
    },
  ];
}

// ── Export-data helper (browser-side sync) ────────────────────────────────────

/** Returns all tab data as structured JSON for the browser to POST to Apps Script. */
export async function buildExportData(conveningId: string): Promise<{
  conveningId: string;
  conveningName: string;
  tabs: { sheet: string; values: string[][] }[];
  editors: string[];
  tabCount: number;
}> {
  const [convening] = await db
    .select({ name: conveningsTable.name })
    .from(conveningsTable)
    .where(eq(conveningsTable.id, conveningId));

  const [tabs, users] = await Promise.all([
    buildTabs(conveningId),
    db.select({ email: portalUsersTable.email }).from(portalUsersTable),
  ]);

  const editors = [
    ...new Set([
      "info@themkutano.com",
      ...users
        .map((u) => u.email)
        .filter((e): e is string => e != null && e.endsWith("@themkutano.com")),
    ]),
  ];

  return {
    conveningId,
    conveningName: convening?.name ?? "Convening",
    tabs: tabs.map((t) => ({ sheet: t.title, values: t.values })),
    editors,
    tabCount: tabs.length,
  };
}

/** Records the result of a browser-side Apps Script sync back to the DB. */
export async function recordSheetSync(
  conveningId: string,
  actorUserId: string,
  spreadsheetId: string,
  spreadsheetUrl: string,
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; sheetsLastSyncedAt: string }> {
  const [convening] = await db
    .select({ name: conveningsTable.name })
    .from(conveningsTable)
    .where(eq(conveningsTable.id, conveningId));
  if (!convening) throw new Error(`Convening ${conveningId} not found`);

  const now = new Date();
  await db
    .update(conveningsTable)
    .set({ googleSheetId: spreadsheetId, sheetsLastSyncedAt: now })
    .where(eq(conveningsTable.id, conveningId));

  logger.info({ conveningId, spreadsheetId, actorUserId }, "Google Sheets sync recorded (browser-side)");
  void writeAudit({
    conveningId,
    actorUserId,
    action: "Export",
    entityType: "GoogleSheet",
    entityId: spreadsheetId,
    summary: `Synced Google Sheet for ${convening.name}`,
  });

  return { spreadsheetId, spreadsheetUrl, sheetsLastSyncedAt: now.toISOString() };
}

// ── Main sync function (server-side, kept for reference) ──────────────────────

export async function syncConveningToSheets(
  conveningId: string,
  actorUserId: string,
): Promise<SheetsSyncResult> {
  const [convening] = await db
    .select()
    .from(conveningsTable)
    .where(eq(conveningsTable.id, conveningId));

  if (!convening) throw new Error(`Convening ${conveningId} not found`);

  const tabs = await buildTabs(conveningId);

  const scriptResponse = await appsScriptPost({
    tabs: tabs.map((t) => ({ sheet: t.title, values: t.values })),
  });

  // Guard against silent partial writes — if Apps Script reports fewer written
  // tabs than expected the token may have expired mid-run; abort before touching
  // the DB so sheetsLastSyncedAt is never marked stale-as-fresh.
  if (
    typeof scriptResponse.written === "number" &&
    scriptResponse.written < tabs.length
  ) {
    throw new Error(
      `Partial sync: Apps Script wrote ${scriptResponse.written} of ${tabs.length} tabs. ` +
      `The Google connector token may have expired. Re-authorise in Settings → Google Sheets sync and try again.`,
    );
  }

  const spreadsheetId = scriptResponse.spreadsheetId ?? convening.googleSheetId ?? "unknown";
  const spreadsheetUrl = scriptResponse.spreadsheetUrl
    ?? (spreadsheetId !== "unknown" ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : "");

  const now = new Date();
  await db
    .update(conveningsTable)
    .set({ googleSheetId: spreadsheetId, sheetsLastSyncedAt: now })
    .where(eq(conveningsTable.id, conveningId));

  logger.info({ conveningId, spreadsheetId, actorUserId }, "Google Sheets sync complete via Apps Script");

  void writeAudit({
    conveningId,
    actorUserId,
    action: "Export",
    entityType: "GoogleSheet",
    entityId: spreadsheetId,
    summary: `Synced Google Sheet for ${convening.name}`,
  });

  return {
    spreadsheetId,
    spreadsheetUrl,
    sheetsLastSyncedAt: now.toISOString(),
    tabCounts: tabs.map((t) => ({ title: t.title, rows: t.values.length - 1 })),
  };
}
