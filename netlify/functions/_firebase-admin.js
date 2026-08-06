// ============================================================
//  _firebase-admin.js — Inicializa Firebase Admin UNA sola vez
//  y lo comparte entre las funciones. Usa la misma base de datos
//  que ya usa tu app, con permisos de administrador (puede
//  escribir sin pasar por las reglas).
//
//  Necesita 4 variables de entorno (en vez del JSON completo,
//  para no pasar el límite de 4KB de AWS Lambda):
//    - FIREBASE_PROJECT_ID
//    - FIREBASE_CLIENT_EMAIL
//    - FIREBASE_PRIVATE_KEY
//    - FIREBASE_DATABASE_URL
//  (ver LEEME.md)
// ============================================================

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";

function credencialesDesdeEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error(
      "Faltan variables de entorno: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY"
    );
  }

  return {
    type: "service_account",
    project_id: projectId,
    client_email: clientEmail,
    // Los \n quedan como texto literal al pegarlos en Netlify;
    // aquí los convertimos a saltos de línea reales.
    private_key: privateKeyRaw.replace(/\\n/g, "\n"),
  };
}

let app;
export function getFirebaseAdmin() {
  if (!getApps().length) {
    const serviceAccount = credencialesDesdeEnv();
    const databaseURL = process.env.FIREBASE_DATABASE_URL;

    if (!databaseURL) {
      throw new Error("Falta la variable de entorno FIREBASE_DATABASE_URL");
    }

    app = initializeApp({
      credential: cert(serviceAccount),
      databaseURL,
    });
  }
  return { db: getDatabase(app), auth: getAuth(app) };
}
