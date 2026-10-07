# Share links with a luxury preview card

When someone taps **Share or gift this** on a product, the link they send is now
`https://<your-domain>/p/<slug>` (for example `/p/20`), not the raw product URL.

* **Chat apps** (WhatsApp, Telegram, Facebook, iMessage, X, Slack…) fetch that link once. `/p/<slug>` answers
  with the product's Open Graph tags: title with price, an offer / spec line, and a branded 1200×630 card
  (`/p/<slug>/og.jpg` — brand mark on the left, the product photo in a gallery frame on the right).
* **People who tap it** are sent straight on to `/product/<slug>`.

The code lives in `share/core.js`. `api/` (Vercel), `netlify/functions/` (Netlify) and `share/viteSharePlugin.js`
(`npm run dev`) are thin wrappers around it.

## One-time setup

1. `npm install` (adds `sharp`, used to draw the preview image).
2. Deploy on **Vercel** or **Netlify** (both are configured: `vercel.json` / `netlify.toml`).
3. In the host's environment variables set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the same values as
   `.env`; the functions read them to look the product up). Optional: `SITE_URL=https://lagamless.com`.
4. Redeploy. New and edited products are picked up automatically (pages cache ≈15 min, images ≈1 day).

Other hosts (Cloudflare Pages, plain static hosting) need an equivalent server route for `/p/*`; the
Vercel/Netlify wrappers show how little is needed — call `handleShare(request)` and return the Response.

## Testing

* **localhost cannot show a preview.** WhatsApp's servers cannot open `localhost:5173`, so a link to it will
  always look plain. Test on the deployed site, or expose your dev server with a tunnel
  (e.g. `cloudflared tunnel --url http://localhost:5173`) and share that address.
* `npm run dev` already serves `/p/20` and `/p/20/og.jpg`, so you can open them in the browser to see the
  card and check the redirect.
* WhatsApp / Facebook cache previews per link. After changing a product's photo or price, re-scrape with
  Facebook's Sharing Debugger (developers.facebook.com/tools/debug) or share the link with `?v=2` added.
