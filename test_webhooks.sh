#!/bin/bash
# =============================================================================
# TEST WEBHOOKS — LEGADO_Wizard v2 Integration Tests (Bash version)
# 
# Ejecutar con: chmod +x test_webhooks.sh && ./test_webhooks.sh
# =============================================================================

set -euo pipefail

# Configuration
WEBHOOK_BASE_URL="https://vmi2945958.contaboserver.net"
WIZARD_WEBHOOK="$WEBHOOK_BASE_URL/webhook/legado-wizard"
STRIPE_WEBHOOK="$WEBHOOK_BASE_URL/webhook/stripe-webhook-legado"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

write_header() {
    echo -e "\n${BLUE}=================================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=================================================================================${NC}\n"
}

write_test_result() {
    local test_name=$1
    local status=$2
    local message=${3:-""}
    
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}[✓ PASS]${NC} $test_name"
    else
        echo -e "${RED}[✗ FAIL]${NC} $test_name"
    fi
    
    if [ -n "$message" ]; then
        echo -e "  ${YELLOW}→ $message${NC}"
    fi
}

test_webhook_reachability() {
    write_header "TEST 1: Webhook Reachability"
    
    echo "Testing WIZARD webhook: $WIZARD_WEBHOOK"
    if response1=$(curl -s -o /dev/null -w "%{http_code}" -I "$WIZARD_WEBHOOK" 2>/dev/null); then
        write_test_result "WIZARD webhook" "PASS" "Status: $response1"
    else
        write_test_result "WIZARD webhook" "FAIL" "Connection failed"
        return 1
    fi
    
    echo "Testing STRIPE webhook: $STRIPE_WEBHOOK"
    if response2=$(curl -s -o /dev/null -w "%{http_code}" -I "$STRIPE_WEBHOOK" 2>/dev/null); then
        write_test_result "STRIPE webhook" "PASS" "Status: $response2"
    else
        write_test_result "STRIPE webhook" "FAIL" "Connection failed"
        return 1
    fi
    
    return 0
}

test_wizard_webhook_payload() {
    write_header "TEST 2: Wizard Webhook Payload (User Purchase)"
    
    local session_id="sess_$(date +%s)_$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' ')"
    local email="test-$(shuf -i 1000-9999 -n 1)@example.com"
    
    local payload=$(cat <<EOF
{
  "plan": "esencial-zulia",
  "email": "$email",
  "firstName": "Test",
  "lastName": "Customer",
  "phone": "+1234567890",
  "amount": 4990,
  "currency": "usd",
  "paymentType": "card",
  "sessionId": "$session_id"
}
EOF
)
    
    echo "Sending payload to: $WIZARD_WEBHOOK"
    echo "Session ID: $session_id"
    echo "Payload: $payload"
    echo ""
    
    if response=$(curl -s -w "\n%{http_code}" -X POST "$WIZARD_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null); then
        
        status_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | head -n-1)
        
        if [ "$status_code" = "200" ]; then
            write_test_result "Wizard webhook" "PASS" "Status: $status_code"
            echo -e "${GREEN}Response:${NC}"
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
            return 0
        else
            write_test_result "Wizard webhook" "FAIL" "Status: $status_code (expected 200)"
            echo "$body"
            return 1
        fi
    else
        write_test_result "Wizard webhook" "FAIL" "Request failed"
        return 1
    fi
}

test_stripe_webhook_payload() {
    write_header "TEST 3: Stripe Webhook Payload (Payment Succeeded)"
    
    local session_id="sess_$(date +%s)_$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' ')"
    local payment_intent_id="pi_$(head -c 13 /dev/urandom | od -An -tx1 | tr -d ' ')"
    local email="test-$(shuf -i 1000-9999 -n 1)@example.com"
    
    local payload=$(cat <<EOF
{
  "id": "evt_$(head -c 13 /dev/urandom | od -An -tx1 | tr -d ' ')",
  "object": "event",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "$payment_intent_id",
      "object": "payment_intent",
      "amount": 4990,
      "currency": "usd",
      "status": "succeeded",
      "metadata": {
        "sessionId": "$session_id",
        "plan": "esencial-zulia",
        "paymentType": "card",
        "customerEmail": "$email"
      }
    }
  }
}
EOF
)
    
    echo "Sending Stripe event to: $STRIPE_WEBHOOK"
    echo "Session ID: $session_id"
    echo "Payment Intent ID: $payment_intent_id"
    echo ""
    
    if response=$(curl -s -w "\n%{http_code}" -X POST "$STRIPE_WEBHOOK" \
        -H "Content-Type: application/json" \
        -H "X-Stripe-Signature: test_signature" \
        -d "$payload" 2>/dev/null); then
        
        status_code=$(echo "$response" | tail -n1)
        
        if [ "$status_code" = "200" ]; then
            write_test_result "Stripe webhook (success)" "PASS" "Status: $status_code"
            return 0
        else
            write_test_result "Stripe webhook (success)" "FAIL" "Status: $status_code (expected 200)"
            return 1
        fi
    else
        write_test_result "Stripe webhook (success)" "FAIL" "Request failed"
        return 1
    fi
}

