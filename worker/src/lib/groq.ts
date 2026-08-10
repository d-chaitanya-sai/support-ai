import Groq from "groq-sdk";
import type { Env } from "../index";

export const MODEL = "llama-3.3-70b-versatile";

let _groq: Groq | null = null;

export function getGroq(env: Env): Groq {
  if (!_groq) {
    _groq = new Groq({ apiKey: env.GROQ_API_KEY });
  }
  return _groq;
}
