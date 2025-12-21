import { Hono } from "hono";
import { verifyOneTimeToken } from "./lib/verifyOneTimeToken";
import { getShareHtmlByBase62Id } from "./lib/shareCache";

const app = new Hono();
const homeDomain = Bun.env.HOME_DOMAIN!;

app.get("/", (c) => c.redirect(homeDomain));

app.get("/share", (c) => c.redirect(homeDomain));

app.get("/share/:id", async (c) => {
  const id = c.req.param("id"); // abc123
  const token = c.req.query("token"); // 12345

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

  const html = await getShareHtmlByBase62Id(id);
  if (!html) {
    return c.redirect(`${homeDomain}/share/${id}`);
  }

  c.header("Cache-Control", "no-store");
  return c.html(html);
});

export default {
  port: Bun.env.PORT || 3000,
  fetch: app.fetch,
};
