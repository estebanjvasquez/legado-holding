# 🚀 LEGADO_Wizard v2 — IMPLEMENTATION COMMANDS

**Quick copy-paste commands for each phase**

---

## PHASE 1: Stripe Dashboard Setup (MANUAL)

```
TASK: Create webhook endpoint in Stripe Dashboard

1. Go to: https://dashboard.stripe.com/settings/webhooks
2. Click: Add endpoint
3. Paste URL: https://vmi2945958.contaboserver.net/webhook/stripe-webhook-legado
4. Select Events:
   □ payment_intent.succeeded
   □ payment_intent.payment_failed
   □ charge.failed
5. Click: Add endpoint
6. Click: Reveal (next to "Signing secret")
7. SAVE the secret (starts with whsec_) for Phase 2
```

**Time:** ~5 minutes  
**Status:** ⏳ Requires manual UI interaction

---

## PHASE 2: n8n Workflow Setup (MANUAL)

```
TASK: Import workflow template and configure credentials

STEP 1: Import Workflow
  1. Go to n8n → Workflows
  2. Click: Import workflow
  3. Select: n8n_workflow_legado_wizard_v2.json
  4. Name it: LEGADO_Wizard_v2
  5. Click: Import

STEP 2: Configure Stripe Credentials
  1. Edit workflow
  2. Right-click any node → Edit credentials
  3. Add new: Stripe
  4. API Key: sk_test_... (from Stripe Dashboard)
  5. Webhook Secret: whsec_... (from Phase 1)
  6. Save & Test

STEP 3: Configure InvoiceNinja Credentials
  1. Add new: HTTP
  2. Name: InvoiceNinja
  3. URL: https://api.invoiceninja.test/
  4. API Key: (your InvoiceNinja API key)
  5. Save & Test

STEP 4: Configure Internal API Credentials
  1. Add new: HTTP
  2. Name: Internal API
  3. URL: https://internal-api.legado.test/
  4. API Key/Token: (your internal credentials)
  5. Save & Test

STEP 5: Update Endpoints
  Edit each HTTP node and verify/update URLs:
  - Create Client: https://api.invoiceninja.test/clients
  - Create Invoice: https://api.invoiceninja.test/invoices
  - Mark session active: https://internal-api.legado.test/sessions/activate

STEP 6: Test & Publish
  1. Click: Test workflow
  2. Send test payload
  3. Verify: No errors
  4. Click: Publish
```

**Time:** ~20 minutes  
**Status:** ⏳ Requires manual UI interaction

---

## PHASE 3: Front-End Deployment (AUTOMATED)

```
COMMAND: Deploy js/main.js to production

Step 1: Navigate to repository
  cd "C:\Users\EstebanVasquez\OneDrive - MSFT\Documents\GitHub\legado-holding"

Step 2: Stage changes
  git add js/main.js

Step 3: Create commit
  git commit -m "Deploy LEGADO_Wizard v2 payment flow

  - Fix WIZARD_WEBHOOK_URL to /webhook/legado-wizard
  - Add STRIPE_WEBHOOK_URL for payment events
  - Implement environment-aware config loading

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

Step 4: Push to branch
  git push origin fix/webhooks-env

Step 5: Merge to main (in your CI/CD or manually)
  git checkout main
  git pull origin main
  git merge fix/webhooks-env
  git push origin main

Step 6: Trigger deployment
  (Your CI/CD deploys automatically, or manually deploy to server)

Step 7: Verify in browser
  1. Visit your website
  2. Open browser console (F12 → Console tab)
  3. Paste: console.log(WIZARD_WEBHOOK_URL, STRIPE_WEBHOOK_URL)
  4. Should show both URLs correctly
```

**Time:** ~5 minutes  
**Status:** ✅ Automated

---

## PHASE 4: Integration Testing (AUTOMATED)

```
COMMAND: Run integration tests

Choose one option based on your OS:

OPTION A: Windows PowerShell
  cd "C:\Users\EstebanVasquez\OneDrive - MSFT\Documents\GitHub\legado-holding"
  powershell -ExecutionPolicy Bypass -File test_webhooks.ps1

OPTION B: Linux/Mac Bash
  cd "C:\Users\EstebanVasquez\OneDrive - MSFT\Documents\GitHub\legado-holding"
  chmod +x test_webhooks.sh
  ./test_webhooks.sh

EXPECTED OUTPUT:
  ✅ Test 1: Webhook Reachability - PASS
  ✅ Test 2: Wizard Webhook Payload - PASS
  ✅ Test 3: Stripe Webhook (success) - PASS
  ✅ Test 4: Stripe Webhook (failed) - PASS
  ✅ Test 5: Idempotence - PASS

  All tests PASSED!

If any fail:
  1. Check n8n logs (Settings → Logs)
  2. Verify webhook URLs match
  3. Verify credentials configured
  4. Re-run test
```

