# Hosted deployment

The app is prepared for a free, publicly accessible Render demo service. The deployment blueprint is [`render.yaml`](../render.yaml). It binds to Render's public interface, uses a temporary SQLite file under `/tmp`, and runs with demo generation. No login is required.

## Deploy from GitHub

1. Push the current project to the GitHub repository.
2. In Render, choose **New → Blueprint**, connect the repository, and select `render.yaml`.
3. Review the Blueprint and confirm it shows a **Free** web service with no disk and no paid resources before creating it.
4. Wait for `/api/health` to report `status: "ok"`, then open the service URL. The app and API routes are public.

The service uses demo generation; it does not need an AI provider key. Do not add Firebase credentials unless cloud backup is intentionally configured and reviewed. The local `.env`, Firebase service-account file, SQLite database, and the disposable Quick Tunnel are not part of this deployment configuration.

## Limits

This free deployment is a public demo for review. Anyone with the URL can view, change, or generate demo content through the app and API; do not store private information or rely on saved data. Render free services can spin down after inactivity and their filesystem is ephemeral. The SQLite database at `/tmp/incrubrix.sqlite` can be lost on a spin-down, restart, or redeploy. The service may take time to wake after inactivity, so it is not always available. To retain data and avoid free-service sleep, change to a paid service and mount a persistent disk after reviewing the current price in Render.
