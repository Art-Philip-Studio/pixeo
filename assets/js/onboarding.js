/* ================================================================
   Pixeo — Onboarding / Tooltips  v1.0
   Aparece solo la primera vez que el usuario entra a cada página.
   Se guarda en localStorage por página.
================================================================ */

(function () {
  "use strict";

  /* ── Config de pasos por página ─────────────────────────── */
  const TOURS = {
    index: [
      {
        target: '.navbar__enlace[href="app.html"]',
        title:  "✏️ Editor gratuito",
        text:   "Aquí entras al editor. No necesitas cuenta para empezar.",
        pos:    "bottom"
      },
      {
        target: "#tendencias",
        title:  "🔥 Tendencias virales",
        text:   "Haz clic en cualquier foto para generar ese estilo con tu propia imagen. ¡Un solo clic!",
        pos:    "top"
      },
      {
        target: '.navbar__enlace[href="comunidad.html"]',
        title:  "👥 Comunidad",
        text:   "Mira qué estilos están siendo tendencia esta semana.",
        pos:    "bottom"
      },
      {
        target: '[data-creditos]',
        title:  "⭐ Créditos gratis",
        text:   "Ganas créditos cada vez que usas el editor. Úsalos para herramientas pro.",
        pos:    "bottom"
      }
    ],
    app: [
      {
        target: ".editor-topbar__nav-link:nth-child(1)",
        title:  "🤖 IA mágica",
        text:   "Elige un estilo viral y tu foto se transforma automáticamente.",
        pos:    "bottom"
      },
      {
        target: "#btn-subir-foto, .upload-area, .btn-upload",
        title:  "📸 Sube tu foto",
        text:   "Arrastra o elige tu foto. En segundos tendrás el resultado.",
        pos:    "bottom",
        fallback: ".editor-sidebar"
      },
      {
        target: "#btn-generar, .btn-generar, .btn-magic",
        title:  "✨ Botón mágico",
        text:   "Pulsa aquí y la IA aplica el estilo a tu foto. ¡Sin escribir nada!",
        pos:    "top",
        fallback: ".editor-canvas"
      },
      {
        target: "#btn-descargar, .btn-descargar, .btn-export",
        title:  "📤 Descarga en HD",
        text:   "Tu resultado en máxima calidad. Y ganas +5 créditos por cada exportación.",
        pos:    "top",
        fallback: ".editor-topbar"
      }
    ],
    comunidad: [
      {
        target: ".com-hero h1, .com-hero",
        title:  "🌟 Estilos virales",
        text:   "Aquí verás qué estilos de IA están arrrasando esta semana.",
        pos:    "bottom"
      },
      {
        target: ".viral-card:first-child, .com-card:first-child",
        title:  "👆 Clic = magia",
        text:   "Toca cualquier estilo para intentarlo tú mismo. Tu foto + este estilo = resultado increíble.",
        pos:    "right"
      },
      {
        target: ".com-fab",
        title:  "🎨 Publica y gana",
        text:   "Comparte tus creaciones y gana +50 créditos por cada diseño que publiques.",
        pos:    "top"
      }
    ]
  };

  /* ── Detectar página actual ──────────────────────────────── */
  function getPagina() {
    const p = window.location.pathname;
    if (p.includes("app.html"))       return "app";
    if (p.includes("comunidad.html")) return "comunidad";
    return "index";
  }

  const pagina    = getPagina();
  const storageKey = `px_tour_done_${pagina}`;

  /* ── ¿Ya lo vio? ─────────────────────────────────────────── */
  if (localStorage.getItem(storageKey)) return;

  const pasos = TOURS[pagina];
  if (!pasos || pasos.length === 0) return;

  /* ── Crear overlay y tooltip ─────────────────────────────── */
  let pasoActual = 0;

  // Inyectar estilos
  const style = document.createElement("style");
  style.textContent = `
    .px-overlay {
      position: fixed; inset: 0; z-index: 9000;
      pointer-events: none;
    }
    .px-spotlight {
      position: fixed; z-index: 9001;
      border-radius: 10px;
      box-shadow: 0 0 0 9999px rgba(0,0,0,0.65);
      transition: all 0.35s cubic-bezier(.4,0,.2,1);
      pointer-events: none;
    }
    .px-tooltip {
      position: fixed; z-index: 9002;
      background: #1a1a2e;
      border: 1px solid rgba(255,107,53,0.4);
      border-radius: 14px;
      padding: 1.1rem 1.3rem;
      max-width: 280px;
      min-width: 220px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,107,53,0.15);
      transition: all 0.3s cubic-bezier(.4,0,.2,1);
      animation: pfPop 0.3s cubic-bezier(.4,0,.2,1);
    }
    @keyframes pfPop {
      from { opacity:0; transform: scale(0.88) translateY(8px); }
      to   { opacity:1; transform: scale(1)    translateY(0);   }
    }
    .px-tooltip__arrow {
      position: absolute; width: 12px; height: 12px;
      background: #1a1a2e;
      border: 1px solid rgba(255,107,53,0.4);
      transform: rotate(45deg);
    }
    .px-tooltip__title {
      font-family: 'Syne', 'Montserrat', sans-serif;
      font-size: .9rem; font-weight: 800;
      color: #fff; margin-bottom: .35rem; line-height: 1.2;
    }
    .px-tooltip__text {
      font-size: .8rem; color: rgba(255,255,255,0.72);
      line-height: 1.5; margin-bottom: .9rem;
    }
    .px-tooltip__footer {
      display: flex; align-items: center; justify-content: space-between; gap: .5rem;
    }
    .px-tooltip__dots { display: flex; gap: 5px; }
    .px-tooltip__dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: rgba(255,255,255,0.25);
      transition: background 0.2s;
    }
    .px-tooltip__dot.activo { background: #ff6b35; }
    .px-tooltip__acciones { display: flex; gap: .5rem; }
    .px-btn-skip {
      background: none; border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.45); border-radius: 7px;
      padding: .35rem .7rem; font-size: .73rem; cursor: pointer;
      transition: all .2s;
    }
    .px-btn-skip:hover { border-color: rgba(255,255,255,0.35); color: rgba(255,255,255,0.7); }
    .px-btn-next {
      background: linear-gradient(135deg, #ff6b35, #f7c948);
      border: none; border-radius: 7px;
      padding: .35rem .9rem; font-size: .78rem; font-weight: 700;
      color: #fff; cursor: pointer; transition: opacity .2s;
    }
    .px-btn-next:hover { opacity: 0.88; }
  `;
  document.head.appendChild(style);

  // Crear elementos
  const overlay   = document.createElement("div");
  overlay.className = "px-overlay";

  const spotlight = document.createElement("div");
  spotlight.className = "px-spotlight";

  const tooltip   = document.createElement("div");
  tooltip.className = "px-tooltip";

  document.body.appendChild(overlay);
  document.body.appendChild(spotlight);
  document.body.appendChild(tooltip);

  /* ── Encontrar elemento target ───────────────────────────── */
  function getTarget(paso) {
    let el = document.querySelector(paso.target);
    if (!el && paso.fallback) el = document.querySelector(paso.fallback);
    return el;
  }

  /* ── Posicionar spotlight y tooltip ─────────────────────── */
  function posicionarPaso(paso) {
    const el = getTarget(paso);

    // Render tooltip content first
    const totalPasos = pasos.length;
    const dots = pasos.map((_, i) =>
      `<span class="px-tooltip__dot ${i === pasoActual ? 'activo' : ''}"></span>`
    ).join('');
    const esUltimo = pasoActual === totalPasos - 1;

    tooltip.innerHTML = `
      <div class="px-tooltip__title">${paso.title}</div>
      <div class="px-tooltip__text">${paso.text}</div>
      <div class="px-tooltip__footer">
        <div class="px-tooltip__dots">${dots}</div>
        <div class="px-tooltip__acciones">
          <button class="px-btn-skip">Saltar</button>
          <button class="px-btn-next">${esUltimo ? '¡Listo! 🎉' : 'Siguiente →'}</button>
        </div>
      </div>
    `;

    tooltip.querySelector('.px-btn-next').onclick  = siguiente;
    tooltip.querySelector('.px-btn-skip').onclick  = terminar;

    if (!el) {
      // Sin target: mostrar centrado sin spotlight
      spotlight.style.cssText = "display:none;";
      tooltip.style.cssText = `
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
      `;
      return;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const pad  = 8;

      spotlight.style.cssText = `
        top:    ${rect.top    - pad}px;
        left:   ${rect.left   - pad}px;
        width:  ${rect.width  + pad*2}px;
        height: ${rect.height + pad*2}px;
        display: block;
      `;

      // Posicionar tooltip
      const tw = 280;
      const th = 160;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let top, left;
      const pos = paso.pos || "bottom";

      if (pos === "bottom") {
        top  = rect.bottom + pad + 12;
        left = rect.left + rect.width / 2 - tw / 2;
      } else if (pos === "top") {
        top  = rect.top - th - pad - 12;
        left = rect.left + rect.width / 2 - tw / 2;
      } else if (pos === "right") {
        top  = rect.top + rect.height / 2 - th / 2;
        left = rect.right + pad + 12;
      } else {
        top  = rect.top + rect.height / 2 - th / 2;
        left = rect.left - tw - pad - 12;
      }

      // Clamp dentro de la pantalla
      left = Math.max(12, Math.min(left, vw - tw - 12));
      top  = Math.max(12, Math.min(top,  vh - th - 12));

      tooltip.style.cssText = `top: ${top}px; left: ${left}px;`;
    }, 350);
  }

  /* ── Controles ───────────────────────────────────────────── */
  function siguiente() {
    pasoActual++;
    if (pasoActual >= pasos.length) {
      terminar();
    } else {
      // Re-animate
      tooltip.style.animation = "none";
      requestAnimationFrame(() => {
        tooltip.style.animation = "";
        posicionarPaso(pasos[pasoActual]);
      });
    }
  }

  function terminar() {
    localStorage.setItem(storageKey, "1");
    overlay.remove();
    spotlight.remove();
    tooltip.remove();
  }

  /* ── Iniciar tour con pequeño delay ─────────────────────── */
  window.addEventListener("load", () => {
    setTimeout(() => posicionarPaso(pasos[0]), 800);
  });

  // Cerrar con Escape
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") terminar();
  });

})();
