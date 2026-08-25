# Guía de especificaciones web - LEGADO

> **Propósito:** instrucciones de marca, contenido, experiencia y criterios de aceptación para crear o modificar el sitio web de LEGADO. Este documento traduce el *Brandbook Identity* y la *Campaña Digital 2026* a decisiones implementables.  
> **Audiencia:** diseño UX/UI, desarrollo, contenidos, SEO, paid media y QA.  
> **Idioma inicial:** español dirigido a venezolanos residentes en Estados Unidos. Preparar desde el inicio la localización al inglés, sin traducir literalmente mensajes emocionales.

---

## 1. Norte de marca

### 1.1 Objetivo de negocio

Posicionar a **LEGADO** como el punto digital confiable para que venezolanos en Estados Unidos protejan y gestionen, desde la distancia, el bienestar y la previsión funeraria de su familia en Venezuela. La web no debe presentar solamente un catálogo funerario: debe facilitar una decisión responsable, clara y humana.

### 1.2 Promesa central

**Uniendo familias, honrando vidas, preservando memorias.**

La narrativa debe comunicar cuatro ideas que se refuerzan entre sí:

1. **Respaldo comprobable:** experiencia histórica de Funeraria del Zulia (desde 1944; más de 80 años).
2. **Conexión cultural:** entiende las costumbres venezolanas y habla el idioma del cliente.
3. **Cercanía operativa:** aunque el contratante esté fuera, sus familiares en Venezuela reciben atención local y respetuosa.
4. **Facilidad digital:** contratar, pagar y seguir la gestión es sencillo, transparente y móvil.

### 1.3 Propuesta única de valor

LEGADO reúne la experiencia y sensibilidad de Funeraria del Zulia, adaptada a una contratación internacional, con respeto a la cultura venezolana y apoyo integral a las familias. La propuesta se sostiene en **tradición + tecnología + accesibilidad**.

### 1.4 Audiencias prioritarias

| Prioridad | Audiencia | Contexto | Necesidad que debe resolver la página |
|---|---|---|---|
| Primaria | Venezolanos en EE. UU., inicialmente Florida y Texas | Adultos que tienen padres, abuelos u otros familiares en Venezuela | Saber que pueden cuidarles sin viajar ni afrontar trámites confusos. |
| Secundaria | Comunidad latina en EE. UU. | Valora atención humana, tradiciones y calidad | Entender que existe un servicio serio, comprensible y accesible. |
| Tercera | Familiares en Venezuela | Son beneficiarios o interlocutores locales | Confirmar cobertura y recibir instrucciones claras de atención. |

**No estereotipar.** Las campañas pueden representar perfiles reales de la diáspora (construcción, limpieza, conducción, profesionales, padres), pero la interfaz debe ser inclusiva y digna para todo nivel socioeconómico.

---

## 2. Personalidad, tono y reglas de lenguaje

### 2.1 Rasgos obligatorios

- **Empática:** reconoce la distancia y el momento sensible, sin dramatizarlo.
- **Confiable:** explica con precisión, evidencia y lenguaje directo.
- **Respetuosa:** honra distintas creencias, tradiciones y situaciones familiares.
- **Profesional:** transmite ejecución impecable, privacidad y claridad.
- **Cercana:** habla como una persona que acompaña, no como una aseguradora fría.

### 2.2 Voz de marca

Usar español claro latinoamericano, frases cortas y verbos concretos. El tono es serio, sereno, informativo y reconfortante. Tratar al usuario de **tú** de forma consistente.

| Hacer | Evitar |
|---|---|
| «Estamos contigo para cuidar a los tuyos en Venezuela.» | «Adquiera un servicio funerario de forma inmediata.» |
| «Conoce qué incluye tu plan antes de contratar.» | «Cobertura integral» sin especificar alcance. |
| «Contrata desde tu celular con acompañamiento humano.» | «Proceso totalmente automatizado» como sustituto de la ayuda humana. |
| «Precios claros. Sin costos ocultos.» | Urgencias artificiales, culpa, miedo o frases alarmistas. |
| «Honramos cada vida y respetamos cada familia.» | Eufemismos confusos o tecnicismos sin explicación. |

### 2.3 Mensajes autorizados

- «Uniendo familias, honrando vidas, preservando memorias.»
- «Tu historia no tiene fronteras.»
- «El amor es el legado que se planifica.»
- «Cerca de ti y los tuyos, siempre.»
- «La calidad no cuesta más.»
- «Contratación 100% digital y rápida.»
- «Sin costos adicionales ocultos.»

