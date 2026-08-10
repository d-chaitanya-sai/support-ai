export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketIntent =
  | "Refund"
  | "Bug"
  | "Feature Request"
  | "Sales"
  | "Billing"
  | "Technical"
  | "Account"
  | "Complaint"
  | "General";
export type TicketSentiment = "happy" | "neutral" | "angry";
export type TicketUrgency = "low" | "medium" | "high" | "critical";

export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
  widgetId: string;
  createdAt: number;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  intent?: TicketIntent;
  sentiment?: TicketSentiment;
  urgency?: TicketUrgency;
  language?: string;
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  assignedTo?: string;
  aiSummary?: string;
  aiSuggestedReply?: string;
  aiSuggestedSolution?: string;
  tags?: string[];
  csat?: number | null;
  agentActive?: boolean;
  widgetId?: string | null;
  resolutionCode?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationEvent {
  id: string;
  kind: "widget" | "reply";
  speaker?: "customer" | "ai" | "agent";
  role: string;
  senderName: string;
  content: string;
  createdAt: number;
}

export interface TicketReply {
  id: string;
  ticketId: string;
  senderId?: string;
  senderName?: string;
  message: string;
  messageEn?: string;
  language?: string;
  createdAt: number;
}

export interface WidgetMessage {
  id: string;
  widgetId: string;
  role: "user" | "assistant";
  content: string;
  originalLanguage?: string;
  type?: "text" | "confirm_ticket" | "auto_ticket";
  ticketDraft?: TicketDraft;
  createdAt: number;
}

export interface TicketDraft {
  title: string;
  description: string;
  priority: TicketPriority;
  category: string;
  intent?: TicketIntent;
  urgency?: TicketUrgency;
  sentiment?: TicketSentiment;
  customerIssue?: string;
  suggestedSolution?: string;
}

// Knowledge Base types
export type KnowledgeDocStatus =
  | "uploading"
  | "chunking"
  | "embedding"
  | "ready"
  | "failed";
export type KnowledgeDocType =
  | "pdf"
  | "docx"
  | "txt"
  | "markdown"
  | "html"
  | "csv"
  | "url"
  | "faq";

export interface KnowledgeCollection {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  createdAt: number;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  type: KnowledgeDocType;
  collectionId?: string;
  collectionName?: string;
  sourceUrl?: string;
  status: KnowledgeDocStatus;
  chunkCount: number;
  embeddingCount: number;
  tokenCount?: number;
  aiSummary?: string;
  aiKeywords?: string[];
  aiTags?: string[];
  metadata?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeFaq {
  id: string;
  question: string;
  answer: string;
  collectionId?: string;
  tags?: string[];
  priority: number;
  createdAt: number;
}

export interface CrawlJob {
  id: string;
  url: string;
  status: "pending" | "running" | "completed" | "failed";
  pagesFound: number;
  pagesProcessed: number;
  collectionId?: string;
  options?: {
    maxDepth: number;
    ignoreBlog: boolean;
    ignoreImages: boolean;
    autoRefreshWeekly: boolean;
  };
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
}

export interface SearchLog {
  id: string;
  query: string;
  retrievedChunks: number;
  responseTime: number;
  tokens: number;
  userId?: string;
  createdAt: number;
}

export interface SearchResult {
  chunk: KnowledgeChunk & { similarity: number; documentTitle: string };
  document: KnowledgeDocument;
}

export interface KnowledgeSettings {
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  similarityThreshold: number;
  maxContext: number;
  autoReindex: boolean;
  embeddingModel: string;
}
