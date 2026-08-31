import {
  createAdminToken,
  setAdminCookie
} from "../_lib/admin-auth.js";

export default async function handler(req, res) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "same-origin"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {

    const password =
      String(
        req.body?.password || ""
      );

    const configured =
      process.env.ADMIN_PANEL_PASSWORD;

    if (!configured) {
      return res.status(500).json({
        ok: false,
        error:
          "ADMIN_PANEL_PASSWORD no está configurada"
      });
    }

    if (
      !password ||
      password !== configured
    ) {
      return res.status(401).json({
        ok: false,
        error:
          "Contraseña incorrecta"
      });
    }

    const token =
      createAdminToken(
        configured
      );

    setAdminCookie(
      res,
      token
    );

    return res.status(200).json({
      ok: true
    });

  } catch (error) {

    console.error(
      "Admin login:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "Internal server error"
    });

  }

}