import { Hono } from "hono";
import { verifyOneTimeToken } from "./lib/verifyOneTimeToken";

const app = new Hono();

app.get("/", (c) => {
  const homeDomain = Bun.env.HOME_DOMAIN;

  if (!homeDomain) {
    return c.text("HOME_URL not configured", 500);
  }

  return c.redirect(homeDomain);
});

app.get("/share/:id", async (c) => {
  const id = c.req.param("id"); // abc123
  const token = c.req.query("token"); // 12345
  const homeDomain = Bun.env.HOME_DOMAIN!;

  if (!id) {
    return c.redirect(homeDomain);
  }

  if (!token) {
    return c.redirect(`${homeDomain}/share/${id}`);
  }
  const { valid } = await verifyOneTimeToken(token, id);

  if (!valid) {
    return c.redirect(`${homeDomain}/share/${id}`);
  }

  return c.json({ id, token });
});

export default {
  port: Bun.env.PORT || 3000,
  fetch: app.fetch,
};
