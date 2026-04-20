# n8n Stripe Checkout Workflow (template)

This file describes a ready-to-implement n8n workflow that accepts the frontend wizard payload, validates it, branches by payment method, and creates a Stripe Checkout session (returning checkoutUrl) or returns manual-instructions for non-card flows.

Use this as a recipe to implement in your n8n instance. Replace placeholder values (price lookup, currency, success/cancel URLs, and credentials) with your real data.

Overview
- Trigger: Webhook (POST)
- Node: Function / Set — validate payload and compute amount
- Node: Switch — branch by paymentMethod (card vs other)
- Node (card branch): Stripe -> Create Checkout Session
- Node (card branch): Respond to Webhook — return { success:true, checkoutUrl }
- Node (manual branch): Respond to Webhook — return { success:true, instructions }

Prerequisites
- Add a Stripe account credential to n8n (Stripe API Key). In n8n: Credentials -> New -> Stripe
- Configure two environment variables or hard-coded values in the Function node (prefer env):
  - SUCCESS_URL: https://your-site.example/checkout/success
  - CANCEL_URL: https://your-site.example/checkout/cancel
  - STRIPE_PRICE_ID or amount/currency mapping for plans

Payload expected (POST JSON)

{
  "paymentMethod": "card",            // or 'zelle', 'bank', etc.
  "plan": "esencial-zulia",
  "paymentType": "annual",           // monthly/annual
  "buyer": { ... },                    // name, email, cedula, phone, etc.
  "family": [],                        // optional
  "timestamp": "2026-04-20T00:00:00Z",
  "source": "wizard"
}

Step-by-step nodes

1) Webhook (Trigger)
- Resource: Webhook
- HTTP Method: POST
- Path: legado-wizard (or whatever your public webhook path is)
- Response Mode: "On Received" (we will respond from downstream Respond node)

2) Function (Validate & map)
- Purpose: ensure required fields exist, map plan -> priceId or amount, compute metadata.
- Example JavaScript (paste into the Function node):

// Input: items[0].json is the incoming payload
const payload = items[0].json || {};
if (!payload.paymentMethod || !payload.plan || !payload.buyer || !payload.buyer.email) {
  throw new Error('Missing required fields: paymentMethod, plan, buyer.email');
}

// Example price mapping - replace with your real price IDs or amount calculation
const PRICE_MAP = {
  "esencial-zulia_monthly": "price_abc123_month",
  "esencial-zulia_annual": "price_abc123_annual",
};

const key = `${payload.plan}_${payload.paymentType}`;
const priceId = PRICE_MAP[key] || null;

return [{
  json: {
    payload,
    priceId,
    metadata: {
      plan: payload.plan,
      paymentType: payload.paymentType,
      source: payload.source || 'wizard'
    }
  }
}];

Notes:
- If you prefer to compute amount + currency instead of a Stripe Price ID, return amount and currency (in cents) for the HTTP Request approach.

3) Switch (paymentMethod)
- Field: expression like {{$json["payload"]["paymentMethod"]}}
- Cases:
  - card -> route to Create Checkout Session
  - default -> route to Manual Instructions node

4) Stripe (Create Checkout Session)
- Node: Stripe (n8n built-in)
- Operation: Create
- Resource: Checkout Session
- Parameters (example):
  - Mode: subscription (or payment)
  - Line Items: Use Price IDs (from Function output) or set price_data/amount
  - Success URL: {{$env.SUCCESS_URL || 'https://your-site.example/checkout/success'}}
  - Cancel URL: {{$env.CANCEL_URL || 'https://your-site.example/checkout/cancel'}}
  - Customer Email: {{$json["payload"]["buyer"]["email"]}}
  - Metadata: pass plan, cedula, phone, etc. (from payload.metadata)

If you need one-off payments (not subscriptions), set Mode to payment and provide amount/currency instead.

5) Respond To Webhook (card branch)
- Return JSON body with the checkout URL so the frontend can open it.
- Example Response JSON (set in the node):

{
  "success": true,
  "checkoutUrl": "={{ $node['Stripe'].json['url'] }}"
}

6) Respond To Webhook (manual branch)
- For non-card flows (Zelle, bank transfer), return success + instructions.
- Example Response JSON:

{
  "success": true,
  "instructions": "Para pagar por Zelle: enviar a correo x@banco.com con referencia XYZ. Una vez hecho, responde con 'He pagado' para continuar."
}

Error Handling
- If validation fails, respond with HTTP 400 and JSON { success:false, error: "message" }.
- Use a Catch node (Error Trigger) to capture exceptions and return HTTP 500 with the error message.

CORS
- n8n's Webhook response can include headers. Ensure your Respond node includes:

  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: POST, OPTIONS
  Access-Control-Allow-Headers: Content-Type

so the browser can call the webhook directly from the frontend.

Security notes
- Do not expose the Stripe secret key in the frontend. Use n8n credentials or environment variables.
- Validate the payload server-side: check buyer.email, plan exists, amount matches your pricing, and prevent tampering.
- Optionally sign responses or return a short-lived session token if you want clients to poll for status.

Testing
- Manually test the webhook with curl or Postman using the payload example. The response should include checkoutUrl for card flows.
- Example curl (replace with your public n8n webhook URL):

curl -X POST 'https://YOUR-N8N-URL/webhook/legado-wizard' \
  -H 'Content-Type: application/json' \
  -d '{"paymentMethod":"card","plan":"esencial-zulia","paymentType":"annual","buyer":{"name":"Test","email":"test@example.com"},"timestamp":"2026-04-20T00:00:00Z","source":"wizard"}'

If implemented correctly, response should be a JSON with checkoutUrl.

Advanced: Returning interactive "message + chips"
- If you want the webhook to drive a conversational flow, return:

{
  "message": "Cuando estes listo, escribe SI para confirmar los datos y proceder al pago.",
  "chips": ["Si, confirmo los datos", "Necesito corregir algo"]
}

The frontend (already updated) will render the message and chips and will POST back the previous payload with an added `reply` field when the user taps a chip.

-- End of template --
