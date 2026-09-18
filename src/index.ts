import * as cheerio from "cheerio";
import { join } from "path";

const TARGET_URL: string = process.env.TARGET_URL || "https://univ-pau-planning2026-27.hyperplanning.fr";
const PORT: number = parseInt(process.env.PORT || "3000");

const USER_AGENT: string = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FOSSNOTE_PREFIX: string = "fossnote";

const injectMods = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const response = await fetch(url, options);

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("text/html"))
        return response;

    const glob = new Bun.Glob("**/*.{js,css}");

    const mods = {
        js: [] as string[],
        css: [] as string[]
    }

    for await (const file of glob.scan({ cwd: "mods" })) {
        const ext = file.split(".").pop();
        switch (ext) {
            case "js":
                mods.js.push(`/${FOSSNOTE_PREFIX}/${file}`);
                break;
            case "css":
                mods.css.push(`/${FOSSNOTE_PREFIX}/${file}`);
                break;
        }
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    mods.js.forEach(js => {
        $("body").append(`<script src="${js}"></script>`);
    });

    mods.css.forEach(css => {
        $("head").append(`<link rel="stylesheet" href="${css}">`);
    });

    const modifiedHtml = $.html();

    return new Response(modifiedHtml, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
    });
};

const server = Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname.startsWith(`/${FOSSNOTE_PREFIX}/`)) {
            const targetPath: string = url.pathname.replace(`/${FOSSNOTE_PREFIX}/`, "");
            const file = Bun.file(`mods/${targetPath}`);
            if (await file.exists()) return new Response(file);
        }

        const targetUrl = `${TARGET_URL}${url.pathname}${url.search}`;

        if (url.pathname === "/") return Response.redirect("/hp/invite", 302);

        const forwardHeaders = new Headers(req.headers);
        forwardHeaders.set("User-Agent", USER_AGENT);
        forwardHeaders.delete("host");

        const response = await injectMods(targetUrl, {
            method: req.method,
            headers: forwardHeaders,
            body: req.body,
        });

        const responseHeaders = new Headers(response.headers);
        responseHeaders.delete("content-encoding");
        responseHeaders.delete("content-length");

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });
    }
});

console.log(`Server running at ${server.url}`);