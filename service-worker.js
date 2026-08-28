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
