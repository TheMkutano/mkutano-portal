import { strict as assert } from "node:assert";
import { test } from "node:test";
import express from "express";
import { db, conveningsTable, speakersTable, speakerEngagementsTable, mediaConsentsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import router from "./consents";

// Opt-in: only QA-owned records are created and cleaned up in the development DB.
test("consents require a project and cannot read or alter another project's speaker", {
  skip: process.env.RUN_CONSENT_ISOLATION_TESTS !== "1" || process.env.NODE_ENV === "production",
}, async () => {
  const suffix = crypto.randomUUID();
  const [a, b] = await db.insert(conveningsTable).values([
    { name: `QA Consent A ${suffix}`, slug: `qa-consent-a-${suffix}` },
    { name: `QA Consent B ${suffix}`, slug: `qa-consent-b-${suffix}` },
  ]).returning();
  const speakers = await db.insert(speakersTable).values([
    { name: `QA Shared Speaker ${suffix}` },
    { name: `QA B Speaker ${suffix}` },
  ]).returning();
  const [shared, onlyB] = speakers;
  await db.insert(speakerEngagementsTable).values([
    { speakerId: shared.id, conveningId: a.id },
    { speakerId: shared.id, conveningId: b.id },
    { speakerId: onlyB.id, conveningId: b.id },
  ]);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    const id = req.header("x-qa-event") === "B" ? b.id : a.id;
    req.portalUser = { role: "SpeakerLead", accountType: "External", conveningIds: [id] } as NonNullable<typeof req.portalUser>;
    next();
  });
  app.use(router);
  const server = app.listen(0);
  try {
    if (!server.listening) await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve); server.once("error", reject);
    });
    const addr = server.address();
    assert.ok(addr && typeof addr !== "string");
    const api = async (path: string, event: "A" | "B", method = "GET", body?: object) => {
      const response = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
        method, headers: { "x-qa-event": event, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, data: response.status === 204 ? null : await response.json() as any };
    };
    assert.equal((await api("/consents", "A")).status, 422);
    assert.equal((await api(`/consents?conveningId=${b.id}`, "A")).status, 403);
    assert.equal((await api("/consents", "A", "POST", { conveningId: a.id, speakerId: onlyB.id })).status, 422);
    const aConsent = await api("/consents", "A", "POST",
      { conveningId: a.id, speakerId: shared.id, status: "Pending" });
    assert.equal(aConsent.status, 201);
    const bConsent = await api("/consents", "B", "POST",
      { conveningId: b.id, speakerId: shared.id, status: "Pending" });
    assert.equal(bConsent.status, 201);
    assert.deepEqual((await api(`/consents?conveningId=${a.id}`, "A")).data.map((c: { id: string }) => c.id), [aConsent.data.id]);
    assert.equal((await api(`/consents/${bConsent.data.id}?conveningId=${a.id}`, "A", "PATCH",
      { status: "Granted" })).status, 404);
    assert.equal((await api(`/consents/${aConsent.data.id}`, "A", "PATCH", { status: "Granted" })).status, 422);
    assert.equal((await api(`/consents/${aConsent.data.id}?conveningId=${a.id}`, "A", "PATCH",
      { conveningId: b.id, status: "Granted" })).status, 400);
    assert.equal((await api(`/consents/${aConsent.data.id}?conveningId=${a.id}`, "A", "PATCH",
      { status: "Granted" })).status, 200);
    assert.equal((await api(`/consents?conveningId=${b.id}`, "B")).data[0].status, "Pending");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await db.delete(mediaConsentsTable).where(inArray(mediaConsentsTable.conveningId, [a.id, b.id]));
    await db.delete(speakerEngagementsTable).where(inArray(speakerEngagementsTable.speakerId, speakers.map(s => s.id)));
    await db.delete(speakersTable).where(inArray(speakersTable.id, speakers.map(s => s.id)));
    await db.delete(conveningsTable).where(inArray(conveningsTable.id, [a.id, b.id]));
  }
});