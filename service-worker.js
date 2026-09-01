/* =====================================================
   OPEN 24HS - SERVICE WORKER DE NOTIFICACIONES PUSH
===================================================== */


self.addEventListener(
  "install",
  (event) => {

    self.skipWaiting();

  }
);


self.addEventListener(
  "activate",
  (event) => {

    event.waitUntil(
      self.clients.claim()
    );

  }
);


/* =====================================================
   RECIBIR NOTIFICACIONES PUSH
===================================================== */

self.addEventListener(
  "push",
  (event) => {

    let data = {};


    try {

      data =
        event.data
          ? event.data.json()
          : {};

    } catch (_) {

      data = {

        title:
          "Open 24hs",

        body:
          event.data
            ? event.data.text()
            : "Tenés una nueva notificación."

      };

    }


    const title =
      data.title ||
      "Open 24hs";


    /*
     * Icono:
     *
     * 1. icon generado específicamente
     *    para Android.
     *
     * 2. si no existe, imagen grande.
     *
     * 3. si no existe, logo.
     */

    const icon =
      data.icon ||
      data.image ||
      "/icon-192.png";


    const options = {

      body:
        data.body ||
        data.message ||
        "Tenés una nueva notificación.",


      icon,


      badge:
        data.badge ||
        icon,


      /*
       * Imagen grande cuando el navegador
       * la soporte.
       */

      image:
        data.image ||
        undefined,


      tag:
        data.tag ||
        "open24hs",


      renotify:
        true,


      data: {

        url:
          data.url ||
          "https://chatsino24hs.vercel.app"

      }

    };


    event.waitUntil(

      self.registration.showNotification(

        title,

        options

      )

    );

  }
);


/* =====================================================
   CLICK EN LA NOTIFICACIÓN
===================================================== */

self.addEventListener(
  "notificationclick",
  (event) => {

    event.notification.close();


    const targetUrl =

      event.notification.data &&
      event.notification.data.url

        ? event.notification.data.url

        : "https://chatsino24hs.vercel.app";


    event.waitUntil(

      self.clients
        .matchAll({

          type:
            "window",

          includeUncontrolled:
            true

        })

        .then(
          (clientList) => {


            for (
              const client
              of clientList
            ) {


              if (
                "focus"
                in client
              ) {


                try {

                  client.navigate(
                    targetUrl
                  );

                } catch (_) {

                  // Continuamos con focus.

                }


                return client.focus();

              }

            }


            if (
              self.clients.openWindow
            ) {

              return self.clients.openWindow(
                targetUrl
              );

            }

          }

        )

    );

  }
);


/* =====================================================
   DETECTAR CAMBIOS EN LA SUSCRIPCIÓN PUSH
===================================================== */

/*
 * Cuando el navegador cambie o pierda una suscripción Push,
 * algunos navegadores pueden ejecutar este evento aunque
 * la página web no esté abierta.
 *
 * Si existe una suscripción nueva, no hacemos una baja.
 *
 * Si la suscripción anterior desapareció y no existe una
 * nueva, avisamos a nuestro backend usando /api/push/status.
 *
 * Esto reemplaza al endpoint separado /api/push/unsubscribe.
 */

self.addEventListener(
  "pushsubscriptionchange",
  (event) => {

    event.waitUntil(

      (async () => {

        try {

          const oldSubscription =
            event.oldSubscription;


          const newSubscription =
            event.newSubscription;


          console.log(
            "OPEN 24HS: pushsubscriptionchange detectado."
          );


          /*
           * Si el navegador creó una nueva suscripción,
           * significa que la suscripción cambió/rotó.
           *
           * No la marcamos como inactiva porque sigue
           * existiendo una suscripción.
           */

          if (
            newSubscription
          ) {

            console.log(
              "OPEN 24HS: se detectó una nueva suscripción Push."
            );


            /*
             * Intentamos informar al servidor de la nueva
             * suscripción si el evento nos la proporciona.
             *
             * Para obtener el client_id necesitamos que
             * el cliente ya esté asociado en Supabase.
             *
             * En este caso mandamos solamente el endpoint
             * anterior para que el backend pueda limpiar
             * la suscripción vieja si todavía existe.
             */

            if (
              oldSubscription &&
              oldSubscription.endpoint
            ) {

              await fetch(
                "/api/push/status",
                {

                  method:
                    "POST",

                  headers: {

                    "Content-Type":
                      "application/json"

                  },

                  body:
                    JSON.stringify({

                      endpoint:
                        oldSubscription.endpoint

                    })

                }
              );

            }


            return;

          }


          /*
           * =================================================
           * BAJA REAL
           * =================================================
           *
           * No existe una nueva suscripción.
           */

          if (
            !oldSubscription ||
            !oldSubscription.endpoint
          ) {

            console.log(
              "OPEN 24HS: no hay endpoint anterior para sincronizar."
            );


            return;

          }


          const endpoint =
            oldSubscription.endpoint;


          console.log(
            "OPEN 24HS: notificando baja Push al servidor..."
          );


          const response =
            await fetch(

              "/api/push/status",

              {

                method:
                  "POST",

                headers: {

                  "Content-Type":
                    "application/json"

                },

                body:
                  JSON.stringify({

                    endpoint

                  })

              }

            );


          const result =
            await response
              .json()
              .catch(
                () => ({})
              );


          console.log(

            "OPEN 24HS: respuesta de sincronización Push:",

            response.status,

            result

          );


        } catch (error) {

          console.error(

            "OPEN 24HS: error sincronizando cambio de suscripción:",

            error

          );

        }

      })()

    );

  }
);
