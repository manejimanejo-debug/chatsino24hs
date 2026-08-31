import webpush from "web-push";
import { isAdminAuthenticated } from "../_lib/admin-auth.js";


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
   * AUTENTICACIÓN DEL ADMINISTRADOR
   * =====================================================
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

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    const vapidPublicKey =
      process.env.VAPID_PUBLIC_KEY;

    const vapidPrivateKey =
      process.env.VAPID_PRIVATE_KEY;

    const vapidSubject =
      process.env.VAPID_SUBJECT;


    if (
      !supabaseUrl ||
      !supabaseKey ||
      !vapidPublicKey ||
      !vapidPrivateKey ||
      !vapidSubject
    ) {

      return res.status(500).json({

        ok:
          false,

        error:
          "Servidor no configurado"

      });

    }


    /*
     * =====================================================
     * CONFIGURACIÓN VAPID
     * =====================================================
     */

    webpush.setVapidDetails(

      vapidSubject,

      vapidPublicKey,

      vapidPrivateKey

    );


    /*
     * =====================================================
     * DATOS
     * =====================================================
     */

    const {
      title,
      body,
      image,
      icon,
      url
    } = req.body || {};


    if (
      !title ||
      !body
    ) {

      return res.status(400).json({

        ok:
          false,

        error:
          "Título y mensaje son obligatorios"

      });

    }


    /*
     * =====================================================
     * VALIDAR IMAGEN
     * =====================================================
     */

    let normalizedImage =
      null;


    if (
      image
    ) {

      try {

        const imageUrl =
          new URL(image);


        if (
          imageUrl.protocol !==
            "https:" &&
          imageUrl.protocol !==
            "http:"
        ) {

          throw new Error(
            "URL de imagen no válida"
          );

        }


        normalizedImage =
          imageUrl.toString();

      } catch (_) {

        return res.status(400).json({

          ok:
            false,

          error:
            "La URL de la imagen no es válida"

        });

      }

    }


    /*
     * =====================================================
     * OBTENER SUSCRIPCIONES
     * =====================================================
     */

    const response =
      await fetch(

        `${supabaseUrl}/rest/v1/push_subscriptions?select=id,client_id,endpoint,p256dh,auth`,

        {

          method:
            "GET",

          headers: {

            apikey:
              supabaseKey,

            Authorization:
              `Bearer ${supabaseKey}`

          }

        }

      );


    if (
      !response.ok
    ) {

      const errorText =
        await response.text();


      console.error(
        "Supabase subscriptions:",
        errorText
      );


      return res.status(500).json({

        ok:
          false,

        error:
          "No se pudieron obtener las suscripciones"

      });

    }


    const subscriptions =
      await response.json();


    if (
      !Array.isArray(
        subscriptions
      ) ||
      subscriptions.length === 0
    ) {

      return res.status(404).json({

        ok:
          false,

        error:
          "No hay clientes suscriptos"

      });

    }


    /*
     * =====================================================
     * PAYLOAD
     * =====================================================
     */

    const payload =
      JSON.stringify({

        title,

        body,

        ...(normalizedImage
          ? {
              image:
                normalizedImage
            }
          : {}),

        ...(icon
          ? {
              icon
            }
          : {}),

        url:
          url ||
          "https://chatsino24hs.vercel.app"

      });


    let sent =
      0;

    let failed =
      0;

    let removed =
      0;

    const invalidClientIds =
      new Set();


    /*
     * =====================================================
     * ENVIAR
     * =====================================================
     */

    for (
      const row
      of subscriptions
    ) {

      const pushSubscription = {

        endpoint:
          row.endpoint,

        keys: {

          p256dh:
            row.p256dh,

          auth:
            row.auth

        }

      };


      try {

        await webpush.sendNotification(

          pushSubscription,

          payload

        );


        sent++;


      } catch (error) {

        failed++;


        console.error(

          "Push error:",

          error.statusCode,

          error.body

        );


        /*
         * 404 / 410 significa que
         * la suscripción ya no es válida.
         */

        if (
          error.statusCode === 404 ||
          error.statusCode === 410
        ) {

          try {

            const deleteResponse =
              await fetch(

                `${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(row.id)}`,

                {

                  method:
                    "DELETE",

                  headers: {

                    apikey:
                      supabaseKey,

                    Authorization:
                      `Bearer ${supabaseKey}`

                  }

                }

              );


            if (
              deleteResponse.ok
            ) {

              removed++;


              if (
                row.client_id
              ) {

                invalidClientIds.add(
                  String(
                    row.client_id
                  ).trim()
                );

              }

            }


          } catch (deleteError) {

            console.error(

              "No se pudo eliminar la suscripción inválida:",

              deleteError

            );

          }

        }

      }

    }


    /*
     * =====================================================
     * ACTUALIZAR customers
     * =====================================================
     *
     * Solo marcamos false a un cliente si,
     * después de eliminar su suscripción inválida,
     * ya NO tiene ninguna suscripción Push.
     */

    for (
      const clientId
      of invalidClientIds
    ) {

      try {

        const remainingResponse =
          await fetch(

            `${supabaseUrl}/rest/v1/push_subscriptions?select=id&client_id=eq.${encodeURIComponent(clientId)}&limit=1`,

            {

              method:
                "GET",

              headers: {

                apikey:
                  supabaseKey,

                Authorization:
                  `Bearer ${supabaseKey}`

              }

            }

          );


        if (
          !remainingResponse.ok
        ) {

          continue;

        }


        const remaining =
          await remainingResponse.json();


        /*
         * No quedan suscripciones:
         * marcamos Push como inactivo.
         */

        if (
          !Array.isArray(
            remaining
          ) ||
          remaining.length === 0
        ) {

          const updateCustomerResponse =
            await fetch(

              `${supabaseUrl}/rest/v1/customers?client_id=eq.${encodeURIComponent(clientId)}`,

              {

                method:
                  "PATCH",

                headers: {

                  apikey:
                    supabaseKey,

                  Authorization:
                    `Bearer ${supabaseKey}`,

                  "Content-Type":
                    "application/json"

                },

                body:
                  JSON.stringify({

                    push_active:
                      false,

                    updated_at:
                      new Date().toISOString()

                  })

              }

            );


          if (
            !updateCustomerResponse.ok
          ) {

            console.error(

              "No se pudo marcar inactive al cliente:",
              clientId

            );

          }

        }

      } catch (syncError) {

        console.error(

          "Error sincronizando customer:",
          clientId,
          syncError

        );

      }

    }


    /*
     * =====================================================
     * RESPUESTA
     * =====================================================
     */

    return res.status(200).json({

      ok:
        true,

      total:
        subscriptions.length,

      sent,

      failed,

      removed

    });


  } catch (error) {

    console.error(

      "Broadcast error:",

      error

    );


    return res.status(500).json({

      ok:
        false,

      error:
        "Internal server error"

    });

  }

}
