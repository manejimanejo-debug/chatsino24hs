import webpush from "web-push";


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

    return res
      .status(200)
      .end();

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
      req.headers[
        "x-push-secret"
      ];


    if (
      !secret ||
      secret !==
        process.env.PUSH_ADMIN_SECRET
    ) {

      return res.status(401).json({

        ok: false,

        error:
          "Unauthorized"

      });

    }


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

        ok: false,

        error:
          "Servidor no configurado"

      });

    }


    webpush.setVapidDetails(

      vapidSubject,

      vapidPublicKey,

      vapidPrivateKey

    );


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

        ok: false,

        error:
          "Título y mensaje son obligatorios"

      });

    }


    /*
     * Obtenemos todas las suscripciones.
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

        ok: false,

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

        ok: false,

        error:
          "No hay clientes suscriptos"

      });

    }


    /*
     * Payload de la notificación.
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


    let sent = 0;

    let failed = 0;

    let removed = 0;


    /*
     * Enviamos a todos.
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
         * Si el navegador ya no tiene
         * esa suscripción, limpiamos
         * el registro.
         */

        if (

          error.statusCode ===
            404 ||

          error.statusCode ===
            410

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

            // Continuar con los demás clientes.

          }

        }

      }

    }


    return res.status(200).json({

      ok: true,

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

      ok: false,

      error:
        "Internal server error"

    });

  }

}
