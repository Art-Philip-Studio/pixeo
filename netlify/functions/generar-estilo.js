// ============================================================
//  generar-estilo.js — Transforma una foto con estilo IA real
//  usando black-forest-labs/flux-kontext-pro en Replicate.
//
//  POST body: { "idToken": "...", "imagen": "data:image/...;base64,...", "estilo": "anime" }
//  Respuesta: { "predictionId": "...", "creditos": 85 }
//
//  Flujo:
//  1. Verifica el idToken de Firebase (nadie puede falsificar el uid).
//  2. Descuenta COSTO_CREDITOS de forma atómica ANTES de llamar a
//     Replicate — si no tiene créditos suficientes, no se gasta nada.
//  3. Crea la predicción en Replicate (asíncrona, no esperamos aquí
//     porque puede tardar más de lo que Netlify permite en una función
//     normal). Devolvemos el predictionId para que el cliente pregunte
//     el estado en estado-estilo.js.
//  4. Si algo falla ANTES de crear la predicción, reembolsamos los
//     créditos automáticamente. Si falla DESPUÉS (la predicción se
//     crea pero termina en error), estado-estilo.js hace el reembolso.
// ============================================================

import { getStore } from "@netlify/blobs";
import { getFirebaseAdmin } from "./_firebase-admin.js";

const COSTO_CREDITOS = 15;

const PROMPTS = {
  anime:     "Transform this photo into a high quality anime illustration. Cel-shaded coloring, clean bold line art, expressive anime-style eyes and face, vibrant saturated colors. Keep the same person, pose, framing and background composition — only change the art style.",
  cyberpunk: "Transform this photo into a cyberpunk portrait: neon blue and magenta lighting, futuristic city glow in the background, subtle glowing highlights on skin and clothing, high-tech moody atmosphere. Keep the same person, pose and framing — only change the style and lighting.",
  ghibli:    "Transform this photo into a Studio Ghibli-inspired hand-painted illustration: soft watercolor textures, warm pastel colors, gentle natural lighting, whimsical storybook atmosphere. Keep the same person, pose, framing and background composition — only change the art style.",
  synthwave: "Transform this photo into a retro 80s synthwave portrait: neon pink and purple gradient lighting, glowing grid horizon in the background, retro-futuristic chrome highlights. Keep the same person, pose and framing — only change the style and lighting.",
  pixar:     "Transform this photo into a 3D animated character render in the style of a modern animated film: smooth stylized 3D shading, soft studio lighting, slightly exaggerated friendly features while preserving the person's likeness. Keep the same pose and framing — only change the rendering style.",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const { idToken, imagen, estilo } = body;

  if (!idToken) return json({ error: "Falta iniciar sesión" }, 401);
  if (!imagen) return json({ error: "Falta la foto" }, 400);

  const prompt = PROMPTS[estilo];
  if (!prompt) return json({ error: "Estilo inválido" }, 400);

  // 1. Verificar sesión
  let uid;
  const { auth, db } = getFirebaseAdmin();
  try {
    const decoded = await auth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return json({ error: "Sesión inválida o expirada" }, 401);
  }

  // 2. Descontar créditos de forma atómica (evita condiciones de carrera
  //    y evita que alguien mande la petición dos veces muy rápido)
  const creditosRef = db.ref(`users/${uid}/creditos`);
  let nuevoTotal;
  try {
    const resultado = await creditosRef.transaction((actual) => {
      const val = actual || 0;
      if (val < COSTO_CREDITOS) return; // undefined = aborta la transacción
      return val - COSTO_CREDITOS;
    });
    if (!resultado.committed) {
      const snap = await creditosRef.get();
      return json(
        { error: "Créditos insuficientes", creditos: snap.val() || 0, necesarios: COSTO_CREDITOS },
        402
      );
    }
    nuevoTotal = resultado.snapshot.val();
  } catch (err) {
    return json({ error: "No se pudo verificar tus créditos", detalle: String(err) }, 500);
  }

  // 3. Crear la predicción en Replicate
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) {
    await creditosRef.transaction((actual) => (actual || 0) + COSTO_CREDITOS); // reembolso
    return json({ error: "Falta configurar REPLICATE_API_TOKEN en Netlify" }, 500);
  }

  try {
    const resp = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${replicateToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            prompt,
            input_image: imagen,
            output_format: "png",
          },
        }),
      }
    );
    const data = await resp.json();

    if (!resp.ok) {
      await creditosRef.transaction((actual) => (actual || 0) + COSTO_CREDITOS); // reembolso
      return json({ error: "Replicate rechazó la solicitud", detalle: data }, 502);
    }

    // Guardamos quién pidió esta predicción para poder reembolsar si falla
    const pendientes = getStore("transformaciones-pendientes");
    await pendientes.setJSON(data.id, {
      uid,
      creditos: COSTO_CREDITOS,
      creado: new Date().toISOString(),
    });

    return json({ predictionId: data.id, creditos: nuevoTotal });
  } catch (err) {
    await creditosRef.transaction((actual) => (actual || 0) + COSTO_CREDITOS); // reembolso
    return json({ error: "No se pudo contactar a Replicate", detalle: String(err) }, 502);
  }
};
