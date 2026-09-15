# Discord Connection (In Development)

This branch supports bot login, voice-channel discovery, and Discord audio output.
Device output is always the default on startup, including after automatic bot login.

## Setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Obtain its **bot token** from the Bot page. Do not use a user account token,
   client secret, or application ID. Never share the token or include it in screenshots.
3. Install the bot in your Discord server using a bot invitation with **View Channels**,
   **Connect**, and **Speak** permissions. You need permission to manage that server.
4. Open Continuo's Configuration, enter the token, and click **Connect**.
5. After Discord reports the bot ready, Status becomes **Connected**. Eligible
   voice channels appear in Output, grouped by server.
6. Select a voice channel to join and send Continuo's mix there. Once connected,
   local speakers are muted. Select Device output to leave and resume local audio.

No privileged intents or Administrator permission are required for this step.
Only ordinary server voice channels are listed, not text channels, Stage channels,
or group DMs. Channel permission overrides also apply. An empty list can mean
the bot has not been invited to a server or lacks the required permissions.

## Behavior

- Closing Configuration leaves the bot logged in and retains its displayed status.
- Successful login saves an OS-encrypted token for automatic login on startup.
  Quitting closes the connection; reopening the app connects again.
- Disconnect (or Cancel) removes the saved token and disables automatic login,
  but retains it in memory for the current app session. Click Connect again to
  reuse it, or enter a replacement token. A successful connection saves it again.
- Cancel stops a pending connection. Network reconnection has a timeout.
- Tokens are stored in `discord-token.enc` in the app's user-data directory using
  Electron safeStorage, never in SQLite or logs. Linux requires a secure keyring;
  without one (including some WSL setups), login is session-only and a warning
  appears. The insecure `basic_text` fallback is not used.
- The password field contains the actual token, masked by the browser. It stays
  locked while connected and becomes editable after disconnecting. Copy, cut,
  and dragging are blocked, but masking does not prevent extraction through
  developer tools. The decrypted token is held in renderer memory; disk storage
  remains encrypted. Error messages do not expose raw API errors.
- Output selection is never saved. Quitting leaves the voice channel; reopening
  requires manually selecting a voice channel again.
- Volume, simultaneous tracks, procedural transitions, and fades apply to Discord
  output too. Switching outputs does not restart tracks. Discord adds network latency.
- Failed or lost voice connections restore Device output. A firewall must allow
  Discord's voice UDP traffic; server mute and channel permissions can prevent sound.

## References

- [Discord bot setup](https://docs.discord.com/developers/quick-start/getting-started)
- [Discord permissions](https://docs.discord.com/developers/topics/permissions)
- [discord.js documentation](https://discord.js.org/docs/packages/discord.js/main)

Voice transport uses the GuildVoiceStates intent and `@discordjs/voice` with DAVE
encryption. The existing Web Audio mix is captured as 48 kHz stereo PCM and encoded
as Opus. No FFmpeg executable or browser audio capture is required. Build installers
on their target OS so the matching native DAVE module is included.
