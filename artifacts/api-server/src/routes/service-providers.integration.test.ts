import { strict as assert } from "node:assert";
import { test } from "node:test";
import express from "express";
import { db, conveningsTable, providerBookingsTable, serviceProvidersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import router from "./service-providers";

// Opt-in development integration test: requires the development DB schema to be applied.
// No QA records are created merely by importing this file.
test("provider and booking CRUD cannot cross events or mutate the legacy directory", {
  skip: process.env.RUN_PROVIDER_ISOLATION_TESTS !== "1" || process.env.NODE_ENV === "production",
}, async () => {
  const suffix = crypto.randomUUID();
  const [a, b] = await db.insert(conveningsTable).values([
    { name: `QA Provider A ${suffix}`, slug: `qa-provider-a-${suffix}` },
    { name: `QA Provider B ${suffix}`, slug: `qa-provider-b-${suffix}` },
  ]).returning();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    // External QA user may access only the event selected in this request.
    const eventId = req.header("x-qa-event") === "B" ? b.id : a.id;
    req.portalUser = { role: "Ops", accountType: "External", conveningIds: [eventId] } as NonNullable<typeof req.portalUser>;
    next();
  });
  app.use(router);
  const server = app.listen(0);
  try {
    if (!server.listening) await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const api = async (path: string, event: "A" | "B", method = "GET", body?: object) => {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method, headers: { "x-qa-event": event, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data: any = response.status === 204 ? null : await response.json();
      return { status: response.status, data };
    };
    const [legacy] = await db.insert(serviceProvidersTable)
      .values({ company: `QA shared ${suffix}`, category: "Other" }).returning();
    await db.insert(providerBookingsTable).values({ conveningId: a.id, serviceProviderId: legacy.id });
    const legacyList = await api(`/service-providers?conveningId=${a.id}`, "A");
    assert.equal(legacyList.status, 200);
    assert.equal(legacyList.data.some((p: { id: string }) => p.id === legacy.id), true);
    assert.equal((await api(`/service-providers?conveningId=${b.id}`, "B")).data.length, 0);

    const created = await api("/service-providers", "A", "POST",
      { conveningId: a.id, company: `QA private ${suffix}`, category: "Other", contactEmail: "a@example.test" });
    assert.equal(created.status, 201);
    const providerId = created.data.id as string;
    assert.equal((await api(`/service-providers?conveningId=${b.id}`, "B")).data.length, 0);
    assert.equal((await api(`/service-providers/${providerId}?conveningId=${b.id}`, "B")).status, 404);
    assert.equal((await api(`/service-providers/${providerId}?conveningId=${b.id}`, "B", "PUT",
      { conveningId: b.id, company: "QA stolen", category: "Other" })).status, 404);
    assert.equal((await api(`/service-providers/${providerId}?conveningId=${b.id}`, "B", "DELETE")).status, 404);
    assert.equal((await api("/provider-bookings", "B", "POST",
      { conveningId: b.id, serviceProviderId: providerId })).status, 404);
    assert.equal((await api("/provider-bookings", "A", "POST",
      { conveningId: a.id, serviceProviderId: legacy.id })).status, 404);
    assert.equal((await api(`/service-providers/${legacy.id}?conveningId=${a.id}`, "A", "PUT",
      { conveningId: a.id, company: "QA shared edited", category: "Other" })).status, 404);
    assert.equal((await api(`/service-providers/${legacy.id}?conveningId=${a.id}`, "A", "DELETE")).status, 404);

    const booking = await api("/provider-bookings", "A", "POST",
      { conveningId: a.id, serviceProviderId: providerId, procurementStatus: "Identified" });
    assert.equal(booking.status, 201);
    const bookingId = booking.data.id as string;
    assert.equal((await api(`/provider-bookings?conveningId=${b.id}`, "B")).data.length, 0);
    assert.equal((await api(`/provider-bookings/${bookingId}?conveningId=${b.id}`, "B", "PUT",
      { conveningId: b.id, procurementStatus: "Paid" })).status, 404);
    assert.equal((await api(`/provider-bookings/${bookingId}?conveningId=${b.id}`, "B", "DELETE")).status, 404);
    assert.equal((await api(`/provider-bookings/${bookingId}?conveningId=${a.id}`, "A", "PUT",
      { conveningId: a.id, serviceProviderId: legacy.id })).status, 400);
    assert.equal((await api(`/provider-bookings/${bookingId}?conveningId=${a.id}`, "A", "PUT",
      { conveningId: b.id })).status, 400);
    assert.equal((await api(`/service-providers/${providerId}?conveningId=${a.id}`, "A", "PUT",
      { conveningId: a.id, company: `QA private updated ${suffix}`, category: "Other" })).status, 200);
    assert.equal((await api(`/provider-bookings/${bookingId}?conveningId=${a.id}`, "A", "DELETE")).status, 204);
    assert.equal((await api(`/service-providers/${providerId}?conveningId=${a.id}`, "A", "DELETE")).status, 204);
    const [globalAfter] = await db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.id, legacy.id));
    assert.equal(globalAfter.company, `QA shared ${suffix}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    const providers = await db.select({ id: serviceProvidersTable.id }).from(serviceProvidersTable)
      .where(inArray(serviceProvidersTable.conveningId, [a.id, b.id]));
    if (providers.length) {
      await db.delete(providerBookingsTable)
        .where(inArray(providerBookingsTable.serviceProviderId, providers.map(p => p.id)));
      await db.delete(serviceProvidersTable).where(inArray(serviceProvidersTable.id, providers.map(p => p.id)));
    }
    const [legacy] = await db.select({ id: serviceProvidersTable.id }).from(serviceProvidersTable)
      .where(eq(serviceProvidersTable.company, `QA shared ${suffix}`));
    if (legacy) {
      await db.delete(providerBookingsTable).where(eq(providerBookingsTable.serviceProviderId, legacy.id));
      await db.delete(serviceProvidersTable).where(eq(serviceProvidersTable.id, legacy.id));
    }
    await db.delete(conveningsTable).where(inArray(conveningsTable.id, [a.id, b.id]));
  }
});