**Time:** ~15 minutes  
**Status:** ✅ Automated

---

## PHASE 5: End-to-End Validation (MANUAL)

```
TASK: Complete test purchase and verify portal access

STEP 1: Open Website
  1. Visit: https://your-domain.com (or localhost:3000)
  2. Verify page loads without errors

STEP 2: Start Purchase
  1. Click: "Buy Now" button on any plan
  2. Fill Step 1: Select plan (e.g., "esencial-zulia")
  3. Click: Next

STEP 3: Customer Details
  1. Fill Step 2:
     - Email: test@example.com
     - First Name: Test
     - Last Name: Customer
     - Phone: +1234567890
  2. Click: Next

STEP 4: Accept Terms
  1. Fill Step 3: 
     - Check: "I accept terms and conditions"
  2. Click: Next

STEP 5: Payment
  1. Fill Step 4:
     - Card Number: 4242 4242 4242 4242
     - Expiry: 12/25 (or any future date)
     - CVC: 123
  2. Click: "Complete Payment"

STEP 6: Verify Success
  Expected results:
  ✅ Payment processes (no error message)
  ✅ Page shows "Thank you" message
  ✅ No console errors (F12 → Console)
  ✅ n8n shows workflow execution (check logs)
  ✅ Invoice created in InvoiceNinja
  ✅ sessionId visible in URL or portal

STEP 7: Check Portal Access
  1. Copy sessionId from response/URL
  2. Visit: https://your-portal.com/?sessionId=sess_...
  3. Verify: Portal loads with customer details
```

**Time:** ~5 minutes  
**Status:** ⏳ Manual verification

---

## Validation Commands (Post-Implementation)

```
VERIFY GIT CHANGES:
  git log --oneline -n 5

VERIFY DEPLOYMENT:
  curl -I https://vmi2945958.contaboserver.net/webhook/legado-wizard
  curl -I https://vmi2945958.contaboserver.net/webhook/stripe-webhook-legado

CHECK WORKFLOW IN N8N:
  1. n8n → Workflows → LEGADO_Wizard_v2
  2. Status should show: "Published"
  3. Click "Executions" to see test runs

MONITOR STRIPE WEBHOOKS:
  1. Stripe Dashboard → Settings → Webhooks
  2. Click your endpoint
  3. Check: "Recent events" tab
  4. Should show successful deliveries

TEST COMPLETE FLOW ONE MORE TIME:
  ./test_webhooks.sh (or .ps1 on Windows)
```

---

## Quick Rollback (If Needed)

```
EMERGENCY ROLLBACK:

1. Deactivate n8n workflow
   1. n8n → LEGADO_Wizard_v2 → Toggle OFF
   2. Status: Inactive

2. Revert front-end
   git revert HEAD
   git push origin main

3. Verify reverted
   curl -I https://vmi2945958.contaboserver.net/webhook/legado-wizard
   (Should show 404 or old behavior)

4. Monitor and alert team
```

---

## Status Tracking

```
Phase 1: Stripe         ⏳ Manual    [  ] Start  [  ] Complete
Phase 2: n8n            ⏳ Manual    [  ] Start  [  ] Complete
Phase 3: Deploy         ✅ Auto     [  ] Start  [  ] Complete
Phase 4: Test           ✅ Auto     [  ] Start  [  ] Complete
Phase 5: Validate       ⏳ Manual    [  ] Start  [  ] Complete

Overall: ⏳ In Progress
Estimated completion: 50 minutes from start
```

---

## Need Help?

| Phase | Problem | Solution |
|-------|---------|----------|
| 1 | Stripe webhook won't add | Check URL, firewall, n8n status |
| 2 | Credentials error | Verify API key format, not expired |
| 2 | Workflow won't import | Check JSON syntax in file |
| 3 | Deployment failed | Check git branch, internet connection |
| 4 | Tests fail | Check webhook URLs, n8n logs |
| 5 | Payment declined | Use test card 4242..., verify mode |
| 5 | Portal won't open | Check sessionId format, DB status |

---

## Next Step

👉 **Start with Phase 1 above**

Expected timeline: 45-50 minutes total

When done: All customers will get portal access immediately after paying! ✅
