# Classroom leadership games

Facilitator-led classroom activities for decision-making, problem solving, and leadership.

**Live app: [Leadership Lab](https://classroom-leadership-games.vercel.app/#home)**

The Leadership Lab web app is in [`app/`](app/). See its [README](app/README.md) for game rules, facilitator setup, and hosting details. Red / Blue is the first game; a second activity is still being considered.

## Run locally

```sh
cd app
npm ci
node scripts/provision-access.mjs generate
node scripts/prepare-access-layout.mjs
npm run dev
```

Open <http://127.0.0.1:4173>. Local facilitator access requires private credentials as described in the app README.

Run the existing checks with `npm test` from `app/`.

`game-walkthrough.md` contains earlier activity plans. `assets/` contains supporting illustrations and their source notes.

For Vercel, set the project root directory to `app`. Local credentials, environment files, saved classroom sessions, screenshots, and installed dependencies are excluded from Git.
