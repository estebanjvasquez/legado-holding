# Onboarding — Legado Holding

> Documento de bienvenida para nuevos miembros del equipo técnico, operativo
> o de soporte. Material base para preparar una presentación de inducción
> (slides) o una sesión de capacitación.

---

## 1. Qué es Legado Holding

**Legado Holding** es una plataforma digital de **previsión funeraria** dirigida
a venezolanos que viven en Estados Unidos y desean dejar protegidos a sus
familiares en Venezuela.

El producto resuelve un problema emocional concreto: muchos venezolanos en EE.
UU. no pueden estar presentes en el momento más difícil para sus familias.
Legado les permite contratar — directamente, sin intermediarios, sin
variaciones de precio — un plan que garantiza atención funeraria profesional
para sus seres queridos.

**Respaldo**: Funeraria del Zulia, con más de 80 años de trayectoria en
Venezuela y aliados en todo el país a través del Grupo Selecto.

**Modelo de negocio**:
- El cliente contrata desde su teléfono o computadora en Estados Unidos.
- Paga con tarjeta de crédito en USD (mensual o anual).
- La cobertura se activa para familiares en Venezuela (hasta 6 personas).

**Idiomas**: el sitio es bilingüe — español (idioma primario) e inglés.

---

## 2. Productos que ofrecemos

| Plan | Cobertura | Precio mensual | Cuota inicial | Edad máxima |
|---|---|---|---|---|
| Esencial Zulia | Región Zulia | $9.47 | — | 65 años |
| Vanguardia Zulia | Región Zulia (titular + 6 familiares, padres hasta 80) | $14.70 | — | 65 / 80 |
| Esencial Selecto | Toda Venezuela | $9.47 | $35 | 65 años |
| Vanguardia Selecto | Toda Venezuela + bóveda en cementerio privado | $14.70 | $55 | 65 años |

> Los precios reales se cargan dinámicamente desde Invoice Ninja. La tabla
> aquí es referencia y puede haberse ajustado.

### Servicios de emergencia (separados del plan)

Para clientes que no tienen un plan contratado y necesitan servicios funerarios
inmediatos, ofrecemos un **catálogo de urgencias** (cremación, velorio,
inhumación, traslado, etc.) facturables uno a uno vía el chatbot Alma.

---

## 3. Quién usa el sistema

### Clientes finales (público externo)
- Venezolanos residentes en EE. UU. que quieren proteger a su familia.
- Acceden vía `legadoholding.com` desde celular o computadora.
- Dos interacciones principales:
  1. **Contratar un plan** (wizard de afiliación de 4 pasos).
  2. **Pedir ayuda urgente** (chatbot rojo "EMERGENCIA" flotante).

### Administradores internos (equipo de Legado)
- Acceden al panel admin con sus credenciales de Invoice Ninja.
- URL: `legadoholding.com/v2/admin/`
- Gestionan: ubicaciones de servicio, aliados/funerarias, configuración del
  agente conversacional, y revisan las conversaciones de los clientes.

### Sistemas y proveedores externos
- **Invoice Ninja v5** (auto-hospedado): catálogo de productos, clientes,
  facturas, envío de email de cobro.
- **Cloudflare Workers**: backend serverless que orquesta todo.
- **Cloudflare DNS/CDN**: enruta el tráfico y proporciona TLS.
- **Google Gemini API**: motor del chatbot Alma (function calling sobre LLM).
- **Supabase**: memoria persistente del chatbot + datos administrativos
  (ubicaciones, aliados, configuración del agente, logs de conversación).
- **cPanel / Apache**: hosting compartido que sirve el sitio estático y el
  Invoice Ninja.

---

## 4. Arquitectura técnica de alto nivel

```
                     ┌──────────────────────────┐
                     │   USUARIO FINAL          │
                     │   (navegador del cliente)│
                     └────┬─────────────────┬───┘
                          │                 │
              GET sitio   │                 │  POST checkout/chat
                          ▼                 ▼
            ┌────────────────────────┐  ┌─────────────────────────────┐
            │  legadoholding.com     │  │  api.legadoholding.com      │
            │  Apache / cPanel       │  │  Cloudflare Worker          │
            │                        │  │  (legado-checkout-dev)      │
            │  index.html · css · js │  │                             │
            │  admin/index.html · js │  │  Rutas:                     │
            │                        │  │   GET  /products            │
            │  Deploy: .cpanel.yml   │  │   GET  /emergency-products  │
            │   en git push a main   │  │   POST /                    │
            └────────────────────────┘  │   POST /chat                │
                                        │   POST /admin/login         │
                                        │   GET/POST/PATCH/DELETE     │
                                        │        /admin/*             │
                                        └──┬──────────┬──────────┬───┘
                                           │          │          │
                            X-API-TOKEN    │   Gemini │   Supabase
                                           ▼   API    ▼          ▼
                            ┌──────────────────────┐  ┌──────────────────┐
                            │ INVOICE NINJA v5     │  │ Google Gemini    │
                            │ invoicing.legadoh... │  │ + Supabase DB    │
                            │ (mismo cPanel)       │  │                  │
                            │                      │  │ Memoria del bot, │
                            │ Productos, clientes, │  │ logs, config y   │
                            │ facturas, emails     │  │ catálogo aliados │
                            └──────────────────────┘  └──────────────────┘
```

