#!/usr/bin/env node
/**
 * Writes the most recent posts from an X account into index.html as plain HTML.
 *
 * The page is static by design: nothing on it fetches from X at render time, so a
 * crawler that executes no JavaScript reads the same posts a browser does. Freshness
 * comes from running this script on a schedule (see .github/workflows/x-feed.yml)
 * and committing what it changes.
 *
 * Usage:
 *   X_BEARER_TOKEN=... node scripts/fetch-x-posts.mjs     # fetch, then render
 *   node scripts/fetch-x-posts.mjs --render-only          # re-render from posts.json
 *
 * Environment:
 *   X_BEARER_TOKEN  an X API v2 app-only bearer token. Preferred.
 *   X_CONSUMER_KEY  \ fallback used only when X_BEARER_TOKEN is absent: the app's API
 *   X_SECRET_KEY    / key and secret, exchanged for an app-only bearer at run time.
 *   X_USERNAME      handle to read, without the @. Default: migratewithmatt
 *   X_POST_COUNT    how many posts to publish, 5-100. Default: 10
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = join(ROOT, 'posts.json');
const PAGE_FILE = join(ROOT, 'index.html');

const START = '<!-- X_POSTS:START -->';
const END = '<!-- X_POSTS:END -->';
const INDENT = '                    ';

const USERNAME = (process.env.X_USERNAME || 'migratewithmatt').replace(/^@/, '');
const COUNT = Math.min(100, Math.max(5, Number(process.env.X_POST_COUNT) || 10));
const RENDER_ONLY = process.argv.includes('--render-only');

/* ---------- X API ---------- */

async function api(path, token) {
    const res = await fetch(`https://api.x.com/2/${path}`, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'iamtheneedle-feed/1.0' },
    });
    const body = await res.text();

    if (res.status === 429) {
        const reset = Number(res.headers.get('x-rate-limit-reset'));
        const when = Number.isFinite(reset) ? new Date(reset * 1000).toISOString() : 'unknown';
        throw new Error(`X API rate limit hit on /${path}; resets at ${when}`);
    }
    if (!res.ok) {
        throw new Error(`X API ${res.status} on /${path}: ${body.slice(0, 400)}`);
    }

    let json;
    try {
        json = JSON.parse(body);
    } catch {
        throw new Error(`X API returned non-JSON on /${path}: ${body.slice(0, 200)}`);
    }
    if (json.errors && !json.data) {
        throw new Error(`X API error on /${path}: ${JSON.stringify(json.errors).slice(0, 400)}`);
    }
    return json;
}

/**
 * An app-only bearer token, either handed to us directly or minted from the API
 * key and secret via OAuth 2.0 client credentials.
 */
async function resolveToken() {
    if (process.env.X_BEARER_TOKEN) return process.env.X_BEARER_TOKEN;

    const key = process.env.X_CONSUMER_KEY;
    const secret = process.env.X_SECRET_KEY;
    if (!key || !secret) {
        throw new Error('No credentials. Set X_BEARER_TOKEN, or X_CONSUMER_KEY and X_SECRET_KEY, or pass --render-only.');
    }

    const basic = Buffer.from(
        `${encodeURIComponent(key)}:${encodeURIComponent(secret)}`,
    ).toString('base64');

    const res = await fetch('https://api.x.com/oauth2/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: 'grant_type=client_credentials',
    });
    const body = await res.text();
    if (!res.ok) {
        throw new Error(`Could not mint a bearer token from X_CONSUMER_KEY/X_SECRET_KEY (${res.status}): ${body.slice(0, 300)}`);
    }

    const token = JSON.parse(body).access_token;
    if (!token) throw new Error('X returned no access_token for the client-credentials grant.');
    console.log('Minted an app-only bearer token from X_CONSUMER_KEY/X_SECRET_KEY.');
    return token;
}

async function fetchPosts(token) {
    const user = await api(`users/by/username/${encodeURIComponent(USERNAME)}`, token);
    if (!user.data?.id) throw new Error(`No X account found for @${USERNAME}`);

    const query = new URLSearchParams({
        max_results: String(Math.max(5, COUNT)),
        exclude: 'retweets,replies',
        'tweet.fields': 'created_at,entities',
    });
    const timeline = await api(`users/${user.data.id}/tweets?${query}`, token);
    const tweets = timeline.data || [];

    return tweets.slice(0, COUNT).map((t) => ({
        id: t.id,
        text: expandLinks(t.text, t.entities),
        created_at: t.created_at,
        url: `https://x.com/${USERNAME}/status/${t.id}`,
    }));
}

