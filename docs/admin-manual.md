# Manual del Administrador — Panel de Legado

> Guía paso a paso para administradores del panel de control de Legado.
> Material base para preparar un manual de instrucciones imprimible o un
> tutorial en video.

---

## 1. Qué es el panel admin

El panel admin es una herramienta interna que te permite:

- **Mantener actualizado el catálogo de ubicaciones** (ciudades y estados de
  Venezuela donde tenemos cobertura).
- **Gestionar la red de aliados** (funerarias y proveedores asociados).
- **Configurar el comportamiento del agente conversacional Alma**
  (mensajes, restricciones, parámetros de operación).
- **Auditar las conversaciones** que los clientes tuvieron con Alma.

No reemplaza a Invoice Ninja — IN sigue siendo el sistema oficial para
**clientes, productos y facturas**. El panel admin gestiona lo que IN no
maneja: ubicaciones de cobertura, aliados locales, y el conocimiento que el
bot usa para conversar.

---

## 2. Quién puede usar el panel

Solo personas con **rol `is_admin=true` en Invoice Ninja**. El panel
re-valida tu rol al iniciar sesión y cada 5 minutos durante el uso.

Para dar acceso a alguien nuevo:

1. Entra al admin de IN (`https://invoicing.legadoholding.com`).
2. Settings → Account Management → User Management.
3. Crear usuario nuevo (o editar uno existente).
4. Marcar la opción **Administrator**.
5. Enviar las credenciales al nuevo admin (email + password temporal que
   ellos cambian al primer login).

Para quitarle acceso a alguien:

1. En IN, edita el usuario y desmarca **Administrator**, o
2. Elimina el usuario completamente.

En cualquier caso, el cambio surte efecto en máximo 5 minutos en el panel
(por el caché del Worker).

---

## 3. Cómo iniciar sesión

1. Abrir en el navegador:
   ```
   https://legadoholding.com/v2/admin/
   ```
2. Te aparece un modal "Legado — Acceso administrador".
3. Ingresar:
   - **Email**: el mismo que usas en Invoice Ninja
   - **Contraseña**: tu password de IN
4. Click en **Entrar**.

### Comportamientos esperados

| Lo que pasa | Significado |
|---|---|
| Login exitoso | Aparece el panel con las pestañas Ubicaciones, Aliados, Agente, Conversaciones |
| "Credenciales inválidas" | Email o password incorrectos — revisa caps lock |
| "Solo administradores pueden acceder al panel" | Tus credenciales son válidas pero no tienes `is_admin=true` en IN |
| El modal se queda cargando | Verifica conexión a internet. Si persiste, escribe a soporte técnico |

### Cierre de sesión

- **Botón "Salir"** en la barra superior derecha del panel → cierra sesión y
  vuelve al login.
- **Cerrar la pestaña** del navegador → la sesión se borra automáticamente
  (usamos `sessionStorage`, no `localStorage`). Tendrás que volver a loguear
  la próxima vez.

### Buenas prácticas de seguridad

- No compartas tu password con nadie.
- No marques "Recordar contraseña" en computadoras compartidas.
- Cierra sesión cuando termines de trabajar.
- Si sospechas que tu cuenta fue comprometida, cambia el password en IN
  inmediatamente.

---

## 4. Estructura del panel

