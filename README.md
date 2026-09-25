# BerryTube Mention Threads

A userscript for [BerryTube](https://berrytube.tv) that turns usernames in chat into
clickable **threads**. Click a username — either an `@mention` inside a message *or*
a message's sender name — and a pinned bar appears that jumps to that person's
relevant message and lets you step **older / newer** through everything they've said.

Works with **vanilla BerryTube chat** and the **MalTweaks** "tweaked" view, and
picks up per-user **wutColors** when that plugin is enabled.

## Features

- **Clickable usernames** — full usernames mentioned in a message get a subtle box;
  the sender name on each message is clickable too. (Client-side squee aliases are
  never linkified — only real usernames from the chat/user list.)
- **Thread bar** — a pinned header shows `🧵 Name (i/n)` with `▲ ▼ ✕` controls. It
  mirrors the chat buffer's position, so it sits in the message area (not under the
  MalTweaks toolbar) and its controls stay just left of the users panel, tracking
  the panel as it expands/contracts.
- **Smart selection** — clicking an `@mention` jumps to that user's most recent
  message **above** the mention (the thing they were likely being mentioned about);
  `▼` still walks down to later messages. Clicking a sender name selects that exact
  message.
- **wutColors aware** — when [wutColors](https://github.com/BTDev/BerryTube/tree/master/web/plugins/wutcolors)
  is enabled, the bar name, the boxed mention, and the highlight outline use the
  user's color.

## Install

1. Install a userscript manager: [Tampermonkey](https://www.tampermonkey.net/)
   (Chrome/Edge/Firefox) or [Violentmonkey](https://violentmonkey.github.io/).
2. Click to install:
   **[MentionThreads.user.js](https://raw.githubusercontent.com/flames5123/BT-mentions-threads/main/MentionThreads.user.js)**
3. Reload BerryTube.

The script auto-updates from this repo (via `@updateURL`).

## Usage

- **Click** any boxed `@mention` or any sender name in chat.
- The thread bar appears at the top of the chat area:
  - `▲` — older message from that user
  - `▼` — newer message from that user
  - `✕` — close the thread bar
- The currently-focused message is outlined (in the user's wutColor if enabled).

## Compatibility

- Vanilla BerryTube chat.
- MalTweaks "tweaked" view (same `#chatbuffer` / `.msgwrap` DOM).
- Optional: [wutColors](https://github.com/BTDev/BerryTube/tree/master/web/plugins/wutcolors)
  for per-user colors.

No dependency on MalTweaks — it's pure DOM and runs with `@grant none`.

## How it works

BerryTube stamps every chat message wrapper with `nick="ExactUsername"` (even
grouped messages with no visible name), so "all messages by X" is a reliable
`.msgwrap[nick="X"]` query. The script registers known usernames from the online
user list plus every message seen, linkifies full-username matches in message
text, and wires up a single fixed nav bar that tracks the chat buffer's geometry.

## License

MIT — see [LICENSE](LICENSE).
