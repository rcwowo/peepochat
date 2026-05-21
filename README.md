<div align="center">

![Logo](public/social-banner.webp)
# Peepochat
A full featured Twitch chat client for the web. Connect to a channel, follow live chat with emotes and badges.

</div>

## Development

Built with React, Vite, TypeScript, and Tailwind.

```sh
git clone https://gitlab.com/rcw.lol/peepochat
cd peepochat && bun install
cp .env.example .env   # add your Twitch app Client ID
bun dev
```

Create a [Twitch application](https://dev.twitch.tv/console/apps) and add an **OAuth Redirect URL** that matches exactly what the app sends — by default `http://localhost:5173` (origin only, no trailing slash). If your console entry differs, set `VITE_TWITCH_REDIRECT_URI` to that same string. Copy the Client ID into `.env` as `VITE_TWITCH_CLIENT_ID`.