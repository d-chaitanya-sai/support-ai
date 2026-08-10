import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required and must be a string." },
        { status: 400 }
      );
    }

    const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";
    const res = await fetch(`${workerUrl}/ai/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Worker embed failed:", errorText);
      throw new Error(`Worker returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json({ embedding: data.embedding });
  } catch (error: any) {
    console.error("Embedding generation failed:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
