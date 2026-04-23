WORKFLOW_CORRECTIONS_SPEC

Overview
- Purpose: Implement fixes to LEGADO_Wizard payment flow so payments in Stripe reliably activate the portal and all Stripe data + session tracking are captured.
- Key changes: sessionId generation & propagation; PaymentIntent metadata; separate Stripe webhook flow with signature verification; post-payment confirmation triggers InvoiceNinja operations; retries, idempotency and cleanup.

Node-by-node changes (before -> after)

1) Webhook: "Legado Webhook" (existing)
- Before: accepts user input, creates PaymentIntent but returns client_secret and ends.
- After: unchanged endpoint path (/webhook/legado-wizard2). Add validation, pass full payload to next nodes. Ensure Response node returns client_secret but does not assume payment success.

2) Function: "Generate sessionId" (new/modify)
- Purpose: create unique session ID and attach to item.json for entire flow.
- Implementation (n8n Function node JS):

// generate session id
const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2,9);
items[0].json.sessionId = sessionId;
return items;

- Propagate sessionId to Stripe metadata and to databases.

3) Stripe: "Create PaymentIntent" (modify)
- Ensure metadata includes: sessionId, plan, paymentType, customerEmail
- Example metadata object:
metadata: {
  sessionId: {{$json["sessionId"]}},
  plan: {{$json["plan"]}},
  paymentType: {{$json["paymentType"] || 'card' }},
  customerEmail: {{$json["email"]}}
}
- Set idempotency_key using sessionId to prevent duplicate charges if retried.

4) Respond to client: "Respond Show Payment" (existing)
- Before: returned client_secret and then branch ended.
- After: return client_secret to client as before but make clear that subsequent confirmation comes via Stripe webhook. Include sessionId in response payload so client can display or store it.
Response body example: { client_secret: <..>, sessionId: <..>, next: 'waiting_for_confirmation' }

5) New Webhook: "Stripe Webhook" (new)
- Path: /webhook/stripe-webhook-legado
- Receives Stripe events (payment_intent.succeeded, payment_intent.payment_failed, charge.failed)
- IMPORTANT: Verify with stripe.webhooks.constructEvent using the Stripe webhook secret and the raw request body + X-Stripe-Signature header. Configure the node to expose raw body and headers.
- If verification fails: return 400 and log. If success: continue.

6) Function: "Parse & Normalize Stripe Event" (new)
- Extract event type, paymentIntent id, metadata.sessionId, amount, currency, customer email.
- Save raw event to logging storage (DB or logging service) for audit.

7) Switch: "Route by Stripe Event" (new)
- Routes: payment_intent.succeeded -> confirm branch; payment_intent.payment_failed -> fail branch; default -> log & ack

8) HTTP Request / InvoiceNinja: "Create Client/Invoice" (new)
- Triggered only on payment_intent.succeeded
- Idempotency: use sessionId as external_id or reference so repeated webhook deliveries don't create duplicates
- Steps:
  - GET/POST client on InvoiceNinja by customer email (create if not exists)
  - Create invoice linked to client with lines, store referencia sessionId
  - If Invoice creation fails, retry up to 3 times with exponential backoff; if still fails, put message in retry queue or mark for manual review and notify ops

9) Update internal DB/records: "Mark session active" (new)
- POST update to internal API or DB: set sessionId status=active, attach stripe_payment_intent_id and invoice_id. This is how client portal access is enabled.

10) Cleanup & Failed payments: "Handle failed payment" (new)
- If payment fails: mark sessionId status=failed, send email to customer, delete partial temp records (if any) after retention period, and provide manual retry URL

11) Monitoring/Retry: "Webhook Dead-letter & Retry" (new)
- Failed post-payment tasks should be moved to DLQ and retried by scheduled workflow. Include audit fields: attempts, last_error, next_attempt.

Security & Stripe settings
- Configure Stripe webhook endpoint in Dashboard to point to /webhook/stripe-webhook-legado and set the signing secret in n8n credentials (do not hard-code). Use X-Stripe-Signature verification.
- Ensure PaymentIntent creation uses an idempotency key (sessionId)
- Always log raw Stripe payloads with at least 7 days retention for debugging.

Testing & Validation
- Use payloads_config.json (test payloads) to simulate payment_intent.succeeded and ensure invoice and session activation occur.
- Test duplicate delivery by sending same event twice and validate idempotency (only one invoice created, session only activated once).

Migration steps (UI / n8n)
1. Create new nodes in n8n: Function (Generate sessionId), modify Stripe PaymentIntent node to include metadata, add new Stripe Webhook flow nodes.
2. Configure credentials: Stripe secret key, Stripe webhook signing secret, InvoiceNinja API credentials, internal API credentials.
3. Export new workflow JSON and import to staging n8n. Run tests.
4. After passing tests, deploy to production and update Stripe Dashboard webhook URL to new endpoint.

Appendix: Sample snippets

- sessionId generator (Function node):
const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2,9);
items[0].json.sessionId = sessionId;
return items;

- Stripe webhook verification (Function node, requires stripe package available in n8n environment):
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const sig = $json['headers']['x-stripe-signature'];
try {
  const event = stripe.webhooks.constructEvent($json['rawBody'], sig, process.env.STRIPE_WEBHOOK_SECRET);
  items[0].json.event = event;
  return items;
} catch (err) {
  throw new Error('Stripe webhook verification failed: ' + err.message);
}

- PaymentIntent metadata payload (HTTP node / Stripe node):
{
  amount: {{$json["amount"]}},
  currency: 'eur',
  metadata: {
    sessionId: {{$json["sessionId"]}},
    plan: {{$json["plan"]}},
    paymentType: 'card',
    customerEmail: {{$json["email"]}}
  }
}


End of spec
