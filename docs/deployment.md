# Hosted deployment

The app is prepared for a free Render demo service. The deployment blueprint is [`render.yaml`](../render.yaml). It binds to Render's public interface, uses a temporary SQLite file under `/tmp`, runs with demo generation, and requires HTTP Basic Authentication before exposing any app or data route. The health endpoint remains available to Render's health checker.

## Deploy from GitHub

1. Push the current project to the GitHub repository.
2. In Render, choose **New → Blueprint**, connect the repository, and select `render.yaml`.
3. Review the Blueprint and confirm it shows a **Free** web service with no disk and no paid resources before creating it.
4. Set `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD` in the Render service environment before opening the public URL. Use a unique username and a long, unique password; do not commit either value. The app refuses to start on a public interface without both values.
5. Wait for `/api/health` to report `status: "ok"`, then sign in to the service URL when the browser requests credentials.

The service uses demo generation; it does not need an AI provider key. Do not add Firebase credentials unless cloud backup is intentionally configured and reviewed. The local `.env`, Firebase service-account file, SQLite database, and the disposable Quick Tunnel are not part of this deployment configuration.

## Limits

This free deployment is for testing the app and API only. Render free services can spin down after inactivity and their filesystem is ephemeral. The SQLite database at `/tmp/incrubrix.sqlite` can be lost on a spin-down, restart, or redeploy; do not store important data there. The service may take time to wake after inactivity, so it is not always available. Basic Authentication protects the app from casual public access. Use a unique password and share the URL and credentials only with intended reviewers. To retain data and avoid free-service sleep, change to a paid service and mount a persistent disk after reviewing the current price in Render.
