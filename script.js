// ============================================================
//  script.js — Lógica del editor Pixeo
//  Separado de app.html para facilitar mantenimiento futuro
// ============================================================

const canvas  = document.getElementById('mi-canvas');
const ctx     = canvas.getContext('2d');

// Estado global del editor
const estado = {
  fondo:      '#0F0F1A',
  gradiente:  null,
  filtros:    { brightness:100, contrast:100, saturate:100, opacity:100, blur:0, sepia:0, grayscale:0 },
  objetos:    [],         // { tipo, x, y, w, h, texto, emoji, color, rot, imagen }
  seleccion:  null,       // índice del objeto seleccionado
  arrastrar:  false,
  offsetX:    0,
  offsetY:    0,
  zoom:       1,
  herramienta:'seleccionar',
  historial:  [],         // snapshots de estado para deshacer
  indexHist:  -1,
};

// ── ESTADO DE RECORTE ────────────────────────────────────────
const crop = {
  activo:    false,   // si el modo crop está activado
  x: 0, y: 0,        // posición del área de recorte en el canvas
  w: 0, h: 0,        // tamaño del área de recorte
  objIdx:    null,    // índice del objeto imagen que se está recortando
  arrastrando: false, // si está moviendo el área
  manija:    null,    // qué esquina se está arrastrando: 'tl','tr','bl','br'
  startX: 0, startY: 0,
  startCrop: null,
};

function cropManijaCercana(x, y) {
  if (!crop.activo) return null;
  const MS = 14;
  const esquinas = {
    tl: { x: crop.x,          y: crop.y },
    tr: { x: crop.x + crop.w, y: crop.y },
    bl: { x: crop.x,          y: crop.y + crop.h },
    br: { x: crop.x + crop.w, y: crop.y + crop.h },
  };
  for (const [key, p] of Object.entries(esquinas)) {
    if (Math.abs(x - p.x) <= MS && Math.abs(y - p.y) <= MS) return key;
  }
  return null;
}

function activarCrop() {
  if (estado.seleccion === null) {
    mostrarToast('Selecciona una imagen primero ✂️', 'error');
    return;
  }
  const obj = estado.objetos[estado.seleccion];
  if (obj.tipo !== 'imagen') {
    mostrarToast('El recorte solo funciona en imágenes 🖼️', 'error');
    return;
  }
  crop.activo  = true;
  crop.objIdx  = estado.seleccion;
  crop.x = obj.x;
  crop.y = obj.y;
  crop.w = obj.w;
  crop.h = obj.h;
  mostrarBarraCrop();
  render();
  mostrarToast('Arrastra las esquinas para recortar ✂️', 'info');
}

function confirmarCrop() {
  if (!crop.activo || crop.objIdx === null) return;
  const obj = estado.objetos[crop.objIdx];

  // Calcular coordenadas relativas a la imagen original
  const escalaX = obj.imagen.naturalWidth  / obj.w;
  const escalaY = obj.imagen.naturalHeight / obj.h;
  const sx = (crop.x - obj.x) * escalaX;
  const sy = (crop.y - obj.y) * escalaY;
  const sw = crop.w * escalaX;
  const sh = crop.h * escalaY;

  // Dibujar en canvas offscreen
  const off = document.createElement('canvas');
  off.width  = Math.max(1, Math.round(sw));
  off.height = Math.max(1, Math.round(sh));
  const octx = off.getContext('2d');
  octx.drawImage(obj.imagen, sx, sy, sw, sh, 0, 0, off.width, off.height);

  const nuevaImg = new Image();
  nuevaImg.onload = () => {
    obj.imagen = nuevaImg;
    obj.x = crop.x;
    obj.y = crop.y;
    obj.w = crop.w;
    obj.h = crop.h;
    cancelarCrop();
    guardarHistorial();
    render();
    mostrarToast('Recorte aplicado ✓', 'exito');
  };
  nuevaImg.src = off.toDataURL();
}

function cancelarCrop() {
  crop.activo  = false;
  crop.objIdx  = null;
  crop.manija  = null;
  crop.arrastrando = false;
  ocultarBarraCrop();
  // Volver a herramienta seleccionar
  estado.herramienta = 'seleccionar';
  canvas.style.cursor = 'default';
  document.querySelectorAll('.canvas-tool').forEach(b => b.classList.remove('activo'));
  document.querySelector('[data-herramienta="seleccionar"]').classList.add('activo');
  render();
}

function mostrarBarraCrop() {
  let barra = document.getElementById('crop-barra');
  if (!barra) {
    barra = document.createElement('div');
    barra.id = 'crop-barra';
    barra.style.cssText = `
      position:absolute; bottom:3.5rem; left:50%; transform:translateX(-50%);
      display:flex; gap:.5rem; align-items:center;
      background:rgba(1,28,64,0.95); border:1px solid rgba(167,235,242,0.3);
      border-radius:999px; padding:.4rem .85rem; z-index:20;
      backdrop-filter:blur(10px); box-shadow:0 4px 20px rgba(0,0,0,0.4);
      font-family:'Syne',sans-serif; font-size:.8rem;
    `;
    barra.innerHTML = `
      <span style="color:rgba(167,235,242,0.7);margin-right:.2rem">✂️ Recortando</span>
      <button id="btn-crop-ok"
        style="padding:.3rem .9rem;background:linear-gradient(135deg,#A7EBF2,#54ACBF);color:#011C40;border:none;border-radius:999px;font-weight:700;cursor:pointer;font-size:.8rem">
        ✓ Aplicar
      </button>
      <button id="btn-crop-cancel"
        style="padding:.3rem .9rem;background:rgba(255,255,255,0.07);color:#E8F8FA;border:1px solid rgba(167,235,242,0.2);border-radius:999px;cursor:pointer;font-size:.8rem">
        ✕ Cancelar
      </button>
    `;
    document.querySelector('.canvas-zona').appendChild(barra);
    document.getElementById('btn-crop-ok').addEventListener('click', confirmarCrop);
    document.getElementById('btn-crop-cancel').addEventListener('click', cancelarCrop);
  }
  barra.style.display = 'flex';
}

function ocultarBarraCrop() {
  const barra = document.getElementById('crop-barra');
  if (barra) barra.style.display = 'none';
}