```
┌──────────────────────────────────────────────────────────────┐
│  LEGADO ADMIN  │ Ubicaciones │ Aliados │ Agente │ Conversaciones │ Salir │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    [Contenido de la pestaña]                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Cuatro pestañas, una a la vez:

1. **Ubicaciones** — ciudades y estados de cobertura
2. **Aliados** — funerarias y proveedores
3. **Agente** — configuración del bot Alma
4. **Conversaciones** — log de chats con clientes

---

## 5. Pestaña Ubicaciones

### Para qué sirve

Definir el catálogo de **ciudades y estados de Venezuela donde Legado tiene
cobertura activa**. Esto alimenta dos cosas:

- El bot Alma, cuando un cliente pregunta "¿dan servicio en X ciudad?"
- La pestaña Aliados (cada aliado se asocia a una ubicación).

### Campos de una ubicación

| Campo | Obligatorio | Descripción |
|---|---|---|
| Estado | Sí | Estado de Venezuela (Zulia, Carabobo, Miranda, etc.) |
| Ciudad | Sí | Nombre de la ciudad (Maracaibo, Valencia, Caracas, etc.) |
| Es capital | No | Marca si esta ciudad es capital del estado |

### Tareas comunes

#### 5.1 Agregar una ubicación
1. En la pestaña **Ubicaciones**, llenar:
   - Estado: ej. `Zulia`
   - Ciudad: ej. `Maracaibo`
   - Es capital: marcar el checkbox si aplica
2. Click en **Crear**.
3. Mensaje verde "Creada ✓" → la ubicación aparece en la tabla.

#### 5.2 Filtrar la lista por estado
- Usar el dropdown "(Todos los estados)" en la parte superior.
- Seleccionar un estado → la tabla muestra solo ciudades de ese estado.
- Click en **Recargar** para volver a ver todo.

#### 5.3 Editar una ubicación existente
- En la fila correspondiente, click en **Editar**.
- Aparece una serie de prompts: estado → ciudad → es capital.
- Cancelar en cualquiera deja el campo sin cambios.

#### 5.4 Eliminar una ubicación
- En la fila correspondiente, click en **Eliminar**.
- Confirmar.
- ⚠️ **Si hay aliados asociados a esa ubicación, fallará** — primero hay que
  eliminar o reasignar los aliados.

### Errores comunes y soluciones

| Error | Causa | Solución |
|---|---|---|
| "state y city son requeridos" | Faltó llenar uno de los campos | Llenar ambos |
| Error al eliminar | Hay aliados asociados | Ir a Aliados, eliminar o cambiar location_id de esos aliados primero |

---

## 6. Pestaña Aliados

### Para qué sirve

Mantener la lista de **funerarias y proveedores asociados** que ejecutan los
servicios funerarios en Venezuela. Cada aliado pertenece a una ubicación
(de las que cargaste en la pestaña anterior).

### Campos de un aliado

| Campo | Obligatorio | Descripción |
|---|---|---|
| Nombre | Sí | Razón social o nombre comercial. Ej: "Funeraria del Zulia" |
| Ubicación | Sí | Ciudad/estado al que sirve (selector con las ubicaciones cargadas) |
| Brand (código) | No | Código corto ASCII para identificar al aliado en IN. Convención: prefijo `f` + palabra clave. Ej: `fzulia`, `faliados` |
| Nombre de contacto | No | Persona de referencia |
| Teléfono | No | Número de contacto (formato libre) |
| Email | No | Email de contacto |
| Dirección | No | Dirección física |
| Servicios | No | Lista de servicios que ofrece (texto separado por comas en la UI) |
| Cobertura estatal | No | Si está marcado, el aliado cubre todo el estado (no solo su ciudad) |
| Activo | Sí | Determina si Alma puede ofrecerlo al cliente |
| Notas | No | Observaciones internas (no visibles al cliente) |

### Tareas comunes

#### 6.1 Agregar un aliado
1. Pestaña **Aliados** → formulario "Crear nuevo aliado".
2. Llenar mínimo Nombre y Ubicación.
3. Los demás campos son opcionales pero recomendados (sobre todo Brand y
   Servicios, que Alma usa para responder).
4. Click en **Crear**.

#### 6.2 Marcar un aliado como inactivo (sin eliminarlo)
- Edita el aliado y desmarca **Activo**.
- Alma dejará de ofrecerlo al cliente.
- El registro queda en la BD por historial.

#### 6.3 Filtrar la lista
- Por ubicación: dropdown en la parte superior.
- Solo activos: checkbox "Mostrar solo activos".

#### 6.4 Eliminar un aliado
- Botón **Eliminar** en la fila.
- Confirmar.
- ⚠️ **Acción irreversible**. Considera marcar como inactivo en su lugar.

### Buenas prácticas

- **Mantén los brands cortos y consistentes** (`fzulia`, `faliados`,
  `fcaracas`). Estos códigos se usan en IN como `custom_value4` de cada
  producto de urgencia.
- **No elimines aliados que han sido facturados** — pierdes el historial.
- **Marca como inactivo** los aliados temporalmente fuera de servicio (en
  reparación, vacaciones del propietario, etc.). Es reversible.

---

## 7. Pestaña Agente

### Para qué sirve

Configurar el comportamiento del agente conversacional **Alma**. Esta
pestaña permite cambiar parámetros del bot **sin tocar código**.

### Cómo funciona

Es un **diccionario `key: value`** que Alma lee al iniciar cada conversación.
Cada entrada tiene:

- **Key**: nombre del parámetro (ej: `tono_inicial`, `pregunta_cierre`)
- **Value**: el contenido del parámetro
- **Descripción** (opcional): para qué sirve esa key

### Tareas comunes

#### 7.1 Modificar un valor existente
1. En la pestaña **Agente**, buscar la key.
2. Editar el textarea con el nuevo valor.
3. Click en **Guardar cambios**.

#### 7.2 Agregar una key nueva
1. Llenar el formulario "Nueva configuración":
   - Key: `mi_nueva_key` (sin espacios, ASCII)
   - Value: el contenido
   - Descripción: explicar qué hace
2. **Guardar**.
3. Avisar al equipo técnico para que Alma empiece a usarla (si la key es
   nueva, hay que referenciarla en el código del Worker).

#### 7.3 Eliminar una key
- Click en el botón rojo de la entrada.
- Confirmar.
- Alma usará el valor por defecto del código.

### Buenas prácticas

- **Probar cambios primero en un chat de prueba** (abre el bot en una pestaña
  privada y conversa con él como si fueras cliente).
- **Documentar cambios importantes** en la descripción de la key.
- **No experimentar en horario laboral pico** — clientes reales pueden estar
  conversando con Alma y los cambios se reflejan en tiempo real.

---

## 8. Pestaña Conversaciones

### Para qué sirve

Auditar las conversaciones que clientes reales (o pruebas) han tenido con
Alma. Es **solo lectura** — no se pueden modificar.

### Qué muestra la lista

Por cada sesión:
- **ID de sesión** (identificador único)
- **Fecha y hora de inicio**
- **Última actividad**
- **Cantidad de turnos** (mensajes intercambiados)
- **¿Se cerró la venta?** (badge "Finalizada" si el bot emitió factura)
- **Email del cliente** si Alma lo capturó

### Detalle de una conversación

Click en una fila → se expande mostrando:

- **Datos extraídos** que Alma capturó (nombre, teléfono, ubicación, etc.)
- **Lista cronológica de turnos**:
  - 🔵 Turno `user`: lo que escribió el cliente
  - 🟡 Turno `model`: respuesta de Alma
  - 🟢 Turno `tool`: cuando Alma llamó a una función (consultar productos,
    crear factura, etc.) y la respuesta de esa función

### Tareas comunes

#### 8.1 Investigar una conversación específica
- Si un cliente dice "hablé con su asistente pero algo salió mal", busca por
  fecha aproximada y revisa los turnos para reconstruir lo que pasó.

#### 8.2 Detectar problemas recurrentes
- ¿Alma entiende mal cierto tipo de pregunta?
- ¿El cliente abandona en cierto punto?
- ¿Alma sugiere productos equivocados?
- Estos patrones se ven revisando varias sesiones del mismo tipo.

#### 8.3 Ajustar el bot basado en lo visto
- Pasar a la pestaña **Agente** y ajustar la key relevante.
- Repetir conversaciones de prueba para verificar que el cambio surgió efecto.

### Limitaciones

- **No es búsqueda full-text**: la lista se ordena por fecha, no se puede
  buscar por palabras clave dentro del contenido.
- **No exporta a Excel/CSV**: si necesitas analizar muchos chats, pídelo al
  equipo técnico (los datos están en Supabase, son exportables vía SQL).

---

## 9. Flujos paso a paso

### 9.1 "Necesito agregar Maracay a las ciudades que cubrimos"

1. Pestaña **Ubicaciones**.
2. Estado: `Aragua`. Ciudad: `Maracay`. Es capital: ✓.
3. Crear.
4. Pestaña **Aliados**.
5. Si tenemos un aliado nuevo en Maracay:
   - Crear con location = "Maracay, Aragua", nombre y datos del aliado.
   - Marcar Activo.
6. (Opcional) en IN, dar de alta los productos de urgencia con
   `custom_value1=urgencias` y `custom_value4=<brand-del-aliado>`.

### 9.2 "Hay que pausar al aliado X porque está fuera de servicio"

1. Pestaña **Aliados**.
2. Buscar el aliado por nombre.
3. Click en **Editar**.
4. Desmarcar **Activo**.
5. Guardar.
6. Alma dejará de ofrecerlo. Para reactivarlo, repetir y marcar Activo.

### 9.3 "Quiero que Alma mencione que somos `RIF-J-XXX` cuando un cliente pregunta por información fiscal"

1. Pestaña **Agente**.
2. Buscar si existe una key tipo `info_fiscal` o `pie_pagina`.
3. Si existe → editar y guardar.
4. Si no existe → crear nueva key `info_fiscal` con el valor.
5. Avisar al equipo técnico que se creó una key nueva si Alma debería usarla
   en un contexto específico (puede requerir un cambio en el prompt del bot).

### 9.4 "Un cliente reclama que Alma le cotizó mal un servicio"

1. Pestaña **Conversaciones**.
2. Buscar por fecha aproximada de la conversación.
3. Click en la sesión → revisar los turnos `tool` (consultas al catálogo de
   urgencias).
4. Verificar en IN qué precio tiene el producto al que Alma se refirió.
5. Si Alma usó un precio desactualizado → corregir en IN (el bot lee precios
   en vivo, no los cachea).
6. Si Alma seleccionó el producto incorrecto → revisar el prompt en la
   pestaña **Agente** o reportar al equipo técnico.

---

## 10. Solución de problemas

### El panel no carga / se queda en blanco
1. Verificar que la URL sea exactamente `https://legadoholding.com/v2/admin/`.
2. Refrescar con `Ctrl+Shift+R` (fuerza recarga sin caché).
3. Abrir en ventana de incógnito para descartar extensiones del navegador.
4. Probar en otro navegador.
5. Si nada funciona: contactar al equipo técnico — puede haber un problema
   con el deploy.

