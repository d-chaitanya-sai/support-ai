import { NextResponse } from "next/server";
import mammoth from "mammoth";


export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = file.name.split(".").pop()?.toLowerCase();
    
    let text = "";

    if (ext === "pdf") {
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (ext === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      // For txt, md, html, csv
      text = await file.text();
    }

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "Could not extract text from file" }, { status: 400 });
    }

    // Clean up null characters to prevent PostgreSQL errors
    text = text.replace(/\0/g, "");

    return NextResponse.json({ text });
  } catch (error: any) {
    console.error("Parse error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