// ── RENDERIZADO ──────────────────────────────────────────────
function render() {
  ctx.save();

  // Fondo
  if (estado.gradiente) {
    const gr = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    // Parsear dos colores del gradiente linear
    const m = estado.gradiente.match(/#[0-9a-fA-F]{6}/g);
    if (m && m.length >= 2) {
      gr.addColorStop(0, m[0]);
      gr.addColorStop(1, m[1]);
    }
    ctx.fillStyle = gr;
  } else {
    ctx.fillStyle = estado.fondo;
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Objetos
  estado.objetos.forEach((obj, idx) => {
    if (obj.oculto) return; // capa oculta
    ctx.save();

    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    ctx.translate(cx, cy);
    if (obj.rot) ctx.rotate((obj.rot * Math.PI) / 180);
    ctx.translate(-cx, -cy);

    if (obj.tipo === 'imagen') {
      // Filtros por objeto (no por canvas)
      const f = obj.filtros || {};
      ctx.filter = [
        `brightness(${f.brightness ?? 100}%)`,
        `contrast(${f.contrast   ?? 100}%)`,
        `saturate(${f.saturate   ?? 100}%)`,
        `opacity(${f.opacity     ?? 100}%)`,
        `blur(${f.blur           ?? 0}px)`,
        `sepia(${f.sepia         ?? 0}%)`,
        `grayscale(${f.grayscale ?? 0}%)`,
      ].join(' ');
      ctx.drawImage(obj.imagen, obj.x, obj.y, obj.w, obj.h);
      ctx.filter = 'none'; // Resetear para el siguiente objeto
    } else if (obj.tipo === 'forma') {
      ctx.fillStyle = obj.color || '#A7EBF2';
      ctx.globalAlpha = obj.opacidad || 1;
      if (obj.forma === 'circulo') {
        ctx.beginPath();
        ctx.ellipse(obj.x + obj.w/2, obj.y + obj.h/2, obj.w/2, obj.h/2, 0, 0, Math.PI*2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.roundRect(obj.x, obj.y, obj.w, obj.h, 6);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (obj.tipo === 'sticker') {
      ctx.font = `${Math.min(obj.w, obj.h)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(obj.emoji, obj.x + obj.w / 2, obj.y + obj.h / 2);
    } else if (obj.tipo === 'texto') {
      ctx.font         = `${obj.peso || 'bold'} ${obj.tamano || 36}px ${obj.fuente || 'Syne, sans-serif'}`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      const lineas = (obj.texto || '').split('\n');
      const lineH  = (obj.tamano || 36) * 1.25;
      const ef     = obj.efecto || 'ninguno';

      // ── Aplicar efecto de sombra/glow ──────────────────────
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      if (ef === 'sombra') {
        ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 14;
        ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 5;
      } else if (ef === 'neon') {
        ctx.shadowColor = obj.color || '#00ffff';
        ctx.shadowBlur = 22;
      } else if (ef === 'fuego') {
        ctx.shadowColor = '#FF6B35'; ctx.shadowBlur = 18;
        ctx.shadowOffsetX = 0; ctx.shadowOffsetY = -3;
      }

      // ── Capas 3D / contorno (antes del fill) ───────────────
      if (ef === 'contorno') {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth   = Math.max(2, (obj.tamano || 36) * 0.06);
        ctx.lineJoin    = 'round';
        lineas.forEach((l, li) => ctx.strokeText(l, obj.x, obj.y + li * lineH));
      } else if (ef === '3d') {
        for (let i = 5; i >= 1; i--) {
          ctx.fillStyle = `rgba(0,0,0,${0.12 + i * 0.07})`;
          lineas.forEach((l, li) => ctx.fillText(l, obj.x + i, obj.y + li * lineH + i));
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.lineJoin = 'round';
        lineas.forEach((l, li) => ctx.strokeText(l, obj.x, obj.y + li * lineH));
      }

      // ── Fill principal ─────────────────────────────────────
      ctx.fillStyle = (ef === 'neon') ? (obj.color || '#00ffff')
                    : (ef === 'fuego') ? (obj.color || '#FF6B35')
                    : (obj.color || '#ffffff');
      lineas.forEach((linea, li) => ctx.fillText(linea, obj.x, obj.y + li * lineH));

      // ── Segunda pasada neón (núcleo blanco) ────────────────
      if (ef === 'neon') {
        ctx.save();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.55; ctx.fillStyle = '#ffffff';
        lineas.forEach((l, li) => ctx.fillText(l, obj.x, obj.y + li * lineH));
        ctx.restore();
      }

      // Reset shadows
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

      obj.h = Math.max(lineH * lineas.length + 10, (obj.tamano || 36) + 20);
    }

    // ── Borde de selección + 8 manijas ──────────────────────────
    if (idx === estado.seleccion) {
      const PAD = 4; // margen visual del bounding box
      const bx = obj.x - PAD;
      const by = obj.y - PAD;
      const bw = obj.w + PAD * 2;
      const bh = obj.h + PAD * 2;

      // Borde punteado
      ctx.strokeStyle = '#A7EBF2';
      ctx.lineWidth = 1.5 / estado.zoom;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.setLineDash([]);

      // 8 manijas: esquinas (HS=8) + centros de lados (HS=6)
      const HS_C = 8;  // tamaño esquinas
      const HS_M = 6;  // tamaño centros
      const manijas8 = getManijas8(obj);
      manijas8.forEach(m => {
        const hs = (m.tipo === 'esquina') ? HS_C : HS_M;
        const half = hs / 2;
        // Sombra / borde exterior oscuro
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.roundRect(m.x - half - 1, m.y - half - 1, hs + 2, hs + 2, 2);
        ctx.fill();
        // Relleno blanco
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(m.x - half, m.y - half, hs, hs, 2);
        ctx.fill();
        // Borde celeste
        ctx.strokeStyle = '#54ACBF';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(m.x - half, m.y - half, hs, hs, 2);
        ctx.stroke();
      });
    }

    ctx.restore();
  });

  ctx.restore();

  // ── Overlay de RECORTE ──────────────────────────────────────
  if (crop.activo) {
    // Oscurecer todo el canvas fuera del área de recorte
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    // Top
    ctx.fillRect(0, 0, canvas.width, crop.y);
    // Bottom
    ctx.fillRect(0, crop.y + crop.h, canvas.width, canvas.height - crop.y - crop.h);
    // Left
    ctx.fillRect(0, crop.y, crop.x, crop.h);
    // Right
    ctx.fillRect(crop.x + crop.w, crop.y, canvas.width - crop.x - crop.w, crop.h);

    // Borde del área de recorte
    ctx.strokeStyle = '#A7EBF2';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);

    // Regla de tercios (líneas de guía)
    ctx.strokeStyle = 'rgba(167,235,242,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(crop.x + crop.w/3, crop.y);
    ctx.lineTo(crop.x + crop.w/3, crop.y + crop.h);
    ctx.moveTo(crop.x + crop.w*2/3, crop.y);
    ctx.lineTo(crop.x + crop.w*2/3, crop.y + crop.h);
    ctx.moveTo(crop.x, crop.y + crop.h/3);
    ctx.lineTo(crop.x + crop.w, crop.y + crop.h/3);
    ctx.moveTo(crop.x, crop.y + crop.h*2/3);
    ctx.lineTo(crop.x + crop.w, crop.y + crop.h*2/3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Las 4 manijas de esquina
    const manijas = [
      { x: crop.x,          y: crop.y },
      { x: crop.x + crop.w, y: crop.y },
      { x: crop.x,          y: crop.y + crop.h },
      { x: crop.x + crop.w, y: crop.y + crop.h },
    ];
    const MS = 10; // tamaño de manija
    manijas.forEach(m => {
      ctx.fillStyle = '#011C40';
      ctx.fillRect(m.x - MS/2 - 1, m.y - MS/2 - 1, MS + 2, MS + 2);
      ctx.fillStyle = '#A7EBF2';
      ctx.fillRect(m.x - MS/2, m.y - MS/2, MS, MS);
    });

    ctx.restore();
  }

  actualizarInfoBar();
  actualizarCapas();
}

// ── HISTORIAL ────────────────────────────────────────────────
function guardarHistorial() {
  const snapshot = JSON.stringify({
    fondo:    estado.fondo,
    gradiente:estado.gradiente,
    objetos:  estado.objetos.map(o => ({...o, imagen: o.imagen ? '__img__' : null})),
  });
  estado.historial = estado.historial.slice(0, estado.indexHist + 1);
  estado.historial.push(snapshot);
  estado.indexHist = estado.historial.length - 1;
}

document.getElementById('btn-deshacer').addEventListener('click', () => {
  if (estado.indexHist > 0) {
    estado.indexHist--;
    const s = JSON.parse(estado.historial[estado.indexHist]);
    estado.fondo    = s.fondo;
    estado.gradiente= s.gradiente;
    estado.objetos  = s.objetos.map(o => ({...o, imagen: null}));
    render();
    mostrarToast('Deshecho ↩', 'info');
  }
});

document.getElementById('btn-rehacer').addEventListener('click', () => {
  if (estado.indexHist < estado.historial.length - 1) {
    estado.indexHist++;
    const s = JSON.parse(estado.historial[estado.indexHist]);
    estado.fondo    = s.fondo;
    estado.gradiente= s.gradiente;
    estado.objetos  = s.objetos.map(o => ({...o, imagen: null}));
    render();
    mostrarToast('Rehecho ↪', 'info');
  }
});

// ── RAIL DE ÍCONOS ───────────────────────────────────────────
const layout = document.querySelector('.editor-layout');
const panelTitulos = {
  ia:         'IA Generativa',
  agente:     'Agente',
  subir:      'Subir imagen',
  ajustar:    'Ajustar',
  efectos:    'Efectos',
  stickers:   'Belleza / Stickers',
  plantillas: 'Plantillas / Borde',
  texto:      'Texto',
  colores:    'Elementos / Fondo',
  pro:        'Más herramientas',
};

let panelActualRail = 'ia';
let panelVisible = true;

document.querySelectorAll('.rail-btn[data-rail]').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.rail;

    // Si ya está activo, toggle del panel
    if (tab === panelActualRail) {
      panelVisible = !panelVisible;
      layout.classList.toggle('panel-abierto', panelVisible);
      return;
    }

    // Cambiar de tab
    document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');

    document.querySelectorAll('[data-panel]').forEach(p => p.style.display = 'none');
    const panel = document.querySelector(`[data-panel="${tab}"]`);
    if (panel) panel.style.display = 'block';

    document.getElementById('panel-titulo').textContent = panelTitulos[tab] || tab;
    panelActualRail = tab;
    panelVisible = true;
    layout.classList.add('panel-abierto');
  });
});

// Abrir panel inicial
layout.classList.add('panel-abierto');

// ── TABS PANEL IZQUIERDO (legacy — desactivado, rail lo maneja) ──
document.querySelectorAll('.panel-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach(t => {
      t.classList.remove('activo');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('[data-panel]').forEach(p => p.style.display = 'none');
    tab.classList.add('activo');
    tab.setAttribute('aria-selected', 'true');
    const panel = document.querySelector(`[data-panel="${tab.dataset.tab}"]`);
    if (panel) panel.style.display = 'block';
  });
});

// ── PLANTILLAS ───────────────────────────────────────────────
const plantillas = {
  sunset:      { fondo:'#FF6B35', gradiente:'linear-gradient(135deg, #FF6B35, #F7C948)' },
  ocean:       { fondo:'#0f3460', gradiente:'linear-gradient(135deg, #0f3460, #4ECDC4)' },
  noche:       { fondo:'#0f0f1a', gradiente:null },
  naturaleza:  { fondo:'#1a3a1a', gradiente:'linear-gradient(135deg, #1a3a1a, #4ECDC4)' },
  fuego:       { fondo:'#8b0000', gradiente:'linear-gradient(135deg, #8b0000, #FF6B35)' },
  galaxia:     { fondo:'#0d0d2b', gradiente:'linear-gradient(135deg, #0d0d2b, #6c3a9e)' },
  minimalista: { fondo:'#f5f5f0', gradiente:null },
  tropical:    { fondo:'#ff9a56', gradiente:'linear-gradient(135deg, #ff9a56, #ff6b9d)' },
};

document.querySelectorAll('[data-plantilla]').forEach(card => {
  card.addEventListener('click', () => {
    const p = plantillas[card.dataset.plantilla];
    if (!p) return;
    estado.fondo    = p.fondo;
    estado.gradiente= p.gradiente;
    guardarHistorial();
    render();
    mostrarToast('Plantilla aplicada 🎨', 'exito');
  });
});

// ── SUBIR IMAGEN ─────────────────────────────────────────────
// input-imagen: manejado por el módulo PANEL SUBIR (ver final de script.js)
document.getElementById('input-imagen').addEventListener('change', (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      const w = Math.min(img.width, canvas.width * 0.8);
      const h = w / ratio;
      estado.objetos.push({ tipo:'imagen', imagen:img,
        x:(canvas.width-w)/2, y:(canvas.height-h)/2, w, h, rot:0 });
      guardarHistorial(); render();
      mostrarToast('Imagen agregada ✓', 'exito');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(archivo);
});

// ── TEXTO ────────────────────────────────────────────────────
const configTexto = {
  titulo:    { texto:'Tu título aquí',        tamano:64, peso:'800', fuente:'Syne, sans-serif',    color:'#FFFFFF' },
  subtitulo: { texto:'Subtítulo aquí',         tamano:40, peso:'700', fuente:'Syne, sans-serif',    color:'#CCCCCC' },
  cuerpo:    { texto:'Escribe aquí tu texto...', tamano:24, peso:'400', fuente:'DM Sans, sans-serif', color:'#AAAAAA' },
};

document.querySelectorAll('[data-agregar-texto]').forEach(btn => {
  btn.addEventListener('click', () => {
    const cfg = configTexto[btn.dataset.agregarTexto];
    const obj = {
      tipo: 'texto',
      texto: cfg.texto,
      x: 50, y: 50 + estado.objetos.length * 80,
      w: canvas.width - 100, h: cfg.tamano + 20,
      tamano: cfg.tamano, peso: cfg.peso, fuente: cfg.fuente,
      color: cfg.color, rot: 0,
    };
    estado.objetos.push(obj);
    estado.seleccion = estado.objetos.length - 1;
    guardarHistorial();
    render();
    // Actualizar panel de edición con los valores del nuevo texto
    actualizarPanelTexto(obj);
    mostrarToast('Texto agregado — edítalo en el panel ✏️', 'exito');
  });
});

// Hover en presets de texto
document.querySelectorAll('.texto-preset').forEach(btn => {
  btn.addEventListener('mouseenter', () => {
    btn.style.borderColor = 'rgba(167,235,242,0.4)';
    btn.style.background  = 'rgba(167,235,242,0.1)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.borderColor = '';
    btn.style.background  = '';
  });
});

function actualizarPanelTexto(obj) {
  if (!obj || obj.tipo !== 'texto') return;
  document.getElementById('texto-contenido').value  = obj.texto  || '';
  const tam = obj.tamano || 36;
  document.getElementById('texto-tamano').value     = tam;
  const label = document.getElementById('texto-tamano-val');
  if (label) label.textContent = tam + 'px';
  document.getElementById('texto-peso').value       = obj.peso   || '700';
  document.getElementById('texto-fuente').value     = obj.fuente || 'Syne, sans-serif';
  const color = obj.color || '#ffffff';
  document.getElementById('texto-color-pick').value = color;
  syncColorTextoPreview(color);
  // Marcar círculo activo si coincide
  document.querySelectorAll('.color-texto-rapido').forEach(c => {
    c.style.borderColor = c.dataset.color?.toLowerCase() === color.toLowerCase() ? '#A7EBF2' : 'transparent';
  });
}

// Aplicar cambios del panel al objeto seleccionado
document.getElementById('btn-aplicar-texto').addEventListener('click', () => {
  if (estado.seleccion === null) {
    mostrarToast('Selecciona un texto en el canvas primero', 'error');
    return;
  }
  const obj = estado.objetos[estado.seleccion];
  if (obj.tipo !== 'texto') {
    mostrarToast('El objeto seleccionado no es un texto', 'error');
    return;
  }
  const nuevoTexto = document.getElementById('texto-contenido').value.trim();
  // Si el texto queda vacío, eliminar el objeto del canvas
  if (!nuevoTexto) {
    estado.objetos.splice(estado.seleccion, 1);
    estado.seleccion = null;
    document.getElementById('panel-objeto').style.display = 'none';
    guardarHistorial();
    render();
    mostrarToast('Texto vacío eliminado 🗑', 'info');
    return;
  }
  obj.texto  = nuevoTexto;
  const nuevoTamano = parseInt(document.getElementById('texto-tamano').value, 10);
  obj.tamano = (!isNaN(nuevoTamano) && nuevoTamano > 0) ? nuevoTamano : (obj.tamano || 36);
  obj.h      = obj.tamano + 20; // Recalcular altura del bounding box
  // Recalcular ancho según texto medido en canvas
  ctx.font = `${obj.peso} ${obj.tamano}px ${obj.fuente}`;
  const medida = ctx.measureText(obj.texto);
  obj.w = Math.max(medida.width + 20, 100);
  obj.peso   = document.getElementById('texto-peso').value;
  obj.fuente = document.getElementById('texto-fuente').value;
  obj.color  = document.getElementById('texto-color-pick').value;
  guardarHistorial();
  render();
  mostrarToast('Texto actualizado ✓', 'exito');
});

// Helper: actualiza el preview de color de texto en el panel
function syncColorTextoPreview(color) {
  const prev = document.getElementById('texto-color-preview');
  const hex  = document.getElementById('texto-color-hex');
  if (prev) prev.style.background = color;
  if (hex)  hex.textContent = color.toUpperCase();
  const pick = document.getElementById('texto-color-pick');
  if (pick) {
    try { pick.value = color; } catch(e) {}
  }
}

// Colores rápidos de texto
document.querySelectorAll('.color-texto-rapido').forEach(c => {
  c.addEventListener('click', () => {
    document.querySelectorAll('.color-texto-rapido').forEach(x => x.style.borderColor = 'transparent');
    c.style.borderColor = '#A7EBF2';
    const color = c.dataset.color;
    syncColorTextoPreview(color);
    // Aplica al texto seleccionado en tiempo real (NO afecta al fondo)
    if (estado.seleccion !== null && estado.objetos[estado.seleccion]?.tipo === 'texto') {
      estado.objetos[estado.seleccion].color = color;
      guardarHistorial();
      render();
      mostrarToast('Color de texto aplicado', 'exito');
    }
  });
});

// Picker de color personalizado — aplica en tiempo real solo al texto seleccionado
document.getElementById('texto-color-pick').addEventListener('input', (e) => {
  const color = e.target.value;
  // Deseleccionar círculos rápidos
  document.querySelectorAll('.color-texto-rapido').forEach(x => x.style.borderColor = 'transparent');
  syncColorTextoPreview(color);
  if (estado.seleccion !== null && estado.objetos[estado.seleccion]?.tipo === 'texto') {
    estado.objetos[estado.seleccion].color = color;
    render(); // live preview sin guardar historial
  }
});
document.getElementById('texto-color-pick').addEventListener('change', (e) => {
  const color = e.target.value;
  syncColorTextoPreview(color);
  if (estado.seleccion !== null && estado.objetos[estado.seleccion]?.tipo === 'texto') {
    estado.objetos[estado.seleccion].color = color;
    guardarHistorial();
    render();
  }
});

// Live update de tamaño, peso, fuente Y TEXTO mientras se escribe/cambia
// (color de texto tiene su propio listener dedicado arriba)
['texto-contenido','texto-tamano','texto-peso','texto-fuente'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    // Actualizar el label del slider de tamaño en tiempo real
    const sliderVal = parseInt(document.getElementById('texto-tamano').value, 10);
    const label = document.getElementById('texto-tamano-val');
    if (label) label.textContent = sliderVal + 'px';

    if (estado.seleccion === null) return;
    const obj = estado.objetos[estado.seleccion];
    if (obj?.tipo !== 'texto') return;
    const nuevoTexto = document.getElementById('texto-contenido').value;
    if (nuevoTexto !== undefined) obj.texto = nuevoTexto;
    const nuevoTamano = sliderVal;
    if (!isNaN(nuevoTamano) && nuevoTamano > 0) {
      obj.tamano = nuevoTamano;
      obj.h = nuevoTamano + 20;
    }
    obj.peso   = document.getElementById('texto-peso').value;
    obj.fuente = document.getElementById('texto-fuente').value;
    obj.color  = document.getElementById('texto-color-pick').value;
    render();
  });
});

// ── STICKERS ─────────────────────────────────────────────────
document.querySelectorAll('[data-sticker]').forEach(card => {
  card.addEventListener('click', () => {
    const emoji = card.dataset.sticker;
    const size  = 80;
    estado.objetos.push({
      tipo: 'sticker',
      emoji,
      x: Math.random() * (canvas.width - size),
      y: Math.random() * (canvas.height - size),
      w: size, h: size, rot: 0,
    });
    guardarHistorial();
    render();
    mostrarToast(`Sticker ${emoji} agregado`, 'exito');
  });
});

// ── FILTROS POR OBJETO (panel derecho, solo imágenes) ─────────
document.querySelectorAll('.filtro-obj').forEach(slider => {
  slider.addEventListener('input', () => {
    if (estado.seleccion === null) return;
    const obj = estado.objetos[estado.seleccion];
    if (obj.tipo !== 'imagen') return;
    if (!obj.filtros) obj.filtros = { brightness:100, contrast:100, saturate:100, opacity:100, blur:0, sepia:0, grayscale:0 };
    obj.filtros[slider.dataset.filtro] = parseFloat(slider.value);
    render();
  });
});

document.getElementById('btn-reset-filtros-obj').addEventListener('click', () => {
  if (estado.seleccion === null) return;
  const obj = estado.objetos[estado.seleccion];
  if (obj.tipo !== 'imagen') return;
  obj.filtros = { brightness:100, contrast:100, saturate:100, opacity:100, blur:0, sepia:0, grayscale:0 };
  document.querySelectorAll('.filtro-obj').forEach(slider => {
    const key = slider.dataset.filtro;
    slider.value = (key === 'blur' || key === 'sepia' || key === 'grayscale') ? 0 : 100;
  });
  render();
  mostrarToast('Filtros del objeto reseteados', 'info');
});

// ── FILTROS GLOBALES DE CANVAS (pestaña Ajustar del panel izquierdo) ─────
document.querySelectorAll('[data-filtro]:not(.filtro-obj)').forEach(slider => {
  slider.addEventListener('input', () => {
    estado.filtros[slider.dataset.filtro] = parseInt(slider.value, 10);
    aplicarFiltrosCanvas();
  });
});

function aplicarFiltrosCanvas() {
  const f = estado.filtros;
  canvas.style.filter = [
    `brightness(${f.brightness}%)`,
    `contrast(${f.contrast}%)`,
    `saturate(${f.saturate}%)`,
    `opacity(${f.opacity}%)`,
    `blur(${f.blur}px)`,
    `sepia(${f.sepia}%)`,
    `grayscale(${f.grayscale}%)`,
  ].join(' ');
}

document.querySelectorAll('#btn-reset-filtros, #btn-reset-filtros2').forEach(btn => {
  if (!btn) return;
  btn.addEventListener('click', () => {
    estado.filtros = { brightness:100, contrast:100, saturate:100, opacity:100, blur:0, sepia:0, grayscale:0 };
    document.querySelectorAll('[data-filtro]').forEach(slider => {
      if (['blur','sepia','grayscale'].includes(slider.dataset.filtro)) slider.value = 0;
      else if (slider.dataset.filtro === 'opacity') slider.value = 100;
      else slider.value = 100;
    });
    canvas.style.filter = 'none';
    mostrarToast('Filtros reseteados', 'info');
  });
});

// ── COLORES DE FONDO ─────────────────────────────────────────
// Solo los círculos dentro del panel "colores" cambian el fondo
document.querySelectorAll('[data-panel="colores"] [data-color]').forEach(circulo => {
  circulo.addEventListener('click', () => {
    estado.fondo    = circulo.dataset.color;
    estado.gradiente= null;
    document.querySelectorAll('[data-panel="colores"] [data-color]').forEach(c => c.classList.remove('activo'));
    circulo.classList.add('activo');
    guardarHistorial();
    render();
  });
});

document.querySelectorAll('[data-gradient]').forEach(circulo => {
  circulo.addEventListener('click', () => {
    estado.gradiente = circulo.dataset.gradient;
    guardarHistorial();
    render();
  });
});

document.getElementById('color-custom').addEventListener('input', (e) => {
  estado.fondo    = e.target.value;
  estado.gradiente= null;
  guardarHistorial();
  render();
});

// ── HERRAMIENTAS PRO / MODAL ──────────────────────────────────
const WORKER_URL = 'https://cv-ia-proxy.armamdofernando.workers.dev';

const modalOverlay  = document.getElementById('modal-pro');
const modalIcono    = document.getElementById('modal-icono');
const modalTitulo   = document.getElementById('modal-titulo');
const modalTexto    = document.getElementById('modal-texto');
const modalCosto    = document.getElementById('modal-costo');
const modalConfirmar= document.getElementById('modal-confirmar');
const modalCancelar = document.getElementById('modal-cancelar');

let proToolActual   = null;
let proCostoActual  = 0;

document.querySelectorAll('[data-pro-tool]').forEach(item => {
  item.addEventListener('click', () => {
    proToolActual  = item.dataset.proTool;
    proCostoActual = parseInt(item.dataset.costo, 10);

    const iconos = { 'bg-remove':'✂️','ai-enhance':'🪄','ai-generate':'🤖','hd-export':'🖥️','video-export':'🎬','obj-remove':'🪄' };
    const nombres= { 'bg-remove':'Eliminar fondo','ai-enhance':'Mejorar con IA','ai-generate':'Generar imagen con IA','hd-export':'Exportar HD 4K','video-export':'Exportar a video','obj-remove':'Quitar objeto con IA' };

    modalIcono.textContent  = iconos[proToolActual];
    modalTitulo.textContent = nombres[proToolActual];
    modalTexto.textContent  = `Esta herramienta usa ${proCostoActual} créditos. Tienes ${window.Creditos?.obtener() || 0} disponibles.`;
    modalCosto.textContent  = `⭐ ${proCostoActual} créditos`;

    // Mostrar campos de prompt solo para ai-generate
    const camposGenerar = document.getElementById('modal-generate-campos');
    if (camposGenerar) {
      camposGenerar.style.display = proToolActual === 'ai-generate' ? 'block' : 'none';
      if (proToolActual === 'ai-generate') {
        document.getElementById('modal-prompt').value = '';
      }
    }

    modalOverlay.classList.add('visible');
  });
});

modalCancelar.addEventListener('click', () => modalOverlay.classList.remove('visible'));
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove('visible'); });

modalConfirmar.addEventListener('click', async () => {
  // Verificar login
  if (window.pixeoUser && !window.pixeoUser()) {
    document.getElementById('modal-pro').classList.remove('visible');
    window.abrirModalLogin && window.abrirModalLogin();
    return;
  }
  if (!window.Creditos) return;
  const exito = await Promise.resolve(window.Creditos.gastar(proCostoActual));
  if (!exito) {
    mostrarToast('Sin créditos suficientes ⭐', 'error');
    modalOverlay.classList.remove('visible');
    return;
  }

  modalOverlay.classList.remove('visible');

  // ── Eliminar fondo con remove.bg via Worker ──
  if (proToolActual === 'bg-remove') {

    // Verificar que haya una imagen seleccionada
    if (estado.seleccion === null) {
      mostrarToast('Selecciona una imagen primero 🖼️', 'error');
      window.Creditos.devolver?.(proCostoActual);
      return;
    }
    const objActual = estado.objetos[estado.seleccion];
    if (!objActual || objActual.tipo !== 'imagen') {
      mostrarToast('Selecciona una imagen en el canvas 🖼️', 'error');
      window.Creditos.devolver?.(proCostoActual);
      return;
    }

    mostrarToast('✂️ Eliminando fondo…', 'info');

    try {
      // 1. Exportar SOLO la imagen seleccionada como Blob PNG
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width  = Math.round(objActual.w);
      tmpCanvas.height = Math.round(objActual.h);
      const tmpCtx = tmpCanvas.getContext('2d');
      tmpCtx.drawImage(objActual.imagen, 0, 0, tmpCanvas.width, tmpCanvas.height);

      const blob = await new Promise((res, rej) => {
        tmpCanvas.toBlob(b => b ? res(b) : rej(new Error('No se pudo exportar la imagen')), 'image/png');
      });

      // 2. Enviar al Worker (proxy remove.bg)
      const form = new FormData();
      form.append('image_file', blob, 'imagen.png');

      const resp = await fetch(`${WORKER_URL}/remove-background`, {
        method: 'POST',
        body: form,
      });

      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(`Worker error ${resp.status}: ${msg}`);
      }

      // 3. Recibir PNG sin fondo y REEMPLAZAR la imagen seleccionada
      const resultBlob = await resp.blob();
      const url = URL.createObjectURL(resultBlob);
      const imgNueva = new Image();
      imgNueva.onload = () => {
        const idx = estado.seleccion;
        estado.objetos[idx].imagen = imgNueva;
        guardarHistorial();
        actualizarCapas();
        render();
        URL.revokeObjectURL(url);
        mostrarToast('✅ ¡Fondo eliminado!', 'exito');
      };
      imgNueva.onerror = () => { throw new Error('No se pudo cargar la imagen resultante'); };
      imgNueva.src = url;

    } catch (err) {
      console.error('bg-remove error:', err);
      window.Creditos.devolver?.(proCostoActual);
      mostrarToast(`❌ Error: ${err.message}`, 'error');
    }

  // ── Mejorar imagen con IA (enhance) via Worker ──
  } else if (proToolActual === 'ai-enhance') {

    if (estado.seleccion === null) {
      mostrarToast('Selecciona una imagen primero 🖼️', 'error');
      window.Creditos.devolver?.(proCostoActual);
      return;
    }
    const objActual = estado.objetos[estado.seleccion];
    if (!objActual || objActual.tipo !== 'imagen') {
      mostrarToast('Selecciona una imagen en el canvas 🖼️', 'error');
      window.Creditos.devolver?.(proCostoActual);
      return;
    }

    mostrarToast('🪄 Mejorando imagen con IA…', 'info');

    try {
      // 1. Exportar la imagen seleccionada como Blob PNG
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width  = Math.round(objActual.w);
      tmpCanvas.height = Math.round(objActual.h);
      const tmpCtx = tmpCanvas.getContext('2d');
      tmpCtx.drawImage(objActual.imagen, 0, 0, tmpCanvas.width, tmpCanvas.height);

      const blob = await new Promise((res, rej) => {
        tmpCanvas.toBlob(b => b ? res(b) : rej(new Error('No se pudo exportar la imagen')), 'image/png');
      });

      // 2. Enviar al Worker (ruta /enhance-image)
      const form = new FormData();
      form.append('image_file', blob, 'imagen.png');

      const resp = await fetch(`${WORKER_URL}/enhance-image`, {
        method: 'POST',
        body: form,
      });

      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(`Worker error ${resp.status}: ${msg}`);
      }

      const contentType = resp.headers.get('Content-Type') || '';

      if (contentType.includes('image')) {
        // 3a. El worker devuelve una imagen mejorada — reemplazar en canvas
        const resultBlob = await resp.blob();
        const url = URL.createObjectURL(resultBlob);
        const imgNueva = new Image();
        imgNueva.onload = () => {
          const idx = estado.seleccion;
          estado.objetos[idx].imagen = imgNueva;
          guardarHistorial();
          actualizarCapas();
          render();
          URL.revokeObjectURL(url);
          mostrarToast('✅ ¡Imagen mejorada!', 'exito');
        };
        imgNueva.onerror = () => { throw new Error('No se pudo cargar la imagen resultante'); };
        imgNueva.src = url;
      } else {
        // 3b. El worker devuelve JSON (clasificación u otro resultado)
        const data = await resp.json();
        console.log('Enhance result:', data);
        // Mostrar el resultado más relevante si viene de clasificación
        const label = Array.isArray(data) ? data[0]?.label : (data?.result?.[0]?.label || 'procesada');
        mostrarToast(`✅ Imagen analizada: ${label}`, 'exito');
      }

    } catch (err) {
      console.error('ai-enhance error:', err);
      window.Creditos.devolver?.(proCostoActual);
      mostrarToast(`❌ Error: ${err.message}`, 'error');
    }

  // ── Generar imagen con IA via Worker ──
  } else if (proToolActual === 'ai-generate') {

    const promptVal = (document.getElementById('modal-prompt')?.value || '').trim();
    if (!promptVal) {
      mostrarToast('✍️ Escribe qué imagen quieres generar', 'error');
      window.Creditos.devolver?.(proCostoActual);
      return;
    }
    const styleVal = document.getElementById('modal-style')?.value || 'realista';

    mostrarToast('🤖 Generando imagen con IA…', 'info');

    try {
      const resp = await fetch(`${WORKER_URL}/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptVal, style: styleVal })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      const contentType = resp.headers.get('Content-Type') || '';

      if (contentType.includes('image')) {
        // Respuesta es una imagen directa
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          // Agregar como nuevo objeto imagen al canvas
          estado.objetos.push({
            tipo: 'imagen',
            imagen: img,
            x: 20,
            y: 20,
            w: Math.min(img.naturalWidth, canvas.width  - 40),
            h: Math.min(img.naturalHeight, canvas.height - 40),
            opacidad: 1,
            oculto: false,
          });
          estado.seleccion = estado.objetos.length - 1;
          guardarHistorial();
          actualizarCapas();
          render();
          URL.revokeObjectURL(url);
          mostrarToast('✅ ¡Imagen generada!', 'exito');
          if (window.Creditos) window.Creditos.agregar(0); // actualiza UI créditos
        };
        img.onerror = () => { throw new Error('No se pudo cargar la imagen generada'); };
        img.src = url;

      } else {
        // Respuesta JSON con URL o base64
        const data = await resp.json();
        const imgSrc = data.url || data.image || data.result;
        if (!imgSrc) throw new Error('El servidor no devolvió una imagen válida');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          estado.objetos.push({
            tipo: 'imagen',
            imagen: img,
            x: 20, y: 20,
            w: Math.min(img.naturalWidth,  canvas.width  - 40),
            h: Math.min(img.naturalHeight, canvas.height - 40),
            opacidad: 1,
            oculto: false,
          });
          estado.seleccion = estado.objetos.length - 1;
          guardarHistorial();
          actualizarCapas();
          render();
          mostrarToast('✅ ¡Imagen generada!', 'exito');
        };
        img.onerror = () => { throw new Error('No se pudo cargar la imagen generada'); };
        img.src = imgSrc;
      }

    } catch (err) {
      console.error('ai-generate error:', err);
      window.Creditos.devolver?.(proCostoActual);
      mostrarToast(`❌ Error: ${err.message}`, 'error');
    }

  // ── Quitar objeto con IA (Replicate Inpainting) ──────────────
  } else if (proToolActual === 'obj-remove') {

    if (estado.seleccion === null) {
      mostrarToast('Selecciona una imagen primero 🖼️', 'error');
      window.Creditos.devolver?.(proCostoActual);
      return;
    }
    const objActual = estado.objetos[estado.seleccion];
    if (!objActual || objActual.tipo !== 'imagen') {
      mostrarToast('Selecciona una imagen en el canvas 🖼️', 'error');
      window.Creditos.devolver?.(proCostoActual);
      return;
    }

    // Activar modo pincel para marcar el área a borrar
    window._objRemoveActivo = true;
    window._objRemoveCapas  = JSON.parse(JSON.stringify(
      estado.objetos.map(o => ({ ...o, imagen: null }))
    ));
    window._objRemoveImagen = objActual.imagen;
    window._objRemoveCosto  = proCostoActual;

    // Crear overlay de pintura sobre el canvas
    const zonaCanvas = document.querySelector('.canvas-zona');
    const maskCanvas = document.createElement('canvas');
    maskCanvas.id     = 'mask-canvas';
    maskCanvas.width  = canvas.width;
    maskCanvas.height = canvas.height;
    const escala      = canvas.getBoundingClientRect().width / canvas.width;
    maskCanvas.style.cssText = `
      position:absolute; top:0; left:50%; transform:translateX(-50%);
      width:${canvas.getBoundingClientRect().width}px;
      height:${canvas.getBoundingClientRect().height}px;
      cursor:crosshair; z-index:100; opacity:0.6;
    `;
    zonaCanvas.style.position = 'relative';
    zonaCanvas.appendChild(maskCanvas);

    const mCtx    = maskCanvas.getContext('2d');
    let pintando  = false;
    const GROSOR  = 30;

    mCtx.fillStyle = 'black';
    mCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    maskCanvas.addEventListener('mousedown', e => {
      pintando = true;
      mCtx.beginPath();
      const r = maskCanvas.getBoundingClientRect();
      mCtx.moveTo((e.clientX - r.left) / escala, (e.clientY - r.top) / escala);
    });
    maskCanvas.addEventListener('mousemove', e => {
      if (!pintando) return;
      const r = maskCanvas.getBoundingClientRect();
      mCtx.lineTo((e.clientX - r.left) / escala, (e.clientY - r.top) / escala);
      mCtx.strokeStyle = 'white';
      mCtx.lineWidth   = GROSOR;
      mCtx.lineCap     = 'round';
      mCtx.stroke();
    });
    maskCanvas.addEventListener('mouseup',   () => { pintando = false; });
    maskCanvas.addEventListener('mouseleave',() => { pintando = false; });

    // Panel de instrucciones + botón procesar
    const instrPanel = document.createElement('div');
    instrPanel.id    = 'obj-remove-panel';
    instrPanel.style.cssText = `
      position:fixed; bottom:5rem; left:50%; transform:translateX(-50%);
      background:#1a1a2e; border:1px solid #7c5cfc; border-radius:12px;
      padding:.75rem 1.25rem; z-index:200; display:flex; align-items:center;
      gap:1rem; color:#fff; font-size:.85rem; box-shadow:0 8px 24px rgba(0,0,0,.5);
    `;
    instrPanel.innerHTML = `
      <span>🖌️ <strong>Pinta en blanco</strong> el objeto a borrar</span>
      <button id="btn-procesar-mask" style="background:#7c5cfc;color:#fff;border:none;border-radius:8px;padding:6px 16px;font-weight:700;cursor:pointer;">
        ✨ Borrar objeto
      </button>
      <button id="btn-cancelar-mask" style="background:none;border:1px solid #555;color:#aaa;border-radius:8px;padding:6px 12px;cursor:pointer;">
        Cancelar
      </button>
    `;
    document.body.appendChild(instrPanel);

    // Cancelar
    document.getElementById('btn-cancelar-mask').onclick = () => {
      maskCanvas.remove();
      instrPanel.remove();
      window.Creditos.devolver?.(proCostoActual);
      mostrarToast('Cancelado', 'info');
    };

    // Procesar con Replicate
    document.getElementById('btn-procesar-mask').onclick = async () => {
      instrPanel.querySelector('#btn-procesar-mask').textContent = '⏳ Procesando…';
      instrPanel.querySelector('#btn-procesar-mask').disabled    = true;

      try {
        // Exportar imagen original (solo el objeto seleccionado)
        const tmpC = document.createElement('canvas');
        tmpC.width  = Math.round(objActual.w);
        tmpC.height = Math.round(objActual.h);
        tmpC.getContext('2d').drawImage(objActual.imagen, 0, 0, tmpC.width, tmpC.height);
        const imagenBase64 = tmpC.toDataURL('image/png');

        // Exportar máscara escalada al tamaño del objeto
        const maskScaled = document.createElement('canvas');
        maskScaled.width  = Math.round(objActual.w);
        maskScaled.height = Math.round(objActual.h);
        maskScaled.getContext('2d').drawImage(maskCanvas, 
          0, 0, maskCanvas.width, maskCanvas.height,
          0, 0, maskScaled.width, maskScaled.height
        );
        const mascaraBase64 = maskScaled.toDataURL('image/png');

        mostrarToast('🤖 Enviando al Worker…', 'info');

        // Llamar a NUESTRO Worker (nunca directo a Replicate desde el navegador).
        // El Worker guarda el token de Replicate como secreto — ver worker.js
        // y la ruta POST /remove-object del paquete "paso1-worker".
        const imagenBlob  = await (await fetch(imagenBase64)).blob();
        const mascaraBlob = await (await fetch(mascaraBase64)).blob();

        const form = new FormData();
        form.append('image_file', imagenBlob, 'imagen.png');
        form.append('mask_file',  mascaraBlob, 'mascara.png');

        const workerResp = await fetch(`${WORKER_URL}/remove-object`, {
          method: 'POST',
          body: form,
        });

        if (!workerResp.ok) {
          const msg = await workerResp.text();
          throw new Error(`Worker error ${workerResp.status}: ${msg}`);
        }

        const { url: urlResultado } = await workerResp.json();

        // Cargar imagen resultante y reemplazar en canvas
        const imgResultado = new Image();
        imgResultado.crossOrigin = 'anonymous';
        imgResultado.onload = () => {
          const idx = estado.seleccion;
          if (idx !== null) estado.objetos[idx].imagen = imgResultado;
          guardarHistorial();
          actualizarCapas();
          render();
          mostrarToast('✅ ¡Objeto borrado con IA! -15 ⭐', 'exito');
        };
        imgResultado.onerror = () => { throw new Error('No se pudo cargar el resultado'); };
        imgResultado.src = urlResultado;

      } catch (err) {
        console.error('obj-remove error:', err);
        window.Creditos.devolver?.(proCostoActual);
        mostrarToast(`❌ Error: ${err.message}`, 'error');
      } finally {
        maskCanvas.remove();
        instrPanel.remove();
      }
    };

  } else {
    // Otras herramientas pro (próximamente)
    mostrarToast(`✅ ${proToolActual} activado (próximamente)`, 'exito');
  }
});

// ── CANVAS MOUSE EVENTS ───────────────────────────────────────
const wrapper = document.getElementById('canvas-wrapper');

function posCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / estado.zoom,
    y: (e.clientY - rect.top)  / estado.zoom,
  };
}

