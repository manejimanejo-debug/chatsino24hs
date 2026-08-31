import {
  clearAdminCookie
} from "../_lib/admin-auth.js";

export default async function handler(req, res) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "same-origin"
  );

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  clearAdminCookie(res);

  return res.status(200).json({
    ok: true
  });

}