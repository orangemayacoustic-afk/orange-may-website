export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/events") {
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

    return new Response("Orange May website is online! 🎸");
  },
};
