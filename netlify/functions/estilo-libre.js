// ============================================================
//  estilo-libre.js — PASO 1: inicia una copia de estilo GRATIS
//  (sin login, límite por dispositivo). Como Gemini puede tardar
//  más de lo que Netlify permite en una función normal, esta
//  función SOLO valida la cuota y dispara el trabajo real en
//  segundo plano (estilo-libre-generar-background.js), devolviendo
//  de inmediato un jobId para que el navegador pregunte el avance.
//
//  POST body: {
//    "deviceId": "<id anónimo generado por el navegador>",
//    "imagenBase": "data:image/...;base64,....",
//    "imagenReferencia": "data:image/...;base64,....",
//    "variaciones": 1   // opcional, 1-3, default 1
//  }
//  Respuesta: { "jobId": "...", "restantes": 3 }
// ============================================================

import { getStore } from "@netlify/blobs";
import { getFirebaseAdmin } from "./_firebase-admin.js";

const LIMITE_DIARIO = 5;
const MAX_VARIACIONES = 3;
const DEVICE_ID_RE = /^[a-zA-Z0-9_-]{8,80}$/;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const { deviceId, imagenBase, imagenReferencia } = body;
  const variaciones = Math.min(Math.max(parseInt(body.variaciones, 10) || 1, 1), MAX_VARIACIONES);

  if (!deviceId || !DEVICE_ID_RE.test(deviceId)) {
    return json({ error: "Falta o es inválido el identificador de dispositivo" }, 400);
  }
  if (!imagenBase) return json({ error: "Falta tu foto" }, 400);
  if (!imagenReferencia) return json({ error: "Falta la foto de referencia" }, 400);
  if (!process.env.GEMINI_API_KEY) {
    return json({ error: "Falta la variable de entorno GEMINI_API_KEY" }, 500);
  }

  // 1. Aplicar el límite diario GRATIS por dispositivo.
  let restantes;
  try {
    const { db } = getFirebaseAdmin();
    const usoRef = db.ref(`usoGratisDispositivo/${deviceId}`);
    const resultado = await usoRef.transaction((actual) => {
      const hoy = hoyISO();
      if (!actual || actual.fecha !== hoy) return { fecha: hoy, conteo: 1 };
      if (actual.conteo >= LIMITE_DIARIO) return;
      return { fecha: hoy, conteo: actual.conteo + 1 };
    });
    if (!resultado.committed) {
      return json(
        { error: `Ya usaste tus ${LIMITE_DIARIO} copias gratis de hoy. Vuelve mañana o usa el estilo pagado con más créditos.` },
        429
      );
    }
    restantes = LIMITE_DIARIO - resultado.snapshot.val().conteo;
  } catch (err) {
    return json({ error: "No se pudo verificar tu cuota gratis. Intenta de nuevo." }, 500);
  }

  // 2. Crear el job y guardarlo como "procesando".
  const jobId = crypto.randomUUID();
  const jobs = getStore("estilo-libre-jobs");
  await jobs.setJSON(jobId, { status: "procesando", creado: new Date().toISOString() });

  // 3. Disparar el trabajo real en segundo plano (no esperamos a que termine).
  const base = new URL(req.url).origin;
  fetch(`${base}/.netlify/functions/estilo-libre-generar-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, imagenBase, imagenReferencia, variaciones }),
  }).catch(() => {}); // si esto falla, el estado se queda en "procesando" y expira solo

  return json({ jobId, restantes });
};
