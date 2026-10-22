# Hosting Leadership Lab

Set the Vercel project root directory to `app`. The app's `vercel.json` serves `public/` and bundles the access and game API functions.

Before deployment, install dependencies and run the asset generator from the app directory:

```sh
npm ci
node scripts/prepare-access-layout.mjs
npm test
```

Configure `FACILITATOR_PASSCODE`, `FACILITATOR_SESSION_SECRET`, and `BLOB_READ_WRITE_TOKEN` privately in the deployment environment. Use a private Vercel Blob store. The passcode needs at least eight non-hyphen characters and the session secret at least 32 characters. Keep local credentials and classroom saves out of version control.

Use `node scripts/provision-access.mjs generate` to create local facilitator credentials. For the upload/update commands, link the app directory to your own Vercel project first; the script uses that linked project. Set `LEADERSHIP_APP_URL` to your deployment origin when generating access instructions or running the production-check scripts. Those checks contact the configured deployment; run them intentionally.

The public board is at `/#board`, and Manage is at `/?manage=1#board` on your deployment. The public views follow a shared classroom session. A GitHub push alone does not configure hosting or private environment variables.