**Regla:** todo mensaje sobre cobertura, precios, pago, disponibilidad, regulación o tiempo de respuesta requiere validación del área comercial/legal antes de publicarse. No afirmar «en 3 clics», «en minutos», «sin costos adicionales» o «cobertura total» si el flujo real no lo demuestra.

---

## 3. Sistema visual

### 3.1 Paleta digital base

La paleta confirmada en el brandbook debe implementarse como tokens reutilizables. El azul marino es la base; los demás colores funcionan como apoyo y respiración visual.

| Token | HEX | Uso principal | Uso prohibido o limitado |
|---|---:|---|---|
| `--legado-navy` | `#263C5B` | Fondo de encabezados, botones principales, enlaces destacados, pie de página, textos sobre fondo claro. | No usar para bloques extensos de texto pequeño sobre negro u otras superficies oscuras. |
| `--legado-blue-mist` | `#A4B6C2` | Fondos secundarios, tarjetas informativas, etiquetas, divisores suaves. | No usar como texto pequeño sobre blanco: contraste insuficiente. |
| `--legado-gray` | `#C2C3C3` | Bordes, tablas, fondos de áreas neutras, iconos secundarios. | No emplear como único indicador de estado o error. |
| `--legado-warm-white` | `#F3F2EE` | Fondo general cálido, secciones de lectura, formularios. | No reemplaza el blanco puro cuando se necesita contraste máximo. |
| `--white` | `#FFFFFF` | Texto sobre azul marino, superficies de formularios y modales. | No usar sin separación visual sobre fondos muy claros. |
| `--ink` | `#17243A` | Texto de cuerpo y datos críticos. | Mantener como color de contenido, no como sustituto del azul de marca. |

**Dorado:** el material de campaña sugiere dorado como acento de dignidad. No se ha entregado un valor de producción definitivo. Hasta su aprobación, no inventar un dorado para logo o elementos de marca. Si se requiere un acento temporal, usar un tono de la paleta existente y marcarlo como pendiente de aprobación.

### 3.2 Accesibilidad de color

- Cumplir WCAG 2.2 AA: contraste mínimo **4.5:1** para texto normal y **3:1** para texto grande, controles y foco visible.
- Todo botón primario debe ser azul marino con texto blanco, o una combinación comprobada equivalente.
- No comunicar éxito, error, cobertura o pasos solo mediante color: añadir icono y texto.
- Definir estado de foco visible, por ejemplo anillo claro de 3 px sobre elementos azul marino y anillo azul marino sobre fondos claros.

### 3.3 Logotipo y símbolos

El logotipo representa el consorcio mediante tres círculos concéntricos: continuidad/protección, memoria y proceso de cremación. Usar siempre los archivos maestros vectoriales autorizados; no reconstruir el logo con CSS ni extraerlo de capturas.

- Preferir versión blanca sobre `--legado-navy` o fotografía oscura controlada.
- Preferir versión azul marino sobre blanco o `--legado-warm-white`.
- Mantener un área libre alrededor igual, como mínimo, al ancho del aro interior del símbolo.
- No deformar, cambiar colores, añadir sombras, contornos, degradados, animación constante ni colocar sobre fotos de bajo contraste.
- En la cabecera móvil, conservar símbolo + nombre; no sustituirlo por texto plano salvo fallback accesible.

### 3.4 Tipografía

- **Logotipo:** `Hardmix Regular`, únicamente si se dispone de licencia web válida y archivo autorizado. Reservada para la marca; no usarla como cuerpo de texto.
- **Interfaz y lectura:** usar una sans serif web accesible, preferentemente `Inter`, con fallback `Arial, sans-serif`.
- **Titulares editoriales opcionales:** una serif sobria, solo tras aprobación, que acompañe la estética del logo sin competir con él. No utilizar una fuente decorativa.

| Rol | Familia | Peso/tamaño sugerido | Reglas |
|---|---|---|---|
| H1 | Inter | 600-700; 40-56 px escritorio, 32-40 px móvil | Máximo 2 líneas en hero. |
| H2 | Inter | 600-700; 28-36 px | Separar secciones principales. |
| H3 | Inter | 600; 20-24 px | Títulos de tarjetas y FAQs. |
| Cuerpo | Inter | 400; 16-18 px; interlineado 1.5-1.7 | Ningún texto base menor de 16 px. |
| Metadatos | Inter | 500; 14-16 px | No usar para información contractual crítica. |

---

## 4. Dirección de arte y contenido visual

### 4.1 Sensación visual

