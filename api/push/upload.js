import crypto from "crypto";

const MAX_FILE_SIZE =
  2 * 1024 * 1024;

const ALLOWED_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ]);

const EXTENSIONS = {

  "image/jpeg":
    "jpg",

  "image/png":
    "png",

  "image/webp":
    "webp",

  "image/gif":
    "gif"

};


function jsonBody(req) {

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
      return JSON.parse(req.body);
    } catch (_) {
      return {};
    }

  }

  return {};

}


export default async function handler(
  req,
  res
) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Push-Secret"
  );


  if (
    req.method === "OPTIONS"
  ) {

    return res.status(200).end();

  }


  if (
    req.method !== "POST"
  ) {

    return res.status(405).json({
      ok: false,
      error:
        "Method not allowed"
    });

  }


  try {

    const secret =
      req.headers["x-push-secret"];


    if (
      !secret ||
      secret !==
        process.env.PUSH_ADMIN_SECRET
    ) {

      return res.status(401).json({
        ok: false,
        error: "Unauthorized"
      });

    }


    const {
      filename,
      contentType,
      data
    } = jsonBody(req);


    if (!data) {

      return res.status(400).json({
        ok: false,
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
        ok: false,
        error:
          "Formato no permitido. Usá JPG, PNG, WEBP o GIF."
      });

    }


    const buffer =
      Buffer.from(
        data,
        "base64"
      );


    if (!buffer.length) {

      return res.status(400).json({
        ok: false,
        error:
          "La imagen está vacía"
      });

    }


    if (
      buffer.length >
      MAX_FILE_SIZE
    ) {

      return res.status(413).json({
        ok: false,
        error:
          "La imagen supera el límite de 2 MB."
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
        ok: false,
        error:
          "Supabase no está configurado"
      });

    }


    const bucket =
      "push-images";


    /*
     * Comprobamos si el bucket existe.
     */

    const bucketCheck =
      await fetch(
        `${supabaseUrl}/storage/v1/bucket/${bucket}`,
        {
          method: "GET",

          headers: {

            Authorization:
              `Bearer ${supabaseKey}`,

            apikey:
              supabaseKey

          }

        }
      );


    /*
     * Si no existe, intentamos crearlo.
     */

    if (
      !bucketCheck.ok
    ) {

      const createBucket =
        await fetch(
          `${supabaseUrl}/storage/v1/bucket`,
          {
            method: "POST",

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
                  true,

                allowed_mime_types:
                  Array.from(
                    ALLOWED_TYPES
                  )

              })

          }
        );


      /*
       * 409 = el bucket ya existe.
       */

      if (
        !createBucket.ok &&
        createBucket.status !== 409
      ) {

        const text =
          await createBucket.text();

        console.error(
          "Storage bucket:",
          text
        );

        return res.status(500).json({

          ok: false,

          error:
            "No se pudo preparar el almacenamiento de imágenes"

        });

      }

    }


    const extension =
      EXTENSIONS[
        contentType
      ];


    /*
     * Nombre único para evitar
     * colisiones entre imágenes.
     */

    const objectPath =
      `alerts/${Date.now()}-${crypto.randomUUID()}.${extension}`;


    const uploadResponse =
      await fetch(
        `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`,
        {
          method: "POST",

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
      !uploadResponse.ok
    ) {

      const text =
        await uploadResponse.text();

      console.error(
        "Storage upload:",
        text
      );

      return res.status(500).json({

        ok: false,

        error:
          "No se pudo subir la imagen"

      });

    }


    /*
     * Como el bucket es público,
     * esta URL puede ser utilizada
     * por el Service Worker.
     */

    const publicUrl =
      `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;


    return res.status(200).json({

      ok: true,

      url:
        publicUrl,

      filename:
        filename || "imagen"

    });


  } catch (error) {

    console.error(
      "Upload error:",
      error
    );


    return res.status(500).json({

      ok: false,

      error:
        "Internal server error"

    });

  }

}
