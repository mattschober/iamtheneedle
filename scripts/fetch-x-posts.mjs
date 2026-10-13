#!/usr/bin/env node
/**
 * Writes the most recent posts from an X account into index.html as plain HTML.
 *
 * The posts are not stacked in one feed box. index.html carries numbered slots --
 * <!-- X_POST:1:START --> ... <!-- X_POST:1:END --> -- spaced down the document, and
 * this script writes one post into each, newest first. Add or move a pair of markers
 * in the page and the next run follows; the number of slots is what decides how many
 * posts are fetched unless X_POST_COUNT says otherwise.
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
 *   X_POST_COUNT    how many posts to publish, 5-100. Default: the number of slots
 *                   found in index.html.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = join(ROOT, 'posts.json');
const PAGE_FILE = join(ROOT, 'index.html');

const slotStart = (n) => `<!-- X_POST:${n}:START -->`;
const slotEnd = (n) => `<!-- X_POST:${n}:END -->`;
const META_START = '<!-- X_POSTS:META:START -->';
const META_END = '<!-- X_POSTS:META:END -->';

const USERNAME = (process.env.X_USERNAME || 'migratewithmatt').replace(/^@/, '');
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

async function fetchPosts(token, count) {
    const user = await api(`users/by/username/${encodeURIComponent(USERNAME)}`, token);
    if (!user.data?.id) throw new Error(`No X account found for @${USERNAME}`);

    const query = new URLSearchParams({
        max_results: String(Math.max(5, count)),
        exclude: 'retweets,replies',
        'tweet.fields': 'created_at,entities',
    });
    const timeline = await api(`users/${user.data.id}/tweets?${query}`, token);
    const tweets = timeline.data || [];

    return tweets.slice(0, count).map((t) => ({
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

/** One post, as the markup that goes between a pair of slot markers. */
function renderPost(feed, post, position, total, indent) {
    const stamp = new Date(post.created_at);
    const line = (depth, str) => indent + '    '.repeat(depth) + str;
    const pad = (n) => String(n).padStart(2, '0');

    return [
        line(0, '<aside class="xdrop">'),
        line(1, '<div class="xdrop-meta">'),
        line(2, `<span class="xdrop-tag">Live signal &middot; ${pad(position)} / ${pad(total)}</span>`),
        line(2, `<span class="xhandle">@${feed.username}</span>`),
        line(2, `<time datetime="${stamp.toISOString()}">${DATE.format(stamp)}</time>`),
        line(2, `<a href="${post.url}" rel="nofollow noopener">Open on X &rarr;</a>`),
        line(1, '</div>'),
        line(1, `<p class="xdrop-text">${renderText(post.text)}</p>`),
        line(0, '</aside>'),
    ].join('\n');
}

/** A slot with no post to put in it: say so, and point at the profile. */
function renderEmptySlot(feed, position, total, indent) {
    const line = (depth, str) => indent + '    '.repeat(depth) + str;
    const pad = (n) => String(n).padStart(2, '0');

    return [
        line(0, '<aside class="xdrop is-empty">'),
        line(1, '<div class="xdrop-meta">'),
        line(2, `<span class="xdrop-tag">Live signal &middot; ${pad(position)} / ${pad(total)}</span>`),
        line(2, `<a href="https://x.com/${feed.username}" rel="me noopener">Open on X &rarr;</a>`),
        line(1, '</div>'),
        line(1, `<p class="xdrop-text">No post written into this slot yet. The account is at `
            + `<a href="https://x.com/${feed.username}" rel="me noopener">x.com/${feed.username}</a>.</p>`),
        line(0, '</aside>'),
    ].join('\n');
}

/** The line in section 01 that reports what the last run wrote. */
function renderMeta(feed, filled, indent) {
    const written = new Date(feed.fetched_at);
    return indent + `<p class="xmeta">${filled} post${filled === 1 ? '' : 's'} written into this page `
        + `<time datetime="${written.toISOString()}">${DATE.format(written)}</time>`
        + ` &middot; <a href="https://x.com/${feed.username}" rel="me noopener">x.com/${feed.username}</a>`
        + ` &middot; <a href="/posts.json">posts.json</a></p>`;
}

/** How many numbered slots index.html carries, counted from 1 upward. */
function countSlots(page) {
    let n = 0;
    while (page.includes(slotStart(n + 1)) && page.includes(slotEnd(n + 1))) n += 1;
    return n;
}

/**
 * Replace whatever sits between a pair of markers, keeping the markers and the
 * indentation the opening one was written at.
 */
function replaceRegion(page, start, end, render) {
    const open = page.indexOf(start);
    const close = page.indexOf(end);
    if (open === -1 || close === -1 || close < open) {
        throw new Error(`Could not find ${start} / ${end} markers in index.html`);
    }

    const indent = page.slice(page.lastIndexOf('\n', open) + 1, open);
    if (/\S/.test(indent)) {
        throw new Error(`${start} must be the first thing on its line in index.html`);
    }

    return page.slice(0, open + start.length)
        + '\n' + render(indent) + '\n' + indent
        + page.slice(close);
}

async function writePage(feed) {
    const page = await readFile(PAGE_FILE, 'utf8');
    const slots = countSlots(page);
    if (!slots) throw new Error('index.html carries no <!-- X_POST:1:START --> slot to write into.');

    let next = page;
    for (let i = 1; i <= slots; i += 1) {
        const post = feed.posts[i - 1];
        next = replaceRegion(next, slotStart(i), slotEnd(i), (indent) =>
            post
                ? renderPost(feed, post, i, slots, indent)
                : renderEmptySlot(feed, i, slots, indent));
    }

    const filled = Math.min(slots, feed.posts.length);
    next = replaceRegion(next, META_START, META_END, (indent) => renderMeta(feed, filled, indent));

    if (feed.posts.length > slots) {
        console.warn(`${feed.posts.length} post(s) for ${slots} slot(s); the oldest ${feed.posts.length - slots} were not published.`);
    } else if (feed.posts.length < slots) {
        console.warn(`${slots} slot(s) but only ${feed.posts.length} post(s); the rest say so on the page.`);
    }

    if (next === page) return { changed: false, slots, filled };
    await writeFile(PAGE_FILE, next);
    return { changed: true, slots, filled };
}

/* ---------- entry ---------- */

async function main() {
    let feed;

    if (RENDER_ONLY) {
        feed = JSON.parse(await readFile(DATA_FILE, 'utf8'));
    } else {
        // The page decides how many posts it has room for, unless asked otherwise.
        const slots = countSlots(await readFile(PAGE_FILE, 'utf8'));
        const count = Math.min(100, Math.max(5, Number(process.env.X_POST_COUNT) || slots || 10));

        const posts = await fetchPosts(await resolveToken(), count);
        if (!posts.length) throw new Error(`X returned no posts for @${USERNAME}; leaving the page as it is.`);

        feed = {
            username: USERNAME,
            profile: `https://x.com/${USERNAME}`,
            fetched_at: new Date().toISOString(),
            posts,
        };
        await writeFile(DATA_FILE, JSON.stringify(feed, null, 2) + '\n');
    }

    const { changed, slots, filled } = await writePage(feed);
    console.log(`${filled} of ${slots} slot(s) filled for @${feed.username}; index.html ${changed ? 'updated' : 'already current'}.`);
}

main().catch((err) => {
    console.error(`fetch-x-posts: ${err.message}`);
    process.exit(1);
});
