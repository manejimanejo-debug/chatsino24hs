import webpush from "web-push";

import {
  isAdminAuthenticated
} from "../_lib/admin-auth.js";


export default async function handler(
  req,
  res
) {

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
   * AUTENTICACIÓN DEL PANEL
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
     * DATOS DE LA ALERTA
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
        "Supabase:",
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
      !subscriptions.length
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

    const payloadData = {

      title,

      body,

      url:
        url ||
        "https://chatsino24hs.vercel.app"

    };


    if (
      image
    ) {

      payloadData.image =
        image;

    }


    if (
      icon
    ) {

      payloadData.icon =
        icon;

      payloadData.badge =
        icon;

    }


    const payload =
      JSON.stringify(
        payloadData
      );


    let sent =
      0;

    let failed =
      0;

    let removed =
      0;


    /*
     * =====================================================
     * ENVÍO
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

          "Error enviando Push:",

          error.statusCode,

          error.body

        );


        /*
         * Suscripción vencida o eliminada.
         */

        if (
          error.statusCode === 404 ||
          error.statusCode === 410
        ) {

          try {

            const deleteResponse =
              await fetch(

                `${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${row.id}`,

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

            }

          } catch (_) {

            // Continuamos con los demás clientes.

          }

        }

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
