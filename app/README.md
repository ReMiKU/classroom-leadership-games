# Leadership Lab classroom games

Live: [Leadership Lab](https://classroom-leadership-games.vercel.app/#home)

A facilitator-led classroom game collection. The home page offers **Red / Blue**, using the revised **smaller side wins** rules, and a clearly labelled slot for an undecided second activity.

The look is a dark "game show" theme (Lilita One and Nunito from Google Fonts). The home page carries the Leadership Lab dice logo; game pages keep the Red / Blue mark. Featured games rotate in a spotlight carousel every seven seconds. It pauses while hovered or focused, once a visitor picks a slide, or with its pause button, and starts paused for visitors who prefer reduced motion. To feature a new game, add a slide to `slides` in `home()` in `app.mjs`; the dots and arrows appear automatically when there is more than one slide. Plain HTML, CSS and JavaScript run the game locally in the browser. A small Vercel Function validates the facilitator passcode and serves the private controller after authentication.

## Facilitator passcode

Home and the game selector are public. Selecting Red / Blue opens the public projector board, with Round log and How to play available without signing in. Click **Manage** to enter the passcode from the local `.facilitator-access.txt` file. That file is excluded from deployment and Git. The passcode and cookie-signing secret are configured as Vercel Secrets for production and preview, never embedded in public JavaScript.

Manage is at `/?manage=1#board`. Its two tabs are **Game board** and **Teams & setup**. The session lasts up to eight hours and uses a signed HttpOnly, SameSite=Strict, Secure cookie on HTTPS. **Lock** signs the browser out, pauses the discussion timer, retains the saved game, and returns to the public board. Other manager tabs in the browser also return to public view. Refresh open tabs after a site update.

The public projector URL is `/#board` on your deployment; the `/?display=1` shortcut also works. The public board includes Manage at the top, plus Round log and How to play. It contains no score or team editing controls, even when signed in. Browsers and devices share one online classroom session through a private Vercel Blob store. Public views refresh automatically every 2.5 seconds and never receive unconfirmed colour entries. Reopen Manage in the original browser once to migrate an existing browser-only game when the online session is empty.

## Open it

From this directory, run:

```powershell
npm ci
node scripts/provision-access.mjs generate
node scripts/prepare-access-layout.mjs
node server.mjs
```

Then open <http://127.0.0.1:4173> in a browser. The root opens the public game selector; `#board` opens the public Red / Blue board; `?manage=1#board` opens the protected manager. Node.js is the only preview requirement. The static app files can be hosted on Vercel; the preview server is not a production backend.

Opening a game or returning to **All games** preserves its saved session. The game card changes to Continue game once a session is in progress. Projector view always opens the game board, independently of the facilitator’s current menu page.

## Classroom arrangement

1. Open Red / Blue, select **Manage**, unlock it and use **Teams & setup** to replace the sample roster. Add 2–12 teams, optional members, discussion time, number of rounds and starting points. Saving setup clears the old session after an in-app confirmation when a game is in progress.
2. Keep the facilitator view on your laptop. Open **Projector view** in another tab or device, move that window to the projector, and use Full screen. Set the computer to extend its display rather than mirror it if you want private entry controls.
3. Start the discussion timer. Each group agrees privately on red or blue.
4. Count down. One spokesperson per group simultaneously reveals a closed fist (red) or open palm (blue), holding it until recorded. You may use any other agreed simultaneous signals.
5. Click **Teams have revealed**, then enter all colours. The projector still conceals individual entries.
6. Click **Reveal the split**. Equal sides nominate one champion each. Select their names, have them play rock–paper–scissors in person, and record the winning side. Draws replay without scoring.
7. Review the public transfer calculation. Click **Apply points** once, then continue.
8. After the last scored round, click **Finish & debrief**. A unique highest-scoring team is the overall champion. If the highest scores are tied, select one representative per tied team, confirm **Draw knockout bracket**, and play the displayed rock–paper–scissors matches in person. Confirm a winner or **Draw — play again** for each match until one overall champion remains.
9. End with the debrief and optionally download the results as CSV from Manage.

When mirroring one screen, the class sees facilitator entry controls. Enter colours only after everyone has physically revealed. The separate display tab provides the cleaner reveal.

## Rules implemented

- The smaller colour side wins; red and blue use the same rules.
- Each losing team gives one point to every winning team.
- Example: 1 red versus 5 blue gives the red team +5 and each blue team −1.
- Example: 2 red versus 4 blue gives each red team +4 and each blue team −2.
- Equal sides use champions. A 3–3 blue champion win gives every blue team +3 and every red team −3.
- Everyone choosing the same colour produces no transfer.
- No bonus multipliers. Scores may go below zero; nobody is eliminated during scored rounds.
- A unique highest final score wins. Equal highest scores enter a title-only knockout; there is exactly one overall champion once the knockout is resolved. Lower-scoring teams do not participate.
- Timer expiry does not submit, reveal or choose on anyone’s behalf.
- Undo restores the latest round and reopens its choices. Undoing while a new round is unscored replaces that round’s draft choices, with confirmation.

`game-walkthrough.md` describes earlier game rules. This prototype implements the later minority-wins variant.

### Final-score knockout

- Each tied first-place team chooses one roster member. A team without member names explicitly selects **Team representative** and chooses that person in the room.
- Confirming the draw locks the representatives and saves one random shuffle. Reloading, reconnecting, and undoing a match do not redraw it.
- For fields that are not a power of two, randomly allocated first-stage byes bring the next stage to a full bracket. A bye advances a team without a match; no team receives repeated byes. Remaining stages follow the saved bracket order.
- The app does not simulate rock–paper–scissors. Representatives play in person; the facilitator confirms a winner or records a draw and replays the same match. Every match is sudden-death after any draws, not best-of-three.
- Scored-round totals and history never change during this knockout. The projector and public round log show pairings, representatives, byes, draw counts, advancement and the sole champion, with no editing controls.
- **Undo last knockout result** removes the latest draw or winner, including a completed final. Repeat to reach an earlier match, then record its corrected result. Dependent later results are removed first; the original draw stays fixed.
- **Undo final round** clears the entire knockout and reopens the scored choices. A confirmed fresh setup clears it too. An older completed game with tied scores offers **Start overall tiebreak** without deleting its history.
- While a tie is unresolved, the board says **Overall title undecided**, not shared winners. A unique leader skips the knockout entirely.

## Scope and data

- Player involvement is in person: discussions, reveal signals and champions. Students do not log in, join online, or submit from phones.
- Roster, scores, round history and the final knockout are saved in the private online store; localStorage retains a browser backup. The API allowlists the knockout fields and validates qualifiers, representatives, saved order and replayed match results. Manage loads the online state first, and imports a local game only if no online game exists. The sync indicator reports pending changes, connection errors and conflicts.
- This is one facilitator desk plus public displays across browsers and devices. Students still play in person; there is one shared classroom session per deployment.
- Browser storage may be cleared by the browser or user. Download CSV if you want a separate results record. CSV retains scored-round rows and adds explicitly labelled **Title knockout** rows (including byes and draw counts) and an **Overall title** row. Title rows transfer zero points; an unresolved title is marked Pending. Added columns are Record type, Stage, Match, Opponent and Title result. Member names are not exported.
- The sample roster uses generic team and member labels.

## Verification

```powershell
npm test
```

The automated checks cover both colours, every possible split for 2–12 teams, conservation of points, champion outcomes, unanimous choices, preventing duplicate application and restoring scores through undo. Final-title checks cover every qualifying field size from 2–12, byes, draws, one-time bracket persistence, corrections, legacy games, reset, API validation/allowlisting, read-only generated views, guide text, CSV and history. Generated browser modules are exercised in a Node VM with synthetic state and DOM stubs; this is not a substitute for a real browser check. See `VERIFICATION.md` for the local-only status of the final-tiebreak work.

## Hosting

`vercel.json` serves only `public/` as static files and deploys the access and game API functions. The generated `.private/facilitator-app.mjs` is included only in the access function’s server bundle. It is sent to an authenticated browser with no-store cache headers. Direct requests for `/app.mjs` or private source paths are not public assets. Game writes require a valid facilitator cookie and same-origin JSON request. ETag preconditions prevent stale managers overwriting a newer game. Reads bypass Blob caching; public responses contain redacted state. Production needs the connected Blob store credentials as well as facilitator secrets.

`.vercelignore` excludes local secrets, preview server, tests, screenshots, deployment records and documentation. Root `game.mjs` must remain in the deployment input because the game API imports its pure knockout validation helpers; the public copy is still generated from that source. Student joining is not implemented. Local preview uses an excluded file store and never changes production.

`app.mjs`, `style.css`, `game.mjs` and `index.html` at the project root remain authoring sources. Run `node scripts/prepare-access-layout.mjs` after changing them, before deploying. The public entry module and access handlers are edited directly. Rotate both server secrets to revoke every existing session when changing the passcode.

## Starting a fresh game and recovering saves

In Teams & setup, set Starting points to 0 if desired, then choose Save setup & start fresh and confirm if a game is in progress. Wait for Shared game saved before closing the tab. The Reset button beside the discussion timer resets that timer only.

A confirmed new session intentionally replaces the latest shared game, even if another Manage tab was open earlier. Normal competing edits show Load shared game or Save my changes instead; the entire page remains usable. Unsent changes are backed up separately and offered for recovery after reload. A save failure never reports Session ready.