### Login dice "Credenciales inválidas" pero estoy seguro de que están bien
1. Probar las mismas credenciales en `https://invoicing.legadoholding.com`.
2. Si IN te deja entrar y el panel no → contactar al equipo técnico (puede
   ser un problema del Worker).
3. Si IN tampoco te deja entrar → resetear el password en IN.

### "Solo administradores pueden acceder al panel"
- Tu usuario en IN no tiene `is_admin=true`.
- Pídele a otro admin que active esa opción para ti.

### Cambio algo y no se ve reflejado
- **Si es contenido del bot**: dale 30s y prueba conversar otra vez. La
  configuración se lee en cada nueva sesión, no en sesiones ya activas.
- **Si es una ubicación o aliado**: click en **Recargar** en la pestaña.
- **Si es algo del frontend público (precios, textos)**: eso no se controla
  desde el admin — se controla desde IN (precios) o desde el código del sitio
  (textos). Coordinar con el equipo técnico.

### Veo errores rojos en la pantalla
Lee el mensaje exacto y coméntalo al equipo técnico. Los más comunes son:
- "Error: 401 unauthorized" → tu sesión expiró. Cierra y vuelve a entrar.
- "Error: 500 ..." → fallo del Worker o de IN. Capturar pantalla y reportar.

---

## 11. Calendario de revisiones recomendado

| Frecuencia | Tarea |
|---|---|
| **Diario** | Revisar conversaciones del día anterior. Detectar quejas o fallos del bot. |
| **Semanal** | Verificar que la lista de aliados activos refleje la realidad operativa. |
| **Mensual** | Revisar las keys del agente y depurar las que no se usen. |
| **Trimestral** | Reunión con el equipo técnico para revisar cambios mayores al bot o flujo. |

---

## 12. Datos sensibles y privacidad

- **Las conversaciones contienen datos personales** (nombres, teléfonos,
  emails, situaciones familiares delicadas). Trátalas con confidencialidad.
- **No copies ni reenvíes contenido de conversaciones** fuera del equipo
  autorizado.
- **No discutas casos específicos** con personas ajenas al equipo, ni siquiera
  con familiares.
- **Cumplimiento**: el sitio recolecta datos sujetos a leyes de protección de
  datos en EE. UU. y Venezuela. Cualquier exportación masiva de datos debe
  pasar por el owner.

---

**Última actualización**: junio 2026 · ajustar cuando se agreguen pestañas
o funcionalidades nuevas al panel.
