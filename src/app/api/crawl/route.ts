import { NextResponse } from "next/server";
import { chunkText } from "@/lib/chunk";
import { headers } from "next/headers";

export async function POST(req: Request) {
  try {
    const { url, collectionId, options } = await req.json();
    if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });

    const authHeader = req.headers.get("Authorization");

    const maxDepth = options?.maxDepth || 1;
    const maxPages = maxDepth === 3 ? 10 : maxDepth === 2 ? 5 : 1;
    
    let crawledPages = 0;
    const visited = new Set<string>();
    const queue = [url];
    let fullText = "";
    let mainTitle = "";
    
    const baseUrlObj = new URL(url);
    const domain = baseUrlObj.hostname;

    while (queue.length > 0 && crawledPages < maxPages) {
      const currentUrl = queue.shift()!;
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      try {
        const jinaUrl = `https://r.jina.ai/${currentUrl}`;
        const res = await fetch(jinaUrl, {
          headers: {
            "Accept": "application/json",
            "X-Return-Format": "markdown"
          }
        });
        
        if (!res.ok) continue;
        
        const data = await res.json();
        const title = data.data.title || currentUrl;
        const text = data.data.content || "";
        
        if (!mainTitle && title) mainTitle = title;
        
        fullText += `\n\n--- Page: ${title} (${currentUrl}) ---\n\n` + text;
        crawledPages++;

        // Find links in markdown
        if (crawledPages < maxPages) {
          // Markdown link regex: [text](url)
          const linkRegex = /\[[^\]]*\]\(([^)]+)\)/g;
          let match;
          while ((match = linkRegex.exec(text)) !== null) {
            let linkUrl = match[1];
            if (linkUrl.startsWith("/") || linkUrl.startsWith(url)) {
              try {
                const absoluteUrl = new URL(linkUrl, currentUrl).href;
                if (new URL(absoluteUrl).hostname === domain) {
                  if (options?.ignoreBlog && absoluteUrl.includes("/blog")) continue;
                  if (!visited.has(absoluteUrl)) {
                    queue.push(absoluteUrl);
                  }
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch", currentUrl, e);
      }
    }

    if (crawledPages === 0 || !fullText.trim()) {
      return NextResponse.json(
        { error: "Could not fetch any content from that URL. Check that it's reachable and not blocking crawlers." },
        { status: 422 }
      );
    }

    if (!mainTitle) mainTitle = url;

    // 3. Chunk text
    const chunks = chunkText(fullText, 500, 50);
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "Fetched the page but found no usable text content to index." },
        { status: 422 }
      );
    }
    const embeddedChunks = [];

    // 4. Generate Embeddings (calling our own local route internally)
    // In server components/routes, it's faster to just import the singleton if we wanted,
    // but fetching our own API route is simple enough since it runs on the same process in dev/vercel.
    // Actually, calling an absolute URL in Next.js API route is tricky without knowing the host.
    // Let's use the local import directly to save HTTP overhead.
    const { pipeline } = await import("@xenova/transformers");
    // We recreate the singleton locally for this file
    if (!(globalThis as any)._embedder_promise) {
      (globalThis as any)._embedder_promise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }
    const embedder = await (globalThis as any)._embedder_promise;

    for (const chunk of chunks) {
      const output = await embedder(chunk, { pooling: "mean", normalize: true });
      embeddedChunks.push({
        content: chunk,
        embedding: Array.from(output.data),
        tokenCount: Math.ceil(chunk.length / 4),
      });
    }

    // 5. Send to worker API (crawler endpoint)
    const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";
    const workerRes = await fetch(`${workerUrl}/knowledge/crawl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader || "",
      },
      body: JSON.stringify({
        url,
        title: mainTitle,
        content: fullText,
        collectionId,
        options,
        chunks: embeddedChunks,
        pagesFound: visited.size,
        pagesProcessed: crawledPages,
      }),
    });

    const data = await workerRes.json();
    if (!workerRes.ok) {
      return NextResponse.json(data, { status: workerRes.status });
    }
    return NextResponse.json({ ...data, pagesFound: visited.size, pagesProcessed: crawledPages });
  } catch (error: any) {
    console.error("Crawl error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
