import { pipeline, env } from "@xenova/transformers";
import { NextResponse } from "next/server";

// Ensure we don't use the local cache in serverless environments
env.useBrowserCache = false;
env.allowLocalModels = false;

import os from "os";
try {
  env.cacheDir = os.tmpdir();
} catch (e) {}

// Create a singleton pattern to avoid instantiating the pipeline multiple times
class PipelineSingleton {
  static task = "feature-extraction";
  static model = "Xenova/all-MiniLM-L6-v2";
  static instance: any = null;

  static async getInstance(progress_callback?: Function) {
    if (this.instance === null) {
      // @ts-ignore
      this.instance = pipeline(this.task, this.model, { progress_callback });
    }
    return this.instance;
  }
}

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required and must be a string." },
        { status: 400 }
      );
    }

    const embedder = await PipelineSingleton.getInstance();
    
    // Generate embeddings
    const output = await embedder(text, { pooling: "mean", normalize: true });
    
    // Convert to a regular Array
    const embeddingArray = Array.from(output.data);

    return NextResponse.json({ embedding: embeddingArray });
  } catch (error: any) {
    console.error("Embedding generation failed:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
