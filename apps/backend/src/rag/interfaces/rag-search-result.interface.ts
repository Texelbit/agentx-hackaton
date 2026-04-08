export interface RagSearchResult {
  id: string;
  collection: string;
  source: string | null;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}
