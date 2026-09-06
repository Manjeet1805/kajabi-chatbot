import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { z } from "zod";
import {
    chatDailyRateLimit,
    chatMinuteRateLimit,
} from "@/lib/rate-limit";
import { courseConfig } from "@/lib/course-config";
import {
    isPdfFileName,
    MAX_PDF_FILE_SIZE,
    MAX_PDF_UPLOAD_REQUEST_SIZE,
    PDF_FILE_ID_PATTERN,
    sanitizePdfFileName,
} from "@/lib/pdf-attachments";
import {
    createPdfFileToken,
    verifyPdfFileToken,
} from "@/lib/pdf-file-token";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const DeletePdfSchema = z.object({
    fileId: z.string().regex(PDF_FILE_ID_PATTERN),
    name: z.string().min(1).max(120),
    size: z.number().int().positive().max(MAX_PDF_FILE_SIZE),
    token: z.string().regex(/^[a-f0-9]{64}$/),
});

function getClientIp(req: NextRequest): string {
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");

    if (forwardedFor) {
        return forwardedFor.split(",")[0].trim();
    }

    if (realIp) {
        return realIp;
    }

    return "unknown";
}

function isAllowedOrigin(req: NextRequest): boolean {
    const origin = req.headers.get("origin");

    if (!origin) {
        return process.env.NODE_ENV !== "production";
    }

    return courseConfig.allowedOrigins.includes(origin);
}

async function checkPdfRateLimit(req: NextRequest) {
    const clientIp = getClientIp(req);
    const rateLimitIdentifier = `${courseConfig.id}:pdf:${clientIp}`;

    const [minuteLimitResult, dailyLimitResult] = await Promise.all([
        chatMinuteRateLimit.limit(rateLimitIdentifier),
        chatDailyRateLimit.limit(rateLimitIdentifier),
    ]);

    return minuteLimitResult.success && dailyLimitResult.success;
}

function isPdfMimeType(file: File): boolean {
    return (
        file.type === "application/pdf" ||
        file.type === "application/x-pdf"
    );
}

function hasPdfHeader(buffer: Buffer): boolean {
    return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

export async function POST(req: NextRequest) {
    try {
        if (!isAllowedOrigin(req)) {
            return NextResponse.json(
                { error: courseConfig.messages.forbidden },
                { status: 403 }
            );
        }

        if (!(await checkPdfRateLimit(req))) {
            return NextResponse.json(
                { error: courseConfig.messages.rateLimit },
                { status: 429 }
            );
        }

        const contentLength = Number(
            req.headers.get("content-length") ?? 0
        );

        if (
            Number.isFinite(contentLength) &&
            contentLength > MAX_PDF_UPLOAD_REQUEST_SIZE
        ) {
            return NextResponse.json(
                { error: "PDF_TOO_LARGE" },
                { status: 413 }
            );
        }

        const formData = await req.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
            return NextResponse.json(
                { error: "PDF_UPLOAD_FAILED" },
                { status: 400 }
            );
        }

        const filename = sanitizePdfFileName(file.name);

        if (
            !isPdfMimeType(file) ||
            !isPdfFileName(filename) ||
            file.size <= 0
        ) {
            return NextResponse.json(
                { error: "PDF_TYPE_NOT_ALLOWED" },
                { status: 400 }
            );
        }

        if (file.size > MAX_PDF_FILE_SIZE) {
            return NextResponse.json(
                { error: "PDF_TOO_LARGE" },
                { status: 413 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        if (!hasPdfHeader(buffer)) {
            return NextResponse.json(
                { error: "PDF_TYPE_NOT_ALLOWED" },
                { status: 400 }
            );
        }

        const uploadedFile = await openai.files.create({
            file: await toFile(buffer, filename, {
                type: "application/pdf",
            }),
            purpose: "user_data",
            expires_after: {
                anchor: "created_at",
                seconds: 3600,
            },
        });

        return NextResponse.json({
            fileId: uploadedFile.id,
            name: filename,
            size: file.size,
            token: createPdfFileToken(
                uploadedFile.id,
                filename,
                file.size
            ),
        });
    } catch (error) {
        console.error("PDF upload error:", error);

        return NextResponse.json(
            { error: "PDF_UPLOAD_FAILED" },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    try {
        if (!isAllowedOrigin(req)) {
            return NextResponse.json(
                { error: courseConfig.messages.forbidden },
                { status: 403 }
            );
        }

        const parsed = DeletePdfSchema.safeParse(await req.json());

        if (!parsed.success) {
            return NextResponse.json(
                { error: "INVALID_PDF_REFERENCE" },
                { status: 400 }
            );
        }

        const { fileId, name, size, token } = parsed.data;

        if (!verifyPdfFileToken(fileId, name, size, token)) {
            return NextResponse.json(
                { error: "INVALID_PDF_REFERENCE" },
                { status: 400 }
            );
        }

        await openai.files.delete(fileId);

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("PDF delete error:", error);

        return NextResponse.json({ ok: true });
    }
}
