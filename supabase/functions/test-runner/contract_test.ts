import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { _z } from "https://esm.sh/zod@3.23.8";
import { WebhookReceiverContracts, WhatsAppWebhookContracts, ErrorResponseContract } from "../_shared/contracts.ts";
import { parseBody } from "../_shared/validation.ts";

Deno.test("WebhookReceiver Contract - v1 valid payload", async () => {
  const payload = {
    event_type: "test.event",
    payload: { key: "value" },
    timestamp: new Date().toISOString()
  };
  
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-version": "v1" },
    body: JSON.stringify(payload)
  });
  
  const result = await parseBody(req, WebhookReceiverContracts);
  assertEquals(result.error, null);
  assertEquals(result.version, "v1");
  if (result.data) {
    assertEquals(result.data.event_type, "test.event");
  } else {
    throw new Error("Data should not be null");
  }
});

Deno.test("WebhookReceiver Contract - v2 missing source (invalid)", async () => {
  const payload = {
    event_type: "test.event",
    payload: { key: "value" },
    timestamp: new Date().toISOString()
    // missing 'source'
  };
  
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-version": "v2" },
    body: JSON.stringify(payload)
  });
  
  const result = await parseBody(req, WebhookReceiverContracts);
  assertEquals(result.data, null);
  assertEquals(result.version, "v2");
  if (result.error) {
    assertEquals(result.error.status, 422);
    const errorBody = await result.error.json();
    const validation = ErrorResponseContract.safeParse(errorBody);
    assertEquals(validation.success, true);
    assertEquals(errorBody.code, "VALIDATION_ERROR");
  } else {
    throw new Error("Error should not be null");
  }
});

Deno.test("WhatsApp Webhook Contract - v2 valid meta payload", async () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "entry_id",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "123456789",
            phone_number_id: "phone_id"
          },
          messages: [{ id: "msg_id", from: "sender", text: { body: "hello" } }]
        },
        field: "messages"
      }]
    }]
  };
  
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-version": "v2" },
    body: JSON.stringify(payload)
  });
  
  const result = await parseBody(req, WhatsAppWebhookContracts);
  assertEquals(result.error, null);
  assertEquals(result.version, "v2");
});

Deno.test("Validation Error Format - 422 fields validation", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-version": "v1" },
    body: JSON.stringify({ event_type: "" }) // Invalid: min(1)
  });
  
  const result = await parseBody(req, WebhookReceiverContracts);
  if (result.error) {
    assertEquals(result.error.status, 422);
    const errorBody = await result.error.json();
    assertEquals(errorBody.fields[0].field, "event_type");
    assertEquals(typeof errorBody.fields[0].message, "string");
  } else {
    throw new Error("Error should not be null");
  }
});
