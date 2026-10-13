# X feed

The ten most recent posts from [@migratewithmatt](https://x.com/migratewithmatt) are
part of `index.html` as ordinary markup. Nothing on the page talks to X at render time:
no widget script, no iframe, no third-party request, no cookie. A crawler that executes
no JavaScript reads the same posts a browser does — which is the point, on a page
written to be crawled.

They are not stacked in one feed box. The page carries ten numbered slots spaced down
the document — one in the header, one in each of the eight numbered sections, one in the
footer — and the script writes a single post into each, newest first. Section 01 explains the
arrangement and reports what the last run wrote.

Freshness happens before the page is served.

## How it refreshes

`.github/workflows/x-feed.yml` runs nightly at 08:47 UTC — 03:47 in Minneapolis on
CDT, 02:47 on CST — and on demand from the Actions tab. It calls
`scripts/fetch-x-posts.mjs`, which:

1. reads the account's timeline from the X API v2,
2. writes `posts.json` at the repository root,
3. rewrites each `<!-- X_POST:n:START -->` / `<!-- X_POST:n:END -->` slot in
   `index.html`, plus the summary line between the `<!-- X_POSTS:META:START -->` and
   `<!-- X_POSTS:META:END -->` markers in section 01,
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

`X_USERNAME` (default `migratewithmatt`) and `X_POST_COUNT` (range 5–100) override the
account and how many posts are published. Left unset, the count follows the number of
slots in `index.html`, so adding or removing a pair of markers is all it takes to change
how many posts the page carries. More slots than posts and the extra slots say so on the
page; more posts than slots and the oldest are left unpublished, with a warning in the
job log.
