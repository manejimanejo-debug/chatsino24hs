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


  try {

    const clientId =
      String(
        req.body?.client_id || ""
      ).trim();


    const username =
      String(
        req.body?.username || ""
      ).trim();


    if (
      !clientId
    ) {

      return res.status(400).json({

        ok:
          false,

        error:
          "client_id es obligatorio"

      });

    }


    /*
     * =====================================================
     * VALIDAR USERNAME SI VIENE INFORMADO
     * =====================================================
     */

    let cleanUsername =
      null;


    if (
      username
    ) {

      cleanUsername =
        username
          .replace(
            /\s+/g,
            ""
          )
          .trim();


      /*
       * Longitud razonable.
       */

      if (
        cleanUsername.length < 2 ||
        cleanUsername.length > 50
      ) {

        return res.status(400).json({

          ok:
            false,

          error:
            "El nombre de usuario debe tener entre 2 y 50 caracteres."

        });

      }


      /*
       * Permitimos letras, números,
       * guión, guión bajo y punto.
       */

      if (
        !/^[a-zA-Z0-9._-]+$/.test(
          cleanUsername
        )
      ) {

        return res.status(400).json({

          ok:
            false,

          error:
            "El nombre de usuario contiene caracteres no permitidos."

        });

      }

    }


    const supabaseUrl =
      process.env.SUPABASE_URL;


    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;


    if (
      !supabaseUrl ||
      !serviceKey
    ) {

      return res.status(500).json({

        ok:
          false,

        error:
          "Supabase no está configurado"

      });

    }


    const headers = {

      apikey:
        serviceKey,

      Authorization:
        `Bearer ${serviceKey}`,

      "Content-Type":
        "application/json"

    };


    /*
     * =====================================================
     * BUSCAR CLIENTE
     * =====================================================
     */

    const searchResponse =
      await fetch(

        `${supabaseUrl}/rest/v1/customers?select=id,client_id,username,push_active&client_id=eq.${encodeURIComponent(clientId)}&limit=1`,

        {

          method:
            "GET",

          headers

        }

      );


    const searchText =
      await searchResponse.text();


    if (
      !searchResponse.ok
    ) {

      console.error(
        "Customer SELECT:",
        searchText
      );


      return res.status(500).json({

        ok:
          false,

        step:
          "SELECT",

        status:
          searchResponse.status,

        supabase:
          searchText

      });

    }


    const existing =
      searchText
        ? JSON.parse(
            searchText
          )
        : [];


    /*
     * =====================================================
     * SI EXISTE
     * =====================================================
     */

    if (
      Array.isArray(existing) &&
      existing.length > 0
    ) {

      const customerId =
        existing[0].id;


      const updateData = {

        updated_at:
          new Date().toISOString()

      };


      /*
       * Solo modificamos username si
       * el frontend envió uno.
       */

      if (
        cleanUsername
      ) {

        updateData.username =
          cleanUsername;

      }


      const updateResponse =
        await fetch(

          `${supabaseUrl}/rest/v1/customers?id=eq.${encodeURIComponent(customerId)}`,

          {

            method:
              "PATCH",

            headers,

            body:
              JSON.stringify(
                updateData
              )

          }

        );


      const updateText =
        await updateResponse.text();


      if (
        !updateResponse.ok
      ) {

        console.error(
          "Customer UPDATE:",
          updateText
        );


        /*
         * Si es una violación de UNIQUE,
         * devolvemos un mensaje entendible.
         */

        if (
          updateResponse.status === 409
        ) {

          return res.status(409).json({

            ok:
              false,

            error:
              "Ese nombre de usuario ya está registrado."

          });

        }


        return res.status(500).json({

          ok:
            false,

          step:
            "UPDATE",

          status:
            updateResponse.status,

          supabase:
            updateText

        });

      }


      return res.status(200).json({

        ok:
          true,

        client_id:
          clientId,

        username:
          cleanUsername ||
          existing[0].username ||
          null,

        existing:
          true

      });

    }


    /*
     * =====================================================
     * SI NO EXISTE: CREAR CLIENTE
     * =====================================================
     */

    const insertResponse =
      await fetch(

        `${supabaseUrl}/rest/v1/customers`,

        {

          method:
            "POST",

          headers: {

            ...headers,

            Prefer:
              "return=representation"

          },

          body:
            JSON.stringify({

              client_id:
                clientId,

              username:
                cleanUsername,

              phone:
                null,

              push_active:
                false,

              created_at:
                new Date().toISOString(),

              updated_at:
                new Date().toISOString()

            })

        }

      );


    const insertText =
      await insertResponse.text();


    if (
      !insertResponse.ok
    ) {

      console.error(
        "Customer INSERT:",
        insertText
      );


      if (
        insertResponse.status === 409
      ) {

        return res.status(409).json({

          ok:
            false,

          error:
            "Ese nombre de usuario ya está registrado."

        });

      }


      return res.status(500).json({

        ok:
          false,

        step:
          "INSERT",

        status:
          insertResponse.status,

        supabase:
          insertText

      });

    }


    return res.status(200).json({

      ok:
        true,

      client_id:
        clientId,

      username:
        cleanUsername,

      existing:
        false

    });


  } catch (error) {

    console.error(
      "Customer identify error:",
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
