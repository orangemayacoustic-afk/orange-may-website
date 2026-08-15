export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    try {

      // =====================================================
      // AUTH - LOGIN
      // =====================================================

      if (
        pathname === "/api/auth/login" &&
        method === "POST"
      ) {
        const body = await request.json();

        const password =
          String(body.password || "");

        if (
          !password ||
          password !== env.ADMIN_PASSWORD
        ) {
          return json(
            {
              error: "Invalid password"
            },
            401
          );
        }

        const response = json({
          success: true
        });

        response.headers.append(
          "Set-Cookie",
          createSessionCookie(
            env.ADMIN_SESSION_TOKEN
          )
        );

        return response;
      }


      // =====================================================
      // AUTH - LOGOUT
      // =====================================================

      if (
        pathname === "/api/auth/logout" &&
        method === "POST"
      ) {
        const response = json({
          success: true
        });

        response.headers.append(
          "Set-Cookie",
          clearSessionCookie()
        );

        return response;
      }


      // =====================================================
      // ADMIN PAGE
      // =====================================================

      if (pathname === "/admin") {
        if (
          !isAdminAuthenticated(
            request,
            env
          )
        ) {
          return Response.redirect(
            new URL(
              "/login",
              request.url
            ),
            302
          );
        }

        return env.ASSETS.fetch(
          request
        );
      }


      // =====================================================
      // PROTECT ADMIN API ROUTES
      // =====================================================

      if (
        pathname.startsWith(
          "/api/admin/"
        )
      ) {
        if (
          !isAdminAuthenticated(
            request,
            env
          )
        ) {
          return json(
            {
              error: "Unauthorized"
            },
            401
          );
        }
      }


      // =====================================================
      // PUBLIC EVENTS
      // =====================================================

      if (
        pathname === "/api/events" &&
        method === "GET"
      ) {
        const { results } =
          await env.DB
            .prepare(`
              SELECT
                id,
                event_date,
                venue,
                location,
                location_url,
                start_time,
                end_time,
                note,
                event_type,
                public_url,
                created_at
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
        const body =
          await request.json();

        const name =
          String(
            body.name || ""
          ).trim();

        const email =
          String(
            body.email || ""
          ).trim();

        const message =
          String(
            body.message || ""
          ).trim();


        // -----------------------------------------------------
        // REQUIRED FIELDS
        // -----------------------------------------------------

        if (
          !name ||
          !email ||
          !message
        ) {
          return json(
            {
              error:
                "Missing required fields"
            },
            400
          );
        }


        // -----------------------------------------------------
        // EMAIL VALIDATION
        // -----------------------------------------------------

        if (!isValidEmail(email)) {
          return json(
            {
              error:
                "Invalid email address"
            },
            400
          );
        }


        // -----------------------------------------------------
        // LIMIT INPUT LENGTH
        // -----------------------------------------------------

        if (name.length > 120) {
          return json(
            {
              error:
                "Name is too long"
            },
            400
          );
        }


        if (email.length > 254) {
          return json(
            {
              error:
                "Email is too long"
            },
            400
          );
        }


        if (message.length > 10000) {
          return json(
            {
              error:
                "Message is too long"
            },
            400
          );
        }


        // -----------------------------------------------------
        // SAVE MESSAGE TO DATABASE
        // -----------------------------------------------------

        const result =
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


        // -----------------------------------------------------
        // SEND EMAIL NOTIFICATION
        // -----------------------------------------------------

        const messageId =
          result.meta
            ?.last_row_id ||
          null;


        const submittedAt =
          new Date()
            .toLocaleString(
              "it-IT",
              {
                timeZone:
                  "Europe/Rome",

                dateStyle:
                  "full",

                timeStyle:
                  "short"
              }
            );


        const subject =
          `Nuovo messaggio dal sito — ${name}`;


        const textBody =
`NUOVO MESSAGGIO DAL SITO ORANGE MAY

Nome:
${name}

Email:
${email}

Data:
${submittedAt}

Messaggio:
${message}

----------------------------------------
Messaggio ricevuto tramite orangemay.blog
${messageId ? `ID messaggio: ${messageId}` : ""}

Per rispondere direttamente alla persona che ha scritto,
usa il tasto "Rispondi" nella tua casella email.`;


        const htmlBody =
          `
          <!DOCTYPE html>

          <html lang="it">

          <head>
            <meta charset="UTF-8">
          </head>

          <body
            style="
              margin:0;
              padding:0;
              background:#f5f0e8;
              font-family:Arial,Helvetica,sans-serif;
              color:#11100f;
            "
          >

            <div
              style="
                max-width:680px;
                margin:0 auto;
                padding:32px 18px;
              "
            >

              <div
                style="
                  background:#11100f;
                  padding:34px;
                  color:#ffffff;
                "
              >

                <div
                  style="
                    color:#ff6a00;
                    font-size:12px;
                    font-weight:700;
                    letter-spacing:2px;
                    text-transform:uppercase;
                    margin-bottom:14px;
                  "
                >
                  Orange May
                </div>


                <h1
                  style="
                    margin:0;
                    font-size:34px;
                    line-height:1;
                    letter-spacing:-1px;
                    text-transform:uppercase;
                  "
                >
                  Nuovo messaggio<br>
                  dal sito.
                </h1>

              </div>


              <div
                style="
                  background:#ffffff;
                  padding:34px;
                "
              >

                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  width="100%"
                  style="
                    border-collapse:collapse;
                  "
                >

                  <tr>

                    <td
                      style="
                        padding:0 0 18px;
                        font-size:11px;
                        font-weight:700;
                        letter-spacing:1.4px;
                        text-transform:uppercase;
                        color:#77716a;
                      "
                    >
                      Nome
                    </td>

                  </tr>

                  <tr>

                    <td
                      style="
                        padding:0 0 28px;
                        font-size:22px;
                        font-weight:700;
                      "
                    >
                      ${escapeHtml(name)}
                    </td>

                  </tr>


                  <tr>

                    <td
                      style="
                        padding:0 0 8px;
                        font-size:11px;
                        font-weight:700;
                        letter-spacing:1.4px;
                        text-transform:uppercase;
                        color:#77716a;
                      "
                    >
                      Email
                    </td>

                  </tr>

                  <tr>

                    <td
                      style="
                        padding:0 0 28px;
                        font-size:17px;
                      "
                    >

                      <a
                        href="mailto:${escapeHtmlAttribute(email)}"
                        style="
                          color:#11100f;
                          text-decoration:underline;
                        "
                      >
                        ${escapeHtml(email)}
                      </a>

                    </td>

                  </tr>


                  <tr>

                    <td
                      style="
                        padding:0 0 8px;
                        font-size:11px;
                        font-weight:700;
                        letter-spacing:1.4px;
                        text-transform:uppercase;
                        color:#77716a;
                      "
                    >
                      Ricevuto
                    </td>

                  </tr>

                  <tr>

                    <td
                      style="
                        padding:0 0 32px;
                        font-size:15px;
                      "
                    >
                      ${escapeHtml(submittedAt)}
                    </td>

                  </tr>


                  <tr>

                    <td
                      style="
                        padding-top:28px;
                        border-top:1px solid #e4ddd4;
                      "
                    >

                      <div
                        style="
                          margin-bottom:12px;
                          color:#ff6a00;
                          font-size:11px;
                          font-weight:700;
                          letter-spacing:1.4px;
                          text-transform:uppercase;
                        "
                      >
                        Messaggio
                      </div>

                      <div
                        style="
                          font-size:17px;
                          line-height:1.65;
                          white-space:pre-wrap;
                        "
                      >${escapeHtml(message)}</div>

                    </td>

                  </tr>

                </table>


                <div
                  style="
                    margin-top:36px;
                    padding-top:20px;
                    border-top:1px solid #e4ddd4;
                    color:#77716a;
                    font-size:12px;
                    line-height:1.6;
                  "
                >
                  Inviato tramite orangemay.blog
                  ${
                    messageId
                      ? `<br>ID messaggio: ${escapeHtml(messageId)}`
                      : ""
                  }
                </div>

              </div>


              <div
                style="
                  background:#ff6a00;
                  padding:18px 34px;
                  color:#11100f;
                  font-size:12px;
                  font-weight:700;
                "
              >
                Puoi rispondere direttamente a questa email:
                la risposta verrà inviata a ${escapeHtml(email)}.
              </div>

            </div>

          </body>

          </html>
          `;


        try {

          await env.EMAIL.send({
            to:
              "orangemayacoustic@gmail.com",

            from: {
              email:
                "website@orangemay.blog",

              name:
                "Orange May Website"
            },

            replyTo: {
              email:
                email,

              name:
                name
            },

            subject:
              subject,

            text:
              textBody,

            html:
              htmlBody
          });


        } catch (emailError) {

          console.error(
            "Contact notification email failed:",
            emailError?.code,
            emailError?.message,
            emailError
          );


          return json(
            {
              error:
                "Message saved but email notification failed",

              code:
                emailError?.code ||
                "EMAIL_SEND_FAILED"
            },
            500
          );
        }


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
        const { results } =
          await env.DB
            .prepare(`
              SELECT
                id,
                event_date,
                venue,
                location,
                location_url,
                start_time,
                end_time,
                note,
                event_type,
                public_url,
                created_at
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
        const body =
          await request.json();


        const validation =
          validateEvent(body);


        if (!validation.ok) {
          return json(
            {
              error:
                validation.error
            },
            400
          );
        }


        const result =
          await env.DB
            .prepare(`
              INSERT INTO events
              (
                event_date,
                venue,
                location,
                location_url,
                start_time,
                end_time,
                note,
                event_type,
                public_url
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(
              validation.data.event_date,
              validation.data.venue,
              validation.data.location,
              validation.data.location_url,
              validation.data.start_time,
              validation.data.end_time,
              validation.data.note,
              validation.data.event_type,
              validation.data.public_url
            )
            .run();


        return json(
          {
            success: true,

            id:
              result.meta
                ?.last_row_id
          },
          201
        );
      }


      // =====================================================
      // ADMIN - EVENT BY ID
      // =====================================================

      const adminEventMatch =
        pathname.match(
          /^\/api\/admin\/events\/(\d+)$/
        );


      if (adminEventMatch) {

        const id =
          Number(
            adminEventMatch[1]
          );


        if (
          !Number.isInteger(id) ||
          id <= 0
        ) {
          return json(
            {
              error:
                "Invalid event ID"
            },
            400
          );
        }


        // -------------------------------------------------
        // UPDATE EVENT
        // -------------------------------------------------

        if (method === "PUT") {

          const body =
            await request.json();


          const validation =
            validateEvent(body);


          if (!validation.ok) {
            return json(
              {
                error:
                  validation.error
              },
              400
            );
          }


          const existing =
            await env.DB
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
                error:
                  "Event not found"
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
                location_url = ?,
                start_time = ?,
                end_time = ?,
                note = ?,
                event_type = ?,
                public_url = ?
              WHERE id = ?
            `)
            .bind(
              validation.data.event_date,
              validation.data.venue,
              validation.data.location,
              validation.data.location_url,
              validation.data.start_time,
              validation.data.end_time,
              validation.data.note,
              validation.data.event_type,
              validation.data.public_url,
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

          const existing =
            await env.DB
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
                error:
                  "Event not found"
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

      return env.ASSETS.fetch(
        request
      );


    } catch (error) {

      console.error(error);


      return json(
        {
          error:
            "Internal server error"
        },
        500
      );
    }
  }
};


// =========================================================
// AUTH
// =========================================================

function isAdminAuthenticated(
  request,
  env
) {

  if (
    !env.ADMIN_SESSION_TOKEN
  ) {
    return false;
  }


  const cookies =
    parseCookies(
      request.headers.get(
        "Cookie"
      ) || ""
    );


  return (
    cookies.orange_may_admin ===
    env.ADMIN_SESSION_TOKEN
  );
}


function createSessionCookie(
  token
) {

  return [
    `orange_may_admin=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=28800"
  ].join("; ");
}


function clearSessionCookie() {

  return [
    "orange_may_admin=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0"
  ].join("; ");
}


function parseCookies(
  cookieHeader
) {

  const cookies = {};


  cookieHeader
    .split(";")
    .forEach(cookie => {

      const separator =
        cookie.indexOf("=");


      if (separator === -1) {
        return;
      }


      const key =
        cookie
          .slice(0, separator)
          .trim();


      const value =
        cookie
          .slice(separator + 1)
          .trim();


      cookies[key] =
        value;
    });


  return cookies;
}


// =========================================================
// EVENT VALIDATION
// =========================================================

function validateEvent(
  body
) {

  const event_date =
    String(
      body.event_date || ""
    ).trim();


  const venue =
    String(
      body.venue || ""
    ).trim();


  const location =
    String(
      body.location || ""
    ).trim();


  const location_url =
    cleanOptional(
      body.location_url
    );


  const start_time =
    cleanOptional(
      body.start_time
    );


  const end_time =
    cleanOptional(
      body.end_time
    );


  const note =
    cleanOptional(
      body.note
    );


  const event_type =
    normalizeEventType(
      body.event_type
    );


  const public_url =
    cleanOptional(
      body.public_url
    );


  // -----------------------------------------------------
  // REQUIRED
  // -----------------------------------------------------

  if (!event_date) {
    return {
      ok: false,

      error:
        "Date is required"
    };
  }


  if (!venue) {
    return {
      ok: false,

      error:
        "Venue is required"
    };
  }


  if (!location) {
    return {
      ok: false,

      error:
        "Location is required"
    };
  }


  // -----------------------------------------------------
  // DATE
  // -----------------------------------------------------

  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(event_date)
  ) {
    return {
      ok: false,

      error:
        "Invalid date"
    };
  }


  // -----------------------------------------------------
  // TIME
  // -----------------------------------------------------

  if (
    start_time &&
    !/^\d{2}:\d{2}$/
      .test(start_time)
  ) {
    return {
      ok: false,

      error:
        "Invalid start time"
    };
  }


  if (
    end_time &&
    !/^\d{2}:\d{2}$/
      .test(end_time)
  ) {
    return {
      ok: false,

      error:
        "Invalid end time"
    };
  }


  if (
    start_time &&
    end_time &&
    end_time < start_time
  ) {
    return {
      ok: false,

      error:
        "End time cannot be earlier than start time"
    };
  }


  // -----------------------------------------------------
  // LOCATION URL
  // -----------------------------------------------------

  if (
    location_url &&
    !isValidHttpUrl(
      location_url
    )
  ) {
    return {
      ok: false,

      error:
        "Invalid location URL"
    };
  }


  // -----------------------------------------------------
  // PUBLIC URL
  // -----------------------------------------------------

  if (
    public_url &&
    !isValidHttpUrl(
      public_url
    )
  ) {
    return {
      ok: false,

      error:
        "Invalid public URL"
    };
  }


  return {
    ok: true,

    data: {
      event_date,
      venue,
      location,
      location_url,
      start_time,
      end_time,
      note,
      event_type,
      public_url
    }
  };
}


// =========================================================
// EVENT TYPE
// =========================================================

function normalizeEventType(
  value
) {

  const allowedTypes = [
    "PUBLIC",
    "GUESTS_ONLY",
    "PRIVATE"
  ];


  const type =
    String(
      value || "PUBLIC"
    )
      .trim()
      .toUpperCase();


  return allowedTypes.includes(
    type
  )
    ? type
    : "PUBLIC";
}


// =========================================================
// EMAIL VALIDATION
// =========================================================

function isValidEmail(
  value
) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(value);
}


// =========================================================
// URL VALIDATION
// =========================================================

function isValidHttpUrl(
  value
) {

  try {

    const url =
      new URL(value);


    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );


  } catch {

    return false;
  }
}


// =========================================================
// HTML ESCAPE
// =========================================================

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


function escapeHtmlAttribute(
  value
) {

  return escapeHtml(value);
}


// =========================================================
// HELPERS
// =========================================================

function cleanOptional(
  value
) {

  const result =
    String(
      value || ""
    ).trim();


  return result || null;
}


function json(
  data,
  status = 200
) {

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
