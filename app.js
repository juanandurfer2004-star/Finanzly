// =============================================
// MIS FINANZAS
// Problema real: llegar a fin de mes sabiendo en
// qué se va el dinero, con límites por categoría
// y metas de ahorro con plan mensual.
// =============================================

// ---------- CONFIGURACIÓN ----------
// Categorías con las que empieza la app. Luego cada uno puede añadir,
// renombrar o borrar las suyas: las de verdad están en estado.categorias.
const CATEGORIAS_INICIALES = {
  gasto: ["🏠 Vivienda", "🛒 Comida", "🚗 Transporte", "🎉 Ocio", "💊 Salud", "👕 Ropa", "📺 Suscripciones", "📦 Otros"],
  ingreso: ["💼 Nómina", "💰 Extra", "🎁 Regalo"],
};

// Objetivo recomendado: ahorrar al menos el 20% de lo que entra (regla 50/30/20)
const TASA_AHORRO_OBJETIVO = 20;

// ---------- ESTADO ----------
// Todo el dinero se guarda en CÉNTIMOS (enteros) para evitar
// errores de coma flotante: 0.1 + 0.2 !== 0.3 en JavaScript.
const CLAVE_STORAGE = "mis-finanzas";

let estado = cargarEstado();
let mesSeleccionado = mesActual(); // formato "2026-11"
let editandoId = null; // id del movimiento que se está editando (null = creando uno nuevo)
let editandoMetaId = null; // lo mismo, pero para las metas
let editandoFijoId = null; // y para los gastos/ingresos fijos
let resaltarId = null; // elemento que se ilumina tras crearlo o cambiarlo

// Filtros de la lista de movimientos (no se guardan: al recargar empiezan limpios)
const FILTROS_INICIALES = { texto: "", tipo: "todos", categoria: "todas", alcance: "mes" };
let filtros = { ...FILTROS_INICIALES };

function cargarEstado() {
  try {
    const guardado = localStorage.getItem(CLAVE_STORAGE);
    if (guardado) return completarEstado(JSON.parse(guardado));
  } catch (e) {
    console.warn("No se pudo leer localStorage", e);
  }
  return estadoVacio();
}

function estadoVacio() {
  return {
    movimientos: [], // { id, tipo, concepto, importe, categoria, fecha }
    presupuestos: {}, // { "🛒 Comida": 30000, ... }
    metas: [], // { id, nombre, objetivo, ahorrado, fechaLimite }
    recurrentes: [], // { id, tipo, concepto, importe, categoria, dia, generadoHasta, activo }
    categorias: structuredClone(CATEGORIAS_INICIALES), // { gasto: [...], ingreso: [...] }
  };
}

// Los datos de versiones anteriores no tenían "recurrentes" ni "categorias":
// rellenamos lo que falte con los valores por defecto
function completarEstado(datos) {
  const completo = { ...estadoVacio(), ...datos };
  asegurarCategorias(completo);
  return completo;
}

// Si algo usa una categoría que no está en la lista (p. ej. de una copia antigua), la añadimos
function asegurarCategorias(datos) {
  const añadir = (tipo, cat) => {
    if (!datos.categorias[tipo].includes(cat)) datos.categorias[tipo].push(cat);
  };
  [...datos.movimientos, ...datos.recurrentes].forEach((m) => añadir(m.tipo, m.categoria));
  Object.keys(datos.presupuestos).forEach((cat) => añadir("gasto", cat));
}

function guardarEstado() {
  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(estado));
  } catch (e) {
    console.warn("No se pudo guardar en localStorage", e);
  }
}

// ---------- UTILIDADES ----------
const formatoEuro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

function aEuros(centimos) {
  return formatoEuro.format(centimos / 100);
}

// "19.99" → 1999. Math.round evita que 19.99 * 100 = 1998.9999...
function aCentimos(texto) {
  const numero = parseFloat(texto);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

function generarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function hoy() {
  // toISOString usa UTC; restamos el desfase para obtener la fecha local
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10); // "2026-11-03"
}

function mesActual() {
  return hoy().slice(0, 7); // "2026-11"
}

// Meses que quedan desde hoy hasta "AAAA-MM" (mínimo 1 para no dividir entre 0)
function mesesHasta(mesLimite) {
  const [a1, m1] = mesActual().split("-").map(Number);
  const [a2, m2] = mesLimite.split("-").map(Number);
  return Math.max(1, (a2 - a1) * 12 + (m2 - m1) + 1);
}

