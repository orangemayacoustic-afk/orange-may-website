export default {

  async fetch(request, env) {

    const url = new URL(request.url);

    // -------------------------
    // EVENTS
    // -------------------------

    if (
      url.pathname === "/api/events" &&
      request.method === "GET"
    ) {

      const { results } = await env.DB
        .prepare(`
          SELECT *
          FROM events
          WHERE event_date >= date('now')
          ORDER BY event_date ASC, start_time ASC
        `)
        .all();

      return Response.json(results);

    }


    // -------------------------
    // CONTACT FORM
    // -------------------------

    if (
      url.pathname === "/api/contact" &&
      request.method === "POST"
    ) {

      try {

        const body = await request.json();

        const name = String(body.name || "").trim();
        const email = String(body.email || "").trim();
        const subject = String(body.subject || "").trim();
        const message = String(body.message || "").trim();

        if (!name || !email || !message) {

          return Response.json(
            { error: "Missing required fields" },
            { status: 400 }
          );

        }

        await env.DB
          .prepare(`
            INSERT INTO contact_messages
            (
              name,
              email,
              subject,
              message
            )
            VALUES (?, ?, ?, ?)
          `)
          .bind(
            name,
            email,
            subject,
            message
          )
          .run();

        return Response.json({
          success: true
        });

      } catch(error) {

        return Response.json(
          { error: "Unable to send message" },
          { status: 500 }
        );

      }

    }


    // -------------------------
    // WEBSITE
    // -------------------------

    return env.ASSETS.fetch(request);

  }

};
