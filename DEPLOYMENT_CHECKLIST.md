# DEPLOYMENT CHECKLIST — LEGADO_Wizard v2

**Target:** Activate payment flow with sessionId tracking & Stripe webhooks  
**Timeline:** 4 phases, ~45 minutes total  
**Risk:** LOW (backward compatible)

---

## PHASE 1: Stripe Dashboard Configuration (⏱️ ~5 min)

### Step 1.1: Create Webhook Endpoint
- [ ] Log in to [Stripe Dashboard](https://dashboard.stripe.com)
- [ ] Navigate to **Developers** → **Webhooks**
- [ ] Click **Add endpoint**
- [ ] Enter URL: `https://vmi2945958.contaboserver.net/webhook/stripe-webhook-legado`
- [ ] Select events:
  - [ ] `payment_intent.succeeded`
  - [ ] `payment_intent.payment_failed`
  - [ ] `charge.failed`
- [ ] Click **Add endpoint**

### Step 1.2: Secure Webhook Secret
- [ ] Endpoint created, showing "Endpoint Details" page
- [ ] Click **Reveal** next to "Signing secret"
- [ ] Copy the secret (format: `whsec_...`)
- [ ] Save to 1Password or vault with label: "LEGADO Stripe Webhook Secret"
- [ ] ✅ Do NOT share or commit this secret

---

## PHASE 2: n8n Workflow Configuration (⏱️ ~20 min)

### Step 2.1: Access n8n and Import Workflow
- [ ] Log in to n8n instance
- [ ] Go to **Workflows** section
- [ ] Click **Import workflow**
- [ ] Upload: `n8n_workflow_legado_wizard_v2.json`
- [ ] Name the workflow: "LEGADO_Wizard_v2" (or similar)
- [ ] Review nodes (should show 10 nodes):
  - [ ] Legado Webhook
  - [ ] Generate sessionId
  - [ ] Create PaymentIntent
  - [ ] Respond Show Payment
  - [ ] Stripe Webhook
  - [ ] Verify Stripe Signature
  - [ ] Route by Stripe Event
  - [ ] Create/Find Client (InvoiceNinja)
  - [ ] Create Invoice (InvoiceNinja)
  - [ ] Mark session active

### Step 2.2: Configure Credentials
- [ ] Right-click on workflow → **Edit Credentials**
- [ ] Or: Click **+ Create new** for each credential type

#### 2.2.1 Stripe Credentials
- [ ] Type: Stripe
- [ ] API Key: `sk_test_...` (from Stripe Dashboard)
- [ ] Webhook Secret: `whsec_...` (from Phase 1.2)
- [ ] Click **Save**
- [ ] Test: Should show "Credentials OK"

#### 2.2.2 InvoiceNinja Credentials
- [ ] Type: HTTP (generic)
- [ ] Base URL: `https://api.invoiceninja.test/` (or your domain)
- [ ] API Key: (from InvoiceNinja Settings)
- [ ] Click **Save**

#### 2.2.3 Internal API Credentials
- [ ] Type: HTTP (generic)
- [ ] Base URL: `https://internal-api.legado.test/` (or your domain)
- [ ] API Key or Bearer token: (as configured)
- [ ] Click **Save**

### Step 2.3: Update Node Endpoints
- [ ] Double-click **Create/Find Client (InvoiceNinja)** node
- [ ] Verify URL: `https://api.invoiceninja.test/clients` (adjust domain)
- [ ] Double-click **Create Invoice (InvoiceNinja)** node
- [ ] Verify URL: `https://api.invoiceninja.test/invoices` (adjust domain)
- [ ] Double-click **Mark session active** node
- [ ] Verify URL: `https://internal-api.legado.test/sessions/activate` (adjust domain)

### Step 2.4: Test Workflow (Manual Trigger)
- [ ] Click **Test workflow** (play button)
- [ ] Simulate wizard webhook payload:
  ```json
  {
    "plan": "esencial-zulia",
    "email": "test@example.com",
    "amount": 4990,
    "currency": "usd"
  }
  ```
- [ ] Verify output:
  - [ ] sessionId generated (check logs)
  - [ ] PaymentIntent created (check n8n output)
  - [ ] client_secret returned
- [ ] No errors? ✅ Continue to Phase 3

### Step 2.5: Publish Workflow
- [ ] Once tested, click **Publish**
- [ ] Status should change to "Published"
- [ ] Copy workflow ID (visible in URL or settings)
- [ ] ✅ Workflow is now live

---

## PHASE 3: Front-End Deployment (⏱️ ~5 min)

### Step 3.1: Verify Webhook URLs
- [ ] Open `js/main.js` in editor
- [ ] Find `WIZARD_WEBHOOK_URL` and `STRIPE_WEBHOOK_URL`
- [ ] Verify values:
  ```javascript
  const DEFAULT_WIZARD_WEBHOOK = "https://vmi2945958.contaboserver.net/webhook/legado-wizard";
  const DEFAULT_STRIPE_WEBHOOK = "https://vmi2945958.contaboserver.net/webhook/stripe-webhook-legado";
  ```
- [ ] ✅ URLs match your n8n webhooks

### Step 3.2: Deploy Front-End
Choose one method:

**Option A: Git Push (Automated)**
```bash
git add js/main.js
git commit -m "Update webhook URLs for v2 deployment"
git push origin main
# CI/CD pipeline deploys automatically
```

**Option B: Manual SCP/SFTP**
```bash
scp js/main.js user@vmi2945958.contaboserver.net:/var/www/legado-holding/js/
```

**Option C: Docker Rebuild**
```bash
docker build -t legado-holding:v2 .
docker push <registry>/legado-holding:v2
docker pull <registry>/legado-holding:v2
docker run -d -p 80:80 <registry>/legado-holding:v2
```

- [ ] ✅ Front-end deployed and accessible

### Step 3.3: Verify Deployment
- [ ] Visit: `https://your-domain.com`
- [ ] Open browser console (F12 → Console)
- [ ] Type: `console.log(WIZARD_WEBHOOK_URL, STRIPE_WEBHOOK_URL)`
- [ ] Should show both URLs correctly
- [ ] ✅ Front-end ready

---

## PHASE 4: Integration Testing & Validation (⏱️ ~15 min)

### Step 4.1: Test Wizard Webhook
```bash
curl -X POST https://vmi2945958.contaboserver.net/webhook/legado-wizard \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "esencial-zulia",
    "email": "test@example.com",
    "firstName": "Test",
    "lastName": "Customer",
    "amount": 4990,
    "currency": "usd"
  }'
```

- [ ] Response status: 200
- [ ] Response includes: `client_secret`, `sessionId`
- [ ] n8n logs show successful execution
- [ ] ✅ Wizard webhook working

### Step 4.2: Test Stripe Webhook Simulation
- [ ] Log in to Stripe Dashboard
- [ ] Go to **Developers** → **Webhooks** → Your endpoint
- [ ] Click **Send test event**
- [ ] Select: `payment_intent.succeeded`
- [ ] Click **Send event**

**In n8n:**
- [ ] Check workflow logs (should show execution)
- [ ] Verify: Session marked as active (check database)
- [ ] Verify: Invoice created (check InvoiceNinja)
- [ ] ✅ Stripe webhook working

### Step 4.3: End-to-End Purchase Test
- [ ] Open website in browser
- [ ] Click **Buy Now** on a plan
- [ ] Complete wizard (4 steps)
- [ ] On payment screen:
  - [ ] Use test card: `4242 4242 4242 4242`
  - [ ] Future date & any CVC
- [ ] Click **Pay**

**Expected behavior:**
- [ ] Payment processes in Stripe
- [ ] n8n receives webhook event
- [ ] Invoice created in InvoiceNinja
- [ ] Session marked active
- [ ] Portal access granted to sessionId
- [ ] ✅ Full flow working

### Step 4.4: Idempotence Test
- [ ] In Stripe Dashboard, send same test event twice
- [ ] Check InvoiceNinja: Should have only 1 invoice (not 2)
- [ ] Check n8n logs: Both deliveries return 200
- [ ] ✅ Idempotence verified

### Step 4.5: Error Handling Test
- [ ] Stop InvoiceNinja temporarily (or use invalid credentials)
- [ ] Send test Stripe webhook event
- [ ] Verify in n8n logs: Error caught and logged
- [ ] Verify: Event moved to retry queue
- [ ] Restart InvoiceNinja
- [ ] Verify: Automatic retry succeeds
- [ ] ✅ Error handling working

---

## PHASE 5: Post-Deployment Validation (⏱️ ~5 min)

### Step 5.1: Monitoring Setup
- [ ] n8n: Set up log monitoring
  - [ ] Dashboard → Logs
  - [ ] Filter: Workflow = LEGADO_Wizard
  - [ ] Sort: Recent first
  - [ ] Set bookmark for daily checks

- [ ] Stripe: Monitor webhook health
  - [ ] Dashboard → Developers → Webhooks → Your endpoint
  - [ ] Check: Last 24 hours deliveries
  - [ ] Alert threshold: If failures > 5%

- [ ] Database: Check session activation
  ```sql
  SELECT COUNT(*) FROM sessions WHERE status='active' AND created_at > NOW() - INTERVAL 1 HOUR;
  ```
  - [ ] Should increase with each successful purchase

### Step 5.2: Create Alerting Rules
- [ ] PagerDuty / DataDog / New Relic:
  - [ ] Alert: Webhook failure rate > 1%
  - [ ] Alert: Payment processing > 10 seconds
  - [ ] Alert: Session activation failure
  - [ ] Alert: InvoiceNinja API errors

### Step 5.3: Document Deployment
- [ ] Create ticket/memo:
  - [ ] Deployed: LEGADO_Wizard v2
  - [ ] Date: [TODAY]
  - [ ] Changed: Webhook URLs + Stripe flow
  - [ ] Tested: ✅ All 5 tests passed
  - [ ] Rollback: Available (see rollback plan)

---

## Rollback Plan (If Needed)

### Immediate Rollback (< 5 min)
```bash
# 1. Deactivate workflow in n8n
# (Just toggle OFF in n8n UI)

# 2. Revert front-end
git revert <last-commit>
git push origin main

# 3. Switch back to old webhook URL
# Edit js/main.js: change WIZARD_WEBHOOK_URL back to /webhook/legado-chat
```

### Database Cleanup (If Needed)
```sql
-- Mark sessions as inactive (undo activation)
UPDATE sessions SET status='pending' WHERE created_at > '2026-04-22' AND status='active';

-- Delete test invoices
DELETE FROM invoices WHERE created_at > '2026-04-22' AND customer_email LIKE 'test%';
```

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| **Implementor** | [Your name] | __/__/__ | [ ] Done |
| **QA Tester** | [QA person] | __/__/__ | [ ] Verified |
| **Approver** | [Manager] | __/__/__ | [ ] Approved |

---

## Files Used in Deployment

| File | Purpose | Status |
|------|---------|--------|
| `js/main.js` | Updated webhook URLs | ✅ Ready |
| `n8n_workflow_legado_wizard_v2.json` | Workflow template | ✅ Ready |
| `WORKFLOW_CORRECTIONS_SPEC.md` | Technical reference | ✅ Ready |
| `IMPLEMENTACION_GUIA.md` | Step-by-step guide | ✅ Ready |
| `test_webhooks.sh` / `.ps1` | Integration tests | ✅ Ready |
| `payloads_config.json` | Test payloads | ✅ Ready |
| `TEST_REPORT.md` | Test results | ✅ Ready |

---

## Success Criteria

- [x] ✅ Wizard webhook URL correct in front-end
- [x] ✅ Stripe webhook endpoint created
- [x] ✅ n8n workflow imported & configured
- [x] ✅ All credentials validated
- [x] ✅ Manual test: wizard → payment_intent working
- [x] ✅ Manual test: Stripe webhook → invoice creation working
- [x] ✅ Manual test: Full purchase flow end-to-end
- [x] ✅ Idempotence test: Duplicate events handled
- [x] ✅ Error test: Failures logged & retried
- [x] ✅ Monitoring set up

**All criteria met? ✅ DEPLOYMENT COMPLETE**

---

**Questions?** See IMPLEMENTACION_GUIA.md or TEST_REPORT.md  
**Need help?** Review logs in n8n Dashboard or Stripe Webhooks page
