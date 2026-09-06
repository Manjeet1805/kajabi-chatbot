import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const courseId = process.env.COURSE_ID?.trim() || "dsu-de";

if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt.");
}

if (!supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt.");
}

const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    }
);

type KnowledgeSearchResult = {
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

async function main() {
    const query =
        process.argv.slice(2).join(" ").trim() ||
        "Wie melde ich ein Gewerbe an?";

    const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
    });

    const embedding = embeddingResponse.data[0]?.embedding;

    if (!embedding) {
        throw new Error("Für die Suchanfrage konnte kein Embedding erstellt werden.");
    }

    const { data, error } = await supabase.rpc("match_knowledge", {
        query_embedding: embedding,
        match_count: 8,
        filter_course_id: courseId,
    });

    if (error) {
        console.error("Knowledge search failed:", error);
        throw new Error("Die Wissensdatenbank konnte nicht durchsucht werden.");
    }

    const results = ((data ?? []) as KnowledgeSearchResult[])
        .filter((item) => item.similarity >= 0.25)
        .slice(0, 5);

    console.log(JSON.stringify(results, null, 2));
}

main();