### Componentes y responsabilidades

| # | Componente | Función |
|---|---|---|
| 1 | **Frontend estático** | Sitio público (`legadoholding.com`) + panel admin (`/v2/admin/`). HTML/CSS/JS puro, sin frameworks. |
| 2 | **Cloudflare Worker** | Backend serverless en `api.legadoholding.com`. Oculta credenciales de IN, orquesta checkout, corre el agente Alma con function calling, y expone los endpoints administrativos. |
| 3 | **Invoice Ninja v5** | Sistema oficial de facturación. Mantiene clientes, productos (planes y servicios de urgencia), facturas recurrentes y plantillas de email. También es la fuente de verdad de **quién es admin** del panel. |
| 4 | **Gemini API** | Motor del agente conversacional Alma. El Worker hace function calling con tools que consultan productos y ubicaciones, y emiten facturas. |
| 5 | **Supabase** | Base de datos PostgreSQL gestionada. Persiste: `chat_sessions` (estado del bot), `chat_turns` (log de cada turno), `agent_config` (parámetros del bot editables desde admin), `locations` y `partners` (ubicaciones y funerarias aliadas). |
| 6 | **Cloudflare DNS + CDN** | Manejo de dominios, TLS, proxying del Worker y caché del frontend. |
| 7 | **Apache / cPanel** | Hosting compartido del proveedor. Sirve los archivos estáticos del sitio y aloja Invoice Ninja en el mismo servidor. |

### Por qué esta arquitectura

- **Cero servidores propios que mantener**: Workers + IN auto-hosted + cPanel
  cubren todo. No hay infraestructura adicional que parchar, monitorear o
  pagar por encima del plan gratuito de Cloudflare.
- **Token de IN seguro**: el `X-API-TOKEN` que da acceso completo a IN nunca
  llega al navegador del cliente. Vive como secret cifrado en Cloudflare.
- **Latencia baja**: el Worker corre en el data center de Cloudflare más
  cercano al usuario (red de ~300 PoPs globales).
- **Mismo lenguaje en todo el stack**: 100% JavaScript desde el frontend al
  backend.

---

## 5. Flujos principales

### 5.1 Compra de un plan (wizard)

```
1. Cliente entra a legadoholding.com
2. Ve los planes (precios cargados en vivo desde IN vía Worker)
3. Click "Comprar" → modal de 4 pasos:
   Paso 1: Datos del titular (nombre, cédula, email, teléfono, etc.)
   Paso 2: Familiares a cubrir (hasta 6)
   Paso 3: Forma de pago (mensual o anual)
   Paso 4: Revisión + aceptación de términos
4. Worker recibe el checkout:
   a. Busca o crea al cliente en IN
   b. Genera la factura recurrente
   c. Dispara el email con enlace de pago
5. Cliente recibe email → paga en el portal de IN → suscripción activa
```

### 5.2 Chatbot de emergencia (Alma)

```
1. Cliente con familiar fallecido o en emergencia clica el botón rojo
   flotante "EMERGENCIA"
2. Alma saluda y pregunta qué pasó
3. Conversación natural: Alma recolecta nombre, contacto, ubicación, servicios
   requeridos (cremación, velorio, etc.) y religión
4. Alma consulta el catálogo de urgencias en IN (vía function calling)
5. Muestra resumen con precios al cliente
6. Si el cliente confirma:
   a. Worker crea cliente nuevo en IN (o reusa si ya existe)
   b. Genera factura única con los servicios seleccionados
   c. Envía email con enlace de pago
   d. Muestra botón "Pagar ahora" en el chat
```

### 5.3 Administración del sistema

```
1. Admin entra a legadoholding.com/v2/admin/
2. Login con email + password de su cuenta IN (debe tener is_admin=true)
3. Cuatro pestañas:
   - Ubicaciones: ciudades/estados donde tenemos cobertura
   - Aliados: funerarias y proveedores asociados
   - Agente: configuración del bot Alma (tono, respuestas, etc.)
   - Conversaciones: histórico de chats con clientes
```

