import { strict as assert } from "node:assert";
import { test } from "node:test";
import { projectProfile } from "./projectProfile";

test("speaker profile edits stay in their convening and preserve cleared values", () => {
  const speaker = { id: "shared", name: "Legacy", email: "legacy@example.org" as string | null };
  const aaps = projectProfile(speaker, { name: "AAPS name", email: null });
  const economic = projectProfile(speaker, null);
  assert.deepEqual(aaps, { id: "shared", name: "AAPS name", email: null });
  assert.deepEqual(economic, speaker);
  assert.equal(speaker.email, "legacy@example.org");
  assert.equal(projectProfile(speaker, { id: "foreign", name: "Alias" }).id, "shared");
});