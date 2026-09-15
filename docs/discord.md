# Discord Connection

Continuo v1.1.0 supports bot login, voice-channel discovery, and Discord audio output. Device output is always the default on startup, including after automatic bot login.

## Setup

You will create your own Discord bot and invite it to your server. You must own
the server or have **Manage Server** permission to authorize the invitation.

### Create Your Bot

1. Sign in to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Choose **New Application**, enter a name for your bot, and select **Create**.
3. Open **Installation** and ensure **Guild Install** is enabled. Continuo needs a bot installed in a server, not an app installed only to your Discord account.

### Create an Invitation

4. Open **OAuth2** and find **OAuth2 URL Generator**.
5. Under **Scopes**, select **bot**.
6. In **Bot Permissions**, enable these three:

| Category | Permission | Why Continuo Needs It |
| --- | --- | --- |
| General Permissions | View Channels | Discover voice channels available to the bot. |
| Voice Permissions | Connect | Join the selected voice channel. |
| Voice Permissions | Speak | Send music to people in that channel. |

7. Choose **Guild Install** under **Integration Type**.
8. Copy the **Generated URL** and open it in your browser.
9. Choose your server, continue through the authorization prompt, and approve the requested permissions. Complete any verification Discord requests.

The bot should now appear in the server's member list. It may remain offline until you connect it through Continuo. To use it in other servers, open the same invitation URL and authorize each server separately.

Continuo does not require **Administrator**, privileged intents, or slash-command setup. Leave the privileged intent switches on the Bot page disabled.

### Connect Continuo

10. Return to your application in the Developer Portal and open **Bot**.
11. Under **Token**, select **Reset Token** to generate a token if you do not already have it. Complete password or multi-factor verification if prompted.
12. Copy the token. In Continuo, click the gear icon to open **Configuration** and paste it into **Bot token**.
13. Click **Connect** and wait for **Status** to show **Connected**.

Treat this token like a password: it grants control of your bot. Do not share it, commit it to Git, or show it in screenshots. Use the **bot token**, not the application ID or client secret. Resetting a token invalidates the previous one; you will need to replace it in Continuo as well.

### Select the Voice Output

14. Join a voice channel yourself in Discord so you can hear the music.
15. In Continuo's **Output** dropdown, choose that channel under its server name.

If no channels appear, check that you invited the bot to the correct server and that its role has all three permissions above. Category and channel overrides can deny access even when the invitation granted it. Continuo lists ordinary server voice channels only, not text channels, Stage channels, or group DMs.

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

Voice transport uses the GuildVoiceStates intent and `@discordjs/voice` with DAVE encryption. The existing Web Audio mix is captured as 48 kHz stereo PCM and encoded as Opus. No FFmpeg executable or browser audio capture is required. Build installers on their target OS so the matching native DAVE module is included.
