# 🚀 LEGADO_Wizard v2 — IMPLEMENTATION AUTOMATION GUIDE

**Start Date:** 2026-04-22  
**Status:** Implementation in progress  
**Estimated Duration:** 45-50 minutes

---

## ⚡ QUICK START: Execute These 5 Phases

### ✅ PHASE 1: Stripe Dashboard Setup (5 min) — MANUAL

**You must do this:**
1. Go to https://dashboard.stripe.com/settings/webhooks
2. Click **Add endpoint**
3. URL: `https://vmi2945958.contaboserver.net/webhook/stripe-webhook-legado`
4. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.failed`
5. Click **Add**
6. Click **Reveal** next to "Signing secret"
7. **Copy secret** → Save to notes (format: `whsec_...`)

**Status:** ⏳ Awaiting your completion

---

### ✅ PHASE 2: n8n Workflow Setup (20 min) — MANUAL

**You must do this:**

1. **Import Workflow:**
   - n8n → Workflows → Import
   - Select: `n8n_workflow_legado_wizard_v2.json`
   - Name: "LEGADO_Wizard_v2"

2. **Configure Credentials:**
   - Edit Workflow → Credentials
   
   **Stripe:**
   - Type: Stripe
   - API Key: `sk_test_...` (from Stripe Dashboard)
   - Webhook Secret: `whsec_...` (from Phase 1)
   - Save & Test

   **InvoiceNinja:**
   - Type: HTTP
   - URL: `https://api.invoiceninja.test/`
   - API Key: (your InvoiceNinja API key)
   - Save & Test

   **Internal API:**
   - Type: HTTP
   - URL: `https://internal-api.legado.test/`
   - API Key/Token: (your internal API credentials)
   - Save & Test

3. **Update Endpoints:**
   - Edit each HTTP node (Create Client, Create Invoice, Mark session active)
   - Adjust URLs to match your actual domains

4. **Test & Publish:**
   - Click "Test workflow"
   - Send test payload
   - Verify no errors
   - Click "Publish"

**Status:** ⏳ Awaiting your completion

---

### ✅ PHASE 3: Front-End Deployment (5 min) — AUTOMATED

**Deployment command:**
```bash
cd "C:\Users\EstebanVasquez\OneDrive - MSFT\Documents\GitHub\legado-holding"
git add js/main.js
git commit -m "Deploy LEGADO_Wizard v2: fix webhook URLs"
git push origin fix/webhooks-env
# Then merge to main in your CI/CD or manually
```

**Verify deployment:**
- Visit your website
- Open browser console (F12)
- Type: `console.log(WIZARD_WEBHOOK_URL, STRIPE_WEBHOOK_URL)`
- Should show both webhook URLs correctly

**Status:** ⏳ Ready to execute

---

### ✅ PHASE 4: Integration Testing (15 min) — AUTOMATED

**Run tests (choose one):**

**Option A: Windows (PowerShell)**
```powershell
cd "C:\Users\EstebanVasquez\OneDrive - MSFT\Documents\GitHub\legado-holding"
powershell -ExecutionPolicy Bypass -File test_webhooks.ps1
```

**Option B: Linux/Mac (Bash)**
```bash
cd "C:\Users\EstebanVasquez\OneDrive - MSFT\Documents\GitHub\legado-holding"
chmod +x test_webhooks.sh
./test_webhooks.sh
```

**Expected output:**
```
✓ PASS - Webhook reachability
✓ PASS - Wizard webhook payload
✓ PASS - Stripe webhook (success)
✓ PASS - Stripe webhook (failed)
✓ PASS - Idempotence test

All tests PASSED!
```

**Status:** ⏳ Ready to execute

---

### ✅ PHASE 5: End-to-End Validation (5 min) — MANUAL

**Test complete purchase flow:**

1. **Open website** in browser
2. **Click "Buy Now"** on any plan
3. **Complete 4-step wizard:**
   - Step 1: Choose plan
   - Step 2: Enter info (use `test@example.com` as email)
   - Step 3: Accept terms
   - Step 4: Review

4. **Payment screen:**
   - Test card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., `12/25`)
   - CVC: Any 3 digits (e.g., `123`)
   - Click "Pay"

5. **Verify success:**
   - ✅ Payment processes (no errors)
   - ✅ n8n logs show execution
   - ✅ Invoice created in InvoiceNinja
   - ✅ Portal accessible with sessionId
   - ✅ Customer sees "Thank you" page

**Status:** ⏳ Awaiting your completion

---

## 📋 Implementation Checklist

### Phase 1: Stripe ✅
- [ ] Go to Stripe Dashboard webhooks
- [ ] Add endpoint: /webhook/stripe-webhook-legado
- [ ] Select: payment_intent.succeeded, payment_intent.payment_failed, charge.failed
- [ ] Copy & save signing secret (whsec_...)