Sobria, cálida, contemporánea y humana. La web debe equilibrar espacio en blanco, azul marino y fotografía auténtica. La emoción viene de gestos y vínculos, no de imágenes explícitas de duelo.

### 4.2 Fotografía y vídeo

**Priorizar:** manos unidas, videollamadas, familias multigeneracionales, un adulto en EE. UU. conectado con familiares en Venezuela, atención humana, móvil mostrando una interfaz real, calles o referencias sutiles de ambas geografías.

**Evitar:** féretros como recurso principal, lloros explícitos, hospitales, clichés lúgubres, imágenes excesivamente oscuras, stock genérico sin diversidad cultural, monumentos como decoración vacía, y fotos que parezcan prometer algo no incluido.

### 4.3 Recursos narrativos permitidos

- **El hilo que nos une:** pantalla dividida EE. UU./Venezuela y un gesto común.
- **La herencia de lo invisible:** previsión como acto de cuidado y responsabilidad.
- **Uniendo familias:** el servicio elimina barreras logísticas y permite acompañar.

Utilizar estos conceptos como módulos de campaña, no todos a la vez en la portada. Cada landing debe tener **una narrativa principal, una promesa y un CTA**.

---

## 5. Arquitectura recomendada del sitio

### 5.1 Navegación principal

1. Inicio
2. Planes de previsión
3. Servicios
4. Cómo funciona
5. Para familias en EE. UU.
6. Recursos y preguntas frecuentes
7. Nosotros
8. Contacto / Ayuda inmediata

Acciones persistentes de cabecera:

- CTA principal: **«Protege tu legado aquí»** o **«Conoce tu plan»**.
- CTA secundario: **«Hablar con un asesor»**.
- Selector ES/EN cuando se habilite inglés.
- Teléfono/WhatsApp solo si existe un canal atendido y con horarios visibles.

### 5.2 Página de inicio: orden y componentes

1. **Hero:** propuesta concreta + 1 CTA principal + 1 CTA humano. Ejemplo: «Cuida a los tuyos en Venezuela, estés donde estés.»
2. **Prueba de confianza:** «Respaldo de Funeraria del Zulia desde 1944» + marcas del consorcio + datos solo verificables.
3. **Qué resuelve LEGADO:** tres pilares: tradición, tecnología, accesibilidad.
4. **Cómo funciona:** 3 pasos reales, por ejemplo seleccionar, completar datos/pago, recibir confirmación y acompañamiento. Nunca mostrar pasos inexistentes.
5. **Planes o servicios:** tarjetas comparables con enlace a detalle; no esconder exclusiones.
6. **Conexión emocional:** bloque breve basado en una de las historias de campaña.
7. **Transparencia:** precios desde / qué incluye / qué no incluye / condiciones / preguntas frecuentes.
8. **Testimonios verificables:** nombre o iniciales, ciudad y autorización. Si no están disponibles, no usar testimonios ficticios.
9. **CTA final:** repetición contextual del CTA primario.
10. **Pie de página:** contacto, legal, privacidad, términos, accesibilidad, enlaces de las marcas del consorcio y redes sociales verificadas.

### 5.3 Páginas de conversión

| Página | Objetivo | Contenido imprescindible | CTA |
|---|---|---|---|
| Planes de previsión | Comparar y elegir | Beneficios, alcance, elegibilidad, precio/forma de pago, exclusiones, FAQs | «Ver mi plan» / «Contratar» |
| Servicio funerario | Solicitar o conocer atención | Situaciones atendidas, proceso, cobertura geográfica, ayuda humana | «Solicitar orientación» |
| Cremación | Explicar con respeto | Proceso, opciones, requisitos, tiempos solo validados | «Hablar con un asesor» |
| Repatriación y traslados | Captar intención de alta necesidad | Alcance exacto, documentación, disponibilidad, canal prioritario | «Solicitar orientación» |
| Familias en EE. UU. | Reducir fricción cultural y operativa | Cómo contratar desde EE. UU., medios de pago, gestión remota, soporte | «Proteger a mi familia» |
| Landing de campaña | Convertir tráfico de anuncios | Un mensaje, una historia, 3 beneficios, evidencia, formulario corto | CTA único de campaña |

### 5.4 Marcas del consorcio

LEGADO es la marca paraguas. Presentar claramente las entidades operativas, sin confundir al usuario:

- **Funeraria del Zulia:** servicios funerarios tradicionales y especializados.
- **Familias Protegidas:** planes de previsión funeraria.
- **Crematorios del Zulia:** servicios de cremación.

