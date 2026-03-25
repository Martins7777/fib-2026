# CLAUDE.md — Planificador de Turnos FIB 2026

## Visión general

Aplicación web de **un único archivo HTML** (`index.html`) para planificar el personal de un evento de 5 días (miércoles a domingo). Tecnología: HTML + CSS + JavaScript vanilla. Sin frameworks, sin servidor, sin dependencias externas.

**Persistencia**: `localStorage` (clave `planificador-turnos-v6`) + sincronización opcional con **Google Sheets** via Apps Script (JSONP para lectura, `fetch` con `mode:'no-cors'` para escritura). La clave de configuración de Sheets es `gs-sync-config` y almacena `{token}` (la URL del Apps Script desplegado).

---

## Estructura del estado (`state`)

```js
{
  employees: Employee[],
  assignmentsByDay: { [day: string]: Shift[] },
  horasEliminadas: {},          // legacy, no usado activamente
  tarifas: { camarero: 12, encargado: 14 },
  currentDay: string
}
```

### Empleado (`Employee`)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | number | `Date.now()` al crear; en datos de ejemplo 1–50 |
| `name` | string | Nombre completo |
| `role` | `"Camarero"` \| `"Encargado"` | Determina tarifa aplicada |
| `dni` | string | DNI |
| `ss` | string | Número Seguridad Social |
| `talla` | `"XS"/"S"/"M"/"L"/"XL"/"XXL"` | Talla camiseta |
| `salario` | number | Campo individual — **NO se usa en cálculos**; la tarifa real la da el rol |
| `entrada` | string | Hora de entrada preferida (metadato, no vincula al cuadrante) |
| `salida` | string | Hora de salida preferida (metadato) |
| `color` | string hex | Color visual en cuadrante y estadísticas |
| `notes` | string | Comentarios libres |

> ⚠️ El coste real siempre se calcula con `getSalario(emp)` → usa `state.tarifas[role]`, **no** `emp.salario`.

### Turno (`Shift`)
```js
{ id: string (uid), employeeId: number, position: string, start: string, end: string }
```
Ejemplo: `{ id: "a1b2c3d4", employeeId: 7, position: "BI", start: "12", end: "20" }`

Las horas son strings sin `:00`: `"12"`, `"20"`, `"00"`, `"02"`, `"03"`.

---

## Constantes clave

```js
const DAYS = ['Miercoles','Jueves','Viernes','Sabado','Domingo'];
const HOURS = ['12','13','14','15','16','17','18','19','20','21','22','23','00','01','02'];
// Rango: 12:00 → 03:00 (15 slots de 1h)
const TOTAL_SLOTS = 15;
const ENTRADAS = new Set([12, 19]); // horas de entrada destacadas visualmente
const ALL_EXIT_HOURS = ['13','14',...,'03']; // hasta 03:00
```

### Secciones y puestos (`SECS`)
| Código | Nombre completo | Máximo personas |
|--------|----------------|-----------------|
| `BT` | BT - Barra Trasera | 3 |
| `BI` | BI - Barra Interior | 6 |
| `TB` | TB - Terraza Ticket Bebida | 1 |
| `BE` | BE - Terraza Barra Bebida | 6 |

```js
const PUESTO_MAX = { BT:3, BI:6, TB:1, BE:6 };
```

---

## Navegación (pestañas)

| Tab ID | Page ID | Función al activar |
|--------|---------|-------------------|
| `tab-cuadrante` | `page-cuadrante` | `render()` |
| `tab-empleados` | `page-empleados` | `renderEmployeeList()` |
| `tab-entradas` | `page-entradas` | `renderEntrySummary()` |
| `tab-stats` | `page-stats` | `renderStats()` + `renderCostePorHora()` |
| `tab-descargar` | `page-descargar` | `populateTarifaInputs()` ← lleva el icono ⚙ y el título "Configuración" |

---

## Módulos funcionales

### 1. Cuadrante (página principal)

- Timeline visual por puesto, con chips arrastrables por empleado.
- Cada chip: nombre + rango horario. Color = `emp.color`.
- **Drag**: handle izquierdo mueve `start`, handle derecho mueve `end`, cuerpo mueve todo el chip.
- Snap a horas enteras (`slotToHour`, `hourToSlot`).
- Filtros: por sección (`filtSec`) y búsqueda por nombre (`buscar`). Los KPIs respetan los filtros activos.
- `checkAlerts()`: avisa si algún puesto no tiene ningún turno en el día actual.
- Botón `+` por puesto abre modal (`openAddModal`) para añadir turno.
- **Anti-doble asignación**: si un empleado ya tiene turno ese día, aparece en el dropdown de añadir turno como "Asignado" (gris, no seleccionable) con aviso toast.

#### KPI bar (encima del cuadrante)
- Coste día (filtrado)
- Coste total evento (filtrado, suma todos los días)
- Horas ocupadas hoy
- Empleados activos hoy
- Indicador "Filtrado" si hay filtros activos

### 2. Empleados

- Tabla editable inline (todos los campos editables directamente en la celda).
- `updateEmpField(id, field, value)`: actualiza el campo y hace flash verde en la fila.
- Si cambia `name` o `color`, re-renderiza el cuadrante automáticamente.
- Modal "Nuevo empleado" (`empModalOverlay`) para altas.
- Borrar empleado elimina también **todos sus turnos** en todos los días.
- `€/h (rol)` en tabla muestra `getSalario(emp)` (tarifa por rol, no `emp.salario`).

