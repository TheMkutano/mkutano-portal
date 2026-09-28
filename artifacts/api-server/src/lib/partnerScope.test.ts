import { strict as assert } from "node:assert";
import { test } from "node:test";
import { matchingInstitutions, scopedPartnerRows } from "./partnerScope";
import { isForeignKeyViolation, isUniqueViolation } from "./pgError";

test("event partner lists include only linked, active institutions for that event", () => {
  const partners = [
    { id: "shared", partnerType: "Institutional" },
    { id: "other", partnerType: "Media" },
    { id: "orphan", partnerType: "Institutional" },
  ];
  const links = [
    { partnerId: "shared", conveningId: "aaps", deletedAt: null },
    { partnerId: "other", conveningId: "economic", deletedAt: null },
    { partnerId: "shared", conveningId: "economic", deletedAt: new Date() },
    { partnerId: "missing", conveningId: "aaps", deletedAt: null },
  ];
  assert.deepEqual(scopedPartnerRows(partners, links, "aaps").map(p => p.id), ["shared"]);
  assert.deepEqual(scopedPartnerRows(partners, links, "economic").map(p => p.id), ["other"]);
  assert.deepEqual(scopedPartnerRows(partners, links, "aaps", "Media"), []);
});

test("linked projects read their own complete profile, including cleared contacts", () => {
  const canonical: { id: string; partnerType: string; institutionName: string; contactEmail: string | null }[] =
    [{ id: "shared", partnerType: "Institutional", institutionName: "Legacy", contactEmail: "old@example.org" }];
  const links = [
    { conveningId: "aaps", partnerId: "shared", deletedAt: null,
      partnerProfile: { ...canonical[0], institutionName: "AAPS", contactEmail: null } },
    { conveningId: "economic", partnerId: "shared", deletedAt: null },
  ];
  const aaps = scopedPartnerRows(canonical, links, "aaps")[0];
  const economic = scopedPartnerRows(canonical, links, "economic")[0];
  assert.equal(aaps.institutionName, "AAPS");
  assert.equal(aaps.contactEmail, null);
  assert.equal(economic.institutionName, "Legacy");
  assert.equal(economic.contactEmail, "old@example.org");
  assert.equal(canonical[0].institutionName, "Legacy");
});

test("existing directory names match case-insensitively without treating percent or underscore as wildcards", () => {
  const partners = [{ institutionName: "ABC_50%" }, { institutionName: "ABCx50y" }];
  assert.deepEqual(matchingInstitutions(partners, " abc_50% "), [partners[0]]);
});

test("Postgres constraint errors are recognized through Drizzle's cause wrapper", () => {
  assert.equal(isUniqueViolation({ cause: { code: "23505" } }), true);
  assert.equal(isForeignKeyViolation({ cause: { code: "23503" } }), true);
  assert.equal(isUniqueViolation({ code: "23503" }), false);
});