/** Swap t.co shorteners for the URLs they point at, so the text reads as written. */
function expandLinks(text, entities) {
    let out = text;
    for (const u of entities?.urls || []) {
        if (!u.url) continue;
        // A media attachment has no expanded form worth showing; drop its link.
        const replacement = u.expanded_url && !/^https:\/\/(x|twitter)\.com\/\w+\/status\/\d+\/(photo|video)\//.test(u.expanded_url)
            ? u.expanded_url
            : '';
        out = out.split(u.url).join(replacement);
    }
    return out.replace(/[ \t]+$/gm, '').trim();
}

/* ---------- rendering ---------- */

const escapeHtml = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Escape first, then turn URLs, @handles and #tags into links. */
function renderText(text) {
    let html = escapeHtml(text);
    html = html.replace(/https?:\/\/[^\s<]+[^\s<.,:;"')\]]/g, (url) => {
        const label = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
        return `<a href="${url}" rel="nofollow noopener">${label}</a>`;
    });
    html = html.replace(/(^|[^\w@/])@(\w{1,15})\b/g, (_, pre, handle) =>
        `${pre}<a href="https://x.com/${handle}" rel="nofollow noopener">@${handle}</a>`);
    html = html.replace(/(^|[^\w&])#(\w+)/g, (_, pre, tag) =>
        `${pre}<a href="https://x.com/hashtag/${tag}" rel="nofollow noopener">#${tag}</a>`);
    return html;
}

const DATE = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});

function renderBlock(feed) {
    const line = (depth, s) => INDENT + '    '.repeat(depth) + s;
    const out = [];

    if (!feed.posts.length) {
        out.push(line(0, '<div class="xbody">'));
        out.push(line(1, '<p class="xempty">'));
        out.push(line(2, 'The feed has not been written yet. The ten most recent posts are at'));
        out.push(line(2, `<a href="https://x.com/${feed.username}" rel="me noopener">x.com/${feed.username}</a>.`));
        out.push(line(1, '</p>'));
        out.push(line(0, '</div>'));
        return out.join('\n');
    }

    out.push(line(0, '<div class="xbody">'));
    out.push(line(1, '<ol class="xposts">'));
    for (const post of feed.posts) {
        const stamp = new Date(post.created_at);
        out.push(line(2, '<li class="xpost">'));
        out.push(line(3, '<div class="xpost-meta">'));
        out.push(line(4, `<span class="xhandle">@${feed.username}</span>`));
        out.push(line(4, `<time datetime="${stamp.toISOString()}">${DATE.format(stamp)}</time>`));
        out.push(line(4, `<a href="${post.url}" rel="nofollow noopener">Open &rarr;</a>`));
        out.push(line(3, '</div>'));
        out.push(line(3, `<p class="xpost-text">${renderText(post.text)}</p>`));
        out.push(line(2, '</li>'));
    }
    out.push(line(1, '</ol>'));
    out.push(line(0, '</div>'));

    const written = new Date(feed.fetched_at);
    out.push(line(0, '<div class="xfoot">'));
    out.push(line(1, `${feed.posts.length} post${feed.posts.length === 1 ? '' : 's'} &middot; written into this page `
        + `<time datetime="${written.toISOString()}">${DATE.format(written)}</time>`));
    out.push(line(0, '</div>'));

    return out.join('\n');
}

async function writePage(feed) {
    const page = await readFile(PAGE_FILE, 'utf8');
    const open = page.indexOf(START);
    const close = page.indexOf(END);
    if (open === -1 || close === -1 || close < open) {
        throw new Error(`Could not find ${START} / ${END} markers in index.html`);
    }

    const next = page.slice(0, open + START.length)
        + '\n' + renderBlock(feed) + '\n'
        + page.slice(close);

    if (next === page) return false;
    await writeFile(PAGE_FILE, next);
    return true;
}

/* ---------- entry ---------- */

async function main() {
    let feed;

    if (RENDER_ONLY) {
        feed = JSON.parse(await readFile(DATA_FILE, 'utf8'));
    } else {
        const posts = await fetchPosts(await resolveToken());
        if (!posts.length) throw new Error(`X returned no posts for @${USERNAME}; leaving the page as it is.`);

        feed = {
            username: USERNAME,
            profile: `https://x.com/${USERNAME}`,
            fetched_at: new Date().toISOString(),
            posts,
        };
        await writeFile(DATA_FILE, JSON.stringify(feed, null, 2) + '\n');
    }

    const changed = await writePage(feed);
    console.log(`${feed.posts.length} post(s) for @${feed.username}; index.html ${changed ? 'updated' : 'already current'}.`);
}

main().catch((err) => {
    console.error(`fetch-x-posts: ${err.message}`);
    process.exit(1);
});
