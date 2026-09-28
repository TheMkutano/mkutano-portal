import { strict as assert } from "node:assert";
import { test } from "node:test";
// @ts-expect-error Node's built-in TypeScript test runner resolves .ts; server emits .js.
import { belongsToProject, objectPathPermitsProject, privateObjectReferencePermitsProject, resolveProjectId } from "./projectIsolation.ts";

test("project scope rejects missing, malformed and conflicting IDs", () => {
  assert.deepEqual(resolveProjectId(undefined, undefined), { status: 422, error: "conveningId is required" });
  assert.deepEqual(resolveProjectId(["a", "b"], undefined), { status: 422, error: "conveningId is required" });
  assert.deepEqual(resolveProjectId("aaps", "economic"), { status: 400, error: "Conflicting conveningId values across request" });
  assert.deepEqual(resolveProjectId("aaps", "aaps"), { id: "aaps" });
});

test("event writes never own global or another project's rows", () => {
  assert.equal(belongsToProject({ conveningId: "aaps" }, "aaps"), true);
  assert.equal(belongsToProject({ conveningId: "economic" }, "aaps"), false);
  assert.equal(belongsToProject({ conveningId: null }, "aaps"), false);
  assert.equal(belongsToProject(undefined, "aaps"), false);
});

test("new private objects are bound to their project; legacy paths require separate reference lookup", () => {
  const id = "a1d0dc82-284f-47cf-aa53-36b5c21868c1";
  const object = `convenings/aaps/uploads/${id}`;
  assert.equal(objectPathPermitsProject(object, "aaps"), true);
  assert.equal(objectPathPermitsProject(object, "economic"), false);
  assert.equal(objectPathPermitsProject(`convenings/aaps/other/${id}`, "aaps"), false);
  assert.equal(objectPathPermitsProject(`convenings/aaps/uploads/../../${id}`, "aaps"), false);
  assert.equal(objectPathPermitsProject(`uploads/${id}`, "aaps"), true);
  assert.equal(privateObjectReferencePermitsProject(`/objects/convenings/economic/uploads/${id}`, "aaps"), false);
  assert.equal(privateObjectReferencePermitsProject(`/api/storage/objects/convenings/aaps/uploads/${id}`, "aaps"), true);
});