// ============================================================
//  estado-estilo.js — El cliente pregunta aquí cada ~2s por el
//  resultado de una predicción creada en generar-estilo.js.
//
//  GET /.netlify/functions/estado-estilo?id=<predictionId>
//  Respuesta:
//    { status: "starting" | "processing" }
//    { status: "succeeded", url: "https://..." }
//    { status: "failed", error: "..." }   ← ya reembolsado automáticamente
// ============================================================

import { getStore } from "@netlify/blobs";
import { getFirebaseAdmin } from "./_firebase-admin.js";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function reembolsar(predictionId) {
  const pendientes = getStore("transformaciones-pendientes");
  const info = await pendientes.get(predictionId, { type: "json" });
  if (!info) return; // ya reembolsado antes, o no existe
  const { db } = getFirebaseAdmin();
  await db.ref(`users/${info.uid}/creditos`).transaction((actual) => (actual || 0) + info.creditos);
  await pendientes.delete(predictionId);
}

async function limpiarPendiente(predictionId) {
  const pendientes = getStore("transformaciones-pendientes");
  await pendientes.delete(predictionId);
}

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "Falta el id" }, 400);

  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) return json({ error: "Falta configurar REPLICATE_API_TOKEN" }, 500);

  let data;
  try {
    const resp = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${replicateToken}` },
    });
    data = await resp.json();
    if (!resp.ok) return json({ error: "No se pudo consultar Replicate", detalle: data }, 502);
  } catch (err) {
    return json({ error: "No se pudo contactar a Replicate", detalle: String(err) }, 502);
  }

  if (data.status === "succeeded") {
    await limpiarPendiente(id);
    const salida = Array.isArray(data.output) ? data.output[0] : data.output;
    return json({ status: "succeeded", url: salida });
  }

  if (data.status === "failed" || data.status === "canceled") {
    await reembolsar(id);
    return json({ status: "failed", error: data.error || "La generación falló. Tus créditos fueron devueltos." });
  }

  return json({ status: data.status }); // starting | processing
};
