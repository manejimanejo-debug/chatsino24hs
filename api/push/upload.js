import crypto from "crypto";
import { isAdminAuthenticated } from "../_lib/admin-auth.js";

const MAX_FILE_SIZE =
  2 * 1024 * 1024;

const ALLOWED_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);

const EXTENSIONS = {
  "image/jpeg":
    "jpg",

  "image/png":
    "png",

  "image/webp":
    "webp"
};

function parseBody(req) {

  if (
    req.body &&
    typeof req.body === "object"
  ) {

    return req.body;
  }

  if (
    typeof req.body === "string"
  ) {

    try {

      return JSON.parse(
        req.body
      );

    } catch (_) {

      return {};

    }

  }

  return {};

}


async function ensureBucket(
  supabaseUrl,
  supabaseKey,
  bucket
) {

  const check =
    await fetch(
      `${supabaseUrl}/storage/v1/bucket/${bucket}`,
      {
        method:
          "GET",

        headers: {

          Authorization:
            `Bearer ${supabaseKey}`,

          apikey:
            supabaseKey

        }

      }
    );


  if (
    check.ok
  ) {

    return;

  }


  const create =
    await fetch(
      `${supabaseUrl}/storage/v1/bucket`,
      {

        method:
          "POST",

        headers: {

          Authorization:
            `Bearer ${supabaseKey}`,

          apikey:
            supabaseKey,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({

            id:
              bucket,

            name:
              bucket,

            public:
              true

          })

      }
    );


  if (
    !create.ok &&
    create.status !== 409
  ) {

    const text =
      await create.text();


    throw new Error(
      `No se pudo crear el bucket: ${text}`
    );

  }

}


async function uploadObject({
  supabaseUrl,
  supabaseKey,
  bucket,
  objectPath,
  data,
  contentType
}) {

  const buffer =
    Buffer.from(
      data,
      "base64"
    );


  if (
    !buffer.length
  ) {

    throw new Error(
      "La imagen está vacía."
    );

  }


  if (
    buffer.length >
    MAX_FILE_SIZE
  ) {

    throw new Error(
      "La imagen supera el límite de 2 MB."
    );

  }


  const response =
    await fetch(

      `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`,

      {

        method:
          "POST",

        headers: {

          Authorization:
            `Bearer ${supabaseKey}`,

          apikey:
            supabaseKey,

          "Content-Type":
            contentType,

          "x-upsert":
            "true"

        },

        body:
          buffer

      }

    );


  if (
    !response.ok
  ) {

    const text =
      await response.text();


    throw new Error(
      `Error Storage: ${text}`
    );

  }


  return (
    `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`
  );

}


export default async function handler(
  req,
  res
) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "same-origin"
  );


  res.setHeader(
    "Access-Control-Allow-Credentials",
    "true"
  );


  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );


  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  if (
    req.method === "OPTIONS"
  ) {

    return res
      .status(200)
      .end();

  }


  if (
    req.method !== "POST"
  ) {

    return res.status(405).json({

      ok:
        false,

      error:
        "Method not allowed"

    });

  }


  /*
   * =====================================================
   * AUTENTICACIÓN
   * =====================================================
   *
   * El upload utiliza la sesión del administrador
   * mediante la cookie HttpOnly.
   *
   * No se acepta PUSH_ADMIN_SECRET desde el navegador.
   */

  if (
    !isAdminAuthenticated(req)
  ) {

    return res.status(401).json({

      ok:
        false,

      error:
        "Unauthorized"

    });

  }


  try {

    const {
      filename,
      contentType,
      data,
      iconData
    } = parseBody(req);


    /*
     * =====================================================
     * VALIDACIONES
     * =====================================================
     */

    if (
      !data
    ) {

      return res.status(400).json({

        ok:
          false,

        error:
          "No se recibió ninguna imagen"

      });

    }


    if (
      !ALLOWED_TYPES.has(
        contentType
      )
    ) {

      return res.status(400).json({

        ok:
          false,

        error:
          "Formato no permitido. Usá JPG, PNG o WEBP."

      });

    }


    const supabaseUrl =
      process.env.SUPABASE_URL;


    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;


    if (
      !supabaseUrl ||
      !supabaseKey
    ) {

      return res.status(500).json({

        ok:
          false,

        error:
          "Supabase no está configurado"

      });

    }


    /*
     * =====================================================
     * STORAGE
     * =====================================================
     */

    const bucket =
      "push-images";


    await ensureBucket(
      supabaseUrl,
      supabaseKey,
      bucket
    );


    const extension =
      EXTENSIONS[
        contentType
      ];


    const imagePath =
      `alerts/${Date.now()}-${crypto.randomUUID()}.${extension}`;


    const imageUrl =
      await uploadObject({

        supabaseUrl,

        supabaseKey,

        bucket,

        objectPath:
          imagePath,

        data,

        contentType

      });


    /*
     * =====================================================
     * ICONO
     * =====================================================
     */

    let iconUrl =
      imageUrl;


    if (
      iconData
    ) {

      const iconPath =
        `alerts/${Date.now()}-${crypto.randomUUID()}-icon.png`;


      iconUrl =
        await uploadObject({

          supabaseUrl,

          supabaseKey,

          bucket,

          objectPath:
            iconPath,

          data:
            iconData,

          contentType:
            "image/png"

        });

    }


    /*
     * =====================================================
     * RESPUESTA
     * =====================================================
     */

    return res.status(200).json({

      ok:
        true,

      imageUrl,

      iconUrl,

      filename:
        filename ||
        "imagen"

    });


  } catch (error) {

    console.error(
      "Upload error:",
      error
    );


    return res.status(500).json({

      ok:
        false,

      error:
        error.message ||
        "Internal server error"

    });

  }

}
