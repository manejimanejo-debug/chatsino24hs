export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: "Open 24hs",
    kommo: "ready",
    push: "pending"
  });
}
