# 🐷 Mis Finanzas

Web para controlar tus gastos, ponerte presupuestos y ahorrar para tus metas.
Hecha con HTML, CSS y JavaScript, sin librerías.

## Qué hace

- Apuntar gastos e ingresos por categoría y mes
- Presupuestos mensuales por categoría con aviso al pasarte
- Metas de ahorro con cuánto ahorrar cada mes
- Gastos e ingresos fijos que se apuntan solos
- Gráfico de los últimos 6 meses
- Buscar y filtrar movimientos
- Categorías propias
- Modo oscuro
- Exportar e importar copia de seguridad (JSON) y movimientos para Excel (CSV)
- Se instala como app y funciona sin internet

## Privacidad

Tus datos **no salen de tu dispositivo**: se guardan en el navegador (`localStorage`).
Cada navegador y cada móvil tiene sus propios datos. Para pasarlos de uno a otro,
usa *Exportar copia* e *Importar copia*.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Diseño y colores (claro y oscuro) |
| `app.js` | Toda la lógica |
| `sw.js` | Service worker: modo sin conexión |
| `manifest.webmanifest` | Nombre e iconos para instalarla como app |
| `icons/` | Iconos de la app |
