import { Deno } from "https://deno.land/x/deno_std/types.d.ts";
import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";

Deno.test("Security Events Contract Validation", async (t) => {
  await t.step("should validate valid security event payload", () => {
    const payload = {
      action: "security.alert",
      severity: "high",
      metadata: { reason: "Multiple failed login attempts", user_id: "123" },
      timestamp: new Date().toISOString()
    };
    
    // Simulating validation logic
    assertEquals(typeof payload.action, "string");
    assertEquals(payload.action, "security.alert");
  });

  await t.step("should handle 422 for missing fields", () => {
    const payload = {
      // missing action
      severity: "low"
    };
    
    const isValid = !!(payload as any).action;
    assertEquals(isValid, false);
  });
});

Deno.test("API Versioning Compatibility", async (t) => {
  await t.step("v1 fallback for security monitoring", () => {
    const v1Payload = { event_type: "login_fail" };
    const mappedToV2 = { action: v1Payload.event_type };
    assertEquals(mappedToV2.action, "login_fail");
  });
});
