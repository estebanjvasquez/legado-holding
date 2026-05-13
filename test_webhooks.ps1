# =============================================================================
# TEST WEBHOOKS — LEGADO_Wizard v2 Integration Tests
# 
# Ejecutar con: powershell -ExecutionPolicy Bypass -File test_webhooks.ps1
# =============================================================================

$ErrorActionPreference = "Stop"
$WarningPreference = "SilentlyContinue"

# Configuration
$WEBHOOK_BASE_URL = "https://vmi2945958.contaboserver.net"
$WIZARD_WEBHOOK = "$WEBHOOK_BASE_URL/webhook/legado-wizard"
$STRIPE_WEBHOOK = "$WEBHOOK_BASE_URL/webhook/stripe-webhook-legado"
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Colors for output
$GREEN = "Green"
$RED = "Red"
$YELLOW = "Yellow"
$BLUE = "Cyan"

function Write-Header {
    param([string]$Text)
    Write-Host "`n" -NoNewline
    Write-Host ("=" * 80) -ForegroundColor $BLUE
    Write-Host $Text -ForegroundColor $BLUE
    Write-Host ("=" * 80) -ForegroundColor $BLUE
}

function Write-TestResult {
    param([string]$TestName, [string]$Status, [string]$Message)
    $Color = if ($Status -eq "PASS") { $GREEN } else { $RED }
    Write-Host "[$Status] $TestName" -ForegroundColor $Color
    if ($Message) { Write-Host "  → $Message" -ForegroundColor $YELLOW }
}

function Test-WebhookReachability {
    Write-Header "TEST 1: Webhook Reachability"
    
    try {
        Write-Host "Testing WIZARD webhook: $WIZARD_WEBHOOK"
        $response1 = Invoke-WebRequest -Uri $WIZARD_WEBHOOK -Method Options -TimeoutSec 5 -SkipHttpErrorCheck
        $status1 = $response1.StatusCode
        Write-TestResult "WIZARD webhook" "PASS" "Status: $status1"
    } catch {
        Write-TestResult "WIZARD webhook" "FAIL" $_.Exception.Message
        return $false
    }
    
    try {
        Write-Host "Testing STRIPE webhook: $STRIPE_WEBHOOK"
        $response2 = Invoke-WebRequest -Uri $STRIPE_WEBHOOK -Method Options -TimeoutSec 5 -SkipHttpErrorCheck
        $status2 = $response2.StatusCode
        Write-TestResult "STRIPE webhook" "PASS" "Status: $status2"
    } catch {
        Write-TestResult "STRIPE webhook" "FAIL" $_.Exception.Message
        return $false
    }
    
    return $true
}