test_stripe_webhook_failed() {
    write_header "TEST 4: Stripe Webhook (Payment Failed)"
    
    local session_id="sess_$(date +%s)_$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' ')"
    local payment_intent_id="pi_$(head -c 13 /dev/urandom | od -An -tx1 | tr -d ' ')"
    local email="test-$(shuf -i 1000-9999 -n 1)@example.com"
    
    local payload=$(cat <<EOF
{
  "id": "evt_$(head -c 13 /dev/urandom | od -An -tx1 | tr -d ' ')",
  "object": "event",
  "type": "payment_intent.payment_failed",
  "data": {
    "object": {
      "id": "$payment_intent_id",
      "object": "payment_intent",
      "amount": 4990,
      "currency": "usd",
      "status": "requires_payment_method",
      "last_payment_error": {
        "message": "Your card was declined"
      },
      "metadata": {
        "sessionId": "$session_id",
        "plan": "esencial-zulia",
        "paymentType": "card",
        "customerEmail": "$email"
      }
    }
  }
}
EOF
)
    
    echo "Sending failed payment event to: $STRIPE_WEBHOOK"
    echo "Session ID: $session_id"
    echo ""
    
    if response=$(curl -s -w "\n%{http_code}" -X POST "$STRIPE_WEBHOOK" \
        -H "Content-Type: application/json" \
        -H "X-Stripe-Signature: test_signature" \
        -d "$payload" 2>/dev/null); then
        
        status_code=$(echo "$response" | tail -n1)
        
        if [ "$status_code" = "200" ]; then
            write_test_result "Stripe webhook (failed)" "PASS" "Status: $status_code"
            return 0
        else
            write_test_result "Stripe webhook (failed)" "FAIL" "Status: $status_code (expected 200)"
            return 1
        fi
    else
        write_test_result "Stripe webhook (failed)" "FAIL" "Request failed"
        return 1
    fi
}

show_summary() {
    local passed=$1
    local failed=$2
    
    write_header "TEST SUMMARY"
    echo -e "${GREEN}Passed: $passed${NC}"
    echo -e "${RED}Failed: $failed${NC}"
    
    if [ $failed -eq 0 ]; then
        echo -e "\n${GREEN}✅ All tests PASSED!${NC}"
    else
        echo -e "\n${RED}❌ Some tests FAILED. Check logs above.${NC}"
    fi
    
    echo -e "\n${BLUE}Next steps:${NC}"
    echo "1. Review n8n workflow logs"
    echo "2. Verify all credentials are configured"
    echo "3. Check that sessionId is propagated through all nodes"
    echo "4. Monitor portal access after payment"
}

# ========== MAIN EXECUTION ==========
echo -e "
${BLUE}╔════════════════════════════════════════════════════════════════════════════╗${NC}
${BLUE}║                 LEGADO_Wizard v2 Integration Tests                         ║${NC}
${BLUE}║                        Started: $TIMESTAMP                        ║${NC}
${BLUE}╚════════════════════════════════════════════════════════════════════════════╝${NC}
"

passed=0
failed=0

if test_webhook_reachability; then ((passed++)); else ((failed++)); fi
if test_wizard_webhook_payload; then ((passed++)); else ((failed++)); fi
if test_stripe_webhook_payload; then ((passed++)); else ((failed++)); fi
if test_stripe_webhook_failed; then ((passed++)); else ((failed++)); fi

show_summary $passed $failed

echo -e "\nCompleted at: $(date '+%Y-%m-%d %H:%M:%S')\n"
