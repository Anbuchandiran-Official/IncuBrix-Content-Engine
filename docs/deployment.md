# Hosted deployment

The app is prepared for a persistent Render web service. The deployment blueprint is [`render.yaml`](../render.yaml). It binds to Render's public interface, stores SQLite on a persistent disk, runs with demo generation, and requires HTTP Basic Authentication before exposing any app or data route. The health endpoint remains available to Render's health checker.

## Deploy from GitHub

1. Push the current project to the GitHub repository.
2. In Render, choose **New → Blueprint**, connect the repository, and select `render.yaml`.
3. Render will show the paid web service and persistent disk before creating them. Review the current recurring price in Render and create the service only if you accept it. The service must stay running and keep its disk to meet the always-available and persistent-data requirement.
4. Set `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD` in the Render service environment before opening the public URL. Use a unique username and a long, unique password; do not commit either value. The app refuses to start on a public interface without both values.
5. Wait for `/api/health` to report `status: "ok"`, then sign in to the service URL when the browser requests credentials.

The service uses demo generation; it does not need an AI provider key. Do not add Firebase credentials unless cloud backup is intentionally configured and reviewed. The local `.env`, Firebase service-account file, SQLite database, and the disposable Quick Tunnel are not part of this deployment configuration.

## Limits

Basic Authentication protects the app from casual public access. Use a unique password and share the URL and credentials only with intended reviewers. This is a small single-instance Node/SQLite app; it is not configured for multiple server instances or high availability. Render's persistent disk retains the SQLite data across service restarts. Render pricing and plan availability can change, so confirm the current charge in the dashboard before provisioning.
