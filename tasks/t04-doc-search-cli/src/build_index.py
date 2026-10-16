#!/usr/bin/env python3
"""Build the T04 local passage index from the fetched Pharos docs corpus.

Input : corpus/llms-full.txt  (fetched live from https://docs.pharos.xyz/llms-full.txt)
        corpus/llms.txt        (fetched live from https://www.pharos.xyz/llms.txt)
        corpus/sitemap.md      (fetched live from https://docs.pharos.xyz/sitemap.md)
Output: index/index.json       (passages + BM25 statistics + retrieval manifest)

The index is committed so `pharos-docs` answers offline. Re-run to refresh.
"""
import json
import math
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(BASE, "corpus")
INDEX_PATH = os.path.join(BASE, "index", "index.json")


def norm(s):
    s = s.lower()
    s = s.replace("&", "and")
    s = re.sub(r"[^a-z0-9]", "", s)
    s = s.replace("and", "")
    return s


def load_title_urls():
    """Parse llms.txt markdown links -> title -> plain page URL."""
    title_url = {}
    txt = open(os.path.join(CORPUS, "llms.txt"), encoding="utf-8").read()
    for title, url in re.findall(r"\[([^\]]+)\]\((https://docs\.pharos\.xyz/[^)]+?)\)", txt):
        url = url.split("?")[0]
        if url.endswith(".md"):
            url = url[:-3]
        title_url.setdefault(norm(title), url)
    return title_url


def load_sitemap_slugs():
    """sitemap.md -> slug(normalized) -> plain page URL."""
    slugs = {}
    txt = open(os.path.join(CORPUS, "sitemap.md"), encoding="utf-8").read()
    for url in re.findall(r"https://docs\.pharos\.xyz/[^\s)]+", txt):
        url = url.split("?")[0].rstrip(")")
        if url.endswith(".md"):
            url = url[:-3]
        slug = url.rsplit("/", 1)[-1]
        slugs.setdefault(norm(slug), url)
    return slugs


ALIASES = {
    # Real pages the strict title/slug match cannot reach (verified by hand).
    "pharosmcp": "https://docs.pharos.xyz/tooling-and-infrastructure/mcp",
    "agentinstructions": "https://docs.pharos.xyz",
}


def url_for_title(title, title_urls, slugs):
    """Strict title/slug match only. Returns None for sub-sections that the
    full-corpus export renders as H1s (they fold into the parent page)."""
    if norm(title) in ALIASES:
        return ALIASES[norm(title)]
    if norm(title) in title_urls:
        return title_urls[norm(title)]
    if norm(title) in slugs:
        return slugs[norm(title)]
    return None


# Canonical citation URLs: the extensionless GitBook URL is the human page URL,
# EXCEPT readme pages, which GitBook redirects to the space root — the .md
# form is the only stable URL that serves the page content (verified 2026-10-16).
CANONICAL_OVERRIDES = {
    "https://docs.pharos.xyz/introduction/readme":
        "https://docs.pharos.xyz/introduction/readme.md",
}


def sitemap_urls():
    """Doc-page URLs in sitemap (TOC) order; the full-corpus export follows
    the same TOC order, so pages are attributed POSITIONALLY (verified:
    72/72 align). This correctly disambiguates duplicate titles such as the
    Foundry/Hardhat 'Write Your First ...' guides."""
    txt = open(os.path.join(CORPUS, "sitemap.md"), encoding="utf-8").read()
    urls = re.findall(r"https://docs\.pharos\.xyz/[^\s)?]+(?:\.md)", txt)
    out = []
    for u in urls:
        if u.startswith("https://docs.pharos.xyz/index"):
            continue  # ask-endpoint template, not a doc page
        u = u.split("?")[0]
        if u.endswith(".md"):
            u = u[:-3]
        out.append(CANONICAL_OVERRIDES.get(u, u))
    return out


def split_pages(full):
    """Split llms-full.txt into (h1_title, body) pages on '# ' headings."""
    pages, cur_title, cur_lines = [], None, []
    for line in full.splitlines():
        m = re.match(r"^# (.+?)\s*$", line)
        if m:
            if cur_title is not None:
                pages.append((cur_title, "\n".join(cur_lines).strip()))
            cur_title, cur_lines = m.group(1), []
        elif cur_title is not None:
            cur_lines.append(line)
    if cur_title is not None:
        pages.append((cur_title, "\n".join(cur_lines).strip()))
    return pages


def clean_text(t):
    """Strip heavy markdown chrome but keep quoted text verbatim-able."""
    t = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", t)          # images
    t = re.sub(r"<img[^>]*>", "", t)
    t = re.sub(r"<figcaption>.*?</figcaption>", "", t, flags=re.S)
    t = re.sub(r"<[^>]+>", "", t)                       # stray tags
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)       # links -> label text
    t = re.sub(r"\*\*([^*]+)\*\*", r"\1", t)
    t = re.sub(r"__([^_]+)__", r"\1", t)
    t = re.sub(r"`([^`]+)`", r"\1", t)
    t = re.sub(r"^#{1,6}\s*", "", t, flags=re.M)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def make_passages(title, body):
    """Split a page into passages on ## sections, then paragraphs; 200-1200 chars."""
    secs, cur_h, cur = [], "", []
    for line in body.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            if cur:
                secs.append((cur_h, "\n".join(cur).strip()))
            cur_h, cur = m.group(1), []
        else:
            cur.append(line)
    if cur:
        secs.append((cur_h, "\n".join(cur).strip()))
    if not secs:
        secs = [("", body)]

    passages = []
    for h, text in secs:
        text = clean_text(text)
        if len(text) < 60:
            continue
        # merge paragraphs into chunks
        paras = [p.strip() for p in text.split("\n\n") if p.strip()]
        buf = ""
        for p in paras:
            if len(buf) + len(p) + 2 <= 1200:
                buf = (buf + "\n\n" + p).strip()
            else:
                if len(buf) >= 200:
                    passages.append((h, buf))
                buf = p if len(p) <= 1400 else p[:1400]
        if len(buf) >= 200:
            passages.append((h, buf))
        elif buf and passages:
            last_h, last_b = passages[-1]
            passages[-1] = (last_h, (last_b + "\n\n" + buf)[:1400])
    return passages


