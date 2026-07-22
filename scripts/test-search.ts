import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { searchKnowledge } from "../lib/vector-search";

async function main() {
    const results = await searchKnowledge(
        "Wie melde ich ein Gewerbe an?"
    );

    console.log(JSON.stringify(results, null, 2));
}

main();