function Test-WizardWebhookPayload {
    Write-Header "TEST 2: Wizard Webhook Payload (User Purchase)"
    
    $sessionId = "sess_$(Get-Date -Format yyyyMMddHHmmss)_$([guid]::NewGuid().ToString().Substring(0, 8))"
    
    $payload = @{
        plan = "esencial-zulia"
        email = "test-$(Get-Random)@example.com"
        amount = 4990
        currency = "usd"
        paymentType = "card"
        firstName = "Test"
        lastName = "Customer"
        phone = "+1234567890"
        sessionId = $sessionId
    } | ConvertTo-Json
    
    Write-Host "Sending payload to: $WIZARD_WEBHOOK"
    Write-Host "Session ID: $sessionId"
    Write-Host "Payload: $payload" -ForegroundColor $YELLOW
    
    try {
        $response = Invoke-WebRequest -Uri $WIZARD_WEBHOOK `
            -Method Post `
            -Headers @{"Content-Type" = "application/json"} `
            -Body $payload `
            -TimeoutSec 10 `
            -SkipHttpErrorCheck
        
        $statusCode = $response.StatusCode
        $responseBody = $response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
        
        if ($statusCode -eq 200) {
            Write-TestResult "Wizard webhook" "PASS" "Status: $statusCode"
            Write-Host "Response:" -ForegroundColor $BLUE
            Write-Host ($responseBody | ConvertTo-Json -Depth 3) -ForegroundColor $GREEN
            return $true
        } else {
            Write-TestResult "Wizard webhook" "FAIL" "Status: $statusCode - Expected 200"
            Write-Host "Response: $($response.Content)" -ForegroundColor $RED
            return $false
        }
    } catch {
        Write-TestResult "Wizard webhook" "FAIL" $_.Exception.Message
        return $false
    }
}

function Test-StripeWebhookPayload {
    Write-Header "TEST 3: Stripe Webhook Payload (Payment Succeeded)"
    
    $sessionId = "sess_$(Get-Date -Format yyyyMMddHHmmss)_$([guid]::NewGuid().ToString().Substring(0, 8))"
    $paymentIntentId = "pi_$([guid]::NewGuid().ToString().Substring(0, 13))"
    
    # Simulated Stripe event structure
    $stripeEvent = @{
        id = "evt_$([guid]::NewGuid().ToString().Substring(0, 13))"
        object = "event"
        type = "payment_intent.succeeded"
        data = @{
            object = @{
                id = $paymentIntentId
                object = "payment_intent"
                amount = 4990
                currency = "usd"
                status = "succeeded"
                metadata = @{
                    sessionId = $sessionId
                    plan = "esencial-zulia"
                    paymentType = "card"
                    customerEmail = "test-$(Get-Random)@example.com"
                }
            }
        }
    } | ConvertTo-Json -Depth 5
    
    Write-Host "Sending Stripe event to: $STRIPE_WEBHOOK"
    Write-Host "Session ID: $sessionId"
    Write-Host "Payment Intent ID: $paymentIntentId"
    Write-Host "Event Payload: $stripeEvent" -ForegroundColor $YELLOW
    
    try {
        $response = Invoke-WebRequest -Uri $STRIPE_WEBHOOK `
            -Method Post `
            -Headers @{
                "Content-Type" = "application/json"
                "X-Stripe-Signature" = "test_signature" # Would be real sig in prod
            } `
            -Body $stripeEvent `
            -TimeoutSec 10 `
            -SkipHttpErrorCheck
        
        $statusCode = $response.StatusCode
        
        if ($statusCode -eq 200) {
            Write-TestResult "Stripe webhook (success)" "PASS" "Status: $statusCode"
            Write-Host "Event processed successfully" -ForegroundColor $GREEN
            return $true
        } else {
            Write-TestResult "Stripe webhook (success)" "FAIL" "Status: $statusCode - Expected 200"
            Write-Host "Response: $($response.Content)" -ForegroundColor $RED
            return $false
        }
    } catch {
        Write-TestResult "Stripe webhook (success)" "FAIL" $_.Exception.Message
        return $false
    }
}

