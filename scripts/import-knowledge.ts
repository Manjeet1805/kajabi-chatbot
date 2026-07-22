import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

type KnowledgeItem = {
    id: string;
    type: "faq" | "course_content" | "general_info";
    category: string;
    module?: string;
    moduleNumber?: number;
    lesson?: string;
    title: string;
    content: string;
    tags: string[];
    questions?: string[];
};

type CourseLanguage = "de" | "en";

const openaiApiKey = process.env.OPENAI_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY fehlt.");
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase-Umgebungsvariablen fehlen.");
}

const openai = new OpenAI({
    apiKey: openaiApiKey,
});

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

function getCliArgument(name: string): string | undefined {
    const prefix = `--${name}=`;
    const argument = process.argv.find((value) => value.startsWith(prefix));

    return argument?.slice(prefix.length);
}

function getImportConfig() {
    const courseId =
        getCliArgument("course-id") ||
        process.env.COURSE_ID ||
        "dsu-de";

    const languageValue =
        getCliArgument("language") ||
        process.env.COURSE_LANGUAGE ||
        "de";

    const language: CourseLanguage =
        languageValue === "en" ? "en" : "de";

    const knowledgeFile =
        getCliArgument("file") ||
        process.env.KNOWLEDGE_FILE ||
        "data/knowledge-de.json";

    return {
        courseId,
        language,
        knowledgeFile,
    };
}

async function createEmbedding(item: KnowledgeItem) {
    const text = `
Module: ${item.module || ""}
Module number: ${item.moduleNumber || ""}
Lesson: ${item.lesson || ""}
Title: ${item.title}
Type: ${item.type}
Category: ${item.category}
Content: ${item.content}
Tags: ${item.tags.join(", ")}
Questions: ${(item.questions ?? []).join(" | ")}
`.trim();

    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
    });

    const embedding = response.data[0]?.embedding;

    if (!embedding) {
        throw new Error(`Kein Embedding für ${item.id} erhalten.`);
    }

    return embedding;
}

async function main() {
    const { courseId, language, knowledgeFile } = getImportConfig();

    const knowledgePath = path.resolve(process.cwd(), knowledgeFile);

    if (!fs.existsSync(knowledgePath)) {
        throw new Error(
            `Knowledge-Datei nicht gefunden: ${knowledgePath}`
        );
    }

    const raw = fs.readFileSync(knowledgePath, "utf8");
    const items = JSON.parse(raw) as KnowledgeItem[];

    if (!Array.isArray(items)) {
        throw new Error("Die Knowledge-Datei muss ein JSON-Array enthalten.");
    }

    console.log("Knowledge-Import gestartet");
    console.log(`Kurs: ${courseId}`);
    console.log(`Sprache: ${language}`);
    console.log(`Datei: ${knowledgeFile}`);
    console.log(`Einträge: ${items.length}`);
    console.log("");

    let imported = 0;
    let failed = 0;

    for (const item of items) {
        try {
            console.log(`Importiere: ${item.id}`);

            const embedding = await createEmbedding(item);

            const { error } = await supabase.from("knowledge").upsert(
                {
                    id: item.id,
                    course_id: courseId,
                    language,
                    type: item.type,
                    category: item.category,
                    module: item.module ?? null,
                    moduleNumber: item.moduleNumber ?? null,
                    lesson: item.lesson ?? null,
                    title: item.title,
                    content: item.content,
                    tags: item.tags,
                    questions: item.questions ?? [],
                    embedding,
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: "course_id,id",
                }
            );

            if (error) {
                throw error;
            }

            imported += 1;
            console.log(`Gespeichert: ${item.id}`);
        } catch (error) {
            failed += 1;
            console.error(`Fehler bei ${item.id}:`, error);
        }
    }

    console.log("");
    console.log("Import abgeschlossen.");
    console.log(`Erfolgreich: ${imported}`);
    console.log(`Fehlgeschlagen: ${failed}`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error("Import fehlgeschlagen:", error);
    process.exit(1);
});