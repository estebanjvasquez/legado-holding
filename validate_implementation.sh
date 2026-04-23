#!/bin/bash
# ============================================================================
# Pre-Implementation Validation Script
# Checks that everything is ready for LEGADO_Wizard v2 deployment
# ============================================================================

set -euo pipefail

WEBHOOK_BASE_URL="https://vmi2945958.contaboserver.net"
WIZARD_WEBHOOK="$WEBHOOK_BASE_URL/webhook/legado-wizard"
STRIPE_WEBHOOK="$WEBHOOK_BASE_URL/webhook/stripe-webhook-legado"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

# Status tracking
PASSED=0
FAILED=0

echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  PRE-IMPLEMENTATION VALIDATION                             ║${NC}"
echo -e "${BLUE}║  LEGADO_Wizard v2 Deployment Readiness Check              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"

# ============================================================================
# 1. Check Files Exist
# ============================================================================
echo -e "${YELLOW}[1] Checking required files...${NC}"

files=(
    "js/main.js"
    "n8n_workflow_legado_wizard_v2.json"
    "payloads_config.json"
    "WORKFLOW_CORRECTIONS_SPEC.md"
    "SUMMARY_CHANGES_N8N.md"
    "IMPLEMENTACION_GUIA.md"
    "DEPLOYMENT_CHECKLIST.md"
    "TEST_REPORT.md"
    "test_webhooks.sh"
    "test_webhooks.ps1"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✓${NC} $file"
        ((PASSED++))
    else
        echo -e "  ${RED}✗${NC} $file (MISSING)"
        ((FAILED++))
    fi
done

# ============================================================================
# 2. Check Webhook URLs in Code
# ============================================================================
echo -e "\n${YELLOW}[2] Checking webhook URLs in code...${NC}"

if grep -q "webhook/legado-wizard" js/main.js; then
    echo -e "  ${GREEN}✓${NC} WIZARD_WEBHOOK_URL correct in js/main.js"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} WIZARD_WEBHOOK_URL not found or incorrect"
    ((FAILED++))
fi

if grep -q "webhook/stripe-webhook-legado" js/main.js; then
    echo -e "  ${GREEN}✓${NC} STRIPE_WEBHOOK_URL found in js/main.js"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} STRIPE_WEBHOOK_URL not found"
    ((FAILED++))
fi

# ============================================================================
# 3. Check JSON Syntax
# ============================================================================
echo -e "\n${YELLOW}[3] Validating JSON files...${NC}"

if jq . n8n_workflow_legado_wizard_v2.json > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} n8n_workflow_legado_wizard_v2.json valid JSON"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} n8n_workflow_legado_wizard_v2.json invalid JSON"
    ((FAILED++))
fi

if jq . payloads_config.json > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} payloads_config.json valid JSON"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} payloads_config.json invalid JSON"
    ((FAILED++))
fi

# ============================================================================
# 4. Test Webhook Reachability
# ============================================================================
echo -e "\n${YELLOW}[4] Testing webhook reachability...${NC}"

WIZARD_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -I "$WIZARD_WEBHOOK" 2>/dev/null || echo "000")
STRIPE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -I "$STRIPE_WEBHOOK" 2>/dev/null || echo "000")

if [ "$WIZARD_RESPONSE" != "000" ] && [ "$WIZARD_RESPONSE" != "404" ]; then
    echo -e "  ${GREEN}✓${NC} WIZARD webhook reachable (HTTP $WIZARD_RESPONSE)"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} WIZARD webhook not responding (HTTP $WIZARD_RESPONSE)"
    echo -e "     Note: This is OK if n8n not yet configured"
fi

if [ "$STRIPE_RESPONSE" != "000" ] && [ "$STRIPE_RESPONSE" != "404" ]; then
    echo -e "  ${GREEN}✓${NC} STRIPE webhook reachable (HTTP $STRIPE_RESPONSE)"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} STRIPE webhook not responding (HTTP $STRIPE_RESPONSE)"
    echo -e "     Note: This is OK if n8n not yet configured"
fi

# ============================================================================
# 5. Check Git Status
# ============================================================================
echo -e "\n${YELLOW}[5] Checking git repository...${NC}"

if [ -d ".git" ]; then
    echo -e "  ${GREEN}✓${NC} Git repository found"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} Not a git repository"
    ((FAILED++))
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [ "$CURRENT_BRANCH" = "fix/webhooks-env" ] || [ "$CURRENT_BRANCH" = "main" ]; then
    echo -e "  ${GREEN}✓${NC} On correct branch: $CURRENT_BRANCH"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} On branch: $CURRENT_BRANCH (expected fix/webhooks-env or main)"
fi

if git status --porcelain | grep -q "js/main.js"; then
    echo -e "  ${GREEN}✓${NC} js/main.js has changes"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} js/main.js may not have changes"
fi

# ============================================================================
# 6. Check Documentation
# ============================================================================
echo -e "\n${YELLOW}[6] Validating documentation completeness...${NC}"

docs=(
    "WORKFLOW_CORRECTIONS_SPEC.md:Node-by-node implementation"
    "SUMMARY_CHANGES_N8N.md:10 key changes"
    "IMPLEMENTACION_GUIA.md:4-phase guide"
    "DEPLOYMENT_CHECKLIST.md:Implementation tracker"
    "TEST_REPORT.md:Test results"
)

for doc_info in "${docs[@]}"; do
    IFS=':' read -r doc_file doc_desc <<< "$doc_info"
    if [ -f "$doc_file" ] && [ -s "$doc_file" ]; then
        echo -e "  ${GREEN}✓${NC} $doc_file ($doc_desc)"
        ((PASSED++))
    else
        echo -e "  ${RED}✗${NC} $doc_file (incomplete or missing)"
        ((FAILED++))
    fi
done

# ============================================================================
# 7. Check Test Scripts
# ============================================================================
echo -e "\n${YELLOW}[7] Validating test scripts...${NC}"

if [ -f "test_webhooks.sh" ] && [ -x "test_webhooks.sh" ]; then
    echo -e "  ${GREEN}✓${NC} test_webhooks.sh executable"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} test_webhooks.sh not executable"
    echo -e "     Run: chmod +x test_webhooks.sh"
fi

if [ -f "test_webhooks.ps1" ]; then
    echo -e "  ${GREEN}✓${NC} test_webhooks.ps1 found (Windows)"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} test_webhooks.ps1 missing"
    ((FAILED++))
fi

# ============================================================================
# Summary
# ============================================================================
TOTAL=$((PASSED + FAILED))
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  VALIDATION RESULTS                                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

echo -e "\nPassed:  ${GREEN}$PASSED${NC}"
echo -e "Failed:  ${RED}$FAILED${NC}"
echo -e "Total:   $TOTAL"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✅ ALL CHECKS PASSED - Ready for implementation!${NC}\n"
    exit 0
else
    echo -e "\n${RED}❌ Some checks failed - Please address issues above${NC}\n"
    exit 1
fi
