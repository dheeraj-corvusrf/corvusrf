# CorvusRF.ai

Texas property tax assistant, built with [Lovable](https://lovable.dev).

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Development

You need Node.js 20+.

```sh
npm i
npm run dev
```

The AI document-scanning features (`/intake`, `/document-review`) call server functions
that need a `LOVABLE_API_KEY` environment variable. Create a `.env` file locally with:

```
LOVABLE_API_KEY=your-key-here
```

## Deployment

This app uses server functions (TanStack Start + Nitro), so it needs a real server at
runtime — it **cannot** be hosted on GitHub Pages, which only serves static files. It's
deployed to **Cloudflare Workers** instead, which the build is already configured for.

### One-time setup

1. Install the Wrangler CLI (already a dev dependency) and log in:
   ```sh
   npx wrangler login
   ```
2. Set the AI gateway key as a Worker secret (you'll be prompted to paste the value):
   ```sh
   npx wrangler secret put LOVABLE_API_KEY --config .output/server/wrangler.json
   ```

### Manual deploy

```sh
npm run deploy
```

### Automatic deploy (GitHub Actions)

Pushing to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which
builds the app and deploys it via `wrangler`. Add these repository secrets under
**Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with "Edit Cloudflare Workers" permission
- `CLOUDFLARE_ACCOUNT_ID` — found on the right sidebar of the Cloudflare dashboard

The `LOVABLE_API_KEY` Worker secret from the one-time setup step persists across deploys
and does not need to be repeated in GitHub Actions.
