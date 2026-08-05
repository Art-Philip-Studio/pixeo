// ============================================================
//  estilo-libre-estado.js — El navegador pregunta aquí cada ~2s
//  por el resultado de un job creado en estilo-libre.js.
//
//  GET /.netlify/functions/estilo-libre-estado?jobId=<jobId>
//  Respuesta:
//    { status: "procesando" }
//    { status: "listo", imagenes: ["data:image/...;base64,...", ...] }
//    { status: "error", error: "..." }
// ============================================================

import { getStore } from "@netlify/blobs";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) return json({ error: "Falta el jobId" }, 400);

  const jobs = getStore("estilo-libre-jobs");
  const job = await jobs.get(jobId, { type: "json" });

  if (!job) return json({ error: "Job no encontrado" }, 404);

  return json(job);
};
