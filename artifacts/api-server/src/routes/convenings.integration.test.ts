import { strict as assert } from "node:assert";
import { test } from "node:test";
import express from "express";
import { db, conveningsTable, portalUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import router from "./convenings";

// Opt-in integration test. Run against the development database only.
test("new projects persist, provision their team, and reject duplicate slugs without creating another row", {
  skip: process.env.RUN_CONVENING_CREATE_TESTS !== "1" || process.env.NODE_ENV === "production",
}, async () => {
  const [admin] = await db.select().from(portalUsersTable)
    .where(eq(portalUsersTable.role, "Admin")).limit(1);
  assert.ok(admin, "Development database needs an Admin account for the integration test");
  const slug = `qa-create-${crypto.randomUUID()}`;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.portalUser = { ...admin, conveningIds: [] };
    req.user = { id: admin.authUserId } as typeof req.user;
    next();
  });
  app.use(router);
  const server = app.listen(0);
  let createdId: string | undefined;
  try {
    if (!server.listening) await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve); server.once("error", reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const api = async (method: string, path: string, body?: object) => {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method, headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, data: response.status === 204 ? null : await response.json() as any };
    };
    const created = await api("POST", "/convenings", { name: "QA Create Project", slug });
    assert.equal(created.status, 201);
    createdId = created.data.id;
    assert.equal(created.data.slug, slug);
    const list = await api("GET", "/convenings");
    assert.equal(list.status, 200);
    assert.equal(list.data.filter((row: { slug: string }) => row.slug === slug).length, 1);
    const duplicate = await api("POST", "/convenings", { name: "QA Duplicate", slug });
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.data.error, /slug/i);
    const after = await api("GET", "/convenings");
    assert.equal(after.data.filter((row: { slug: string }) => row.slug === slug).length, 1);
  } finally {
    if (createdId) {
      const row = await db.select({ id: conveningsTable.id }).from(conveningsTable)
        .where(eq(conveningsTable.id, createdId));
      if (row.length) await db.delete(conveningsTable).where(eq(conveningsTable.id, createdId));
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});