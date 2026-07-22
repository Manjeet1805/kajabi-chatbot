import "server-only";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";
import { courseConfig } from "@/lib/course-config";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export type KnowledgeSearchResult = {
    id: string;
    type: string;
    category: string;
    course_id: string;
    language: string;
    module?: string;
    moduleNumber?: number;
    lesson?: string;
    title: string;
    content: string;
    tags: string[];
    similarity: number;
};

export async function searchKnowledge(
    query: string
): Promise<KnowledgeSearchResult[]> {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
        return [];
    }

    const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: normalizedQuery,
    });

    const embedding = embeddingResponse.data[0]?.embedding;

    if (!embedding) {
        throw new Error("Für die Suchanfrage konnte kein Embedding erstellt werden.");
    }

    const { data, error } = await supabase.rpc("match_knowledge", {
        query_embedding: embedding,
        match_count: 8,
        filter_course_id: courseConfig.id,
    });

    if (error) {
        console.error("Knowledge search failed:", error);
        throw new Error("Die Wissensdatenbank konnte nicht durchsucht werden.");
    }

    return ((data ?? []) as KnowledgeSearchResult[])
        .filter((item) => item.similarity >= 0.25)
        .slice(0, 5);
}