function Test-StripeWebhookFailedPayment {
    Write-Header "TEST 4: Stripe Webhook Payload (Payment Failed)"
    
    $sessionId = "sess_$(Get-Date -Format yyyyMMddHHmmss)_$([guid]::NewGuid().ToString().Substring(0, 8))"
    $paymentIntentId = "pi_$([guid]::NewGuid().ToString().Substring(0, 13))"
    
    # Simulated Stripe event for failed payment
    $stripeEvent = @{
        id = "evt_$([guid]::NewGuid().ToString().Substring(0, 13))"
        object = "event"
        type = "payment_intent.payment_failed"
        data = @{
            object = @{
                id = $paymentIntentId
                object = "payment_intent"
                amount = 4990
                currency = "usd"
                status = "requires_payment_method"
                last_payment_error = @{
                    message = "Your card was declined"
                }
                metadata = @{
                    sessionId = $sessionId
                    plan = "esencial-zulia"
                    paymentType = "card"
                    customerEmail = "test-$(Get-Random)@example.com"
                }
            }
        }
    } | ConvertTo-Json -Depth 5
    
    Write-Host "Sending failed payment event to: $STRIPE_WEBHOOK"
    Write-Host "Session ID: $sessionId"
    Write-Host "Payment Intent ID: $paymentIntentId"
    Write-Host "Event Payload: $stripeEvent" -ForegroundColor $YELLOW
    
    try {
        $response = Invoke-WebRequest -Uri $STRIPE_WEBHOOK `
            -Method Post `
            -Headers @{
                "Content-Type" = "application/json"
                "X-Stripe-Signature" = "test_signature"
            } `
            -Body $stripeEvent `
            -TimeoutSec 10 `
            -SkipHttpErrorCheck
        
        $statusCode = $response.StatusCode
        
        if ($statusCode -eq 200) {
            Write-TestResult "Stripe webhook (failed)" "PASS" "Status: $statusCode"
            Write-Host "Failed payment handled successfully" -ForegroundColor $GREEN
            return $true
        } else {
            Write-TestResult "Stripe webhook (failed)" "FAIL" "Status: $statusCode - Expected 200"
            Write-Host "Response: $($response.Content)" -ForegroundColor $RED
            return $false
        }
    } catch {
        Write-TestResult "Stripe webhook (failed)" "FAIL" $_.Exception.Message
        return $false
    }
}

function Test-Idempotence {
    Write-Header "TEST 5: Idempotence Test (Duplicate Delivery)"
    
    $sessionId = "sess_$(Get-Date -Format yyyyMMddHHmmss)_$([guid]::NewGuid().ToString().Substring(0, 8))"
    $paymentIntentId = "pi_$([guid]::NewGuid().ToString().Substring(0, 13))"
    
    $stripeEvent = @{
        id = "evt_same_123456789"
        object = "event"
        type = "payment_intent.succeeded"
        data = @{
            object = @{
                id = $paymentIntentId
                object = "payment_intent"
                amount = 4990
                currency = "usd"
                status = "succeeded"
                metadata = @{
                    sessionId = $sessionId
                    plan = "esencial-zulia"
                    paymentType = "card"
                    customerEmail = "test-$(Get-Random)@example.com"
                }
            }
        }
    } | ConvertTo-Json -Depth 5
    
    Write-Host "Sending same event twice to test idempotence..."
    Write-Host "Session ID: $sessionId"
    
    try {
        # First delivery
        $response1 = Invoke-WebRequest -Uri $STRIPE_WEBHOOK `
            -Method Post `
            -Headers @{"Content-Type" = "application/json"} `
            -Body $stripeEvent `
            -TimeoutSec 10 `
            -SkipHttpErrorCheck
        
        Start-Sleep -Seconds 2
        
        # Second delivery (same event)
        $response2 = Invoke-WebRequest -Uri $STRIPE_WEBHOOK `
            -Method Post `
            -Headers @{"Content-Type" = "application/json"} `
            -Body $stripeEvent `
            -TimeoutSec 10 `
            -SkipHttpErrorCheck
        
        if ($response1.StatusCode -eq 200 -and $response2.StatusCode -eq 200) {
            Write-TestResult "Idempotence" "PASS" "Both deliveries processed (should use sessionId as unique key)"
            Write-Host "Note: Verify in n8n logs that only ONE invoice was created" -ForegroundColor $YELLOW
            return $true
        } else {
            Write-TestResult "Idempotence" "FAIL" "Unexpected status codes: $($response1.StatusCode), $($response2.StatusCode)"
            return $false
        }
    } catch {
        Write-TestResult "Idempotence" "FAIL" $_.Exception.Message
        return $false
    }
}

function Show-Summary {
    param([int]$Passed, [int]$Failed)
    
    Write-Header "TEST SUMMARY"
    Write-Host "Passed: " -NoNewline -ForegroundColor $GREEN
    Write-Host $Passed -ForegroundColor $GREEN
    Write-Host "Failed: " -NoNewline -ForegroundColor $RED
    Write-Host $Failed -ForegroundColor $RED
    
    if ($Failed -eq 0) {
        Write-Host "`n✅ All tests PASSED!" -ForegroundColor $GREEN
    } else {
        Write-Host "`n❌ Some tests FAILED. Check logs above." -ForegroundColor $RED
    }
    
    Write-Host "`nNext steps:" -ForegroundColor $BLUE
    Write-Host "1. Review n8n workflow logs"
    Write-Host "2. Verify all credentials are configured"
    Write-Host "3. Check that sessionId is propagated through all nodes"
    Write-Host "4. Monitor portal access after payment" -ForegroundColor $BLUE
}

# ========== MAIN EXECUTION ==========
Write-Host "
╔════════════════════════════════════════════════════════════════════════════╗
║                 LEGADO_Wizard v2 Integration Tests                         ║
║                        Started: $TIMESTAMP                        ║
╚════════════════════════════════════════════════════════════════════════════╝
" -ForegroundColor $BLUE

$passed = 0
$failed = 0

# Run all tests
if (Test-WebhookReachability) { $passed++ } else { $failed++ }
if (Test-WizardWebhookPayload) { $passed++ } else { $failed++ }
if (Test-StripeWebhookPayload) { $passed++ } else { $failed++ }
if (Test-StripeWebhookFailedPayment) { $passed++ } else { $failed++ }
if (Test-Idempotence) { $passed++ } else { $failed++ }

# Show summary
Show-Summary $passed $failed

Write-Host "`nCompleted at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n"