### 3. Horas de Entrada

- Tabla automática derivada del cuadrante: muestra qué empleados entran en cada hora, por día.
- `renderEntrySummary()`: filtra turnos donde `s.start === hour`.
- Las filas de las horas 12:00 y 19:00 se destacan visualmente (clase `entrada-row-highlight`).
- Botón "Compartir texto" genera un texto formateado copiable al portapapeles.
- **Se actualiza automáticamente** al mover chips en el cuadrante (llamada al final de `mouseup`).

### 4. Estadísticas

Dos sub-pestañas:

**Resumen costes** (`stats-panel-resumen`):
- Tabla con filas: nº empleados, horas ocupadas (+ barra %), coste del día.
- Desglose por empleado: rangos asignados por día, horas, coste individual.
- `calcDayStats(day, filtSec, buscar)` → `{numEmps, totalHours, totalCost}`.

**Coste por hora** (`stats-panel-coste-hora`):
- Tabla hora × día mostrando el coste acumulado de todos los empleados activos en esa franja.
- Coloreado verde→rojo según intensidad (normalizado al máximo del evento).
- `renderCostePorHora()` recalcula con `shiftCoversHour(shift, h)`.

**Función `getSalario(emp)`** — lógica de tarifa:
```js
function getSalario(emp) {
  if (emp.role === 'Encargado') return state.tarifas.encargado;
  return state.tarifas.camarero;
}
```

### 5. Configuración (pestaña ⚙)

**Tarifas salariales**:
- Campo `tarifaCamarero` y `tarifaEncargado` (€/h).
- `updateTarifa(role, val)` → actualiza `state.tarifas`, recalcula stats, KPIs y tabla de empleados.

**Copia de seguridad**:
- Exportar CSV (`exportBackupCSV`) → secciones `##META`, `##EMPLEADOS`, `##TURNOS`.
- Importar CSV (`importBackupCSV`) → reemplaza todo el estado (con confirmación).
- Formato CSV v2: columnas en `##EMPLEADOS` = `id,nombre,rol,dni,ss,talla,salario,entrada,salida,color,notas`.
- Columnas en `##TURNOS` = `dia,shift_id,empleado_id,puesto,inicio,fin`.

> El usuario ha mencionado que el sistema de exportación/importación **podría cambiar** en futuras versiones.

---

## Sincronización Google Sheets

- Integración via Apps Script desplegado como Web App.
- **Lectura**: JSONP (crea `<script>` dinámico con `?callback=_gsLoadXXX`).
- **Escritura**: `fetch(url, { method:'POST', mode:'no-cors', body: JSON.stringify(state) })`.
- El estado de conexión se muestra en el header (`ghStatusBtn`): `uncfg / syncing / ok / err`.
- `saveAll()` guarda primero en localStorage, luego intenta Sheets si está configurado.
- Al iniciar (`initGhSync`), carga datos remotos si están disponibles y pregunta si reemplazar los locales.

> ⚠️ El modal de configuración en el HTML se llama "Google Sheets" pero el botón del header dice "Sheets: no configurado". Internamente las variables se llaman `ghXxx` (gh = legado de cuando apuntaba a GitHub).

---

## Datos de ejemplo (estado por defecto)

- **50 empleados** precargados (IDs 1–50): 6 Encargados + 44 Camareros.
- **Turnos por defecto** en `buildDefaultAssignments()`: distribuidos en dos franjas por día (12:00–20:00 y 20:00–03:00), cubriendo todos los puestos.
- Los IDs de empleado en `buildDefaultAssignments()` son integers (1–50) y los shifts usan `mkS(eId, pos, start, end)`.

---

## Utilidades importantes

| Función | Descripción |
|---------|-------------|
| `hourToOrder(h)` | Convierte hora string a número ordinal (00→24, 01→25, 02→26, 03→27) |
| `shiftCoversHour(shift, h)` | Comprueba si un turno cubre una hora concreta |
| `getEmployee(id)` | Busca empleado tolerando string/int |
| `uid()` | Genera ID aleatorio de 8 caracteres |
| `escHtml(str)` | Escapa HTML (anti-XSS) |
| `showToast(msg)` | Toast 2.2s en esquina inferior derecha |
| `buildDayGrid(day)` | Construye grid posición→hora→empleados (para compatibilidad KPI) |

---

## Módulos pendientes / próximos pasos

1. **Asistente automático de asignación de horario** — distribuir empleados en puestos automáticamente según reglas a definir. Módulo futuro prioritario.
2. **Revisión del sistema de exportación/importación** — posible cambio de formato o destino.
3. El campo `horasEliminadas` en el estado existe pero no está activamente utilizado; legado de una versión anterior.

---

## Convenciones del código

- Todo en un único `<script>` al final del `<body>`.
- CSS en `<style>` en el `<head>`, con variables CSS en `:root`.
- No hay clases ni módulos ES; todo en scope global.
- Las horas se manejan siempre como strings sin `:00` (excepto en etiquetas visuales).
- `render()` es la función maestra del cuadrante; llama internamente a `renderKPI()` y `checkAlerts()`.
- Cambios en empleados que afectan al cuadrante deben llamar `render()` para reflejar colores/nombres.
- Al modificar turnos vía drag, el re-render completo se hace con `setTimeout(render, 50)` para no bloquear el cursor.
