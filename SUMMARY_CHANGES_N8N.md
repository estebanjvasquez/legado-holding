SUMMARY_CHANGES_N8N

Concise summary of changes to apply in n8n (LEGADO_Wizard -> v2):

1. Add "Generate sessionId" Function node immediately after the incoming webhook. Use format: 'sess_'+Date.now()+ '_' + Math.random().toString(36).substr(2,9)
2. Update Create PaymentIntent node: include metadata {sessionId, plan, paymentType, customerEmail} and set idempotency key to sessionId
3. Keep Respond Show Payment but include sessionId in response body and a clear next state
4. Create new Webhook endpoint '/webhook/stripe-webhook-legado' for Stripe events
5. Add verification Function node using stripe.webhooks.constructEvent and the webhook signing secret
6. Add Switch node to route payment_intent.succeeded -> Invoice creation, payment_intent.payment_failed -> cleanup
7. Add InvoiceNinja HTTP nodes with idempotency using sessionId (client lookup/create, invoice create)
8. Update database/API nodes to mark session active only after invoice creation success
9. Add retry and dead-letter handling for invoice creation failures
10. Log all raw Stripe events and actions for audit

Priority: Implement nodes 1-6 first (session, metadata, response, webhook, verify, routing). Then implement invoice and DB updates with retries.

Testing: Use provided test payloads and duplicate-delivery tests. Verify portal activation post-payment_intent.succeeded.
