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

      ok:
        false,

      error:
        "Method not allowed"

    });

  }


  try {

    /*
     * =====================================================
     * SEGURIDAD
     * =====================================================
     */

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

        ok:
          false,

        error:
          "Unauthorized"

      });

    }


    /*
     * =====================================================
     * VAPID
     * =====================================================
     */

    const vapidPrivateKey =
      process.env.VAPID_PRIVATE_KEY;


    const vapidPublicKey =
      process.env.VAPID_PUBLIC_KEY;


    const vapidSubject =
      process.env.VAPID_SUBJECT;


    if (
      !vapidPrivateKey ||
      !vapidPublicKey ||
      !vapidSubject
    ) {

      return res.status(500).json({

        ok:
          false,

        error:
          "VAPID no configurado"

      });

    }


    webpush.setVapidDetails(

      vapidSubject,

      vapidPublicKey,

      vapidPrivateKey

    );


    /*
     * =====================================================
     * DATOS RECIBIDOS
     * =====================================================
     *
     * Se puede enviar:
     *
     * client_id
     *
     * o
     *
     * username
     *
     * además de title/body/url.
     */

    const {
      client_id,
      username,
      title,
      body,
      url,
      image,
      icon
    } =
      req.body || {};


    const cleanClientId =
      String(
        client_id || ""
      ).trim();


    const cleanUsername =
      String(
        username || ""
      )
        .replace(
          /\s+/g,
          ""
        )
        .trim();


    /*
     * =====================================================
     * SUPABASE
     * =====================================================
     */

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
          "Supabase no configurado"

      });

    }


    const supabaseHeaders = {

      apikey:
        supabaseKey,

      Authorization:
        `Bearer ${supabaseKey}`,

      "Content-Type":
        "application/json"

    };


    /*
     * =====================================================
     * DETERMINAR CLIENT_ID
     * =====================================================
     *
     * Si recibimos username:
     *
     * username → customers → client_id
     *
     * Si recibimos client_id:
     * usamos directamente ese valor.
     */

    let targetClientId =
      cleanClientId;


    if (
      !targetClientId &&
      cleanUsername
    ) {

      const customerResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/customers?select=id,client_id,username&username=ilike.${encodeURIComponent(cleanUsername)}&limit=1`,

          {

            method:
              "GET",

            headers:
              supabaseHeaders

          }

        );


      const customerText =
        await customerResponse.text();


      if (
        !customerResponse.ok
      ) {

        console.error(

          "Supabase customer username:",

          customerText

        );


        return res.status(500).json({

          ok:
            false,

          error:
            "Error buscando el usuario"

        });

      }


      const customers =
        customerText
          ? JSON.parse(
              customerText
            )
          : [];


      if (
        !Array.isArray(customers) ||
        customers.length === 0
      ) {

        return res.status(404).json({

          ok:
            false,

          error:
            `No se encontró el usuario "${cleanUsername}"`

        });

      }


      targetClientId =
        String(
          customers[0].client_id ||
          ""
        ).trim();


      if (
        !targetClientId
      ) {

        return res.status(404).json({

          ok:
            false,

          error:
            "El usuario encontrado no tiene client_id asociado."

        });

      }

    }


    /*
     * =====================================================
     * VALIDACIÓN
     * =====================================================
     */

    if (
      !targetClientId
    ) {

      return res.status(400).json({

        ok:
          false,

        error:
          "Debés enviar client_id o username"

      });

    }


    /*
     * =====================================================
     * BUSCAR SUSCRIPCIONES DEL CLIENTE
     * =====================================================
     */

    const subscriptionsResponse =
      await fetch(

        `${supabaseUrl}/rest/v1/push_subscriptions?select=id,client_id,endpoint,p256dh,auth&client_id=eq.${encodeURIComponent(targetClientId)}`,

        {

          method:
            "GET",

          headers:
            supabaseHeaders

        }

      );


    const subscriptionsText =
      await subscriptionsResponse.text();


    if (
      !subscriptionsResponse.ok
    ) {

      console.error(

        "Supabase subscriptions:",

        subscriptionsText

      );


      return res.status(500).json({

        ok:
          false,

        error:
          "Error consultando suscripciones"

      });

    }


    const subscriptions =
      subscriptionsText
        ? JSON.parse(
            subscriptionsText
          )
        : [];


    if (
      !Array.isArray(subscriptions) ||
      subscriptions.length === 0
    ) {

      return res.status(404).json({

        ok:
          false,

        error:
          "Este cliente no tiene notificaciones activas."

      });

    }


    /*
     * =====================================================
     * PAYLOAD
     * =====================================================
     */

    const payloadData = {

      title:
        title ||
        "Open 24hs",

      body:
        body ||
        "Tenés un nuevo mensaje.",

      url:
        url ||
        "https://chatsino24hs.vercel.app"

    };


    /*
     * Imagen opcional.
     */

    if (
      image
    ) {

      payloadData.image =
        image;

    }


    /*
     * Icono opcional.
     */

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
     * ENVIAR PUSH
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
         * 404 / 410 =
         * suscripción inválida/caducada.
         *
         * La eliminamos.
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

                `${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(row.id)}`,

                {

                  method:
                    "DELETE",

                  headers:
                    supabaseHeaders

                }

              );


            if (
              deleteResponse.ok
            ) {

              removed++;

            }

          } catch (
            deleteError
          ) {

            console.error(

              "Error eliminando suscripción inválida:",

              deleteError

            );

          }

        }

      }

    }


    /*
     * =====================================================
     * ACTUALIZAR ESTADO DEL CLIENTE
     * =====================================================
     *
     * Si después de limpiar las suscripciones
     * no queda ninguna, lo marcamos como inactivo.
     */

    if (
      removed > 0
    ) {

      try {

        const remainingResponse =
          await fetch(

            `${supabaseUrl}/rest/v1/push_subscriptions?select=id&client_id=eq.${encodeURIComponent(targetClientId)}&limit=1`,

            {

              method:
                "GET",

              headers:
                supabaseHeaders

            }

          );


        if (
          remainingResponse.ok
        ) {

          const remaining =
            await remainingResponse.json();


          if (
            !Array.isArray(
              remaining
            ) ||
            remaining.length === 0
          ) {

            await fetch(

              `${supabaseUrl}/rest/v1/customers?client_id=eq.${encodeURIComponent(targetClientId)}`,

              {

                method:
                  "PATCH",

                headers:
                  supabaseHeaders,

                body:
                  JSON.stringify({

                    push_active:
                      false,

                    updated_at:
                      new Date().toISOString()

                  })

              }

            );

          }

        }

      } catch (
        statusError
      ) {

        console.error(

          "Error actualizando push_active:",

          statusError

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

      client_id:
        targetClientId,

      username:
        cleanUsername ||
        null,

      total:
        subscriptions.length,

      sent,

      failed,

      removed

    });


  } catch (error) {

    console.error(

      "Push error:",

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