def normalize_for_index(s):
    """Normalize known compounds before tokenizing (quotes keep original text)."""
    s = s.lower()
    s = s.replace("chainid", "chain id")
    s = s.replace("chain-id", "chain id")
    s = s.replace("crosschain", "cross chain")
    return s


def tokenize(s):
    return re.findall(r"[a-z0-9]{2,}", normalize_for_index(s))


def main():
    retrieval_date = open(os.path.join(CORPUS, "manifest.json"), encoding="utf-8")
    manifest = json.load(retrieval_date)
    ret_date = manifest["retrieved"]
    full = open(os.path.join(CORPUS, "llms-full.txt"), encoding="utf-8").read()

    title_urls = load_title_urls()
    slugs = load_sitemap_slugs()

    passages, pages_out, continuations = [], [], 0
    pages = split_pages(full)
    cur_title, cur_body = None, []
    for title, body in pages:
        url = url_for_title(title, title_urls, slugs)
        if url is None:
            # Unmapped H1: a sub-section rendered as H1; fold it into the
            # current page so nothing is dropped and citations stay correct.
            if cur_title is None:
                continue  # nothing to fold into (shouldn't happen)
            cur_body.append("\n\n# " + title + "\n" + body)
            continuations += 1
            continue
        if cur_title is not None:
            pages_out.append((cur_title, "\n".join(cur_body)))
        cur_title, cur_body = title, [body]

    if cur_title is not None:
        pages_out.append((cur_title, "\n".join(cur_body)))

    # Positional attribution: full-corpus TOC order == sitemap TOC order.
    agent_pages = [p for p in pages_out if norm(p[0]) == "agentinstructions"]
    doc_pages = [p for p in pages_out if norm(p[0]) != "agentinstructions"]
    urls = sitemap_urls()
    if len(doc_pages) != len(urls):
        print(f"FATAL: positional mapping mismatch: {len(doc_pages)} pages vs {len(urls)} sitemap URLs")
        sys.exit(1)
    # sanity: strict URL (where available) must equal positional URL,
    # except for duplicate titles whose strict match is inherently ambiguous.
    from collections import Counter
    counts = Counter(norm(t) for (t, _) in pages_out)
    for (title, _), pos_url in zip(doc_pages, urls):
        if counts[norm(title)] > 1:
            continue
        strict_url = url_for_title(title, title_urls, slugs)
        if strict_url and CANONICAL_OVERRIDES.get(strict_url, strict_url) != pos_url:
            print(f"FATAL: positional/strict disagreement on {title!r}: {pos_url} vs {strict_url}")
            sys.exit(1)
    attributed = [(t, u) for (t, _), u in zip(doc_pages, urls)]
    attributed += [(t, "https://docs.pharos.xyz") for (t, _) in agent_pages]

    # llms.txt itself is a fetched live doc (the task's starting point) and
    # carries the authoritative "Defaults" recommendations (Chainlink, ZAN,
    # CCIP, Foundry/Hardhat) that the full corpus does not repeat.
    llms_txt = open(os.path.join(CORPUS, "llms.txt"), encoding="utf-8").read()
    attributed.append(("Pharos Documentation Index",
                       "https://www.pharos.xyz/llms.txt"))
    pages_out.append(("Pharos Documentation Index", llms_txt))

    for title, url in attributed:
        body = dict((t, b) for t, b in pages_out)[title]
        for h, text in make_passages(title, body):
            passages.append({
                "page_title": title,
                "section": h,
                "page_url": url,
                "text": text,
                "retrieved": ret_date,
            })

    # BM25 stats (stdlib only)
    N = len(passages)
    doc_tfs, doc_lens, df = [], [], {}
    for p in passages:
        toks = tokenize(p["text"])
        tf = {}
        for t in toks:
            tf[t] = tf.get(t, 0) + 1
        doc_tfs.append(tf)
        doc_lens.append(len(toks))
        for t in tf:
            df[t] = df.get(t, 0) + 1
    avgdl = sum(doc_lens) / N
    idf = {t: math.log(1 + (N - n + 0.5) / (n + 0.5)) for t, n in df.items()}
    for i, p in enumerate(passages):
        p["tf"] = doc_tfs[i]
        p["len"] = doc_lens[i]

    os.makedirs(os.path.dirname(INDEX_PATH), exist_ok=True)
    index = {
        "built_from": manifest,
        "passage_count": N,
        "avgdl": avgdl,
        "idf": idf,
        "passages": passages,
    }
    json.dump(index, open(INDEX_PATH, "w", encoding="utf-8"))

    print(f"pages parsed: {len(split_pages(full))}")
    print(f"pages indexed: {len(pages_out)}")
    print(f"passages indexed: {N}")
    print(f"folded sub-sections: {continuations}")
    print(f"index written: {INDEX_PATH}")


if __name__ == "__main__":
    main()