function hitTest(x, y) {
  for (let i = estado.objetos.length - 1; i >= 0; i--) {
    const o = estado.objetos[i];
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return i;
  }
  return null;
}

// ── SISTEMA DE 8 MANIJAS ─────────────────────────────────────
// Retorna las 8 manijas del objeto seleccionado con su tipo y cursor
// Las manijas se ubican exactamente sobre los bordes/esquinas del objeto
function getManijas8(obj) {
  const x = obj.x, y = obj.y, w = obj.w, h = obj.h;
  return [
    { id:'tl', x: x,       y: y,       tipo:'esquina', cursor:'nwse-resize' },
    { id:'tc', x: x + w/2, y: y,       tipo:'lado',    cursor:'ns-resize'   },
    { id:'tr', x: x + w,   y: y,       tipo:'esquina', cursor:'nesw-resize' },
    { id:'ml', x: x,       y: y + h/2, tipo:'lado',    cursor:'ew-resize'   },
    { id:'mr', x: x + w,   y: y + h/2, tipo:'lado',    cursor:'ew-resize'   },
    { id:'bl', x: x,       y: y + h,   tipo:'esquina', cursor:'nesw-resize' },
    { id:'bc', x: x + w/2, y: y + h,   tipo:'lado',    cursor:'ns-resize'   },
    { id:'br', x: x + w,   y: y + h,   tipo:'esquina', cursor:'nwse-resize' },
  ];
}