Ver [admin-manual.md](admin-manual.md) para el detalle operativo.

---

## 6. Idiomas del proyecto y convenciones

- **Idioma primario del producto**: español de Venezuela.
- **Inglés**: traducción completa de la web pública (toggle en la nav).
- **Documentación interna y commits**: español.
- **Código**: identificadores en inglés; comentarios en español cuando aclaran
  decisiones de diseño.
- **Commits**: formato Conventional Commits en español
  (`feat(admin):`, `fix(emergency):`, `chore(...):`).

---

## 7. Stack técnico resumido

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | HTML5 + CSS3 + JavaScript ES2017+ vanilla | Sin build step, fácil de desplegar, sin sorpresas |
| Backend | Cloudflare Workers (V8 isolates) | Edge computing, sin servidor, escala automáticamente |
| LLM | Google Gemini (`gemini-2.5-flash`) | Costo/latencia razonables, function calling sólido |
| BD operativa | Invoice Ninja v5 (MySQL) | Fuente de verdad de clientes, productos, facturas |
| BD del bot | Supabase (PostgreSQL) | Estado de sesiones, logs, datos administrativos |
| DNS / CDN | Cloudflare | Mismo proveedor del Worker, integración nativa |
| Hosting estático | Apache via cPanel | Hosting compartido, suficiente para sitio estático |

---

## 8. Quién hace qué dentro del equipo

| Rol | Responsabilidades |
|---|---|
| **Owner / Founder** (Esteban Vásquez) | Decisiones de producto, dirección estratégica, gestión comercial |
| **Equipo técnico** | Desarrollo del frontend, Worker, integraciones; ops del Worker (deploys, logs); ajustes al bot |
| **Equipo operativo (admin del panel)** | Mantener ubicaciones y aliados actualizados; ajustar el tono y respuestas del bot; revisar conversaciones para detectar problemas |
| **Equipo comercial / soporte** | Atender a clientes que llegan por el chatbot o llaman; coordinar con funerarias aliadas |

---

## 9. Glosario

| Término | Significado |
|---|---|
| **IN** | Invoice Ninja — sistema de facturación auto-hospedado |
| **Worker** | El Cloudflare Worker en `api.legadoholding.com` |
| **Alma** | Nombre del agente conversacional (chatbot de emergencia) |
| **Wizard** | Modal de 4 pasos para contratar un plan |
| **CompanyUser** | Concepto de IN: un usuario asociado a una empresa, con permisos (incluye `is_admin`) |
| **Plan Selecto** | Planes con cuota inicial + mensualidad (Toda Venezuela) |
| **Plan Zulia** | Planes con solo mensualidad (Región Zulia) |
| **Aliado** | Funeraria o proveedor asociado en una ciudad específica de Venezuela |
| **Function calling** | Mecanismo de Gemini para que el bot ejecute "tools" (funciones JS en el Worker) |
| **Turn** | Cada mensaje individual en una conversación con Alma |
| **Session** | Una conversación completa, identificada por `sessionId` |

---

## 10. Próximos pasos para alguien nuevo

1. **Leer este documento completo** — contexto general.
2. **Probar la web pública** como cliente:
   - Abrir `legadoholding.com`
   - Toggle ES/EN
   - Iniciar un wizard sin completarlo (Paso 1 → Atrás → cerrar)
   - Click en EMERGENCIA y chatear con Alma sobre un caso hipotético
3. **Pedir acceso al panel admin** — tu cuenta IN debe estar como
   `is_admin=true`. Solicítalo al owner.
4. **Leer el manual relevante**:
   - Técnico → [README.md](../README.md)
   - Operativo (admin) → [admin-manual.md](admin-manual.md)
   - Comercial / soporte → [user-manual.md](user-manual.md)
5. **Acceso a sistemas externos** que puedas necesitar:
   - Cloudflare dash (para purgar caché, ver logs del Worker)
   - Invoice Ninja admin (`invoicing.legadoholding.com`)
   - Supabase (para inspeccionar datos del bot)
   - GitHub repo (para revisar/contribuir código)

---

## 11. Contactos clave

> Sección a completar internamente: emails, teléfonos y canales (Slack / WhatsApp)
> de los integrantes del equipo y proveedores externos. No se incluyen aquí por
> privacidad.

---

**Última actualización**: junio 2026 · revisar y ajustar cuando cambie la
arquitectura o el stack.
