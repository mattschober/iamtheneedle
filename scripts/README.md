# X feed

The ten most recent posts from [@migratewithmatt](https://x.com/migratewithmatt) are
part of section 01 of `index.html` as ordinary markup. Nothing on the page talks to X
at render time: no widget script, no iframe, no third-party request, no cookie. A
crawler that executes no JavaScript reads the same posts a browser does — which is the
point, on a page written to be crawled.

Freshness happens before the page is served.

## How it refreshes

`.github/workflows/x-feed.yml` runs every six hours (and on demand from the Actions
tab). It calls `scripts/fetch-x-posts.mjs`, which:

1. reads the account's timeline from the X API v2,
2. writes `posts.json` at the repository root,
3. rewrites the block between the `<!-- X_POSTS:START -->` and `<!-- X_POSTS:END -->`
   markers in `index.html`,
4. commits the result, but only if something actually changed.

If the API call fails — rate limit, expired token, revoked access — the job exits
non-zero and touches nothing. The page keeps the last good set of posts rather than
going blank.

## Credentials

Repository secrets, in order of preference:

| Secret | Role |
| --- | --- |
| `X_BEARER_TOKEN` | App-only bearer token. Used directly if present. |
| `X_CONSUMER_KEY` + `X_SECRET_KEY` | Fallback. Exchanged for an app-only bearer token at run time via OAuth 2.0 client credentials. |

Both come from the X developer portal, under your project's **Keys and tokens**. The
timeline endpoint this uses (`GET /2/users/:id/tweets`) requires a plan that permits
reading user timelines; on a tier that does not, the job will report a 403 from X.

## Running it by hand

```sh
# fetch from X, then rewrite index.html
X_BEARER_TOKEN=... node scripts/fetch-x-posts.mjs

# rebuild the HTML from posts.json without calling X
node scripts/fetch-x-posts.mjs --render-only
```

`X_USERNAME` (default `migratewithmatt`) and `X_POST_COUNT` (default `10`, range
5–100) override the account and how many posts are published.