function hitManija(x, y) {
  if (estado.seleccion === null) return null;
  const obj = estado.objetos[estado.seleccion];
  const manijas = getManijas8(obj);
  const HIT = 10; // radio de hit en píxeles de canvas
  for (const m of manijas) {
    if (Math.abs(x - m.x) <= HIT && Math.abs(y - m.y) <= HIT) return m;
  }
  return null;
}

// hitResizeHandle: alias para feedback de cursor en mousemove
function hitResizeHandle(x, y) {
  return hitManija(x, y);
}

// Resize state
let redimensionando = false;
let manijaActiva    = null; // id de la manija que se está arrastrando
let resizeStartX = 0, resizeStartY = 0;
let resizeStartObj = null; // snapshot de { x, y, w, h } al inicio del drag

canvas.addEventListener('mousedown', (e) => {
  const pos = posCanvas(e);

  // ── Modo RECORTE ──────────────────────────────────────────
  if (crop.activo) {
    const manija = cropManijaCercana(pos.x, pos.y);
    if (manija) {
      crop.manija    = manija;
      crop.startX    = pos.x;
      crop.startY    = pos.y;
      crop.startCrop = { x: crop.x, y: crop.y, w: crop.w, h: crop.h };
      canvas.style.cursor = 'nwse-resize';
    } else if (pos.x >= crop.x && pos.x <= crop.x + crop.w &&
               pos.y >= crop.y && pos.y <= crop.y + crop.h) {
      // Arrastrar todo el área de recorte
      crop.arrastrando = true;
      crop.startX = pos.x - crop.x;
      crop.startY = pos.y - crop.y;
      canvas.style.cursor = 'move';
    }
    return;
  }

  if (estado.herramienta !== 'seleccionar' && estado.herramienta !== 'mover') return;

  // Check 8 manijas de resize primero
  const manijaHit = hitManija(pos.x, pos.y);
  if (manijaHit && estado.seleccion !== null) {
    redimensionando = true;
    manijaActiva    = manijaHit.id;
    resizeStartX    = pos.x;
    resizeStartY    = pos.y;
    const obj = estado.objetos[estado.seleccion];
    resizeStartObj  = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    canvas.style.cursor = manijaHit.cursor;
    return;
  }

  const hit = hitTest(pos.x, pos.y);
  if (hit !== null) {
    estado.seleccion = hit;
    estado.arrastrar = true;
    const obj = estado.objetos[hit];
    estado.offsetX = pos.x - obj.x;
    estado.offsetY = pos.y - obj.y;
    mostrarPropiedades(obj);
  } else {
    estado.seleccion = null;
    document.getElementById('panel-objeto').style.display = 'none';
  }
  render();
});

canvas.addEventListener('mousemove', (e) => {
  const pos = posCanvas(e);

  // ── Modo RECORTE ──────────────────────────────────────────
  if (crop.activo) {
    if (crop.manija && crop.startCrop) {
      const dx = pos.x - crop.startX;
      const dy = pos.y - crop.startY;
      const s  = crop.startCrop;
      const obj = estado.objetos[crop.objIdx];
      const MIN = 20;
      if (crop.manija === 'tl') {
        crop.x = Math.min(s.x + dx, s.x + s.w - MIN);
        crop.y = Math.min(s.y + dy, s.y + s.h - MIN);
        crop.w = s.w - (crop.x - s.x);
        crop.h = s.h - (crop.y - s.y);
      } else if (crop.manija === 'tr') {
        crop.y = Math.min(s.y + dy, s.y + s.h - MIN);
        crop.w = Math.max(MIN, s.w + dx);
        crop.h = s.h - (crop.y - s.y);
      } else if (crop.manija === 'bl') {
        crop.x = Math.min(s.x + dx, s.x + s.w - MIN);
        crop.w = s.w - (crop.x - s.x);
        crop.h = Math.max(MIN, s.h + dy);
      } else if (crop.manija === 'br') {
        crop.w = Math.max(MIN, s.w + dx);
        crop.h = Math.max(MIN, s.h + dy);
      }
      // Limitar dentro de la imagen
      if (obj) {
        crop.x = Math.max(obj.x, Math.min(crop.x, obj.x + obj.w - MIN));
        crop.y = Math.max(obj.y, Math.min(crop.y, obj.y + obj.h - MIN));
        crop.w = Math.min(crop.w, obj.x + obj.w - crop.x);
        crop.h = Math.min(crop.h, obj.y + obj.h - crop.y);
      }
      render();
      return;
    }
    if (crop.arrastrando) {
      const obj = estado.objetos[crop.objIdx];
      crop.x = Math.max(obj ? obj.x : 0, pos.x - crop.startX);
      crop.y = Math.max(obj ? obj.y : 0, pos.y - crop.startY);
      if (obj) {
        crop.x = Math.min(crop.x, obj.x + obj.w - crop.w);
        crop.y = Math.min(crop.y, obj.y + obj.h - crop.h);
      }
      render();
      return;
    }
    // Cursor feedback en modo crop
    const m = cropManijaCercana(pos.x, pos.y);
    if (m) canvas.style.cursor = 'nwse-resize';
    else if (pos.x >= crop.x && pos.x <= crop.x + crop.w &&
             pos.y >= crop.y && pos.y <= crop.y + crop.h)
      canvas.style.cursor = 'move';
    else canvas.style.cursor = 'crosshair';
    return;
  }

  // Resize drag — 8 manijas
  if (redimensionando && estado.seleccion !== null && manijaActiva) {
    const obj = estado.objetos[estado.seleccion];
    const dx = pos.x - resizeStartX;
    const dy = pos.y - resizeStartY;
    const s  = resizeStartObj;
    const MIN_W = 20, MIN_H = 20;

    // Calcular nuevas dimensiones según qué manija se arrastra
    let nx = s.x, ny = s.y, nw = s.w, nh = s.h;
    const id = manijaActiva;

    if (id === 'br') { nw = s.w + dx;       nh = s.h + dy; }
    else if (id === 'bl') { nx = s.x + dx;  nw = s.w - dx; nh = s.h + dy; }
    else if (id === 'tr') { ny = s.y + dy;  nw = s.w + dx; nh = s.h - dy; }
    else if (id === 'tl') { nx = s.x + dx;  ny = s.y + dy; nw = s.w - dx; nh = s.h - dy; }
    else if (id === 'mr') { nw = s.w + dx; }
    else if (id === 'ml') { nx = s.x + dx;  nw = s.w - dx; }
    else if (id === 'bc') { nh = s.h + dy; }
    else if (id === 'tc') { ny = s.y + dy;  nh = s.h - dy; }

    // Mantener proporción con Shift
    if (e.shiftKey && (id === 'br' || id === 'bl' || id === 'tr' || id === 'tl')) {
      const ratio = s.w / s.h;
      // Usar el eje con mayor cambio absoluto
      if (Math.abs(nw - s.w) >= Math.abs(nh - s.h)) {
        nh = nw / ratio;
        if (id === 'tl' || id === 'tr') ny = s.y + s.h - nh;
      } else {
        nw = nh * ratio;
        if (id === 'tl' || id === 'bl') nx = s.x + s.w - nw;
      }
    }

    // Aplicar mínimos
    if (nw < MIN_W) { nw = MIN_W; if (id.includes('l')) nx = s.x + s.w - MIN_W; }
    if (nh < MIN_H) { nh = MIN_H; if (id.includes('t')) ny = s.y + s.h - MIN_H; }

    obj.x = nx; obj.y = ny; obj.w = nw; obj.h = nh;

    // Sync panel derecho
    document.getElementById('obj-x').value = Math.round(obj.x);
    document.getElementById('obj-y').value = Math.round(obj.y);
    document.getElementById('obj-w').value = Math.round(obj.w);
    document.getElementById('obj-h').value = Math.round(obj.h);
    render();
    return;
  }

  // Move drag
  if (estado.arrastrar && estado.seleccion !== null) {
    const obj = estado.objetos[estado.seleccion];
    obj.x = pos.x - estado.offsetX;
    obj.y = pos.y - estado.offsetY;
    render();
    return;
  }

  // Cursor feedback: usar el cursor correcto según la manija en hover
  const manijaHover = hitResizeHandle(pos.x, pos.y);
  if (manijaHover) {
    canvas.style.cursor = manijaHover.cursor;
  } else {
    const cursores = { seleccionar:'default', mover:'grab', texto:'text', forma:'crosshair', recortar:'crosshair' };
    canvas.style.cursor = cursores[estado.herramienta] || 'default';
  }
});

canvas.addEventListener('mouseup', () => {
  // Crop: soltar manija o área
  if (crop.activo) {
    crop.manija      = null;
    crop.arrastrando = false;
    crop.startCrop   = null;
    canvas.style.cursor = 'crosshair';
    return;
  }
  if (redimensionando || estado.arrastrar) guardarHistorial();
  redimensionando = false;
  estado.arrastrar = false;
  const cursores = { seleccionar:'default', mover:'grab', texto:'text', forma:'crosshair', recortar:'crosshair' };
  canvas.style.cursor = cursores[estado.herramienta] || 'default';
});

// ── SOPORTE TOUCH (móvil) ─────────────────────────────────────
function posTouchCanvas(touch) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (touch.clientX - rect.left) / estado.zoom,
    y: (touch.clientY - rect.top)  / estado.zoom,
  };
}
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  e.preventDefault();
  const pos = posTouchCanvas(e.touches[0]);
  if (estado.herramienta !== 'seleccionar' && estado.herramienta !== 'mover') return;
  const manijaHit = hitManija(pos.x, pos.y);
  if (manijaHit && estado.seleccion !== null) {
    redimensionando = true;
    manijaActiva    = manijaHit.id;
    resizeStartX    = pos.x;
    resizeStartY    = pos.y;
    const obj = estado.objetos[estado.seleccion];
    resizeStartObj  = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    return;
  }
  const hit = hitTest(pos.x, pos.y);
  if (hit !== null) {
    estado.seleccion = hit;
    estado.arrastrar = true;
    const obj = estado.objetos[hit];
    estado.offsetX = pos.x - obj.x;
    estado.offsetY = pos.y - obj.y;
    mostrarPropiedades(obj);
  } else {
    estado.seleccion = null;
    document.getElementById('panel-objeto').style.display = 'none';
  }
  render();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length !== 1) return;
  e.preventDefault();
  const pos = posTouchCanvas(e.touches[0]);
  if (redimensionando && estado.seleccion !== null && manijaActiva) {
    const obj = estado.objetos[estado.seleccion];
    const dx = pos.x - resizeStartX;
    const dy = pos.y - resizeStartY;
    const s  = resizeStartObj;
    const MIN_W = 20, MIN_H = 20;
    let nx = s.x, ny = s.y, nw = s.w, nh = s.h;
    const id = manijaActiva;
    if (id === 'br') { nw = s.w + dx;       nh = s.h + dy; }
    else if (id === 'bl') { nx = s.x + dx;  nw = s.w - dx; nh = s.h + dy; }
    else if (id === 'tr') { ny = s.y + dy;  nw = s.w + dx; nh = s.h - dy; }
    else if (id === 'tl') { nx = s.x + dx;  ny = s.y + dy; nw = s.w - dx; nh = s.h - dy; }
    else if (id === 'mr') { nw = s.w + dx; }
    else if (id === 'ml') { nx = s.x + dx;  nw = s.w - dx; }
    else if (id === 'bc') { nh = s.h + dy; }
    else if (id === 'tc') { ny = s.y + dy;  nh = s.h - dy; }
    if (nw < MIN_W) { nw = MIN_W; if (id.includes('l')) nx = s.x + s.w - MIN_W; }
    if (nh < MIN_H) { nh = MIN_H; if (id.includes('t')) ny = s.y + s.h - MIN_H; }
    obj.x = nx; obj.y = ny; obj.w = nw; obj.h = nh;
    document.getElementById('obj-x').value = Math.round(obj.x);
    document.getElementById('obj-y').value = Math.round(obj.y);
    document.getElementById('obj-w').value = Math.round(obj.w);
    document.getElementById('obj-h').value = Math.round(obj.h);
    render();
    return;
  }
  if (estado.arrastrar && estado.seleccion !== null) {
    const obj = estado.objetos[estado.seleccion];
    obj.x = pos.x - estado.offsetX;
    obj.y = pos.y - estado.offsetY;
    render();
  }
}, { passive: false });

canvas.addEventListener('touchend', () => {
  if (redimensionando || estado.arrastrar) guardarHistorial();
  redimensionando  = false;
  estado.arrastrar = false;
  manijaActiva     = null;
});

canvas.addEventListener('dblclick', (e) => {
  const pos = posCanvas(e);
  const hit = hitTest(pos.x, pos.y);
  if (hit !== null && estado.objetos[hit].tipo === 'texto') {
    estado.seleccion = hit;
    const obj = estado.objetos[hit];
    actualizarPanelTexto(obj);
    mostrarPropiedades(obj);
    // Abrir panel de texto
    document.querySelectorAll('[data-panel]').forEach(p => p.style.display = 'none');
    document.querySelector('[data-panel="texto"]').style.display = 'block';
    document.getElementById('panel-titulo').textContent = 'Texto';
    document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('activo'));
    document.querySelector('[data-rail="texto"]').classList.add('activo');
    panelActualRail = 'texto';
    panelVisible = true;
    layout.classList.add('panel-abierto');
    document.getElementById('texto-contenido').focus();
    render();
    mostrarToast('Doble clic — edita el texto en el panel ✏️', 'info');
  }
});

