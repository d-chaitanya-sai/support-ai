import Groq from "groq-sdk";

if (!process.env.GROQ_API_KEY) {
  console.warn("Missing GROQ_API_KEY environment variable");
}

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

export const MODEL = "llama-3.3-70b-versatile"; // Configurable standard model
