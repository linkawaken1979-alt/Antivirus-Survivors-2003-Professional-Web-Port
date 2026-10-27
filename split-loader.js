
(() => {
    "use strict";

    const nativeFetch = window.fetch.bind(window);
    const cache = new Map();

    async function combineParts(url) {
        const key = url.href;

        if (cache.has(key)) {
            return cache.get(key);
        }

        const promise = (async () => {
            const chunks = [];
            let totalBytes = 0;

            for (let i = 0; i < 1000; i++) {
                const part = new URL(url.href);
                part.pathname += ".part" + String(i).padStart(3, "0");

                const response = await nativeFetch(part.href);

                if (response.status === 404 && i > 0) {
                    break;
                }

                if (!response.ok) {
                    throw new Error(
                        `Could not load ${part.pathname}: HTTP ${response.status}`
                    );
                }

                const data = await response.arrayBuffer();

                if (data.byteLength === 0) {
                    throw new Error(`Empty chunk: ${part.pathname}`);
                }

                chunks.push(data);
                totalBytes += data.byteLength;

                console.log(
                    `[SplitLoader] ${part.pathname}: ` +
                    `${data.byteLength.toLocaleString()} bytes`
                );
            }

            if (chunks.length === 1000) {
                throw new Error("Part limit reached.");
            }

            const combined = new Uint8Array(totalBytes);
            let offset = 0;

            for (const chunk of chunks) {
                combined.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
            }

            console.log(
                `[SplitLoader] Combined ${url.pathname}: ` +
                `${chunks.length} parts, ${totalBytes} bytes`
            );

            return combined;
        })();

        cache.set(key, promise);

        try {
            return await promise;
        } catch (error) {
            cache.delete(key);
            throw error;
        }
    }

    window.fetch = async function (input, init) {
        const requestUrl = input instanceof Request
            ? input.url
            : String(input);

        const url = new URL(requestUrl, document.baseURI);
        const path = url.pathname.toLowerCase();

        if (
            !path.endsWith(".pck") &&
            !path.endsWith(".side.wasm")
        ) {
            return nativeFetch(input, init);
        }

        console.log(`[SplitLoader] Intercepting ${url.pathname}`);

        const data = await combineParts(url);

        return new Response(data, {
            status: 200,
            headers: {
                "Content-Type": path.endsWith(".wasm")
                    ? "application/wasm"
                    : "application/octet-stream"
            }
        });
    };

    console.log("[SplitLoader] Ready");
})();