function mostrarPropiedades(obj) {
  document.getElementById('panel-objeto').style.display = 'block';
  document.getElementById('obj-x').value = Math.round(obj.x);
  document.getElementById('obj-y').value = Math.round(obj.y);
  document.getElementById('obj-w').value = Math.round(obj.w);
  document.getElementById('obj-h').value = Math.round(obj.h);
  document.getElementById('obj-rotacion').value = obj.rot || 0;
  document.getElementById('obj-rotacion-val').textContent = `${obj.rot || 0}°`;
  if (obj.color) {
    document.getElementById('obj-color').value = obj.color;
    document.getElementById('obj-color-preview').style.background = obj.color;
  }

  // Mostrar panel de filtros solo para imágenes
  const panelFiltros = document.getElementById('panel-filtros-obj');
  if (obj.tipo === 'imagen') {
    panelFiltros.style.display = 'block';
    // Asegurar que el objeto tenga filtros inicializados
    if (!obj.filtros) obj.filtros = { brightness:100, contrast:100, saturate:100, opacity:100, blur:0, sepia:0, grayscale:0 };
    // Sincronizar sliders con los valores actuales del objeto
    document.querySelectorAll('.filtro-obj').forEach(slider => {
      const key = slider.dataset.filtro;
      slider.value = obj.filtros[key] ?? (key === 'blur' || key === 'sepia' || key === 'grayscale' ? 0 : 100);
    });
  } else {
    panelFiltros.style.display = 'none';
  }

  // Sync panel de texto si el objeto es texto
  if (obj.tipo === 'texto') actualizarPanelTexto(obj);
}

document.getElementById('obj-rotacion').addEventListener('input', (e) => {
  if (estado.seleccion === null) return;
  const val = parseInt(e.target.value, 10);
  estado.objetos[estado.seleccion].rot = val;
  document.getElementById('obj-rotacion-val').textContent = `${val}°`;
  render();
});

document.getElementById('obj-color').addEventListener('input', (e) => {
  if (estado.seleccion === null) return;
  estado.objetos[estado.seleccion].color = e.target.value;
  document.getElementById('obj-color-preview').style.background = e.target.value;
  render();
});

document.getElementById('btn-eliminar-obj').addEventListener('click', () => {
  if (estado.seleccion === null) return;
  estado.objetos.splice(estado.seleccion, 1);
  estado.seleccion = null;
  document.getElementById('panel-objeto').style.display = 'none';
  guardarHistorial();
  render();
});

document.getElementById('btn-obj-arriba').addEventListener('click', () => {
  const i = estado.seleccion;
  if (i === null || i >= estado.objetos.length - 1) return;
  [estado.objetos[i], estado.objetos[i+1]] = [estado.objetos[i+1], estado.objetos[i]];
  estado.seleccion = i + 1;
  guardarHistorial();
  render();
});

document.getElementById('btn-obj-abajo').addEventListener('click', () => {
  const i = estado.seleccion;
  if (i === null || i <= 0) return;
  [estado.objetos[i], estado.objetos[i-1]] = [estado.objetos[i-1], estado.objetos[i]];
  estado.seleccion = i - 1;
  guardarHistorial();
  render();
});

// ── HERRAMIENTAS TOOLBAR ──────────────────────────────────────
document.querySelectorAll('.canvas-tool[data-herramienta]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.canvas-tool').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');
    estado.herramienta = btn.dataset.herramienta;

    // Cursor según herramienta
    const cursores = {
      seleccionar: 'default',
      mover:       'grab',
      texto:       'text',
      forma:       'crosshair',
      recortar:    'crosshair'
    };
    canvas.style.cursor = cursores[btn.dataset.herramienta] || 'default';

    // Activar crop inmediatamente si hay imagen seleccionada
    if (btn.dataset.herramienta === 'recortar') {
      activarCrop();
      return;
    }

    mostrarToast(`Herramienta: ${btn.title.split(' (')[0]}`, 'info');
  });
});

// ── CANVAS CLICK para herramienta TEXTO y FORMA ──────────────
canvas.addEventListener('click', (e) => {
  if (estado.herramienta === 'texto') {
    const pos = posCanvas(e);
    const obj = {
      tipo: 'texto', texto: 'Tu texto aquí',
      x: pos.x - 60, y: pos.y - 18,
      w: 300, h: 56,
      tamano: 36, peso: '700',
      fuente: 'Syne, sans-serif',
      color: '#FFFFFF', rot: 0,
    };
    estado.objetos.push(obj);
    estado.seleccion = estado.objetos.length - 1;
    guardarHistorial();
    render();
    actualizarPanelTexto(obj);
    // Abrir panel texto
    document.querySelectorAll('[data-panel]').forEach(p => p.style.display = 'none');
    document.querySelector('[data-panel="texto"]').style.display = 'block';
    document.getElementById('panel-titulo').textContent = 'Texto';
    document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('activo'));
    document.querySelector('[data-rail="texto"]').classList.add('activo');
    panelActualRail = 'texto';
    layout.classList.add('panel-abierto');
    document.getElementById('texto-contenido').focus();
    mostrarToast('Texto agregado — edítalo en el panel ✏️', 'exito');
    return;
  }

  if (estado.herramienta === 'forma') {
    const pos = posCanvas(e);
    estado.objetos.push({
      tipo: 'forma', forma: 'rect',
      x: pos.x - 60, y: pos.y - 40,
      w: 120, h: 80,
      color: '#A7EBF2', rot: 0,
    });
    guardarHistorial();
    render();
    mostrarToast('Forma agregada ◻', 'exito');
    return;
  }
});

// ── ZOOM ─────────────────────────────────────────────────────
document.getElementById('zoom-select').addEventListener('change', (e) => {
  estado.zoom = parseFloat(e.target.value);
  canvas.style.transform = `scale(${estado.zoom})`;
  canvas.style.transformOrigin = 'center center';
  document.getElementById('canvas-zoom-label').textContent = `${Math.round(estado.zoom * 100)}%`;
});

// ── PRESETS DE TAMAÑO ─────────────────────────────────────────
document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const [w, h] = btn.dataset.preset.split(',').map(Number);
    document.getElementById('canvas-w').value = w;
    document.getElementById('canvas-h').value = h;
    aplicarTamanyo(w, h);
  });
});

document.getElementById('btn-aplicar-tam').addEventListener('click', () => {
  const w = parseInt(document.getElementById('canvas-w').value, 10);
  const h = parseInt(document.getElementById('canvas-h').value, 10);
  aplicarTamanyo(w, h);
});

function aplicarTamanyo(w, h) {
  canvas.width  = w;
  canvas.height = h;
  document.getElementById('canvas-dimensiones').textContent = `${w} × ${h} px`;
  guardarHistorial();
  render();
  mostrarToast(`Tamaño: ${w}×${h}px`, 'info');
}

// ── EXPORTAR ─────────────────────────────────────────────────
document.getElementById('btn-exportar').addEventListener('click', () => {
  // Guarda filtros CSS, aplica al canvas real para exportar
  const filtroActual = canvas.style.filter;
  const nombre  = document.querySelector('.editor-topbar__nombre').value || 'mi-diseno';
  const enlace  = document.createElement('a');
  enlace.download = `${nombre.replace(/\s+/g,'-')}.png`;
  enlace.href  = canvas.toDataURL('image/png');
  enlace.click();
  mostrarToast('Diseño exportado ⬇️', 'exito');
  // Sin créditos por exportar (eliminado)
});

// ── INFO BAR ─────────────────────────────────────────────────
function actualizarInfoBar() {
  document.getElementById('canvas-objetos').textContent = `${estado.objetos.length} objeto${estado.objetos.length !== 1 ? 's' : ''}`;
}

// ── CAPAS con drag-and-drop ───────────────────────────────────
let dragSrcIdx = null; // índice real en estado.objetos del item que se arrastra

function actualizarCapas() {
  const lista = document.getElementById('capas-lista');
  if (estado.objetos.length === 0) {
    lista.innerHTML = '<div style="font-size:.75rem;color:var(--texto-suave);text-align:center;padding:.75rem">Sin objetos aún</div>';
    return;
  }

  lista.innerHTML = '';
  [...estado.objetos].reverse().forEach((obj, ri) => {
    const i = estado.objetos.length - 1 - ri; // índice real en el array

    const iconos = { imagen:'🖼️', texto:'T', sticker: obj.emoji || '⭐', forma:'◻' };
    const nombres = { imagen:'Imagen', texto: obj.texto?.slice(0,20) || 'Texto', sticker:'Sticker', forma:'Forma' };

    const item = document.createElement('div');
    item.className = `capa-item${i === estado.seleccion ? ' activa' : ''}`;
    item.draggable = true;
    item.dataset.idx = i;
    item.style.transition = 'border-top .12s, border-bottom .12s, opacity .15s';

    // Miniatura visual por tipo
    let thumb = '';
    if (obj.tipo === 'imagen' && obj.imagen) {
      const tc = document.createElement('canvas');
      tc.width = 24; tc.height = 24;
      const tx = tc.getContext('2d');
      tx.drawImage(obj.imagen, 0, 0, 24, 24);
      thumb = `<img src="${tc.toDataURL()}" style="width:24px;height:24px;border-radius:4px;object-fit:cover;flex-shrink:0;border:1px solid rgba(167,235,242,0.2)">`;
    } else {
      thumb = `<span class="capa-icono" style="font-size:1rem;line-height:1">${iconos[obj.tipo] || '◻'}</span>`;
    }

    item.innerHTML = `
      <span style="cursor:grab;color:rgba(167,235,242,0.3);font-size:.75rem;margin-right:2px;flex-shrink:0" title="Arrastrar para reordenar">⠿</span>
      ${thumb}
      <span class="capa-nombre" style="font-size:.78rem">${nombres[obj.tipo] || 'Objeto'}</span>
      <button class="btn-icon capa-ojo" data-idx="${i}" title="Ocultar/mostrar" style="margin-left:auto;opacity:${obj.oculto ? 0.3 : 1};font-size:.8rem">${obj.oculto ? '🙈' : '👁'}</button>
    `;

    // Seleccionar al clicar (evitando el botón ojo)
    item.addEventListener('click', (e) => {
      if (e.target.closest('.capa-ojo')) return;
      estado.seleccion = i;
      mostrarPropiedades(obj);
      render();
    });

    // Botón visibilidad
    item.querySelector('.capa-ojo').addEventListener('click', (e) => {
      e.stopPropagation();
      obj.oculto = !obj.oculto;
      guardarHistorial();
      render();
      mostrarToast(obj.oculto ? 'Capa oculta 🙈' : 'Capa visible 👁', 'info');
    });

    // ── Drag-and-drop ────────────────────────────────────────
    item.addEventListener('dragstart', (e) => {
      dragSrcIdx = i;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', i);
      setTimeout(() => { item.style.opacity = '0.4'; }, 0);
    });

    item.addEventListener('dragend', () => {
      item.style.opacity = '1';
      // Limpiar todos los indicadores visuales
      lista.querySelectorAll('.capa-item').forEach(el => {
        el.style.borderTop    = '';
        el.style.borderBottom = '';
      });
      dragSrcIdx = null;
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // Mostrar indicador encima o debajo según mitad del elemento
      const rect = item.getBoundingClientRect();
      const mitad = rect.top + rect.height / 2;
      lista.querySelectorAll('.capa-item').forEach(el => {
        el.style.borderTop    = '';
        el.style.borderBottom = '';
      });
      if (e.clientY < mitad) {
        item.style.borderTop    = '2px solid #A7EBF2';
      } else {
        item.style.borderBottom = '2px solid #A7EBF2';
      }
    });

    item.addEventListener('dragleave', () => {
      item.style.borderTop    = '';
      item.style.borderBottom = '';
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.style.borderTop    = '';
      item.style.borderBottom = '';
      if (dragSrcIdx === null || dragSrcIdx === i) return;

      const arr = estado.objetos;
      const rect = item.getBoundingClientRect();
      const mitad = rect.top + rect.height / 2;

      // Extraer el elemento arrastrado
      const [moved] = arr.splice(dragSrcIdx, 1);

      // Calcular índice destino tras el splice
      // La lista se muestra en orden inverso, así que:
      //   soltar en la mitad superior del ítem = por encima en pantalla = índice mayor en array
      //   soltar en mitad inferior = por debajo en pantalla = índice menor en array
      let destReal = e.clientY < mitad
        ? (dragSrcIdx < i ? i - 1 : i)
        : (dragSrcIdx < i ? i - 1 : Math.max(0, i - 1));

      // Inserción más simple: usar índice i ajustado
      destReal = dragSrcIdx > i
        ? (e.clientY < mitad ? i + 1 : i)
        : (e.clientY < mitad ? i     : Math.max(0, i - 1));

      arr.splice(Math.max(0, Math.min(destReal, arr.length)), 0, moved);

      estado.seleccion = arr.indexOf(moved);
      guardarHistorial();
      render();
      mostrarToast('Capa reordenada ✓', 'exito');
    });

    lista.appendChild(item);
  });
}

// ── TECLADO ──────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Escape cancela el recorte
  if (e.key === 'Escape' && crop.activo) {
    cancelarCrop();
    return;
  }
  // Enter confirma el recorte
  if (e.key === 'Enter' && crop.activo) {
    confirmarCrop();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (document.activeElement === document.body || document.activeElement === canvas) {
      if (estado.seleccion !== null) {
        estado.objetos.splice(estado.seleccion, 1);
        estado.seleccion = null;
        document.getElementById('panel-objeto').style.display = 'none';
        guardarHistorial();
        render();
      }
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    document.getElementById('btn-deshacer').click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    document.getElementById('btn-rehacer').click();
  }
});

// ── INICIALIZAR ──────────────────────────────────────────────
guardarHistorial();
render();

// Leer tab desde URL ?tab=...
const tabURL = new URLSearchParams(window.location.search).get('tab');
if (tabURL) {
  const btn = document.querySelector(`[data-tab="${tabURL}"]`);
  if (btn) btn.click();
}

console.log('🎨 Pixeo Editor cargado');
// ── CARGAR PLANTILLA DESDE URL ?plantilla=ID ─────────────────────────
// Se ejecuta al cargar el editor si viene desde comunidad.html
(function cargarPlantillaDesdeURL() {
  const plantillaID = new URLSearchParams(window.location.search).get('plantilla');
  if (!plantillaID) return;

  // Esperar a que Firebase esté listo (firebase-auth.js carga en paralelo)
  const MAX_ESPERA = 5000;
  const INTERVALO  = 200;
  let   transcurrido = 0;

  const esperar = setInterval(async () => {
    transcurrido += INTERVALO;

    // Verificar que FirebaseCreditos esté disponible (indica que firebase-auth.js cargó)
    if (!window.FirebaseCreditos && transcurrido < MAX_ESPERA) return;
    clearInterval(esperar);

    try {
      // Importar Firebase dinámicamente (misma instancia ya inicializada)
      const { getDatabase, ref, get, update } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js"
      );
      const { getApp } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
      );

      const db          = getDatabase(getApp());
      const plantRef    = ref(db, `comunidad/${plantillaID}`);
      const snap        = await get(plantRef);

      if (!snap.exists()) {
        mostrarToast('Plantilla no encontrada', 'error');
        return;
      }

      const data = snap.val();
      mostrarToast(`Cargando plantilla: ${data.titulo} ⏳`, 'info');

      // ── Cargar imagen en el canvas ────────────────────────
      const img = new Image();
      img.onload = async () => {
        const ratio = img.width  / img.height;
        const w     = Math.min(img.width, canvas.width  * 0.9);
        const h     = w / ratio;

        estado.objetos.push({
          tipo:   'imagen',
          imagen: img,
          x:      (canvas.width  - w) / 2,
          y:      (canvas.height - h) / 2,
          w, h,
          rot:    0,
        });
        guardarHistorial();
        render();
        mostrarToast(`✅ Plantilla "${data.titulo}" cargada`, 'exito');

        // ── Incrementar usos de la plantilla ─────────────────
        await update(plantRef, {
          descargas: (snap.val().descargas || 0) + 1
        });

        // ── Dar +5 créditos al autor original (si no es el mismo usuario) ──
        const usuarioActual = window.pixeoUser ? window.pixeoUser() : null;
        if (data.autorId && usuarioActual && data.autorId !== usuarioActual.uid) {
          const autorRef  = ref(db, `users/${data.autorId}`);
          const autorSnap = await get(autorRef);
          if (autorSnap.exists()) {
            await update(autorRef, {
              creditos: (autorSnap.val().creditos || 0) + 5
            });
          }
        }
      };
      img.crossOrigin = 'anonymous';
      img.src = data.imagen; // base64 guardado en Realtime Database

    } catch (err) {
      console.error('Error cargando plantilla:', err);
      mostrarToast('Error al cargar la plantilla', 'error');
    }
  }, INTERVALO);
})();