En toda página de oferta debe indicarse qué entidad presta cada servicio, las condiciones aplicables y el responsable de atención.

---

## 6. Conversión, formularios y experiencia

### 6.1 Principios de UX

- Diseñar **mobile-first**: la campaña muestra explícitamente el móvil como prueba de facilidad.
- Dar una ruta rápida, pero siempre visible, para atención humana.
- Reducir la carga emocional: explicar antes de pedir datos sensibles.
- Mantener el proceso en pasos cortos con indicador de progreso, guardado seguro y confirmación clara.
- No usar temporizadores, contadores falsos, casillas preseleccionadas ni patrones engañosos.

### 6.2 Formulario de captación inicial

Pedir únicamente lo indispensable: nombre, teléfono o correo, estado/ciudad en EE. UU., necesidad/servicio, y permiso de contacto. Explicar finalidad y enlazar la política de privacidad antes del envío.

**No pedir inicialmente** documentos de identidad, datos médicos, información del fallecido ni tarjetas. Esos datos solo deben capturarse en un flujo seguro y cuando sean estrictamente necesarios.

### 6.3 Contratación digital

Cada pantalla debe incluir:

- Título que explique la acción.
- Resumen de lo seleccionado y coste verificable.
- Qué ocurre después y quién contactará al usuario.
- Enlace a condiciones, cancelación y soporte.
- Confirmación final con número de referencia y copia por correo/SMS si procede.

Si se afirma «en 3 clics», la ruta de landing a contratación debe requerir tres decisiones reales o menos; de otro modo, usar «proceso digital simple».

### 6.4 Pagos

- Usar proveedor de pago certificado; nunca capturar ni almacenar datos de tarjeta en el servidor de la web.
- Comunicar moneda, importe, frecuencia, impuestos/comisiones aplicables y política de reembolso antes de autorizar pago.
- Separar el mensaje comercial de los términos contractuales. El botón de pago debe decir una acción explícita, por ejemplo «Pagar y contratar».

---

## 7. Requisitos técnicos y de accesibilidad

### 7.1 Diseño responsivo

- Anchura de lectura de cuerpo: 65-75 caracteres aproximadamente.
- Breakpoints orientativos: 360 px, 768 px, 1024 px y 1440 px.
- Objetivos táctiles mínimos de 44 x 44 px.
- No ocultar información contractual en móvil; reorganizarla con acordeones accesibles si es necesario.

### 7.2 Accesibilidad

- Cumplir WCAG 2.2 AA.
- Navegación completa por teclado; foco visible; salto a contenido.
- HTML semántico: un H1 por página y jerarquía sin saltos.
- Etiquetas asociadas a todos los campos; errores explicados en texto y anunciados a lectores de pantalla.
- Texto alternativo útil para imágenes informativas; imágenes decorativas con `alt=""`.
- Vídeos con subtítulos, transcripción y controles; no iniciar audio automáticamente.
- Respetar `prefers-reduced-motion`; animaciones solo breves y no esenciales.

### 7.3 Rendimiento y SEO

- Optimizar LCP: hero con imagen AVIF/WebP comprimida, dimensiones definidas y carga prioritaria solo para el recurso principal.
- Carga diferida para imágenes bajo el primer pliegue; no cargar vídeos pesados automáticamente.
- Evitar sliders automáticos y bibliotecas de animación innecesarias.
- Meta title, meta description, Open Graph, favicon y datos estructurados por página.
- Implementar `Organization`, `LocalBusiness` solo si la entidad/dirección es válida, `Service`, `FAQPage` cuando corresponda, y `BreadcrumbList`.
- Contenido indexable para búsquedas de intención, validado por marketing/legal: «previsión funeraria para venezolanos en Estados Unidos», «servicios funerarios en español», «repatriación a Venezuela».

---

## 8. Analítica, privacidad y cumplimiento

### 8.1 Eventos mínimos

| Evento | Disparador | Propiedades recomendadas |
|---|---|---|
| `view_service` | Visita a página de servicio | `service_name`, `campaign`, `language` |
| `cta_click` | Clic en CTA | `cta_label`, `page`, `placement` |
| `lead_start` | Inicio de formulario | `form_name`, `service_interest` |
| `lead_submit` | Envío válido | `form_name`, `service_interest`, `source` |
| `advisor_contact` | Clic en llamada/WhatsApp/chat | `channel`, `page` |
| `checkout_start` | Inicio de contratación | `plan_id`, `currency` |
| `purchase` | Pago confirmado por backend | `transaction_id`, `plan_id`, `value`, `currency` |

