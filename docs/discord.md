# Discord Connection (In Development)

This branch supports real bot login and server voice-channel discovery.
Joining voice channels and sending audio are not implemented yet. Device output
continues to play locally; discovered Discord outputs are disabled.

## Setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Obtain its **bot token** from the Bot page. Do not use a user account token,
   client secret, or application ID. Never share the token or include it in screenshots.
3. Install the bot in your Discord server using a bot invitation with **View Channels**,
   **Connect**, and **Speak** permissions. You need permission to manage that server.
4. Open Continuo's Configuration, enter the token, and click **Connect**.
5. After Discord reports the bot ready, Status becomes **Connected**. Eligible
   voice channels appear in Output, grouped by server.

No privileged intents or Administrator permission are required for this step.
Only ordinary server voice channels are listed, not text channels, Stage channels,
or group DMs. Channel permission overrides also apply. An empty list can mean
the bot has not been invited to a server or lacks the required permissions.

## Behavior

- Closing Configuration leaves the bot logged in and retains its displayed status.
- Successful login saves an OS-encrypted token for automatic login on startup.
  Quitting closes the connection; reopening the app connects again.
- Disconnect (or Cancel) removes the saved token and disables automatic login.
- Cancel stops a pending connection. Network reconnection has a timeout.
- Tokens are stored in `discord-token.enc` in the app's user-data directory using
  Electron safeStorage, never in SQLite or logs. Linux requires a secure keyring;
  without one (including some WSL setups), login is session-only and a warning
  appears. The insecure `basic_text` fallback is not used.
- The token field clears on submission. Error messages do not expose raw API errors.
- Selecting Discord as the actual audio output will be added in a later step.

## References

- [Discord bot setup](https://docs.discord.com/developers/quick-start/getting-started)
- [Discord permissions](https://docs.discord.com/developers/topics/permissions)
- [discord.js documentation](https://discord.js.org/docs/packages/discord.js/main)

Voice transport will additionally require the GuildVoiceStates intent and a
DAVE-compatible voice library. Neither voice transport nor audio encoding is
part of this login/discovery implementation.
