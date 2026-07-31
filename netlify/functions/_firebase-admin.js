// ============================================================
//  _firebase-admin.js — Inicializa Firebase Admin UNA sola vez
//  y lo comparte entre las funciones. Usa la misma base de datos
//  que ya usa tu app (pixeo-app-7880d), pero con permisos de
//  administrador (puede escribir sin pasar por las reglas).
//
//  Necesita la variable de entorno FIREBASE_SERVICE_ACCOUNT con
//  el JSON completo de la cuenta de servicio (ver LEEME.md).
// ============================================================

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";

function credencialesDesdeEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT");
  }
  // Aceptamos tanto el JSON tal cual como una versión en base64
  // (base64 es más seguro para pegar en el panel de Netlify sin
  // que se rompan los saltos de línea de la private_key).
  const texto = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf-8");
  return JSON.parse(texto);
}

let app;
export function getFirebaseAdmin() {
  if (!getApps().length) {
    const serviceAccount = credencialesDesdeEnv();
    app = initializeApp({
      credential: cert(serviceAccount),
      databaseURL:
        process.env.FIREBASE_DATABASE_URL ||
        "https://pixeo-app-7880d-default-rtdb.firebaseio.com",
    });
  }
  return { db: getDatabase(app), auth: getAuth(app) };
}