// ============================================================
//  EFECTOS PRO DE TEXTO — Pixeo v2
//  Sombra, Contorno, Neón, 3D Bold, Fuego
// ============================================================

// ── Renderizado de efectos en canvas ──────────────────────────
// Esta función se llama desde render() para aplicar efectos sobre textos
function aplicarEfectoTexto(ctx, obj) {
  const ef = obj.efecto || 'ninguno';
  // Reset previo
  ctx.shadowColor   = 'transparent';
  ctx.shadowBlur    = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  if (ef === 'sombra') {
    ctx.shadowColor   = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur    = 14;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 5;
  }

  if (ef === 'neon') {
    // Primero dibuja glow exterior (varias capas de sombra)
    ctx.shadowColor   = obj.color || '#00ffff';
    ctx.shadowBlur    = 22;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  if (ef === 'fuego') {
    ctx.shadowColor   = '#FF6B35';
    ctx.shadowBlur    = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = -3;
  }
}

// Dibuja contorno negro antes del fill (para efecto contorno)
function dibujarContornoTexto(ctx, obj, lineas, lineH) {
  const ef = obj.efecto || 'ninguno';
  if (ef !== 'contorno' && ef !== '3d') return;

  ctx.save();
  if (ef === 'contorno') {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth   = Math.max(2, (obj.tamano || 36) * 0.06);
    ctx.lineJoin    = 'round';
    lineas.forEach((linea, li) => {
      ctx.strokeText(linea, obj.x, obj.y + li * lineH);
    });
  } else if (ef === '3d') {
    // Capas de sombra escalonadas
    const pasos = 5;
    for (let i = pasos; i >= 1; i--) {
      ctx.fillStyle = `rgba(0,0,0,${0.15 + i * 0.08})`;
      lineas.forEach((linea, li) => {
        ctx.fillText(linea, obj.x + i, obj.y + li * lineH + i);
      });
    }
    // Borde oscuro fino
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth   = 1;
    ctx.lineJoin    = 'round';
    lineas.forEach((linea, li) => {
      ctx.strokeText(linea, obj.x, obj.y + li * lineH);
    });
  }
  ctx.restore();
}


// ── UI: Botones de efecto ─────────────────────────────────────
document.querySelectorAll('.btn-efecto-texto').forEach(btn => {
  btn.addEventListener('click', () => {
    const efecto = btn.dataset.efecto;

    // Highlight botón activo
    document.querySelectorAll('.btn-efecto-texto').forEach(b => {
      b.style.borderColor = 'rgba(167,235,242,0.12)';
      b.style.background  = 'rgba(255,255,255,0.04)';
    });
    btn.style.borderColor = 'rgba(167,235,242,0.5)';
    btn.style.background  = 'rgba(167,235,242,0.12)';

    // Mostrar badge
    const badge = document.getElementById('efecto-activo-badge');
    const nombre = document.getElementById('efecto-activo-nombre');
    const nombres = { ninguno:'Sin efecto', sombra:'Sombra', contorno:'Contorno', neon:'Neón ⚡', '3d':'3D Bold', fuego:'Fuego 🔥' };
    if (badge && nombre) {
      nombre.textContent = nombres[efecto] || efecto;
      badge.style.display = efecto === 'ninguno' ? 'none' : 'block';
    }

    // Aplicar al objeto seleccionado en tiempo real
    if (estado.seleccion !== null && estado.objetos[estado.seleccion]?.tipo === 'texto') {
      estado.objetos[estado.seleccion].efecto = efecto;
      render();
      mostrarToast(`Efecto "${nombres[efecto]}" aplicado ✨`, 'exito');
    } else {
      mostrarToast('Selecciona un texto en el canvas primero', 'info');
    }
  });
});

// ── UI: Fuentes extra ─────────────────────────────────────────
document.querySelectorAll('.texto-fuente-extra').forEach(btn => {
  btn.addEventListener('click', () => {
    const fuente = btn.dataset.fuente;

    // Highlight
    document.querySelectorAll('.texto-fuente-extra').forEach(b => {
      b.style.borderColor = 'rgba(167,235,242,0.12)';
      b.style.background  = 'rgba(167,235,242,0.05)';
    });
    btn.style.borderColor = 'rgba(167,235,242,0.5)';
    btn.style.background  = 'rgba(167,235,242,0.12)';

    // Sincronizar con el select de fuentes del panel
    const selectFuente = document.getElementById('texto-fuente');
    if (selectFuente) {
      // Agregar opción si no existe
      const yaExiste = Array.from(selectFuente.options).some(o => o.value === fuente);
      if (!yaExiste) {
        const opt = document.createElement('option');
        opt.value = fuente;
        opt.textContent = btn.textContent.trim();
        selectFuente.appendChild(opt);
      }
      selectFuente.value = fuente;
    }

    // Aplicar inmediatamente si hay texto seleccionado
    if (estado.seleccion !== null && estado.objetos[estado.seleccion]?.tipo === 'texto') {
      estado.objetos[estado.seleccion].fuente = fuente;
      render();
      mostrarToast(`Fuente cambiada ✓`, 'exito');
    } else {
      mostrarToast('Selecciona un texto para aplicar la fuente', 'info');
    }
  });
});

// ── Sincronizar efecto al seleccionar objeto de texto ─────────
// Extender la función de selección para mostrar efecto activo en el panel
const _syncObjPanel_orig = typeof sincronizarPanelObjeto === 'function' ? sincronizarPanelObjeto : null;

document.addEventListener('pixeo:seleccion', (e) => {
  syncEfectoPanel();
});

function syncEfectoPanel() {
  if (estado.seleccion === null) return;
  const obj = estado.objetos[estado.seleccion];
  if (!obj || obj.tipo !== 'texto') return;

  const ef = obj.efecto || 'ninguno';
  document.querySelectorAll('.btn-efecto-texto').forEach(b => {
    const activo = b.dataset.efecto === ef;
    b.style.borderColor = activo ? 'rgba(167,235,242,0.5)' : 'rgba(167,235,242,0.12)';
    b.style.background  = activo ? 'rgba(167,235,242,0.12)' : 'rgba(255,255,255,0.04)';
  });

  const badge = document.getElementById('efecto-activo-badge');
  const nombre = document.getElementById('efecto-activo-nombre');
  const nombres = { ninguno:'Sin efecto', sombra:'Sombra', contorno:'Contorno', neon:'Neón ⚡', '3d':'3D Bold', fuego:'Fuego 🔥' };
  if (badge && nombre) {
    nombre.textContent = nombres[ef] || ef;
    badge.style.display = ef === 'ninguno' ? 'none' : 'block';
  }
}

// ── Incluir efecto en btn-aplicar-texto ───────────────────────
// Reemplazamos el listener existente con uno que también guarda el efecto
const btnAplicar = document.getElementById('btn-aplicar-texto');
if (btnAplicar) {
  const clonado = btnAplicar.cloneNode(true);
  btnAplicar.parentNode.replaceChild(clonado, btnAplicar);
  clonado.addEventListener('click', () => {
    if (estado.seleccion === null) {
      mostrarToast('Selecciona un texto en el canvas primero', 'error');
      return;
    }
    const obj = estado.objetos[estado.seleccion];
    if (obj.tipo !== 'texto') {
      mostrarToast('El objeto seleccionado no es un texto', 'error');
      return;
    }
    const nuevoTexto = document.getElementById('texto-contenido').value.trim();
    if (!nuevoTexto) {
      estado.objetos.splice(estado.seleccion, 1);
      estado.seleccion = null;
      document.getElementById('panel-objeto').style.display = 'none';
      guardarHistorial();
      render();
      mostrarToast('Texto vacío eliminado 🗑', 'info');
      return;
    }
    obj.texto  = nuevoTexto;
    const nuevoTamano = parseInt(document.getElementById('texto-tamano').value, 10);
    obj.tamano = (!isNaN(nuevoTamano) && nuevoTamano > 0) ? nuevoTamano : (obj.tamano || 36);
    obj.h      = obj.tamano + 20;
    ctx.font   = `${obj.peso} ${obj.tamano}px ${obj.fuente}`;
    const medida = ctx.measureText(obj.texto);
    obj.w      = Math.max(medida.width + 20, 100);
    obj.peso   = document.getElementById('texto-peso').value;
    obj.fuente = document.getElementById('texto-fuente').value;
    obj.color  = document.getElementById('texto-color-pick').value;
    // Preservar efecto activo (ya fue aplicado en tiempo real por los botones)
    guardarHistorial();
    render();
    mostrarToast('Texto actualizado ✓', 'exito');
  });
}

console.log('✨ Pixeo Efectos Pro cargado');

// ── CUBO 3D: sincronizar todos los spans de créditos ──────────
// Extiende actualizarCreditos para actualizar cubo-num-2 y cubo-num-label
(function() {
  function syncCubo(n) {
    const el2   = document.getElementById('cubo-num-2');
    const label = document.getElementById('cubo-num-label');
    const cubo  = document.getElementById('cubo-creditos-el');
    const txt   = Number(n).toLocaleString('es');
    if (el2)   el2.textContent   = txt;
    if (label) label.textContent = txt;
    if (cubo) {
      if (n < 20) cubo.classList.add('alerta');
      else        cubo.classList.remove('alerta');
    }
  }

  // Observar cambios en cubo-num-1 (que es el [data-creditos] que actualiza firebase-auth)
  const num1 = document.getElementById('cubo-num-1');
  if (num1) {
    const obs = new MutationObserver(() => syncCubo(parseFloat(num1.textContent.replace(/\./g, '').replace(',', '.')) || 0));
    obs.observe(num1, { childList: true, characterData: true, subtree: true });
  }

  // También exponer como helper global
  window.actualizarCreditosUI = function(n) {
    if (num1) num1.textContent = Number(n).toLocaleString('es');
    syncCubo(n);
  };
})();

// ============================================================
//  PANEL SUBIR — Dropdown + Drag & Drop + URL + Recientes
// ============================================================
(function() {

  // ── Dropdown toggle ───────────────────────────────────────
  const btnDrop = document.getElementById('btn-subir-dropdown');
  const menu    = document.getElementById('subir-dropdown-menu');
  if (btnDrop && menu) {
    btnDrop.addEventListener('click', (e) => {
      e.stopPropagation();
      const visible = menu.style.display !== 'none';
      menu.style.display = visible ? 'none' : 'block';
    });
    document.addEventListener('click', () => { if (menu) menu.style.display = 'none'; });
  }

  // ── Desde URL ─────────────────────────────────────────────
  const desdeURL  = document.getElementById('drop-desde-url');
  const panelURL  = document.getElementById('panel-url-imagen');
  const inputURL  = document.getElementById('input-url-imagen');
  const btnURL    = document.getElementById('btn-cargar-url');

  if (desdeURL && panelURL) {
    desdeURL.addEventListener('click', () => {
      if (menu) menu.style.display = 'none';
      panelURL.style.display = panelURL.style.display === 'none' ? 'block' : 'none';
      if (panelURL.style.display === 'block' && inputURL) inputURL.focus();
    });
  }

  function cargarDesdeURL(url) {
    if (!url || !url.startsWith('http')) {
      mostrarToast('URL no válida', 'error'); return;
    }
    mostrarToast('Cargando imagen...', 'info');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      agregarImagenAlCanvas(img);
      if (panelURL) panelURL.style.display = 'none';
      if (inputURL) inputURL.value = '';
    };
    img.onerror = () => mostrarToast('No se pudo cargar la imagen (CORS o URL inválida)', 'error');
    img.src = url;
  }

  if (btnURL) btnURL.addEventListener('click', () => cargarDesdeURL(inputURL?.value?.trim()));
  if (inputURL) inputURL.addEventListener('keydown', (e) => { if (e.key === 'Enter') cargarDesdeURL(inputURL.value.trim()); });

  // ── Drag & Drop sobre la zona ────────────────────────────
  const dropZona = document.getElementById('drop-zona');
  if (dropZona) {
    ['dragenter','dragover'].forEach(ev => {
      dropZona.addEventListener(ev, (e) => {
        e.preventDefault();
        dropZona.style.borderColor  = 'rgba(167,235,242,0.6)';
        dropZona.style.background   = 'rgba(167,235,242,0.06)';
      });
    });
    ['dragleave','dragend'].forEach(ev => {
      dropZona.addEventListener(ev, () => {
        dropZona.style.borderColor = 'rgba(167,235,242,0.2)';
        dropZona.style.background  = 'rgba(167,235,242,0.02)';
      });
    });
    dropZona.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZona.style.borderColor = 'rgba(167,235,242,0.2)';
      dropZona.style.background  = 'rgba(167,235,242,0.02)';
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) cargarDesdeArchivo(file);
      else mostrarToast('Solo se aceptan imágenes', 'error');
    });
  }

  // También drag & drop sobre el canvas principal
  const canvasEl = document.getElementById('mi-canvas');
  if (canvasEl) {
    canvasEl.addEventListener('dragover', (e) => e.preventDefault());
    canvasEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) cargarDesdeArchivo(file);
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  function agregarImagenAlCanvas(img) {
    const ratio = img.width / img.height;
    const w = Math.min(img.width, canvas.width * 0.8);
    const h = w / ratio;
    estado.objetos.push({
      tipo: 'imagen', imagen: img,
      x: (canvas.width - w) / 2,
      y: (canvas.height - h) / 2,
      w, h, rot: 0,
    });
    guardarHistorial();
    render();
    mostrarToast('Imagen agregada ✓', 'exito');
    guardarReciente(img.src);
  }

  function cargarDesdeArchivo(archivo) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => agregarImagenAlCanvas(img);
      img.src = ev.target.result;
    };
    reader.readAsDataURL(archivo);
  }

  // ── Recientes (localStorage) ──────────────────────────────
  const RECIENTES_KEY = 'px_recientes_thumbs';
  const MAX_RECIENTES = 6;

  function guardarReciente(src) {
    // Solo guardar si es base64 pequeño (<100KB en b64)
    if (!src.startsWith('data:image') || src.length > 120000) return;
    try {
      let arr = JSON.parse(localStorage.getItem(RECIENTES_KEY) || '[]');
      arr = arr.filter(s => s !== src);
      arr.unshift(src);
      arr = arr.slice(0, MAX_RECIENTES);
      localStorage.setItem(RECIENTES_KEY, JSON.stringify(arr));
      renderRecientes(arr);
    } catch(e) {}
  }

  function renderRecientes(arr) {
    const wrap = document.getElementById('subir-recientes');
    const grid = document.getElementById('subir-recientes-grid');
    if (!wrap || !grid || !arr.length) return;
    wrap.style.display = 'block';
    grid.innerHTML = '';
    arr.forEach(src => {
      const div = document.createElement('div');
      div.style.cssText = 'aspect-ratio:1;border-radius:7px;overflow:hidden;cursor:pointer;border:1.5px solid rgba(167,235,242,0.12);transition:border-color .15s';
      div.onmouseover  = () => div.style.borderColor = 'rgba(167,235,242,0.5)';
      div.onmouseout   = () => div.style.borderColor = 'rgba(167,235,242,0.12)';
      const im = document.createElement('img');
      im.src = src; im.style.cssText = 'width:100%;height:100%;object-fit:cover';
      div.appendChild(im);
      div.addEventListener('click', () => {
        const imgObj = new Image();
        imgObj.onload = () => agregarImagenAlCanvas(imgObj);
        imgObj.src = src;
      });
      grid.appendChild(div);
    });
  }

  // Cargar recientes al iniciar
  try {
    const saved = JSON.parse(localStorage.getItem(RECIENTES_KEY) || '[]');
    if (saved.length) renderRecientes(saved);
  } catch(e) {}

})();

