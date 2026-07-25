(function () {
    if (window.__kajabiChatbotLoaded) {
        return;
    }

    window.__kajabiChatbotLoaded = true;

    const pathname = window.location.pathname.toLowerCase();

    const blockedPaths = [
        "/login",
        "/member-login",
        "/signin",
        "/sign-in"
    ];

    const isBlockedPage = blockedPaths.some(function (path) {
        return pathname === path || pathname.startsWith(path + "/");
    });

    if (isBlockedPage) {
        return;
    }

    const currentScript = document.currentScript;

    if (!currentScript || !currentScript.src) {
        console.error(
            "Kajabi Chatbot: Script URL konnte nicht ermittelt werden."
        );
        return;
    }

    const scriptUrl = new URL(currentScript.src);
    const chatbotOrigin = scriptUrl.origin;

    const iframe = document.createElement("iframe");

    iframe.src = `${chatbotOrigin}/embed`;
    iframe.title = "DSU AI Chatbot";

    iframe.style.position = "fixed";
    iframe.style.right = "20px";
    iframe.style.bottom = "20px";
    iframe.style.width = "128px";
    iframe.style.height = "128px";
    iframe.style.border = "0";
    iframe.style.zIndex = "999999";
    iframe.style.background = "transparent";
    iframe.style.overflow = "hidden";

    iframe.setAttribute("allowtransparency", "true");
    iframe.setAttribute("allow", "clipboard-write");
    iframe.setAttribute("loading", "eager");

    document.body.appendChild(iframe);

    window.addEventListener(
        "message",
        function (event) {
            if (event.origin !== chatbotOrigin) {
                return;
            }

            if (
                !event.data ||
                event.data.type !==
                "KAJABI_CHATBOT_SIZE"
            ) {
                return;
            }

            if (
                typeof event.data.width !==
                "string" ||
                typeof event.data.height !==
                "string"
            ) {
                return;
            }

            iframe.style.width = event.data.width;
            iframe.style.height = event.data.height;
        }
    );
})();
