export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    try {
      // =====================================================
      // PUBLIC EVENTS
      // =====================================================

      if (
        pathname === "/api/events" &&
        method === "GET"
      ) {
        const { results } = await env.DB
          .prepare(`
            SELECT *
            FROM events
            WHERE event_date >= date('now')
            ORDER BY event_date ASC, start_time ASC
          `)
          .all();

        return json(results);
      }

      // =====================================================
      // CONTACT FORM
      // =====================================================

      if (
        pathname === "/api/contact" &&
        method === "POST"
      ) {
        const body = await request.json();

        const name =
          String(body.name || "").trim();

        const email =
          String(body.email || "").trim();

        const message =
          String(body.message || "").trim();

        if (!name || !email || !message) {
          return json(
            {
              error: "Missing required fields"
            },
            400
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
            "",
            message
          )
          .run();

        return json({
          success: true
        });
      }

      // =====================================================
      // ADMIN - GET ALL EVENTS
      // =====================================================

      if (
        pathname === "/api/admin/events" &&
        method === "GET"
      ) {
        const { results } = await env.DB
          .prepare(`
            SELECT *
            FROM events
            ORDER BY event_date ASC, start_time ASC
          `)
          .all();

        return json(results);
      }

      // =====================================================
      // ADMIN - CREATE EVENT
      // =====================================================

      if (
        pathname === "/api/admin/events" &&
        method === "POST"
      ) {
        const body = await request.json();

        const validation =
          validateEvent(body);

        if (!validation.ok) {
          return json(
            {
              error: validation.error
            },
            400
          );
        }

        const result = await env.DB
          .prepare(`
            INSERT INTO events
            (
              event_date,
              venue,
              location,
              start_time,
              end_time,
              note
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .bind(
            validation.data.event_date,
            validation.data.venue,
            validation.data.location,
            validation.data.start_time,
            validation.data.end_time,
            validation.data.note
          )
          .run();

        return json(
          {
            success: true,
            id: result.meta?.last_row_id
          },
          201
        );
      }

      // =====================================================
      // ADMIN - UPDATE / DELETE
      // =====================================================

      const adminEventMatch =
        pathname.match(
          /^\/api\/admin\/events\/(\d+)$/
        );

      if (adminEventMatch) {
        const id =
          Number(adminEventMatch[1]);

        if (!Number.isInteger(id) || id <= 0) {
          return json(
            {
              error: "Invalid event ID"
            },
            400
          );
        }

        // -------------------------------------------------
        // UPDATE EVENT
        // -------------------------------------------------

        if (method === "PUT") {
          const body = await request.json();

          const validation =
            validateEvent(body);

          if (!validation.ok) {
            return json(
              {
                error: validation.error
              },
              400
            );
          }

          const existing = await env.DB
            .prepare(`
              SELECT id
              FROM events
              WHERE id = ?
            `)
            .bind(id)
            .first();

          if (!existing) {
            return json(
              {
                error: "Event not found"
              },
              404
            );
          }

          await env.DB
            .prepare(`
              UPDATE events
              SET
                event_date = ?,
                venue = ?,
                location = ?,
                start_time = ?,
                end_time = ?,
                note = ?
              WHERE id = ?
            `)
            .bind(
              validation.data.event_date,
              validation.data.venue,
              validation.data.location,
              validation.data.start_time,
              validation.data.end_time,
              validation.data.note,
              id
            )
            .run();

          return json({
            success: true
          });
        }

        // -------------------------------------------------
        // DELETE EVENT
        // -------------------------------------------------

        if (method === "DELETE") {
          const existing = await env.DB
            .prepare(`
              SELECT id
              FROM events
              WHERE id = ?
            `)
            .bind(id)
            .first();

          if (!existing) {
            return json(
              {
                error: "Event not found"
              },
              404
            );
          }

          await env.DB
            .prepare(`
              DELETE FROM events
              WHERE id = ?
            `)
            .bind(id)
            .run();

          return json({
            success: true
          });
        }
      }

      // =====================================================
      // STATIC WEBSITE
      // =====================================================

      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error(error);

      return json(
        {
          error: "Internal server error"
        },
        500
      );
    }
  }
};


// =========================================================
// EVENT VALIDATION
// =========================================================

function validateEvent(body) {
  const event_date =
    String(body.event_date || "").trim();

  const venue =
    String(body.venue || "").trim();

  const location =
    String(body.location || "").trim();

  const start_time =
    cleanOptional(body.start_time);

  const end_time =
    cleanOptional(body.end_time);

  const note =
    cleanOptional(body.note);

  if (!event_date) {
    return {
      ok: false,
      error: "Date is required"
    };
  }

  if (!venue) {
    return {
      ok: false,
      error: "Venue is required"
    };
  }

  if (!location) {
    return {
      ok: false,
      error: "Location is required"
    };
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(event_date)
  ) {
    return {
      ok: false,
      error: "Invalid date"
    };
  }

  if (
    start_time &&
    !/^\d{2}:\d{2}$/.test(start_time)
  ) {
    return {
      ok: false,
      error: "Invalid start time"
    };
  }

  if (
    end_time &&
    !/^\d{2}:\d{2}$/.test(end_time)
  ) {
    return {
      ok: false,
      error: "Invalid end time"
    };
  }

  return {
    ok: true,

    data: {
      event_date,
      venue,
      location,
      start_time,
      end_time,
      note
    }
  };
}


// =========================================================
// HELPERS
// =========================================================

function cleanOptional(value) {
  const result =
    String(value || "").trim();

  return result || null;
}


function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    }
  );
}
