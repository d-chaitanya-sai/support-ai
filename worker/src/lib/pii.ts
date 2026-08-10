/** Mask common PII before sending text to LLMs or storing in logs. */
export function redactPii(text: string): string {
  if (!text) return text;
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g, "[PHONE]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[CARD]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]");
}

/** Basic prompt-injection / jailbreak shield for widget input. */
export function looksLikeJailbreak(text: string): boolean {
  const patterns = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
    /you\s+are\s+now\s+(dan|evil|unrestricted)/i,
    /system\s*:\s*you\s+are/i,
    /forget\s+(your|the)\s+(rules|prompt|instructions)/i,
    /\[INST\]|<<SYS>>|<\|im_start\|>/i,
  ];
  return patterns.some((p) => p.test(text));
}
