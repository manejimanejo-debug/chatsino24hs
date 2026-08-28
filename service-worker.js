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


    const options = {

      body:
        data.body ||
        data.message ||
        "Tenés una nueva notificación.",


      icon:
        data.icon ||
        "/icon-192.png",


      badge:
        data.badge ||
        "/icon-192.png",


      /*
       * Si el panel cargó una imagen,
       * Chrome podrá utilizarla como
       * imagen grande de la notificación.
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
          "/"

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

        : "/";


    event.waitUntil(

      clients.matchAll({

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

            if ("focus" in client) {

              client.navigate(
                targetUrl
              );

              return client.focus();

            }

          }


          if (clients.openWindow) {

            return clients.openWindow(
              targetUrl
            );

          }

        }
      )

    );

  }
);
