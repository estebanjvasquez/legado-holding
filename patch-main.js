// PATCH: Agregar fallback mock para PaymentIntent cuando webhook no está disponible
// Apply this change to js/main.js around line 1543-1556

// REEMPLAZAR este bloque:
/*
          const resp = await fetch(WIZARD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!resp.ok) throw new Error("HTTP " + resp.status);
          const data = await resp.json().catch(() => ({}));

          if (data?.client_secret) {
*/

// CON este nuevo código:
/*
          let data = {};
          let useMock = false;

          try {
            const resp = await fetch(WIZARD_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!resp.ok) {
              console.warn("Webhook HTTP error:", resp.status, "- using mock");
              useMock = true;
            } else {
              data = await resp.json().catch(() => ({}));
              console.log("Webhook response:", data);
            }
          } catch (err) {
            console.warn("Webhook fetch error:", err.message, "- using mock");
            useMock = true;
          }

          // Use mock if webhook unavailable or no client_secret in response
          if (useMock || !data?.client_secret) {
            console.log("=== Using TEST client_secret (mock) ===");
            const mockId = "pi_test_" + Date.now();
            const mockSecret = mockId + "_secret_" + Math.random().toString(36).substr(2, 9);
            __wizardClientSecret = mockSecret;
            showToast("TEST MODE: Using mock payment", "info");
            wizardCardConfirmStep = "stripe-form";
            renderCardConfirmStep();
            updateCardConfirmFooter();
          } else if (data?.client_secret) {
*/
