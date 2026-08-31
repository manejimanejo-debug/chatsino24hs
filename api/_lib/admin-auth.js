import crypto from "crypto";


const COOKIE_NAME =
  "open24hs_admin";

const MAX_AGE_SECONDS =
  60 * 60 * 12; // 12 horas


function getCookie(
  req,
  name
) {

  const header =
    req.headers?.cookie || "";


  const parts =
    header
      .split(";")
      .map(
        value =>
          value.trim()
      );


  for (
    const part
    of parts
  ) {

    const separator =
      part.indexOf("=");


    if (
      separator === -1
    ) {
      continue;
    }


    const key =
      part.slice(
        0,
        separator
      );


    const value =
      part.slice(
        separator + 1
      );


    if (
      key === name
    ) {

      return decodeURIComponent(
        value
      );

    }

  }


  return null;

}


function sign(
  value,
  secret
) {

  return crypto
    .createHmac(
      "sha256",
      secret
    )
    .update(value)
    .digest("hex");

}


export function createAdminToken(
  secret
) {

  const exp =
    Math.floor(
      Date.now() / 1000
    ) +
    MAX_AGE_SECONDS;


  const payload =
    String(exp);


  const signature =
    sign(
      payload,
      secret
    );


  return (
    `${payload}.${signature}`
  );

}


export function verifyAdminToken(
  token,
  secret
) {

  if (
    !token ||
    !secret
  ) {

    return false;

  }


  const parts =
    token.split(".");


  if (
    parts.length !== 2
  ) {

    return false;

  }


  const [
    expText,
    signature
  ] = parts;


  const exp =
    Number(expText);


  if (
    !Number.isFinite(exp)
  ) {

    return false;

  }


  if (
    exp <=
    Math.floor(
      Date.now() / 1000
    )
  ) {

    return false;

  }


  const expected =
    sign(
      expText,
      secret
    );


  if (
    signature.length !==
    expected.length
  ) {

    return false;

  }


  return crypto.timingSafeEqual(
    Buffer.from(
      signature
    ),
    Buffer.from(
      expected
    )
  );

}


export function isAdminAuthenticated(
  req
) {

  const secret =
    process.env
      .ADMIN_PANEL_PASSWORD;


  if (!secret) {

    return false;

  }


  const token =
    getCookie(
      req,
      COOKIE_NAME
    );


  return verifyAdminToken(
    token,
    secret
  );

}


export function setAdminCookie(
  res,
  token
) {

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`
  );

}


export function clearAdminCookie(
  res
) {

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`
  );

}


export function getAdminCookieName() {

  return COOKIE_NAME;

}