### Phase 2: n8n ✅
- [ ] Import workflow from JSON file
- [ ] Configure Stripe credentials (API key + webhook secret)
- [ ] Configure InvoiceNinja credentials
- [ ] Configure Internal API credentials
- [ ] Test workflow (send test payload)
- [ ] Publish workflow

### Phase 3: Deploy ✅
- [ ] Git add js/main.js
- [ ] Git commit with message
- [ ] Git push to fix/webhooks-env
- [ ] Deploy to production (CI/CD or manual)
- [ ] Verify URLs in browser console

### Phase 4: Test ✅
- [ ] Run test_webhooks.ps1 or test_webhooks.sh
- [ ] Verify 5 tests pass
- [ ] Check webhook reachability
- [ ] Check payload validation

### Phase 5: Validate ✅
- [ ] Complete test purchase
- [ ] Verify payment processed
- [ ] Verify invoice created
- [ ] Verify portal activated
- [ ] Verify sessionId tracked

---

## 🔍 Validation Points

**After each phase, verify:**

| Phase | What to Check | Expected Result |
|-------|---------------|-----------------|
| 1 | Webhook endpoint created | Status: "Ready to receive events" |
| 2 | Workflow published | Status shows "Published" |
| 3 | js/main.js deployed | URLs correct in browser console |
| 4 | Tests run | All 5 tests: ✓ PASS |
| 5 | Full purchase | Customer has portal access |

---

## 🆘 Troubleshooting During Implementation

### Webhook Not Responding
**Problem:** Test shows "Connection failed"  
**Solution:**
1. Check Stripe Dashboard → Webhooks → Endpoint settings
2. Verify URL is exactly: `https://vmi2945958.contaboserver.net/webhook/stripe-webhook-legado`
3. Check n8n is running and accessible
4. Check firewall rules allow traffic

### Credentials Invalid
**Problem:** "Authentication failed" in n8n  
**Solution:**
1. Double-check credentials are correct (copy/paste from source)
2. Verify API key format (starts with `sk_test_` for Stripe)
3. Test each credential individually in n8n
4. Check expiration dates on API keys

### Payment Fails
**Problem:** Test payment shows "declined"  
**Solution:**
1. Use test card: `4242 4242 4242 4242`
2. Verify Stripe is in TEST mode (not live)
3. Check amount is valid (> $0)
4. Verify test card hasn't expired

### Invoice Not Created
**Problem:** Payment succeeded but no invoice in InvoiceNinja  
**Solution:**
1. Check InvoiceNinja API credentials
2. Verify InvoiceNinja endpoint URL is correct
3. Check n8n logs for HTTP errors
4. Manually test InvoiceNinja API with curl

### Portal Won't Activate
**Problem:** After payment, customer can't access portal  
**Solution:**
1. Verify "Mark session active" node is executing
2. Check database: session should have status='active'
3. Verify sessionId format: `sess_[timestamp]_[random]`
4. Check portal code handles sessionId correctly

---

## 📊 Progress Tracking

**Estimated Total Time: 50 minutes**

```
Phase 1: Stripe ........... 5 min   ⏳ Not started
Phase 2: n8n ............ 20 min   ⏳ Not started
Phase 3: Deploy .......... 5 min   ⏳ Not started
Phase 4: Test ........... 15 min   ⏳ Not started
Phase 5: Validate ........ 5 min   ⏳ Not started
                         ─────────
Total:              50 minutes
```

---

## 📞 Help & Support

**Need detailed steps?**
- Phase 1: See IMPLEMENTACION_GUIA.md → Phase 1
- Phase 2: See IMPLEMENTACION_GUIA.md → Phase 2
- Phase 3: See IMPLEMENTACION_GUIA.md → Phase 3
- Phase 4: See TEST_REPORT.md
- Phase 5: See DEPLOYMENT_CHECKLIST.md

**Stuck on something?**
1. Check FILES_MANIFEST.md (file descriptions)
2. Search relevant doc for "Phase X"
3. Check TROUBLESHOOTING_QUICK_LINKS.md
4. Review test results in TEST_REPORT.md

---

## ✅ When Complete

All phases done? ✓

**Verify success:**
```bash
# 1. Check git branch
git branch

# 2. Check changes pushed
git log --oneline -n 3

# 3. Verify tests passed
echo "All 5 tests: PASSED"

# 4. Verify deployment
curl https://vmi2945958.contaboserver.net/webhook/legado-wizard -I

# 5. Complete test purchase & verify portal access
```

**Then:**
- ✅ Mark as deployed in ticket
- ✅ Enable monitoring/alerts
- ✅ Notify stakeholders
- ✅ Document any issues

---

**Ready to start? Begin with Phase 1 above. ⬆️**

