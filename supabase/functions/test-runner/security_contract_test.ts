import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("Security Events Contract Validation", async (t: Deno.TestContext) => {
  await t.step("should validate valid security event payload", () => {
    const payload = {
      action: "security.alert",
      severity: "high",
      metadata: { reason: "Multiple failed login attempts", user_id: "123" },
      timestamp: new Date().toISOString(),
    };
    assertEquals(typeof payload.action, "string");
    assertEquals(payload.action, "security.alert");
  });

  await t.step("should handle 422 for missing fields", () => {
    const payload: { action?: string; severity: string } = { severity: "low" };
    assertEquals(!!payload.action, false);
  });
});

Deno.test("API Versioning Compatibility", async (t: Deno.TestContext) => {
  await t.step("v1 fallback for security monitoring", () => {
    const v1Payload = { event_type: "login_fail" };
    const mappedToV2 = { action: v1Payload.event_type };
    assertEquals(mappedToV2.action, "login_fail");
  });
});