No incluir nombres, teléfonos, correos, documentos ni otro dato personal en plataformas analíticas o URLs.

### 8.2 Privacidad y confianza

- Banner de consentimiento configurable por región y bloqueo de etiquetas no esenciales hasta consentimiento cuando aplique.
- Política de privacidad, términos, cookies y aviso de accesibilidad accesibles desde todas las páginas.
- Formularios con consentimiento explícito de contacto y enlaces legales legibles.
- Aplicar HTTPS, protección antifraude, rate limiting y CAPTCHA accesible solo cuando sea necesario.
- Validar leyes, licencias, cobertura geográfica, condiciones del plan y publicidad de seguros/previsión con asesoría legal antes de publicar.

---

## 9. Reglas para campañas y landings

### 9.1 Embudo

| Fase | Fuente | Página/destino | Métrica principal |
|---|---|---|---|
| Atracción | Reels, TikTok, Meta Ads, historias de migrantes | Landing narrativa de campaña | Reproducción, clic cualificado |
| Consideración | Webinars, testimonios, guías | Página explicativa / FAQ / agenda | Lead o cita |
| Conversión | Search Ads y remarketing | Landing de servicio o contratación | Inicio y finalización de contratación |

### 9.2 Segmentación inicial indicada en la campaña

Priorizar pruebas de campaña en Doral, Weston, Orlando y Katy (Texas), sin bloquear otras áreas. Cada campaña debe utilizar parámetros UTM y una landing asociada.

### 9.3 Matriz de mensaje

| Concepto | Titular de landing | Prueba visual | CTA |
|---|---|---|---|
| El hilo que nos une | «Tu historia no tiene fronteras.» | Pantalla dividida con vínculo humano EE. UU./Venezuela | «Cuida a los tuyos» |
| Herencia de lo invisible | «El amor es el legado que se planifica.» | Relación intergeneracional y decisión responsable | «Conoce un plan» |
| Uniendo familias | «Cerca de ti y los tuyos, siempre.» | Videollamada, apoyo humano y móvil | «Hablar con un asesor» |

---

## 10. Criterios de aceptación antes de publicar

### Marca y contenido

- [ ] Se usa el logo maestro correcto, sin alteraciones.
- [ ] Los colores implementados corresponden a los tokens aprobados.
- [ ] Se comunica el lema de marca y una propuesta de valor clara en el primer pliegue.
- [ ] Toda promesa comercial es comprobable y está aprobada.
- [ ] La relación entre LEGADO y cada marca del consorcio está clara.
- [ ] No hay lenguaje que explote el miedo, la culpa o el duelo.

### UX y conversión

- [ ] El CTA principal se ve sin desplazamiento en móvil y escritorio.
- [ ] Existe una alternativa humana de contacto en páginas de alta intención.
- [ ] Formularios, mensajes de error y confirmaciones se entienden sin ambigüedad.
- [ ] Precios, inclusiones, exclusiones y condiciones son fáciles de encontrar antes de pagar.
- [ ] Cada landing de anuncio tiene un solo objetivo de conversión dominante.

### Calidad técnica

- [ ] La experiencia funciona en móvil, teclado y lector de pantalla.
- [ ] Contraste y foco cumplen WCAG 2.2 AA.
- [ ] No hay contenido sensible en analítica, consola ni URLs.
- [ ] Las imágenes tienen peso optimizado, dimensiones y texto alternativo adecuados.
- [ ] Eventos analíticos y UTMs están validados en entorno de prueba.
- [ ] Se han revisado enlaces legales, disponibilidad de canales y formularios en producción.

---

## 11. Instrucción breve para el agente de desarrollo

> Construye o modifica el sitio de LEGADO siguiendo estrictamente `GUIA_ESPECIFICACIONES_WEB_LEGADO.md`. Mantén una experiencia mobile-first, accesible WCAG 2.2 AA y enfocada en convertir a venezolanos residentes en Estados Unidos que desean proteger a su familia en Venezuela. Usa los tokens de color aprobados, el logo oficial sin alterarlo, lenguaje empático y verificable, y CTAs claros. No inventes precios, coberturas, licencias, tiempos de respuesta ni datos de contacto. Antes de publicar, aplica la lista de criterios de aceptación de esta guía.

## Fuentes revisadas

- *GUIDELINES BRANDBOOK Identity* (Mind Branding Studio, febrero de 2026).
- *Campaña LEGADO 2026* (Mind Branding Studio, enero de 2026).
- Paleta digital verificada en la lámina de logotipo del brandbook.
