# bluesky-appsscript
Basic Bluesky / atproto library for apps script; post from your Doc or Spreadsheet!

## Setup

1. Create a new file in your apps script, call it 'bluesky' (it'll be labeled 'bluesky.gs' after saving)
2. Copy [bluesky.gs](https://raw.githubusercontent.com/softplus/bluesky-appsscript/refs/heads/main/bluesky.gs) from here into your file
3. Done.

## Usage

Strong recommendation: *create a test account and use app passwords.*
Don't test with your actual account.
It's much harder to clean up and [rate limits](https://docs.bsky.app/docs/advanced-guides/rate-limits) will be annoying.

Sample code:

```javascript
const BLUESKY_HANDLE = 'whatever.bsky.social';
const BLUESKY_APP_PASSWORD = 'abcd-1234-123x-yzzy';
const bsky = Bluesky; // (or whatever your namespace is for bluesky.gs)
if (!bsky.login(BLUESKY_HANDLE, BLUESKY_APP_PASSWORD)) {console.log("Can't log in"); return;}
let post = bsky.pd_AddText(false, 'This is a fantastic post.');
post = bsky.pd_AddHashtag(post, 'cheese');
const res = bsky.post(post);
if (!res) console.log('Something failed while posting.');
```

## More?

* License: MIT
* Copyright: John Mueller
* Docs: https://docs.bsky.app/docs/api/at-protocol-xrpc-api
* Bluesky discord: https://discord.gg/3srmDsHSZJ