// sumarMeses("2026-11", 2) → "2027-01"
function sumarMeses(mes, cantidad) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + cantidad, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// fechaEnMes("2027-02", 31) → "2027-02-28" (si el mes es más corto, el último día)
function fechaEnMes(mes, dia) {
  const [a, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(a, m, 0).getDate(); // día 0 del mes siguiente = último de este
  return `${mes}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
}

function porcentaje(parte, total) {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

// Crea un elemento HTML de forma corta:
// el("li", { className: "x" }, "texto", otroElemento)
function el(etiqueta, propiedades = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  const { dataset, ...resto } = propiedades; // dataset no se puede asignar de golpe
  Object.assign(nodo, resto);
  if (dataset) Object.assign(nodo.dataset, dataset);
  nodo.append(...hijos); // append con strings usa texto plano: seguro ante HTML
  return nodo;
}

function barra(pct, clase = "") {
  const relleno = el("div", { className: `relleno ${clase}` });
  relleno.style.width = Math.min(pct, 100) + "%";
  return el("div", { className: "barra" }, relleno);
}

function botonBorrar(titulo, alPulsar) {
  return botonIcono("×", titulo, alPulsar);
}

function botonIcono(icono, titulo, alPulsar) {
  const btn = el("button", { className: "btn-x", type: "button", textContent: icono, title: titulo });
  btn.addEventListener("click", alPulsar);
  return btn;
}

// ---------- AVISOS (TOAST) ----------
// Muestra un mensaje flotante unos segundos.
// tipo: "exito" | "error" | "info". accion: { texto, alPulsar } opcional (ej. Deshacer)
let temporizadorToast = null;

function mostrarAviso(mensaje, tipo = "exito", accion = null) {
  const toast = document.querySelector("#toast");
  toast.className = `toast ${tipo}`;
  toast.replaceChildren(el("span", {}, mensaje));

  if (accion) {
    const btn = el("button", { type: "button", textContent: accion.texto });
    btn.addEventListener("click", () => {
      accion.alPulsar();
      toast.classList.remove("visible");
    });
    toast.append(btn);
  }

  // requestAnimationFrame para que la animación se reinicie si ya estaba visible
  requestAnimationFrame(() => toast.classList.add("visible"));

  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove("visible"), accion ? 5000 : 2500);
}

// ---------- CÁLCULOS ----------
// Sin argumento usa el mes seleccionado; el gráfico le pasa otros meses
function movimientosDelMes(mes = mesSeleccionado) {
  return estado.movimientos
    .filter((m) => m.fecha.startsWith(mes))
    .sort((a, b) => b.fecha.localeCompare(a.fecha)); // más recientes primero
}

function totalesDelMes(mes = mesSeleccionado) {
  let ingresos = 0;
  let gastos = 0;
  movimientosDelMes(mes).forEach((m) => {
    if (m.tipo === "ingreso") ingresos += m.importe;
    else gastos += m.importe;
  });
  const ahorro = ingresos - gastos;
  return { ingresos, gastos, ahorro, tasa: porcentaje(ahorro, ingresos) };
}

// { "🛒 Comida": 25000, "🎉 Ocio": 8000, ... } solo con gastos
function gastoPorCategoria() {
  const resultado = {};
  movimientosDelMes()
    .filter((m) => m.tipo === "gasto")
    .forEach((m) => {
      resultado[m.categoria] = (resultado[m.categoria] || 0) + m.importe;
    });
  return resultado;
}

// Verde < 80%, ámbar 80-100%, rojo si te pasas
function claseSegunUso(pct) {
  if (pct > 100) return "pasado";
  if (pct >= 80) return "aviso";
  return "ok";
}

// ---------- DOM ----------
const $ = (selector) => document.querySelector(selector);

const inputMes = $("#input-mes");
const formMovimiento = $("#form-movimiento");
const selectCategoria = $("#mov-categoria");
const inputFecha = $("#mov-fecha");
const formPresupuesto = $("#form-presupuesto");
const selectPresCategoria = $("#pres-categoria");
const formMeta = $("#form-meta");

function rellenarSelect(select, opciones) {
  select.innerHTML = "";
  opciones.forEach((texto) => select.appendChild(el("option", { value: texto, textContent: texto })));
}

function tipoSeleccionado() {
  return formMovimiento.querySelector("input[name=tipo]:checked").value;
}

function pintarResumen() {
  const { ingresos, gastos, ahorro, tasa } = totalesDelMes();

  $("#stat-ingresos").textContent = aEuros(ingresos);
  $("#stat-gastos").textContent = aEuros(gastos);
  $("#stat-ahorro").textContent = aEuros(ahorro);
  $("#stat-ahorro").className = ahorro >= 0 ? "positivo" : "negativo";
  $("#stat-tasa").textContent = ingresos > 0 ? `${tasa}%` : "—";
  $("#stat-tasa").className = ingresos === 0 ? "" : tasa >= TASA_AHORRO_OBJETIVO ? "positivo" : "negativo";

  $("#consejo").textContent = generarConsejo(ingresos, gastos, tasa);
}

// Un consejo sencillo según cómo va el mes
function generarConsejo(ingresos, gastos, tasa) {
  if (ingresos === 0 && gastos === 0) return "💡 Empieza apuntando tus ingresos del mes y tus gastos fijos (alquiler, facturas...).";
  if (ingresos === 0) return "💡 Añade tus ingresos para saber cuánto estás ahorrando.";

  const porCategoria = gastoPorCategoria();
  const pasados = Object.keys(estado.presupuestos).filter(
    (cat) => (porCategoria[cat] || 0) > estado.presupuestos[cat]
  );
  if (pasados.length > 0) return `⚠️ Te has pasado del presupuesto en: ${pasados.join(", ")}.`;
  if (gastos > ingresos) return "⚠️ Este mes gastas más de lo que ingresas. Revisa la categoría con más gasto.";
  if (tasa < TASA_AHORRO_OBJETIVO) {
    const falta = Math.ceil((ingresos * TASA_AHORRO_OBJETIVO) / 100) - (ingresos - gastos);
    return `💡 Para llegar al ${TASA_AHORRO_OBJETIVO}% de ahorro te faltan ${aEuros(falta)} este mes.`;
  }
  return `✅ ¡Bien! Estás ahorrando el ${tasa}% de tus ingresos.`;
}

function pintarPresupuestos() {
  const lista = $("#lista-presupuestos");
  const porCategoria = gastoPorCategoria();
  const categorias = Object.keys(estado.presupuestos);
  lista.innerHTML = "";

  if (categorias.length === 0) {
    lista.appendChild(el("li", { className: "vacio" }, "Fija un límite para las categorías donde más gastas."));
    return;
  }

  categorias.forEach((cat) => {
    const limite = estado.presupuestos[cat];
    const gastado = porCategoria[cat] || 0;
    const pct = porcentaje(gastado, limite);
    const restante = limite - gastado;

    const detalle = restante >= 0 ? `Quedan ${aEuros(restante)}` : `Te has pasado ${aEuros(-restante)}`;

    lista.appendChild(
      el("li", { className: "bloque", dataset: { id: cat } },
        el("div", { className: "cabecera" },
          el("strong", {}, cat),
          el("span", {}, `${aEuros(gastado)} / ${aEuros(limite)}`),
          botonBorrar("Quitar presupuesto", () => borrarPresupuesto(cat))
        ),
        barra(pct, claseSegunUso(pct)),
        el("small", {}, `${pct}% · ${detalle}`)
      )
    );
  });
}

function pintarCategorias() {
  const lista = $("#lista-categorias");
  const porCategoria = gastoPorCategoria();
  const total = Object.values(porCategoria).reduce((a, b) => a + b, 0);
  lista.innerHTML = "";

  if (total === 0) {
    lista.appendChild(el("li", { className: "vacio" }, "Sin gastos este mes."));
    return;
  }

  // Ordenadas de mayor a menor gasto
  Object.entries(porCategoria)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, importe]) => {
      const pct = porcentaje(importe, total);
      lista.appendChild(
        el("li", { className: "bloque" },
          el("div", { className: "cabecera" }, el("span", {}, cat), el("strong", {}, `${aEuros(importe)} · ${pct}%`)),
          barra(pct, "neutro")
        )
      );
    });
}

function pintarMetas() {
  const lista = $("#lista-metas");
  lista.innerHTML = "";

  if (estado.metas.length === 0) {
    lista.appendChild(el("li", { className: "vacio" }, "¿Para qué quieres ahorrar? Crea tu primera meta."));
    return;
  }

  estado.metas.forEach((meta) => {
    const pct = porcentaje(meta.ahorrado, meta.objetivo);
    const falta = Math.max(0, meta.objetivo - meta.ahorrado);
    const meses = mesesHasta(meta.fechaLimite);
    const porMes = Math.ceil(falta / meses);

    const texto =
      falta === 0
        ? "🎉 ¡Meta conseguida!"
        : `Faltan ${aEuros(falta)} · ahorra ${aEuros(porMes)}/mes durante ${meses} ${meses === 1 ? "mes" : "meses"}`;

    // Mini formulario para aportar dinero a la meta
    const inputAporte = el("input", { type: "number", min: "0.01", step: "0.01", placeholder: "€", required: true });
    const formAporte = el("form", { className: "fila aporte" }, inputAporte, el("button", { type: "submit" }, "Aportar"));
    formAporte.addEventListener("submit", (e) => {
      e.preventDefault();
      aportarAMeta(meta.id, aCentimos(inputAporte.value));
    });

    lista.appendChild(
      el("li", { className: meta.id === editandoMetaId ? "bloque editando" : "bloque", dataset: { id: meta.id } },
        el("div", { className: "cabecera" },
          el("strong", {}, meta.nombre),
          el("span", {}, `${aEuros(meta.ahorrado)} / ${aEuros(meta.objetivo)}`),
          botonIcono("✏️", "Editar meta", () => empezarEdicionMeta(meta.id)),
          botonBorrar("Borrar meta", () => borrarMeta(meta.id))
        ),
        barra(pct, falta === 0 ? "ok" : "meta"),
        el("small", {}, texto),
        falta > 0 ? formAporte : ""
      )
    );
  });
}

// ---------- BUSCAR Y FILTRAR ----------
// "Cafetería" → "cafeteria": así buscar "cafe" encuentra "Café"
function normalizar(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function busquedaActual() {
  return normalizar(filtros.texto.trim());
}

// ¿Hay algún filtro que reduzca la lista? (el alcance no cuenta)
function hayFiltros() {
  return busquedaActual() !== "" || filtros.tipo !== "todos" || filtros.categoria !== "todas";
}

function cumpleFiltros(m) {
  if (filtros.tipo !== "todos" && m.tipo !== filtros.tipo) return false;
  if (filtros.categoria !== "todas" && m.categoria !== filtros.categoria) return false;

  const busqueda = busquedaActual();
  if (!busqueda) return true;
  // Buscamos en el concepto, la categoría y el importe ("21" encuentra 21,00 €)
  return [m.concepto, m.categoria, aEuros(m.importe)].some((texto) => normalizar(texto).includes(busqueda));
}

// Devuelve el texto partido en trozos, con <mark> donde coincide la búsqueda.
// Como normalizar() puede cambiar la longitud de algunas letras, guardamos
// para cada letra "plana" en qué posición del texto original empieza y acaba.
function resaltar(texto) {
  const busqueda = busquedaActual();
  if (!busqueda) return [texto];

  let plano = "";
  const inicio = [];
  const fin = [];
  let posicion = 0;
  for (const letra of texto) {
    const normalizada = normalizar(letra);
    for (let k = 0; k < normalizada.length; k++) {
      inicio.push(posicion);
      fin.push(posicion + letra.length);
    }
    plano += normalizada;
    posicion += letra.length;
  }

  const trozos = [];
  let cursor = 0; // posición en el texto original hasta donde ya hemos copiado
  let desde = 0; // posición en el texto plano desde donde seguir buscando
  let encontrado;
  while ((encontrado = plano.indexOf(busqueda, desde)) !== -1) {
    const a = inicio[encontrado];
    const b = fin[encontrado + busqueda.length - 1];
    if (a > cursor) trozos.push(texto.slice(cursor, a));
    trozos.push(el("mark", {}, texto.slice(a, b)));
    cursor = b;
    desde = encontrado + busqueda.length;
  }
  if (cursor < texto.length) trozos.push(texto.slice(cursor));
  return trozos;
}

// Las categorías del desplegable dependen del tipo elegido
function rellenarFiltroCategoria() {
  const select = $("#filtro-categoria");
  const categorias = filtros.tipo === "todos" ? todasLasCategorias() : estado.categorias[filtros.tipo];

  select.innerHTML = "";
  select.appendChild(el("option", { value: "todas", textContent: "Todas las categorías" }));
  categorias.forEach((cat) => select.appendChild(el("option", { value: cat, textContent: cat })));

  // Si la categoría elegida ya no está en la lista (p. ej. "Nómina" con "Solo gastos"), la quitamos
  if (!categorias.includes(filtros.categoria)) filtros.categoria = "todas";
  select.value = filtros.categoria;
}

function pintarResumenFiltro(movimientos) {
  const gastos = movimientos.filter((m) => m.tipo === "gasto").reduce((s, m) => s + m.importe, 0);
  const ingresos = movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.importe, 0);

  const palabra = hayFiltros() ? "resultado" : "movimiento";
  const partes = [`${movimientos.length} ${palabra}${movimientos.length === 1 ? "" : "s"}`];
  if (ingresos) partes.push(`+${aEuros(ingresos)}`);
  if (gastos) partes.push(`−${aEuros(gastos)}`);
  $("#resumen-filtro").textContent = partes.join(" · ");

  const filtrosPorDefecto = !hayFiltros() && filtros.alcance === FILTROS_INICIALES.alcance;
  $("#btn-limpiar-filtros").hidden = filtrosPorDefecto;
}

function pintarMovimientos() {
  const lista = $("#lista-movimientos");
  const todoElHistorial = filtros.alcance === "todo";
  const base = todoElHistorial
    ? [...estado.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha))
    : movimientosDelMes();
  const movimientos = base.filter(cumpleFiltros);
  lista.innerHTML = "";
  pintarResumenFiltro(movimientos);

  if (movimientos.length === 0) {
    let mensaje = todoElHistorial ? "Todavía no hay movimientos." : "No hay movimientos en este mes.";
    if (hayFiltros() && base.length > 0) mensaje = "Ningún movimiento coincide con la búsqueda.";
    lista.appendChild(el("li", { className: "vacio" }, mensaje));
    return;
  }

  // Con todo el historial mostramos también el año
  const formatoFecha = todoElHistorial ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" };

  movimientos.forEach((m) => {
    const signo = m.tipo === "ingreso" ? "+" : "−";
    const fecha = new Date(m.fecha + "T00:00").toLocaleDateString("es-ES", formatoFecha);

    lista.appendChild(
      el("li", { className: m.id === editandoId ? "editando" : "", dataset: { id: m.id } },
        el("div", {},
          el("strong", {}, ...resaltar(m.concepto)),
          el("small", {}, ...resaltar(m.categoria), ` · ${fecha}${m.recurrenteId ? " · 🔁 fijo" : ""}`)
        ),
        el("div", { className: "fila-derecha" },
          el("strong", { className: m.tipo === "ingreso" ? "positivo" : "negativo" }, `${signo}${aEuros(m.importe)}`),
          botonIcono("✏️", "Editar movimiento", () => empezarEdicion(m.id)),
          botonBorrar("Borrar movimiento", () => borrarMovimiento(m.id))
        )
      )
    );
  });
}

// ---------- GRÁFICO POR MESES ----------
const MESES_GRAFICO = 6;
const formatoEuroCorto = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// ultimosMeses("2026-02", 3) → ["2025-12", "2026-01", "2026-02"]
function ultimosMeses(mesFinal, cantidad) {
  const [anio, mes] = mesFinal.split("-").map(Number);
  const meses = [];
  for (let i = cantidad - 1; i >= 0; i--) {
    const d = new Date(anio, mes - 1 - i, 1); // Date pasa solo al año anterior si el mes es negativo
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return meses;
}

function nombreMes(mes, largo = false) {
  const [a, m] = mes.split("-").map(Number);
  const opciones = largo ? { month: "long", year: "numeric" } : { month: "short" };
  const texto = new Date(a, m - 1, 1).toLocaleDateString("es-ES", opciones);
  return texto.charAt(0).toUpperCase() + texto.slice(1); // "septiembre de 2026" → "Septiembre de 2026"
}

// Escala "bonita": 0, 500, 1000, 1500... en vez de 0, 437, 874...
function pasoBonito(maximo, divisiones = 4) {
  const bruto = maximo / divisiones;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 2.5, 5, 10].find((f) => f * magnitud >= bruto) * magnitud;
}

// Como el() pero para SVG, que necesita su propio "namespace"
function svg(etiqueta, atributos = {}) {
  const nodo = document.createElementNS("http://www.w3.org/2000/svg", etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) nodo.setAttribute(clave, valor);
  return nodo;
}

// Barra con las esquinas de arriba redondeadas y la base recta
function rutaBarra(x, y, ancho, alto, radio = 4) {
  const r = Math.min(radio, alto, ancho / 2);
  return `M${x},${y + alto} V${y + r} Q${x},${y} ${x + r},${y} H${x + ancho - r} Q${x + ancho},${y} ${x + ancho},${y + r} V${y + alto} Z`;
}

function signoEuros(centimos) {
  return (centimos >= 0 ? "+" : "−") + formatoEuroCorto.format(Math.abs(centimos) / 100);
}

function pintarGrafico() {
  const contenedor = $("#grafico");
  const cuerpoTabla = $("#tabla-grafico tbody");
  const datos = ultimosMeses(mesSeleccionado, MESES_GRAFICO).map((mes) => ({ mes, ...totalesDelMes(mes) }));
  const maximo = Math.max(...datos.map((d) => Math.max(d.ingresos, d.gastos)));

  contenedor.replaceChildren();
  ocultarTooltip();

  // Tabla con los mismos datos (accesible y útil para ver cifras exactas)
  cuerpoTabla.replaceChildren(
    ...datos.map((d) =>
      el("tr", {},
        el("td", {}, nombreMes(d.mes, true)),
        el("td", {}, aEuros(d.ingresos)),
        el("td", {}, aEuros(d.gastos)),
        el("td", {}, aEuros(d.ahorro))
      )
    )
  );

  if (maximo === 0) {
    contenedor.append(el("p", { className: "vacio" }, "Aún no hay movimientos en estos meses."));
    return;
  }

  // Dibujamos al ancho real del contenedor para que el texto no se encoja en el móvil
  const ANCHO = Math.max(300, contenedor.clientWidth);
  const ALTO = 240;
  const margen = { arriba: 12, derecha: 8, abajo: 44, izquierda: 60 };
  const anchoPlot = ANCHO - margen.izquierda - margen.derecha;
  const altoPlot = ALTO - margen.arriba - margen.abajo;

  const paso = pasoBonito(maximo);
  const tope = Math.ceil(maximo / paso) * paso;
  const y = (valor) => margen.arriba + altoPlot - (valor / tope) * altoPlot;

  const lienzo = svg("svg", {
    width: ANCHO,
    height: ALTO,
    viewBox: `0 0 ${ANCHO} ${ALTO}`,
    role: "img",
    "aria-label": "Ingresos y gastos de los últimos 6 meses",
  });

  // Líneas de referencia horizontales con su importe
  for (let v = 0; v <= tope; v += paso) {
    lienzo.append(svg("line", { x1: margen.izquierda, x2: ANCHO - margen.derecha, y1: y(v), y2: y(v), class: v === 0 ? "eje" : "rejilla" }));
    const texto = svg("text", { x: margen.izquierda - 8, y: y(v) + 4, "text-anchor": "end", class: "etiqueta-eje" });
    texto.textContent = formatoEuroCorto.format(v / 100);
    lienzo.append(texto);
  }

  const anchoColumna = anchoPlot / datos.length;
  const anchoBarra = Math.min(28, anchoColumna * 0.3);
  const HUECO = 2; // separación entre la barra de ingresos y la de gastos

  datos.forEach((d) => {
    const centro = margen.izquierda + anchoColumna * datos.indexOf(d) + anchoColumna / 2;
    const grupo = svg("g", { class: d.mes === mesSeleccionado ? "columna seleccionada" : "columna" });

    // Zona invisible (más grande que las barras) para el hover y el clic. Va primero para quedar detrás.
    const zona = svg("rect", { x: centro - anchoColumna / 2, y: margen.arriba, width: anchoColumna, height: ALTO - margen.arriba, class: "zona" });
    zona.addEventListener("mouseenter", () => mostrarTooltip(d, (centro / ANCHO) * 100));
    zona.addEventListener("mouseleave", ocultarTooltip);
    zona.addEventListener("click", () => irAMes(d.mes));
    grupo.append(zona);

    const barras = [
      ["ingresos", centro - HUECO / 2 - anchoBarra],
      ["gastos", centro + HUECO / 2],
    ];
    barras.forEach(([serie, x]) => {
      if (d[serie] > 0) {
        grupo.append(svg("path", { d: rutaBarra(x, y(d[serie]), anchoBarra, y(0) - y(d[serie])), class: `barra-${serie}` }));
      }
    });

    const textoMes = svg("text", { x: centro, y: ALTO - margen.abajo + 18, "text-anchor": "middle", class: "etiqueta-mes" });
    textoMes.textContent = nombreMes(d.mes);
    const textoAhorro = svg("text", { x: centro, y: ALTO - margen.abajo + 34, "text-anchor": "middle", class: "etiqueta-ahorro" });
    textoAhorro.textContent = d.ingresos || d.gastos ? signoEuros(d.ahorro) : "";
    grupo.append(textoMes, textoAhorro);

    lienzo.append(grupo);
  });

  contenedor.append(lienzo);
}

function filaTooltip(serie, texto, valor) {
  return el("div", { className: "tip-fila" },
    el("span", {}, el("i", { className: `muestra ${serie}` }), texto),
    el("strong", {}, aEuros(valor))
  );
}

function mostrarTooltip(d, posicionPct) {
  const tip = $("#tooltip-grafico");
  tip.replaceChildren(
    el("strong", { className: "tip-titulo" }, nombreMes(d.mes, true)),
    filaTooltip("ingresos", "Ingresos", d.ingresos),
    filaTooltip("gastos", "Gastos", d.gastos),
    el("div", { className: "tip-fila" }, el("span", {}, "Ahorro"), el("strong", {}, aEuros(d.ahorro))),
    el("small", {}, d.mes === mesSeleccionado ? "Mes seleccionado" : "Clic para ver este mes")
  );
  // Limitamos la posición para que no se salga por los lados
  tip.style.left = Math.min(85, Math.max(15, posicionPct)) + "%";
  tip.hidden = false;
}

function ocultarTooltip() {
  $("#tooltip-grafico").hidden = true;
}

function irAMes(mes) {
  mesSeleccionado = mes;
  inputMes.value = mes;
  pintarTodo();
}

function pintarTodo() {
  refrescarSelectsCategorias();
  pintarGestorCategorias();
  pintarResumen();
  pintarGrafico();
  pintarPresupuestos();
  pintarCategorias();
  pintarMetas();
  pintarRecurrentes();
  pintarMovimientos();

  // Ilumina un momento lo último que se ha creado o cambiado
  if (resaltarId) {
    document.querySelectorAll("[data-id]").forEach((nodo) => {
      if (nodo.dataset.id === resaltarId) nodo.classList.add("destacado");
    });
    resaltarId = null;
  }
}

// ---------- ACCIONES ----------
// Todas siguen el mismo patrón: cambiar estado → guardar → pintar
function actualizar() {
  guardarEstado();
  pintarTodo();
}

// Sirve tanto para crear como para editar: depende de editandoId
function guardarMovimiento() {
  const error = $("#error-movimiento");
  error.textContent = "";

  const datos = {
    tipo: tipoSeleccionado(),
    concepto: $("#mov-concepto").value.trim(),
    importe: aCentimos($("#mov-importe").value),
    categoria: selectCategoria.value,
    fecha: inputFecha.value,
  };

  let mensajeError = "";
  if (!datos.concepto) mensajeError = "Escribe un concepto.";
  else if (datos.importe <= 0) mensajeError = "El importe debe ser mayor que 0.";
  else if (!datos.fecha) mensajeError = "Elige una fecha.";

  if (mensajeError) {
    error.textContent = mensajeError;
    mostrarAviso(mensajeError, "error");
    return;
  }

  if (editandoId) {
    // Editar: sustituimos los datos del movimiento existente
    const movimiento = estado.movimientos.find((m) => m.id === editandoId);
    Object.assign(movimiento, datos);
    resaltarId = movimiento.id;
    mostrarAviso(`✏️ "${datos.concepto}" actualizado`);
  } else {
    const movimiento = { id: generarId(), ...datos };
    const repetir = $("#mov-repetir").checked;

    if (repetir) {
      // La plantilla que se copiará cada mes. Este movimiento ya cubre su mes.
      const recurrente = {
        id: generarId(),
        tipo: datos.tipo,
        concepto: datos.concepto,
        importe: datos.importe,
        categoria: datos.categoria,
        dia: Number(datos.fecha.slice(8)),
        generadoHasta: datos.fecha.slice(0, 7),
        activo: true,
      };
      estado.recurrentes.push(recurrente);
      movimiento.recurrenteId = recurrente.id;
    }

    estado.movimientos.push(movimiento);
    resaltarId = movimiento.id;

    const texto = datos.tipo === "ingreso" ? "Ingreso" : "Gasto";
    if (repetir) {
      // Si la fecha es antigua, rellena los meses que faltan hasta hoy
      const atrasados = generarRecurrentes();
      const extra = atrasados ? ` (+${atrasados} de meses anteriores)` : "";
      mostrarAviso(`🔁 ${texto} fijo de ${aEuros(datos.importe)} guardado: se repetirá cada mes${extra}`);
    } else {
      mostrarAviso(`✅ ${texto} de ${aEuros(datos.importe)} guardado`);
    }
    avisarSiSuperaPresupuesto(datos);
  }

  // Si lo apuntas en otro mes, saltamos a ese mes para que lo veas
  mesSeleccionado = datos.fecha.slice(0, 7);
  inputMes.value = mesSeleccionado;

  salirDeEdicion();
  $("#mov-concepto").focus();
  actualizar();
}

// Feedback extra si este gasto hace que te pases del límite
function avisarSiSuperaPresupuesto(datos) {
  const limite = estado.presupuestos[datos.categoria];
  if (datos.tipo !== "gasto" || !limite) return;

  const mes = datos.fecha.slice(0, 7);
  const gastado = estado.movimientos
    .filter((m) => m.tipo === "gasto" && m.categoria === datos.categoria && m.fecha.startsWith(mes))
    .reduce((suma, m) => suma + m.importe, 0);

  if (gastado > limite) {
    // Esperamos a que se vea el primer aviso antes de mostrar este
    setTimeout(() => mostrarAviso(`⚠️ Te has pasado ${aEuros(gastado - limite)} en ${datos.categoria}`, "error"), 1500);
  }
}

// Carga el movimiento en el formulario para cambiarlo
function empezarEdicion(id) {
  const m = estado.movimientos.find((mov) => mov.id === id);
  if (!m) return;

  editandoId = id;
  formMovimiento.querySelector(`input[value=${m.tipo}]`).checked = true;
  rellenarSelect(selectCategoria, estado.categorias[m.tipo]);
  selectCategoria.value = m.categoria;
  $("#mov-concepto").value = m.concepto;
  $("#mov-importe").value = (m.importe / 100).toFixed(2);
  inputFecha.value = m.fecha;

  $("#titulo-movimiento").textContent = "✏️ Editar movimiento";
  $("#btn-guardar-mov").textContent = "Guardar cambios";
  $("#btn-cancelar-edicion").hidden = false;
  $("#campo-repetir").hidden = true; // editar solo cambia este movimiento, no la plantilla
  formMovimiento.closest(".card").classList.add("editando");

  formMovimiento.scrollIntoView({ behavior: "smooth", block: "center" });
  $("#mov-concepto").focus();
  pintarMovimientos(); // para marcar cuál se está editando
}

// Vuelve el formulario al modo "nuevo movimiento"
function salirDeEdicion() {
  editandoId = null;
  $("#mov-concepto").value = "";
  $("#mov-importe").value = "";
  $("#error-movimiento").textContent = "";
  $("#titulo-movimiento").textContent = "➕ Nuevo movimiento";
  $("#btn-guardar-mov").textContent = "Guardar";
  $("#btn-cancelar-edicion").hidden = true;
  $("#campo-repetir").hidden = false;
  $("#mov-repetir").checked = false;
  formMovimiento.closest(".card").classList.remove("editando");
}

function cancelarEdicion() {
  salirDeEdicion();
  inputFecha.value = hoy();
  mostrarAviso("Edición cancelada", "info");
  pintarMovimientos();
}

function borrarMovimiento(id) {
  const indice = estado.movimientos.findIndex((m) => m.id === id);
  if (indice === -1) return;

  const [borrado] = estado.movimientos.splice(indice, 1);
  if (editandoId === id) salirDeEdicion();
  actualizar();

  // Deshacer: lo volvemos a meter en la misma posición
  mostrarAviso(`🗑️ "${borrado.concepto}" borrado`, "info", {
    texto: "Deshacer",
    alPulsar: () => {
      estado.movimientos.splice(indice, 0, borrado);
      resaltarId = borrado.id;
      actualizar();
    },
  });
}

function fijarPresupuesto(categoria, limite) {
  if (limite <= 0) return mostrarAviso("El límite debe ser mayor que 0", "error");
  const existia = categoria in estado.presupuestos;
  estado.presupuestos[categoria] = limite;
  resaltarId = categoria;
  mostrarAviso(`🎯 Presupuesto de ${categoria} ${existia ? "cambiado" : "fijado"} en ${aEuros(limite)}`);
  actualizar();
}

function borrarPresupuesto(categoria) {
  delete estado.presupuestos[categoria];
  mostrarAviso(`Presupuesto de ${categoria} quitado`, "info");
  actualizar();
}

// Igual que con los movimientos: crea o edita según editandoMetaId
function guardarMeta() {
  const nombre = $("#meta-nombre").value.trim();
  const objetivo = aCentimos($("#meta-objetivo").value);
  const fechaLimite = $("#meta-fecha").value;

  if (!nombre || objetivo <= 0 || !fechaLimite) return mostrarAviso("Rellena nombre, objetivo y fecha", "error");

  if (editandoMetaId) {
    const meta = estado.metas.find((m) => m.id === editandoMetaId);
    const ahorrado = aCentimos($("#meta-ahorrado").value);
    if (ahorrado < 0) return mostrarAviso("Lo ahorrado no puede ser negativo", "error");

    const estabaConseguida = meta.ahorrado >= meta.objetivo;
    Object.assign(meta, { nombre, objetivo, fechaLimite, ahorrado });
    resaltarId = meta.id;

    if (!estabaConseguida && ahorrado >= objetivo) mostrarAviso(`🎉 ¡Has conseguido tu meta "${nombre}"!`);
    else mostrarAviso(`✏️ Meta "${nombre}" actualizada`);
  } else {
    const meta = { id: generarId(), nombre, objetivo, ahorrado: 0, fechaLimite };
    estado.metas.push(meta);
    resaltarId = meta.id;
    mostrarAviso(`🏆 Meta "${nombre}" creada`);
  }

  salirDeEdicionMeta();
  actualizar();
}

// Carga la meta en el formulario para cambiarla
function empezarEdicionMeta(id) {
  const meta = estado.metas.find((m) => m.id === id);
  if (!meta) return;

  editandoMetaId = id;
  $("#meta-nombre").value = meta.nombre;
  $("#meta-objetivo").value = meta.objetivo / 100;
  $("#meta-fecha").min = ""; // una meta antigua puede tener fecha pasada
  $("#meta-fecha").value = meta.fechaLimite;
  $("#meta-ahorrado").value = (meta.ahorrado / 100).toFixed(2);

  $("#titulo-meta").textContent = "✏️ Editar meta";
  $("#btn-guardar-meta").textContent = "Guardar cambios";
  $("#campo-ahorrado").hidden = false;
  $("#btn-cancelar-meta").hidden = false;
  formMeta.closest(".card").classList.add("editando");

  formMeta.scrollIntoView({ behavior: "smooth", block: "center" });
  $("#meta-nombre").focus();
  pintarMetas();
}

// Vuelve el formulario al modo "crear meta"
function salirDeEdicionMeta() {
  editandoMetaId = null;
  formMeta.reset();
  $("#meta-fecha").min = mesActual();
  $("#titulo-meta").textContent = "🏆 Metas de ahorro";
  $("#btn-guardar-meta").textContent = "Crear meta";
  $("#campo-ahorrado").hidden = true;
  $("#btn-cancelar-meta").hidden = true;
  formMeta.closest(".card").classList.remove("editando");
}

function cancelarEdicionMeta() {
  salirDeEdicionMeta();
  mostrarAviso("Edición cancelada", "info");
  pintarMetas();
}

function aportarAMeta(id, cantidad) {
  const meta = estado.metas.find((m) => m.id === id);
  if (!meta) return;
  if (cantidad <= 0) return mostrarAviso("La aportación debe ser mayor que 0", "error");

  meta.ahorrado += cantidad;
  resaltarId = meta.id;
  if (meta.ahorrado >= meta.objetivo) {
    mostrarAviso(`🎉 ¡Has conseguido tu meta "${meta.nombre}"!`);
  } else {
    mostrarAviso(`💰 +${aEuros(cantidad)} a "${meta.nombre}" (${porcentaje(meta.ahorrado, meta.objetivo)}%)`);
  }
  actualizar();
}

function borrarMeta(id) {
  const indice = estado.metas.findIndex((m) => m.id === id);
  if (indice === -1) return;

  const [borrada] = estado.metas.splice(indice, 1);
  if (editandoMetaId === id) salirDeEdicionMeta();
  actualizar();

  // En vez de pedir confirmación, damos la opción de deshacer
  mostrarAviso(`🗑️ Meta "${borrada.nombre}" borrada`, "info", {
    texto: "Deshacer",
    alPulsar: () => {
      estado.metas.splice(indice, 0, borrada);
      resaltarId = borrada.id;
      actualizar();
    },
  });
}

// ---------- GASTOS E INGRESOS FIJOS (RECURRENTES) ----------
// Cada recurrente es una "plantilla". generadoHasta guarda el último mes
// en el que ya se creó su movimiento, así nunca se duplica (y si borras
// uno a mano, no vuelve a aparecer).

// Crea los movimientos de los meses que falten hasta hoy. Devuelve cuántos ha creado.
function generarRecurrentes() {
  const fechaHoy = hoy();
  const mesHoy = mesActual();
  let creados = 0;

  estado.recurrentes.forEach((r) => {
    if (!r.activo) return;

    let mes = sumarMeses(r.generadoHasta, 1);
    // Los textos "AAAA-MM" se pueden comparar con <= como si fueran números
    while (mes <= mesHoy) {
      const fecha = fechaEnMes(mes, r.dia);
      if (fecha > fechaHoy) break; // este mes todavía no ha llegado el día

      estado.movimientos.push({
        id: generarId(),
        tipo: r.tipo,
        concepto: r.concepto,
        importe: r.importe,
        categoria: r.categoria,
        fecha,
        recurrenteId: r.id,
      });
      r.generadoHasta = mes;
      creados++;
      mes = sumarMeses(mes, 1);
    }
  });

  return creados;
}

function pintarRecurrentes() {
  const lista = $("#lista-recurrentes");
  const resumen = $("#resumen-recurrentes");
  lista.innerHTML = "";

  const activos = estado.recurrentes.filter((r) => r.activo);
  const sumar = (tipo) => activos.filter((r) => r.tipo === tipo).reduce((suma, r) => suma + r.importe, 0);
  resumen.textContent =
    estado.recurrentes.length === 0
      ? "Marca \"Repetir cada mes\" al guardar un movimiento y se apuntará solo cada mes."
      : `Cada mes: ${aEuros(sumar("ingreso"))} de ingresos fijos y ${aEuros(sumar("gasto"))} de gastos fijos.`;

  estado.recurrentes.forEach((r) => {
    // El que se está editando se pinta como formulario
    if (r.id === editandoFijoId) {
      lista.appendChild(el("li", { className: "bloque editando", dataset: { id: r.id } }, formularioFijo(r)));
      return;
    }

    const proximo = fechaEnMes(sumarMeses(r.generadoHasta, 1), r.dia);
    const fechaBonita = new Date(proximo + "T00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const detalle = r.activo ? `día ${r.dia} de cada mes · próximo: ${fechaBonita}` : "⏸️ En pausa";
    const signo = r.tipo === "ingreso" ? "+" : "−";

    lista.appendChild(
      el("li", { className: r.activo ? "" : "en-pausa", dataset: { id: r.id } },
        el("div", {}, el("strong", {}, r.concepto), el("small", {}, `${r.categoria} · ${detalle}`)),
        el("div", { className: "fila-derecha" },
          el("strong", { className: r.tipo === "ingreso" ? "positivo" : "negativo" }, `${signo}${aEuros(r.importe)}`),
          botonIcono("✏️", "Editar fijo", () => empezarEdicionFijo(r.id)),
          botonIcono(r.activo ? "⏸️" : "▶️", r.activo ? "Pausar" : "Reanudar", () => alternarRecurrente(r.id)),
          botonBorrar("Dejar de repetir", () => borrarRecurrente(r.id))
        )
      )
    );
  });
}

// El movimiento que este fijo ya apuntó en el mes actual (si existe)
function movimientoFijoDelMes(r) {
  return estado.movimientos.find((m) => m.recurrenteId === r.id && m.fecha.startsWith(mesActual()));
}

// Formulario que sustituye al fijo dentro de la lista mientras lo editas
function formularioFijo(r) {
  const inputConcepto = el("input", { type: "text", value: r.concepto, maxLength: 40, required: true });
  const inputImporte = el("input", { type: "number", min: "0.01", step: "0.01", value: (r.importe / 100).toFixed(2), required: true });
  const inputDia = el("input", { type: "number", min: "1", max: "31", step: "1", value: r.dia, required: true });
  const selectCat = el("select");
  rellenarSelect(selectCat, estado.categorias[r.tipo]);
  selectCat.value = r.categoria;

  // Si este mes ya se apuntó, preguntamos si también hay que cambiarlo
  const movimientoMes = movimientoFijoDelMes(r);
  const casillaMes = el("input", { type: "checkbox", checked: true });
  const textoMes = movimientoMes
    ? `Cambiar también el ya apuntado este mes (${new Date(movimientoMes.fecha + "T00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })})`
    : "";

  const botonCancelar = el("button", { type: "button", className: "secundario", textContent: "Cancelar" });
  botonCancelar.addEventListener("click", cancelarEdicionFijo);

  const formulario = el("form", { className: "form-fijo" },
    el("strong", {}, r.tipo === "ingreso" ? "✏️ Editar ingreso fijo" : "✏️ Editar gasto fijo"),
    el("label", {}, "Concepto", inputConcepto),
    el("div", { className: "fila" },
      el("label", {}, "Importe (€)", inputImporte),
      el("label", {}, "Día del mes", inputDia)
    ),
    el("label", {}, "Categoría", selectCat),
    movimientoMes ? el("label", { className: "check" }, casillaMes, textoMes) : "",
    el("div", { className: "fila" }, el("button", { type: "submit", className: "principal" }, "Guardar cambios"), botonCancelar)
  );

  formulario.addEventListener("submit", (e) => {
    e.preventDefault();
    guardarFijo(
      r.id,
      {
        concepto: inputConcepto.value.trim(),
        importe: aCentimos(inputImporte.value),
        dia: Number(inputDia.value),
        categoria: selectCat.value,
      },
      movimientoMes && casillaMes.checked ? movimientoMes : null
    );
  });

  return formulario;
}

function empezarEdicionFijo(id) {
  editandoFijoId = id;
  pintarRecurrentes();
  $("#lista-recurrentes .form-fijo input").focus();
}

function cancelarEdicionFijo() {
  editandoFijoId = null;
  mostrarAviso("Edición cancelada", "info");
  pintarRecurrentes();
}

function guardarFijo(id, cambios, movimientoMes) {
  const r = estado.recurrentes.find((rec) => rec.id === id);
  if (!r) return;

  if (!cambios.concepto) return mostrarAviso("Escribe un concepto", "error");
  if (cambios.importe <= 0) return mostrarAviso("El importe debe ser mayor que 0", "error");
  if (!Number.isInteger(cambios.dia) || cambios.dia < 1 || cambios.dia > 31) {
    return mostrarAviso("El día debe estar entre 1 y 31", "error");
  }

  const diferencia = cambios.importe - r.importe;
  Object.assign(r, cambios);

  // Los meses anteriores no se tocan; el actual solo si lo has pedido
  if (movimientoMes) {
    Object.assign(movimientoMes, {
      concepto: cambios.concepto,
      importe: cambios.importe,
      categoria: cambios.categoria,
      fecha: fechaEnMes(movimientoMes.fecha.slice(0, 7), cambios.dia),
    });
  }

  editandoFijoId = null;
  resaltarId = r.id;
  const creados = generarRecurrentes(); // si has adelantado el día, puede que ya toque este mes

  let mensaje = `✏️ "${r.concepto}" actualizado`;
  if (diferencia !== 0) mensaje += `: ${diferencia > 0 ? "+" : "−"}${aEuros(Math.abs(diferencia))} al mes`;
  if (movimientoMes) mensaje += " (también este mes)";
  if (creados) mensaje += " · apuntado este mes";
  mostrarAviso(mensaje);
  actualizar();
}

function alternarRecurrente(id) {
  const r = estado.recurrentes.find((rec) => rec.id === id);
  if (!r) return;

  r.activo = !r.activo;
  resaltarId = r.id;

  if (r.activo) {
    // Al reanudar no rellenamos los meses que estuvo en pausa
    const mesAnterior = sumarMeses(mesActual(), -1);
    if (r.generadoHasta < mesAnterior) r.generadoHasta = mesAnterior;
    const creados = generarRecurrentes();
    mostrarAviso(`▶️ "${r.concepto}" reanudado${creados ? " y apuntado este mes" : ""}`);
  } else {
    mostrarAviso(`⏸️ "${r.concepto}" en pausa: no se apuntará hasta que lo reanudes`, "info");
  }
  actualizar();
}

// Borra la plantilla; los movimientos ya apuntados se quedan
function borrarRecurrente(id) {
  const indice = estado.recurrentes.findIndex((r) => r.id === id);
  if (indice === -1) return;

  const [borrado] = estado.recurrentes.splice(indice, 1);
  if (editandoFijoId === id) editandoFijoId = null;
  actualizar();

  mostrarAviso(`"${borrado.concepto}" ya no se repetirá`, "info", {
    texto: "Deshacer",
    alPulsar: () => {
      estado.recurrentes.splice(indice, 0, borrado);
      resaltarId = borrado.id;
      actualizar();
    },
  });
}

// ---------- CATEGORÍAS PROPIAS ----------
// Una categoría es un texto como "🐶 Mascotas": emoji, espacio y nombre.
// Los movimientos guardan ese texto, así que al renombrar o borrar
// hay que cambiarlo en todas partes (movimientos, fijos, presupuestos).
let editandoCategoria = null; // categoría que se está renombrando
let borrandoCategoria = null; // categoría en uso que se va a borrar (pregunta a dónde mover lo suyo)

function todasLasCategorias() {
  return [...estado.categorias.gasto, ...estado.categorias.ingreso];
}

// "🐶 Mascotas" → { emoji: "🐶", nombre: "Mascotas" }
function partesCategoria(cat) {
  const espacio = cat.indexOf(" ");
  return espacio === -1 ? { emoji: "", nombre: cat } : { emoji: cat.slice(0, espacio), nombre: cat.slice(espacio + 1) };
}

// Solo el primer emoji. Intl.Segmenter sabe que 👨‍👩‍👧 es UN dibujo aunque ocupe 8 caracteres.
function primerEmoji(texto) {
  const limpio = texto.trim();
  if (!limpio) return "🏷️";
  if (window.Intl && Intl.Segmenter) return [...new Intl.Segmenter().segment(limpio)][0].segment;
  return Array.from(limpio)[0];
}

// Monta "emoji nombre" comprobando que no esté vacío ni repetido. Devuelve null si no vale.
function construirCategoria(emoji, nombre, ignorar = null) {
  const limpio = nombre.trim().replace(/\s+/g, " ");
  if (!limpio) {
    mostrarAviso("Escribe un nombre para la categoría", "error");
    return null;
  }
  const repetida = todasLasCategorias().some(
    (cat) => cat !== ignorar && normalizar(partesCategoria(cat).nombre) === normalizar(limpio)
  );
  if (repetida) {
    mostrarAviso(`Ya existe una categoría llamada "${limpio}"`, "error");
    return null;
  }
  return `${primerEmoji(emoji)} ${limpio}`;
}

function usosCategoria(cat) {
  const movimientos = estado.movimientos.filter((m) => m.categoria === cat).length;
  const fijos = estado.recurrentes.filter((r) => r.categoria === cat).length;
  return { movimientos, fijos, total: movimientos + fijos };
}

function textoUsos({ movimientos, fijos }) {
  const partes = [];
  if (movimientos) partes.push(`${movimientos} movimiento${movimientos === 1 ? "" : "s"}`);
  if (fijos) partes.push(`${fijos} fijo${fijos === 1 ? "" : "s"}`);
  return partes.length ? partes.join(" · ") : "Sin usar";
}

// Cambia una categoría por otra en todo lo que la use
function sustituirCategoria(vieja, nueva, { conservarPresupuesto }) {
  estado.movimientos.forEach((m) => {
    if (m.categoria === vieja) m.categoria = nueva;
  });
  estado.recurrentes.forEach((r) => {
    if (r.categoria === vieja) r.categoria = nueva;
  });
  // Al renombrar, el presupuesto se va con ella; al borrar, desaparece
  if (conservarPresupuesto && vieja in estado.presupuestos) {
    estado.presupuestos[nueva] = estado.presupuestos[vieja];
  }
  delete estado.presupuestos[vieja];
  if (filtros.categoria === vieja) filtros.categoria = nueva;
}

// Hace el cambio guardando antes una copia completa, para poder deshacerlo.
// structuredClone copia el objeto entero (también lo que hay dentro).
function cambiarConDeshacer(mensaje, tipoAviso, cambio) {
  const copia = structuredClone(estado);
  cambio();
  actualizar();
  mostrarAviso(mensaje, tipoAviso, {
    texto: "Deshacer",
    alPulsar: () => {
      estado = copia;
      actualizar();
    },
  });
}

function añadirCategoria() {
  const tipo = $("#cat-tipo").value;
  const cat = construirCategoria($("#cat-emoji").value, $("#cat-nombre").value);
  if (!cat) return;

  estado.categorias[tipo].push(cat);
  resaltarId = "cat:" + cat;
  $("#cat-emoji").value = "";
  $("#cat-nombre").value = "";
  mostrarAviso(`🏷️ Categoría ${cat} añadida a ${tipo === "gasto" ? "gastos" : "ingresos"}`);
  actualizar();
}

function renombrarCategoria(tipo, vieja, emoji, nombre) {
  const nueva = construirCategoria(emoji, nombre, vieja);
  if (!nueva) return;

  editandoCategoria = null;
  if (nueva === vieja) return pintarGestorCategorias();

  resaltarId = "cat:" + nueva;
  const usos = usosCategoria(vieja).total;
  const detalle = usos ? ` (${usos} cambiado${usos === 1 ? "" : "s"})` : "";
  cambiarConDeshacer(`✏️ ${vieja} → ${nueva}${detalle}`, "exito", () => {
    const lista = estado.categorias[tipo];
    lista[lista.indexOf(vieja)] = nueva;
    sustituirCategoria(vieja, nueva, { conservarPresupuesto: true });
  });
}

function pedirBorrarCategoria(tipo, cat) {
  if (estado.categorias[tipo].length === 1) {
    return mostrarAviso("Tiene que quedar al menos una categoría de este tipo", "error");
  }
  // Si nadie la usa, se borra directamente; si no, preguntamos a dónde mover lo suyo
  if (usosCategoria(cat).total === 0) return borrarCategoria(tipo, cat, null);

  borrandoCategoria = cat;
  editandoCategoria = null;
  pintarGestorCategorias();
}

function borrarCategoria(tipo, cat, destino) {
  borrandoCategoria = null;
  const mensaje = destino ? `🗑️ ${cat} borrada; lo suyo pasa a ${destino}` : `🗑️ ${cat} borrada`;
  cambiarConDeshacer(mensaje, "info", () => {
    estado.categorias[tipo] = estado.categorias[tipo].filter((c) => c !== cat);
    if (destino) sustituirCategoria(cat, destino, { conservarPresupuesto: false });
    delete estado.presupuestos[cat];
  });
}

function cancelarGestionCategoria() {
  editandoCategoria = null;
  borrandoCategoria = null;
  pintarGestorCategorias();
}

// Un <li> de la lista; según el estado es una fila normal, un formulario o la pregunta de borrar
function itemCategoria(tipo, cat) {
  const id = "cat:" + cat;
  const botonCancelar = el("button", { type: "button", className: "secundario", textContent: "Cancelar" });
  botonCancelar.addEventListener("click", cancelarGestionCategoria);

  if (cat === editandoCategoria) {
    const { emoji, nombre } = partesCategoria(cat);
    const inputEmoji = el("input", { type: "text", value: emoji, maxLength: 8, className: "campo-emoji", title: "Emoji" });
    const inputNombre = el("input", { type: "text", value: nombre, maxLength: 25, required: true, title: "Nombre" });
    const formulario = el("form", { className: "fila" }, inputEmoji, inputNombre, el("button", { type: "submit" }, "Guardar"), botonCancelar);
    formulario.addEventListener("submit", (e) => {
      e.preventDefault();
      renombrarCategoria(tipo, cat, inputEmoji.value, inputNombre.value);
    });
    setTimeout(() => inputNombre.focus()); // esperamos a que esté en la página
    return el("li", { className: "bloque editando", dataset: { id } }, formulario);
  }

  if (cat === borrandoCategoria) {
    const otras = estado.categorias[tipo].filter((c) => c !== cat);
    const selectDestino = el("select", { title: "Mover a" });
    rellenarSelect(selectDestino, otras);
    const otros = otras.find((c) => normalizar(c).includes("otros"));
    if (otros) selectDestino.value = otros; // "Otros" es el destino más lógico
    const botonMover = el("button", { type: "button", className: "peligro", textContent: "Mover y borrar" });
    botonMover.addEventListener("click", () => borrarCategoria(tipo, cat, selectDestino.value));

    return el("li", { className: "bloque editando", dataset: { id } },
      el("span", {}, `${cat} tiene ${textoUsos(usosCategoria(cat))}. ¿A qué categoría los pasamos?`),
      el("div", { className: "fila" }, selectDestino, botonMover, botonCancelar)
    );
  }

  return el("li", { dataset: { id } },
    el("div", {}, el("span", {}, cat), el("small", {}, textoUsos(usosCategoria(cat)))),
    el("div", { className: "fila-derecha" },
      botonIcono("✏️", "Renombrar", () => {
        editandoCategoria = cat;
        borrandoCategoria = null;
        pintarGestorCategorias();
      }),
      botonBorrar("Borrar categoría", () => pedirBorrarCategoria(tipo, cat))
    )
  );
}

function pintarGestorCategorias() {
  ["gasto", "ingreso"].forEach((tipo) => {
    const lista = $(`#lista-cat-${tipo}`);
    lista.innerHTML = "";
    estado.categorias[tipo].forEach((cat) => lista.appendChild(itemCategoria(tipo, cat)));
  });
}

// Rellena un desplegable sin perder lo que estaba elegido (si sigue existiendo)
function rellenarConservando(select, opciones) {
  const anterior = select.value;
  rellenarSelect(select, opciones);
  if (opciones.includes(anterior)) select.value = anterior;
}

// Todos los desplegables de categorías se rehacen al cambiar la lista
function refrescarSelectsCategorias() {
  rellenarConservando(selectCategoria, estado.categorias[tipoSeleccionado()]);
  rellenarConservando(selectPresCategoria, estado.categorias.gasto);
  rellenarFiltroCategoria();
}

// ---------- EXPORTAR / IMPORTAR ----------
// Crea un archivo en memoria (Blob) y simula un clic en un enlace para descargarlo
function descargarArchivo(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const enlace = el("a", { href: url, download: nombre });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

function exportarJSON() {
  const copia = { app: "mis-finanzas", version: 1, exportado: new Date().toISOString(), datos: estado };
  descargarArchivo(`mis-finanzas-${hoy()}.json`, JSON.stringify(copia, null, 2), "application/json");
  mostrarAviso(`⬇️ Copia descargada (${estado.movimientos.length} movimientos, ${estado.metas.length} metas)`);
}

// Si el texto tiene ; comillas o saltos de línea, va entre comillas (y las comillas se duplican)
function celdaCSV(valor) {
  const texto = String(valor);
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function exportarCSV() {
  if (estado.movimientos.length === 0) return mostrarAviso("No hay movimientos que exportar", "info");

  const cabecera = ["Fecha", "Tipo", "Concepto", "Categoría", "Importe"];
  const filas = [...estado.movimientos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((m) => {
      const importe = (m.tipo === "gasto" ? -m.importe : m.importe) / 100;
      return [m.fecha, m.tipo, m.concepto, m.categoria, importe.toFixed(2).replace(".", ",")];
    });

  // Excel en español usa ; como separador y coma decimal
  const csv = [cabecera, ...filas].map((fila) => fila.map(celdaCSV).join(";")).join("\r\n");
  // ﻿ (BOM) para que Excel lea bien las tildes y los emojis
  descargarArchivo(`movimientos-${hoy()}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
  mostrarAviso(`📄 ${estado.movimientos.length} movimientos exportados`);
}

// Nunca te fíes de un archivo: comprobamos su forma antes de usarlo.
// Devuelve un mensaje de error o "" si todo está bien.
function validarDatos(datos) {
  if (!datos || typeof datos !== "object") return "El archivo no contiene datos.";

  const { movimientos, presupuestos, metas } = datos;
  if (!Array.isArray(movimientos) || !Array.isArray(metas) || !presupuestos || typeof presupuestos !== "object" || Array.isArray(presupuestos)) {
    return "Faltan movimientos, presupuestos o metas.";
  }

  const esTexto = (v) => typeof v === "string";
  const esCentimos = (n) => Number.isInteger(n) && n >= 0;
  const esFecha = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f);
  const esMes = (f) => /^\d{4}-\d{2}$/.test(f);

  const movimientosOk = movimientos.every(
    (m) => esTexto(m.id) && ["gasto", "ingreso"].includes(m.tipo) && esTexto(m.concepto) && esTexto(m.categoria) && esCentimos(m.importe) && esFecha(m.fecha)
  );
  if (!movimientosOk) return "Hay movimientos con datos incorrectos.";

  const metasOk = metas.every((m) => esTexto(m.id) && esTexto(m.nombre) && esCentimos(m.objetivo) && esCentimos(m.ahorrado) && esMes(m.fechaLimite));
  if (!metasOk) return "Hay metas con datos incorrectos.";

  if (!Object.values(presupuestos).every(esCentimos)) return "Hay presupuestos con datos incorrectos.";

  // Las copias antiguas no tienen recurrentes: en ese caso vale con []
  const recurrentes = datos.recurrentes ?? [];
  if (!Array.isArray(recurrentes)) return "Los gastos fijos no tienen el formato correcto.";
  const recurrentesOk = recurrentes.every(
    (r) =>
      esTexto(r.id) && ["gasto", "ingreso"].includes(r.tipo) && esTexto(r.concepto) && esTexto(r.categoria) &&
      esCentimos(r.importe) && Number.isInteger(r.dia) && r.dia >= 1 && r.dia <= 31 &&
      esMes(r.generadoHasta) && typeof r.activo === "boolean"
  );
  if (!recurrentesOk) return "Hay gastos fijos con datos incorrectos.";

  // Las categorías también son opcionales (copias antiguas)
  if (datos.categorias !== undefined) {
    const c = datos.categorias;
    const listaOk = (lista) => Array.isArray(lista) && lista.length > 0 && lista.every((x) => esTexto(x) && x.trim() !== "");
    if (!c || !listaOk(c.gasto) || !listaOk(c.ingreso)) return "Las categorías no tienen el formato correcto.";
  }

  return "";
}

// async/await: leer un archivo tarda, así que esperamos a que termine
async function importarArchivo(archivo) {
  let datos;
  try {
    const contenido = JSON.parse(await archivo.text());
    datos = contenido.datos ?? contenido; // acepta la copia completa o solo el estado
  } catch {
    return mostrarAviso("❌ El archivo no es un JSON válido", "error");
  }

  const error = validarDatos(datos);
  if (error) return mostrarAviso(`❌ ${error}`, "error");

  const recurrentes = datos.recurrentes ?? [];
  const resumen = `${datos.movimientos.length} movimientos, ${Object.keys(datos.presupuestos).length} presupuestos, ${datos.metas.length} metas y ${recurrentes.length} fijos`;
  if (!confirm(`Se van a cargar ${resumen}.\n\nEsto SUSTITUYE tus datos actuales. ¿Seguir?`)) return;

  const anterior = estado;
  const { movimientos, presupuestos, metas, categorias } = datos;
  // Si la copia no trae categorías, completarEstado pone las de siempre
  estado = completarEstado({ movimientos, presupuestos, metas, recurrentes, ...(categorias ? { categorias } : {}) });
  generarRecurrentes(); // por si la copia es de hace meses
  salirDeEdicion();
  salirDeEdicionMeta();
  actualizar();

  mostrarAviso(`⬆️ Importados ${resumen}`, "exito", {
    texto: "Deshacer",
    alPulsar: () => {
      estado = anterior;
      actualizar();
    },
  });
}

// ---------- TEMA (CLARO / OSCURO) ----------
// "auto" sigue al sistema operativo; "claro" y "oscuro" lo fuerzan.
// El CSS hace el resto mirando el atributo data-theme de <html>.
const CLAVE_TEMA = "mis-finanzas-tema";
const TEMAS = ["auto", "claro", "oscuro"];
const TEXTO_TEMA = { auto: "🌗 Auto", claro: "☀️ Claro", oscuro: "🌙 Oscuro" };

function temaGuardado() {
  try {
    return localStorage.getItem(CLAVE_TEMA) || "auto";
  } catch {
    return "auto";
  }
}

function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === "auto") delete raiz.dataset.theme;
  else raiz.dataset.theme = tema === "oscuro" ? "dark" : "light";

  $("#btn-tema").textContent = TEXTO_TEMA[tema];
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin localStorage el tema funciona igual, solo que no se recuerda
  }
}

function siguienteTema() {
  const actual = temaGuardado();
  const siguiente = TEMAS[(TEMAS.indexOf(actual) + 1) % TEMAS.length]; // % hace que vuelva al principio
  aplicarTema(siguiente);
  mostrarAviso(`Tema: ${TEXTO_TEMA[siguiente]}`, "info");
}

// ---------- INSTALAR COMO APP (PWA) ----------
// PWA = "Progressive Web App": una web que se puede instalar y usar sin internet.
// Necesita tres cosas: manifest.webmanifest (nombre e iconos), sw.js
// (el service worker que guarda los archivos) y abrirse por http(s).
let avisoInstalacion = null; // el navegador nos lo da cuando se puede instalar

function registrarServiceWorker() {
  // Con doble clic en index.html (file://) los service workers no funcionan
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("No se pudo registrar el service worker", e));
}

// Chrome y Edge avisan de que la app se puede instalar: guardamos el aviso
// y enseñamos nuestro propio botón en lugar del suyo
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  avisoInstalacion = e;
  $("#btn-instalar").hidden = false;
});

$("#btn-instalar").addEventListener("click", async () => {
  if (!avisoInstalacion) return;
  avisoInstalacion.prompt(); // abre la ventana de "¿Instalar?" del navegador
  const { outcome } = await avisoInstalacion.userChoice;
  avisoInstalacion = null; // cada aviso solo se puede usar una vez
  $("#btn-instalar").hidden = true;
  if (outcome === "dismissed") mostrarAviso("Instalación cancelada", "info");
});

window.addEventListener("appinstalled", () => {
  $("#btn-instalar").hidden = true;
  mostrarAviso("📲 ¡App instalada! Búscala en tu escritorio o pantalla de inicio");
});

// La app sigue funcionando sin conexión: solo avisamos
window.addEventListener("offline", () => mostrarAviso("📴 Sin conexión: puedes seguir usando la app", "info"));
window.addEventListener("online", () => mostrarAviso("🌐 Conexión recuperada", "info"));

// ---------- EVENTOS ----------
$("#btn-tema").addEventListener("click", siguienteTema);

// Filtros: "input" se dispara con cada letra, así la lista se filtra mientras escribes
$("#filtro-texto").addEventListener("input", (e) => {
  filtros.texto = e.target.value;
  pintarMovimientos();
});

$("#filtro-tipo").addEventListener("change", (e) => {
  filtros.tipo = e.target.value;
  rellenarFiltroCategoria();
  pintarMovimientos();
});

$("#filtro-categoria").addEventListener("change", (e) => {
  filtros.categoria = e.target.value;
  pintarMovimientos();
});

$("#filtro-alcance").addEventListener("change", (e) => {
  filtros.alcance = e.target.value;
  pintarMovimientos();
});

$("#btn-limpiar-filtros").addEventListener("click", () => {
  filtros = { ...FILTROS_INICIALES };
  $("#filtro-texto").value = "";
  $("#filtro-tipo").value = filtros.tipo;
  $("#filtro-alcance").value = filtros.alcance;
  rellenarFiltroCategoria();
  pintarMovimientos();
  mostrarAviso("Filtros quitados", "info");
});

// Atajo: pulsar "/" (fuera de un campo de texto) lleva al buscador
document.addEventListener("keydown", (e) => {
  const escribiendo = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
  if (e.key === "/" && !escribiendo) {
    e.preventDefault();
    $("#filtro-texto").focus();
  }
});

$("#btn-exportar").addEventListener("click", exportarJSON);
$("#btn-exportar-csv").addEventListener("click", exportarCSV);

$("#input-importar").addEventListener("change", (e) => {
  const archivo = e.target.files[0];
  if (archivo) importarArchivo(archivo);
  e.target.value = ""; // para poder volver a elegir el mismo archivo
});

inputMes.addEventListener("change", () => {
  if (!inputMes.value) return;
  mesSeleccionado = inputMes.value;
  pintarTodo();
});

// El gráfico se dibuja al ancho de la pantalla: lo repintamos si cambia
window.addEventListener("resize", pintarGrafico);

// Al cambiar Gasto/Ingreso cambian las categorías disponibles
formMovimiento.querySelectorAll("input[name=tipo]").forEach((radio) => {
  radio.addEventListener("change", () => rellenarSelect(selectCategoria, estado.categorias[tipoSeleccionado()]));
});

formMovimiento.addEventListener("submit", (e) => {
  e.preventDefault(); // que el formulario no recargue la página
  guardarMovimiento();
});

$("#btn-cancelar-edicion").addEventListener("click", cancelarEdicion);

// Escape también cancela la edición
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (editandoId) cancelarEdicion();
  if (editandoMetaId) cancelarEdicionMeta();
  if (editandoFijoId) cancelarEdicionFijo();
  if (editandoCategoria || borrandoCategoria) cancelarGestionCategoria();
});

formPresupuesto.addEventListener("submit", (e) => {
  e.preventDefault();
  fijarPresupuesto(selectPresCategoria.value, aCentimos($("#pres-importe").value));
  formPresupuesto.reset();
});

formMeta.addEventListener("submit", (e) => {
  e.preventDefault();
  guardarMeta();
});

$("#btn-cancelar-meta").addEventListener("click", cancelarEdicionMeta);

$("#form-categoria").addEventListener("submit", (e) => {
  e.preventDefault();
  añadirCategoria();
});

$("#btn-reset").addEventListener("click", () => {
  if (confirm("¿Borrar todos los movimientos, presupuestos y metas? No se puede deshacer.")) {
    estado = estadoVacio();
    salirDeEdicion();
    salirDeEdicionMeta();
    mostrarAviso("Todos los datos borrados", "info");
    actualizar();
  }
});

// ---------- INICIO ----------
registrarServiceWorker();
aplicarTema(temaGuardado());
inputMes.value = mesSeleccionado;
inputFecha.value = hoy();
$("#meta-fecha").min = mesActual();

// Al abrir la página se apuntan solos los fijos que ya tocaban
const fijosNuevos = generarRecurrentes();
if (fijosNuevos > 0) {
  guardarEstado();
  mostrarAviso(`🔁 Se han apuntado ${fijosNuevos} movimientos fijos automáticamente`, "info");
}
pintarTodo();