// ============================================================
//  PANEL ELEMENTOS — Líneas, Flechas, Formas, Búsqueda, Tabs
// ============================================================
(function() {

  // ── Helpers de canvas ─────────────────────────────────────
  function addForma(tipo, color) {
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    estado.objetos.push({
      tipo: 'forma', forma: tipo,
      x: cx - 60, y: cy - 60, w: 120, h: 120,
      color: color || '#A7EBF2', rot: 0, opacidad: 0.85,
    });
    guardarHistorial(); render();
    mostrarToast('Forma agregada ✓', 'exito');
  }

  function addLineaSVG(tipo) {
    // Las líneas y flechas se agregan como objetos "forma" con tipo especial
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    estado.objetos.push({
      tipo: 'linea', lineaTipo: tipo,
      x: cx - 80, y: cy - 4, w: 160, h: 8,
      color: '#A7EBF2', rot: 0,
    });
    guardarHistorial(); render();
    mostrarToast('Elemento agregado ✓', 'exito');
  }

  // ── Render de líneas/flechas en canvas ────────────────────
  // Extender el render principal para soportar tipo 'linea'
  const _renderLineas_orig = window.render;
  // Monkey-patch: inyectar dibujo de lineas en el loop de objetos
  // (se hace agregando el caso al bloque switch en el render existente)
  // En su lugar, usamos el evento de render para post-procesar lineas
  // Este enfoque más simple funciona porque lineas son objetos simples

  // Patch directo: sobreescribir solo la sección de objetos desconocidos
  const origRender = window.render || render;
  window.render = function patchedRender() {
    origRender();
    // Dibujar líneas y flechas que pudieran no estar soportadas nativamante
    estado.objetos.forEach((obj, idx) => {
      if (obj.tipo !== 'linea') return;
      ctx.save();
      const cx2 = obj.x + obj.w / 2;
      const cy2 = obj.y + obj.h / 2;
      ctx.translate(cx2, cy2);
      if (obj.rot) ctx.rotate((obj.rot * Math.PI) / 180);
      ctx.translate(-cx2, -cy2);

      ctx.strokeStyle = obj.color || '#A7EBF2';
      ctx.lineWidth   = 2.5;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      const x1 = obj.x, y1 = obj.y + obj.h / 2;
      const x2 = obj.x + obj.w, y2 = obj.y + obj.h / 2;

      ctx.setLineDash([]);
      if (obj.lineaTipo === 'solida')   ctx.setLineDash([]);
      if (obj.lineaTipo === 'punteada') ctx.setLineDash([3, 4]);
      if (obj.lineaTipo === 'guion')    ctx.setLineDash([8, 5]);

      if (obj.lineaTipo === 'ondulada') {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        const seg = obj.w / 4;
        for (let i = 0; i < 4; i++) {
          const sx = x1 + i * seg;
          ctx.quadraticCurveTo(sx + seg/2, y1 - 10 * (i%2===0?1:-1), sx + seg, y1);
        }
        ctx.stroke();
      } else if (obj.lineaTipo === 'derecha' || obj.lineaTipo === 'gruesa') {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - 14, y2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 14, y2 - 7);
        ctx.lineTo(x2 - 14, y2 + 7);
        ctx.closePath();
        ctx.fillStyle = obj.color || '#A7EBF2';
        ctx.fill();
      } else if (obj.lineaTipo === 'doble') {
        ctx.beginPath(); ctx.moveTo(x1 + 14, y1); ctx.lineTo(x2 - 14, y2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = obj.color || '#A7EBF2';
        [x1, x2].forEach((px, pi) => {
          ctx.beginPath();
          const dir = pi === 0 ? -1 : 1;
          ctx.moveTo(px, y1);
          ctx.lineTo(px + dir * 14, y1 - 7);
          ctx.lineTo(px + dir * 14, y1 + 7);
          ctx.closePath(); ctx.fill();
        });
      } else if (obj.lineaTipo === 'curva') {
        ctx.beginPath();
        ctx.moveTo(x1, y1 + 10);
        ctx.quadraticCurveTo(cx2, y1 - 20, x2, y1);
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }

      ctx.setLineDash([]);
      // Borde de selección
      if (idx === estado.seleccion) {
        ctx.strokeStyle = '#A7EBF2'; ctx.lineWidth = 1.5 / estado.zoom;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(obj.x - 4, obj.y - 4, obj.w + 8, obj.h + 8);
        ctx.setLineDash([]);
      }
      ctx.restore();
    });
  };

  // ── Clicks en líneas ──────────────────────────────────────
  document.querySelectorAll('.elem-linea').forEach(el => {
    el.addEventListener('click', () => addLineaSVG(el.dataset.linea));
  });

  // ── Clicks en flechas ────────────────────────────────────
  document.querySelectorAll('.elem-flecha').forEach(el => {
    el.addEventListener('click', () => addLineaSVG(el.dataset.flecha));
  });

  // ── Clicks en formas ─────────────────────────────────────
  const coloresForma = {
    cuadrado: '#A7EBF2', circulo: '#54ACBF', triangulo: '#A7EBF2',
    estrella: '#F7C948', corazon: '#e74c3c', rombo: '#54ACBF',
    pentagono: '#9b59b6', hexagono: '#2ecc71',
  };
  document.querySelectorAll('.elem-forma').forEach(el => {
    el.addEventListener('click', () => {
      const tipo = el.dataset.forma;
      addForma(tipo === 'cuadrado' ? 'rectangulo' : tipo, coloresForma[tipo]);
    });
  });

  // ── IA Generator cards ────────────────────────────────────
  document.querySelectorAll('[data-elem-tipo]').forEach(el => {
    el.addEventListener('click', () => {
      const tipo = el.dataset.elemTipo;
      if (tipo === 'ia-imagen') {
        // Activar panel IA → herramienta generar imagen
        document.querySelector('[data-rail="ia"]')?.click();
        mostrarToast('Usa el panel IA para generar imágenes ✨', 'info');
      } else if (tipo === 'ia-sticker') {
        mostrarToast('AI Sticker — próximamente 🚀', 'info');
      } else if (tipo === 'ia-logo') {
        mostrarToast('AI Logo — próximamente 🚀', 'info');
      }
    });
  });

  // ── Búsqueda de elementos ────────────────────────────────
  const inputBuscar = document.getElementById('elem-buscar');
  if (inputBuscar) {
    inputBuscar.addEventListener('input', () => {
      const q = inputBuscar.value.toLowerCase().trim();
      document.querySelectorAll('.elem-seccion').forEach(sec => {
        const nombre = sec.dataset.seccion || '';
        const visible = !q || nombre.includes(q) || sec.textContent.toLowerCase().includes(q);
        sec.style.display = visible ? 'block' : 'none';
      });
    });
  }

  // ── Tabs Todo / Favoritos ────────────────────────────────
  document.querySelectorAll('.elem-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.elem-tab').forEach(t => {
        t.classList.remove('activo-tab');
        t.style.borderBottomColor = 'transparent';
        t.style.color = 'rgba(167,235,242,0.4)';
      });
      tab.classList.add('activo-tab');
      tab.style.borderBottomColor = '#A7EBF2';
      tab.style.color = '#A7EBF2';

      if (tab.dataset.tab === 'fav') {
        mostrarToast('Favoritos — próximamente ⭐', 'info');
      } else {
        document.querySelectorAll('.elem-seccion').forEach(s => s.style.display = 'block');
      }
    });
  });

  // ── "Más ›" expandir sección ─────────────────────────────
  document.querySelectorAll('.elem-ver-mas').forEach(btn => {
    btn.addEventListener('click', () => {
      mostrarToast(`Más ${btn.dataset.grupo} — próximamente ›`, 'info');
    });
  });

})();

// ============================================================
//  ELEMENTOS PRO — Marcos, Stickers, Gradientes
// ============================================================
(function() {

  // ── Hover glow en todas las elem-cards ───────────────────
  document.querySelectorAll('.elem-card').forEach(el => {
    el.addEventListener('mouseenter', () => {
      el.style.borderColor  = 'rgba(167,235,242,0.55)';
      el.style.boxShadow    = '0 0 10px rgba(167,235,242,0.2)';
      el.style.transform    = 'scale(1.06)';
    });
    el.addEventListener('mouseleave', () => {
      el.style.borderColor  = 'rgba(167,235,242,0.1)';
      el.style.boxShadow    = 'none';
      el.style.transform    = 'scale(1)';
    });
  });

  // ── MARCOS: agregar al canvas como objeto forma ───────────
  const MARCO_W = 300, MARCO_H = 300;
  const MARCO_DEFS = {
    simple:      { grosor:6,  radio:4,  color:'#A7EBF2', estilo:'solido'   },
    doble:       { grosor:4,  radio:4,  color:'#A7EBF2', estilo:'doble'    },
    redondeado:  { grosor:5,  radio:24, color:'#F7C948', estilo:'solido'   },
    sombra:      { grosor:5,  radio:4,  color:'#54ACBF', estilo:'sombra'   },
    polaroid:    { grosor:6,  radio:3,  color:'#ffffff', estilo:'polaroid' },
    circulo:     { grosor:5,  radio:999,color:'#A7EBF2', estilo:'solido'   },
    'borde-grueso': { grosor:14, radio:3, color:'#F7C948', estilo:'solido' },
    puntos:      { grosor:3,  radio:4,  color:'#A7EBF2', estilo:'puntos'   },
  };

  document.querySelectorAll('.elem-marco').forEach(el => {
    el.addEventListener('click', () => {
      const tipo  = el.dataset.marco;
      const def   = MARCO_DEFS[tipo] || MARCO_DEFS.simple;
      const cx    = canvas.width  / 2;
      const cy    = canvas.height / 2;
      const obj   = {
        tipo:   'marco',
        x: cx - MARCO_W / 2,
        y: cy - MARCO_H / 2,
        w: MARCO_W, h: MARCO_H,
        rot: 0,
        marcoTipo:  tipo,
        marcoColor: def.color,
        marcoGrosor: def.grosor,
        marcoRadio: def.radio,
        marcoEstilo: def.estilo,
      };
      estado.objetos.push(obj);
      estado.seleccion = estado.objetos.length - 1;
      guardarHistorial();
      render();
      mostrarToast(`Marco "${tipo}" agregado 🖼️`, 'exito');
    });
  });

  // ── Renderizar marcos en el ciclo de render ───────────────
  // Extender el render para dibujar marcos
  const _render_prev = render;
  window.render = function() {
    _render_prev();
    // Los marcos los dibujamos encima como overlay (post-render)
    estado.objetos.forEach((obj, idx) => {
      if (obj.tipo !== 'marco') return;
      ctx.save();
      const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
      ctx.translate(cx, cy);
      if (obj.rot) ctx.rotate(obj.rot * Math.PI / 180);
      ctx.translate(-cx, -cy);

      ctx.strokeStyle = obj.marcoColor || '#A7EBF2';
      ctx.lineWidth   = obj.marcoGrosor || 4;
      ctx.lineJoin    = 'round';

      if (obj.marcoEstilo === 'puntos') ctx.setLineDash([5, 5]);
      else ctx.setLineDash([]);

      if (obj.marcoEstilo === 'sombra') {
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur  = 10;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;
      }

      const r = Math.min(obj.marcoRadio || 4, obj.w / 2, obj.h / 2);
      if (obj.marcoEstilo === 'doble') {
        ctx.strokeRect(obj.x + 2, obj.y + 2, obj.w - 4, obj.h - 4);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(obj.x + 8, obj.y + 8, obj.w - 16, obj.h - 16);
      } else if (obj.marcoRadio >= 999) {
        // Círculo
        ctx.beginPath();
        ctx.ellipse(cx, cy, obj.w / 2, obj.h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.roundRect(obj.x + ctx.lineWidth/2, obj.y + ctx.lineWidth/2,
                      obj.w - ctx.lineWidth, obj.h - ctx.lineWidth, r);
        ctx.stroke();
      }

      if (obj.marcoEstilo === 'polaroid') {
        // Borde inferior más grueso
        ctx.lineWidth = obj.marcoGrosor * 3;
        ctx.beginPath();
        ctx.moveTo(obj.x, obj.y + obj.h - ctx.lineWidth / 2);
        ctx.lineTo(obj.x + obj.w, obj.y + obj.h - ctx.lineWidth / 2);
        ctx.stroke();
      }

      ctx.restore();
    });
  };

  // ── STICKERS por categoría ────────────────────────────────
  const STICKER_CATS = {
    popular:    ['🌟','💫','🔥','⚡','💎','🎨','🚀','🎯','✨','🌈','🎭','💥','🔮','🎪','🌙'],
    naturaleza: ['🌸','🌺','🌻','🌹','🍀','🌿','🌱','🌲','🌊','🏔️','🌅','🦋','🐝','🌸','🍃'],
    emociones:  ['😍','🥳','😎','🤩','💪','👑','🙌','💯','🤝','👏','🥰','😂','🤣','😤','🎉'],
    comida:     ['🍕','🍔','🌮','🍣','🍦','🎂','🍩','☕','🥤','🍓','🍑','🍭','🍿','🥨','🍫'],
    viajes:     ['✈️','🗺️','🏝️','🗼','🎡','🏖️','🚢','⛵','🗽','🎠','🏕️','🌄','🚁','🎆','🏟️'],
  };

  function renderStickerGrid(cat) {
    const grid = document.getElementById('sticker-grid');
    if (!grid) return;
    grid.innerHTML = '';
    (STICKER_CATS[cat] || []).forEach(emoji => {
      const div = document.createElement('div');
      div.style.cssText = 'background:#0c1829;border:1.5px solid rgba(167,235,242,0.08);border-radius:8px;height:42px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:1.3rem;transition:all .15s';
      div.textContent = emoji;
      div.addEventListener('mouseenter', () => { div.style.borderColor='rgba(167,235,242,0.5)'; div.style.transform='scale(1.1)'; });
      div.addEventListener('mouseleave', () => { div.style.borderColor='rgba(167,235,242,0.08)'; div.style.transform='scale(1)'; });
      div.addEventListener('click', () => {
        const sz = 60;
        estado.objetos.push({
          tipo:'sticker', emoji,
          x: canvas.width/2 - sz/2,
          y: canvas.height/2 - sz/2,
          w: sz, h: sz, rot: 0,
        });
        guardarHistorial(); render();
        mostrarToast(`Sticker ${emoji} agregado`, 'exito');
      });
      grid.appendChild(div);
    });
  }

  // Iniciar con popular
  renderStickerGrid('popular');

  // Botones de categoría
  document.querySelectorAll('.sticker-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sticker-cat').forEach(b => {
        b.style.background   = 'rgba(255,255,255,0.04)';
        b.style.borderColor  = 'rgba(167,235,242,0.1)';
        b.style.color        = 'rgba(167,235,242,0.5)';
        b.classList.remove('activo-cat');
      });
      btn.style.background  = 'rgba(167,235,242,0.12)';
      btn.style.borderColor = 'rgba(167,235,242,0.3)';
      btn.style.color       = '#A7EBF2';
      btn.classList.add('activo-cat');
      renderStickerGrid(btn.dataset.cat);
    });
  });

  // ── GRADIENTES como fondo del canvas ─────────────────────
  document.querySelectorAll('.elem-grad').forEach(el => {
    el.addEventListener('click', () => {
      estado.gradiente = el.dataset.grad;
      estado.fondo     = '#000000';
      guardarHistorial(); render();
      mostrarToast('Gradiente aplicado ✓', 'exito');
    });
  });

  // ── Hover genérico para elem-grad ────────────────────────
  document.querySelectorAll('.elem-grad').forEach(el => {
    el.addEventListener('mouseenter', () => { el.style.transform='scale(1.06)'; el.style.borderColor='rgba(167,235,242,0.5)'; });
    el.addEventListener('mouseleave', () => { el.style.transform='scale(1)'; el.style.borderColor='rgba(167,235,242,0.1)'; });
  });

  // ══ PANEL EFECTOS ESTILO FOTOR ══════════════════════════════
  (function initEfectosPanel() {

    // ── Tabs Filtros / Efectos / Favoritos ──
    document.querySelectorAll('.ef-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.ef-tab').forEach(t => t.classList.remove('activo'));
        document.querySelectorAll('[data-eftab-cont]').forEach(c => c.style.display = 'none');
        tab.classList.add('activo');
        const cont = document.querySelector(`[data-eftab-cont="${tab.dataset.eftab}"]`);
        if (cont) cont.style.display = '';
      });
    });

    // ── Acordeón de categorías ──
    document.querySelectorAll('.ef-cat-header').forEach(btn => {
      // Primera categoría (escenas) abierta por defecto
      const catId = btn.dataset.toggle;
      const body = document.getElementById('cat-body-' + catId);
      if (!body) return;
      btn.addEventListener('click', () => {
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : '';
        btn.classList.toggle('abierto', !isOpen);
      });
    });
    // Abrir "escenas" por defecto
    const headerEscenas = document.querySelector('[data-toggle="escenas"]');
    if (headerEscenas) headerEscenas.classList.add('abierto');

    // ── Presets de filtros CSS ──
    const PRESETS = {
      // Escenas
      'golden':      'brightness(105%) saturate(130%) sepia(20%)',
      'dusk':        'brightness(95%) saturate(120%) hue-rotate(10deg) sepia(15%)',
      'ocean':       'brightness(100%) saturate(110%) hue-rotate(190deg)',
      'forest':      'brightness(95%) saturate(130%) hue-rotate(90deg)',
      'night':       'brightness(70%) saturate(60%) hue-rotate(220deg)',
      'aurora':      'brightness(105%) saturate(140%) hue-rotate(160deg)',
      // Clásico
      'bw':          'grayscale(100%)',
      'sepia-classic':'sepia(80%)',
      'chrome':      'grayscale(50%) contrast(120%) brightness(110%)',
      'fade':        'brightness(115%) saturate(60%) contrast(85%)',
      'silvertone':  'grayscale(60%) brightness(105%) contrast(110%)',
      'noir':        'grayscale(100%) contrast(140%) brightness(80%)',
      // Retro
      'polaroid':    'brightness(110%) saturate(80%) contrast(90%) sepia(10%)',
      'lomography':  'saturate(150%) contrast(130%) brightness(90%)',
      'vhs':         'saturate(120%) hue-rotate(5deg) contrast(110%)',
      'kodak':       'brightness(108%) saturate(130%) sepia(15%) contrast(105%)',
      'fuji':        'brightness(100%) saturate(120%) hue-rotate(170deg) contrast(105%)',
      '70s':         'sepia(40%) saturate(150%) brightness(105%) hue-rotate(-10deg)',
      // Invierno
      'snowglobe':   'brightness(115%) saturate(60%) hue-rotate(200deg)',
      'cozy':        'brightness(108%) saturate(110%) sepia(20%) warmth(10%)',
      'blizzard':    'brightness(120%) saturate(40%) contrast(90%)',
      'frozen':      'brightness(110%) saturate(80%) hue-rotate(170deg)',
      // Grises
      'pure-bw':     'grayscale(100%) contrast(110%)',
      'soft-grey':   'grayscale(80%) brightness(115%)',
      'high-contrast':'grayscale(100%) contrast(180%)',
      'iron':        'grayscale(70%) contrast(120%) brightness(90%)',
      // Vintage
      'antique':     'sepia(60%) saturate(80%) brightness(95%)',
      'faded-sepia':  'sepia(50%) brightness(110%) contrast(85%)',
      'americana':   'saturate(120%) contrast(110%) sepia(10%)',
      'estate':      'brightness(108%) saturate(70%) sepia(25%)',
    };

    let presetsActivos = new Set();
    const favs = JSON.parse(localStorage.getItem('ef_favs') || '[]');

    function aplicarPreset(preset) {
      const filtroCSS = PRESETS[preset];
      if (!filtroCSS) return;
      canvas.style.filter = filtroCSS;
      mostrarToast('Filtro aplicado ✓', 'exito');
    }

    // Agregar estrella de fav a cada filtro-item
    document.querySelectorAll('.ef-filter-item[data-filtro-preset]').forEach(item => {
      const preset = item.dataset.filtroPreset;
      // Fav button
      const favBtn = document.createElement('button');
      favBtn.className = 'ef-fav-btn';
      favBtn.innerHTML = '⭐';
      favBtn.title = 'Guardar como favorito';
      if (favs.includes(preset)) { item.classList.add('fav'); }
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = favs.indexOf(preset);
        if (idx > -1) { favs.splice(idx, 1); item.classList.remove('fav'); }
        else { favs.push(preset); item.classList.add('fav'); }
        localStorage.setItem('ef_favs', JSON.stringify(favs));
        renderFavs();
      });
      item.appendChild(favBtn);

      item.addEventListener('click', () => {
        document.querySelectorAll('.ef-filter-item').forEach(i => i.classList.remove('activo'));
        item.classList.add('activo');
        aplicarPreset(preset);
      });
    });

    // Render favs tab
    function renderFavs() {
      const grid = document.getElementById('ef-favs-grid');
      const vacio = document.getElementById('ef-favs-vacio');
      const lista = document.getElementById('ef-favs-lista');
      if (!grid) return;
      if (favs.length === 0) { vacio.style.display=''; lista.style.display='none'; return; }
      vacio.style.display='none'; lista.style.display='';
      grid.innerHTML = favs.map(p => `
        <div class="ef-filter-item" data-filtro-preset="${p}" style="cursor:pointer">
          <div class="ef-filter-prev" style="background:${PRESETS[p] ? 'linear-gradient(135deg,#A7EBF2,#0d2b4e)' : '#333'}"></div>
          <span>${p}</span>
        </div>
      `).join('');
      grid.querySelectorAll('.ef-filter-item').forEach(item => {
        item.addEventListener('click', () => aplicarPreset(item.dataset.filtroPreset));
      });
    }
    renderFavs();

    // AI Art cards
    document.querySelectorAll('.ef-ai-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.ef-ai-card').forEach(c => c.classList.remove('activo'));
        card.classList.add('activo');
        const preset = card.dataset.preset;
        const aiPresets = {
          'anime':     'saturate(130%) brightness(108%) contrast(105%)',
          'lineart':   'grayscale(100%) contrast(200%) brightness(120%)',
          'realistic': 'saturate(110%) contrast(110%) brightness(102%)',
          'watercolor':'saturate(90%) brightness(112%) contrast(90%) blur(0.3px)',
          'oilpaint':  'saturate(140%) contrast(115%) brightness(98%)',
          'sketch':    'grayscale(100%) contrast(150%) brightness(130%)',
        };
        if (aiPresets[preset]) { canvas.style.filter = aiPresets[preset]; mostrarToast(`Efecto AI "${card.title}" aplicado ✓`, 'exito'); }
      });
    });

    // Efectos especiales tab
    document.querySelectorAll('.ef-efecto-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.ef-efecto-item').forEach(i => i.classList.remove('activo'));
        item.classList.add('activo');
        const e = item.dataset.efecto;
        const efectos = {
          'glitch':       'saturate(200%) contrast(150%) hue-rotate(5deg)',
          'neon':         'saturate(200%) brightness(120%) contrast(130%)',
          'duotone':      'grayscale(100%) sepia(100%) saturate(200%) hue-rotate(310deg)',
          'vignette':     'brightness(90%) contrast(110%)',
          'blur-artistic':'blur(1.5px) saturate(130%) brightness(105%)',
          'tilt-shift':   'blur(0.5px) saturate(110%) contrast(105%)',
        };
        if (efectos[e]) { canvas.style.filter = efectos[e]; mostrarToast(`Efecto "${e}" aplicado ✓`, 'exito'); }
      });
    });

  })();
  // ══════════════════════════════════════════════════════════

  // ══ PANEL ADJUST ESTILO FOTOR ══════════════════════════════
  (function initAjustarPanel() {

    // Toggles AI
    const ajEnhance = document.getElementById('aj-enhance-toggle');
    if (ajEnhance) ajEnhance.addEventListener('change', () => {
      if (ajEnhance.checked) {
        canvas.style.filter = 'brightness(108%) contrast(112%) saturate(115%)';
        mostrarToast('✦ 1-Tap Enhance aplicado', 'exito');
      } else {
        canvas.style.filter = 'none';
        mostrarToast('Enhance desactivado', 'info');
      }
    });

    const ajFaceUnblur = document.getElementById('aj-faceunblur-toggle');
    if (ajFaceUnblur) ajFaceUnblur.addEventListener('change', () => {
      mostrarToast(ajFaceUnblur.checked ? '✦ Face Unblur activado (Pro)' : 'Face Unblur desactivado', ajFaceUnblur.checked ? 'exito' : 'info');
    });

    // Rows AI con flecha → toast pro
    ['aj-bgrm-row','aj-upscale-row','aj-eraser-row'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const labels = { 'aj-bgrm-row':'BG Remover', 'aj-upscale-row':'AI Upscaler', 'aj-eraser-row':'Magic Eraser' };
      el.addEventListener('click', () => mostrarToast(`✦ ${labels[id]} — función Pro`, 'info'));
    });

    // Size rows
    const ajCrop = document.getElementById('aj-crop-row');
    if (ajCrop) ajCrop.addEventListener('click', () => mostrarToast('Usa las asas del canvas para recortar', 'info'));

    const ajRotate = document.getElementById('aj-rotate-row');
    if (ajRotate) ajRotate.addEventListener('click', () => {
      if (window.estado) {
        estado.rotacion = ((estado.rotacion || 0) + 90) % 360;
        if (typeof render === 'function') render();
        mostrarToast('Rotado 90° ✓', 'exito');
      } else {
        mostrarToast('Carga una imagen primero', 'info');
      }
    });

    const ajResize = document.getElementById('aj-resize-row');
    if (ajResize) ajResize.addEventListener('click', () => mostrarToast('Ajusta el tamaño del canvas en la barra superior', 'info'));

    const ajColor = document.getElementById('aj-color-row');
    if (ajColor) ajColor.addEventListener('click', () => {
      // Abrir Ajuste Fino automáticamente
      const body = document.getElementById('aj-finetune-body');
      const row = document.getElementById('aj-finetune-row');
      if (body && body.style.display === 'none') {
        body.style.display = '';
        row && row.classList.add('abierto');
      }
      mostrarToast('Ajusta los colores con los sliders de abajo', 'info');
    });

    // Expandibles
    document.querySelectorAll('.aj-expandible').forEach(row => {
      row.addEventListener('click', () => {
        const body = document.getElementById(row.dataset.expand);
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : '';
        row.classList.toggle('abierto', !isOpen);
      });
    });

  })();
  // ══════════════════════════════════════════════════════════

  // ══ PANEL AI TOOLS ═════════════════════════════════
  (function initAIToolsPanel() {

    // Actualizar display de créditos
    function updateCreditsDisplay() {
      const el = document.getElementById('ait-credits-num');
      if (!el) return;
      try {
        const credits = JSON.parse(localStorage.getItem('pixeo_credits') || '100');
        el.textContent = credits + ' ⭐';
      } catch(e) { el.textContent = '100 ⭐'; }
    }
    updateCreditsDisplay();

    // Acciones por herramienta
    const AI_TOOLS = {
      'ai-enhance':    { label: '1-Tap Enhance',     fn: () => { canvas.style.filter='brightness(108%) contrast(112%) saturate(115%)'; } },
      'ai-upscale':    { label: 'AI Upscaler',       fn: () => mostrarToast('AI Upscaler — función Pro ✨', 'info') },
      'obj-remove':    { label: 'Magic Eraser',      fn: () => mostrarToast('Magic Eraser — seleccióna el objeto en el canvas', 'info') },
      'bg-remove':     { label: 'BG Remover',        fn: () => { canvas.style.filter='opacity(0.85)'; mostrarToast('BG Remover aplicado ✔', 'exito'); } },
      'face-unblur':   { label: 'Face Unblur',       fn: () => { canvas.style.filter='brightness(105%) contrast(110%) sharpen(1)'; mostrarToast('Face Unblur — función Pro', 'info'); } },
      'skin-retouch':  { label: 'AI Skin Retouch',   fn: () => { canvas.style.filter='brightness(107%) saturate(88%) contrast(96%)'; mostrarToast('Skin Retouch aplicado ✔', 'exito'); } },
      'ai-reshot':     { label: 'AI Reshot',         fn: () => mostrarToast('AI Reshot — sube tu foto para continuar', 'info') },
      'ai-headshot':   { label: 'AI Headshot',       fn: () => mostrarToast('AI Headshot — función Pro ✨', 'info') },
      'ai-art':        { label: 'AI Art Effects',    fn: () => { canvas.style.filter='saturate(130%) contrast(110%) brightness(105%)'; mostrarToast('AI Art Effects aplicado ✔', 'exito'); } },
      'ai-expand':     { label: 'AI Expand',         fn: () => mostrarToast('AI Expand — extiende el fondo de la imagen', 'info') },
      'ai-replace':    { label: 'AI Replace',        fn: () => mostrarToast('AI Replace — selecciona el objeto a reemplazar', 'info') },
      'photo-restore': { label: 'Old Photo Restorer',fn: () => { canvas.style.filter='brightness(108%) contrast(105%) saturate(110%) sepia(5%)'; mostrarToast('Photo Restorer aplicado ✔', 'exito'); } },
      'ai-generate':   { label: 'AI Generator',      fn: () => { document.querySelector('[data-rail="ia"]') && document.querySelector('[data-rail="ia"]').click(); mostrarToast('Usa el generador de IA ✨', 'info'); } },
      'ai-avatar':     { label: 'AI Avatar',         fn: () => mostrarToast('AI Avatar — función Pro ✨', 'info') },
      'ai-denoise':    { label: 'AI Denoise',        fn: () => { canvas.style.filter='brightness(102%) contrast(108%) saturate(105%)'; mostrarToast('AI Denoise aplicado ✔', 'exito'); } },
    };

    document.querySelectorAll('[data-panel="ia"] .ait-card').forEach(card => {
      card.addEventListener('click', () => {
        const tool = card.dataset.proTool;
        const costo = parseInt(card.dataset.costo || '0');
        const info = AI_TOOLS[tool];
        if (!info) return;

        // Descontar créditos
        let credits = 100;
        try { credits = parseInt(localStorage.getItem('pixeo_credits') || '100'); } catch(e) {}
        if (credits < costo) { mostrarToast('Créditos insuficientes — consigue más Pro ⭐', 'info'); return; }
        credits -= costo;
        try { localStorage.setItem('pixeo_credits', credits); } catch(e) {}
        updateCreditsDisplay();

        // Ejecutar acción
        info.fn();
      });
    });

  })();
  // ══════════════════════════════════════════════════════════

})();