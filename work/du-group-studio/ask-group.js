(() => {
  const byId = (id) => document.getElementById(id);
  const panel = byId("ask-panel");
  const opener = byId("ask-open");
  const input = byId("ask-question");
  const status = byId("ask-status");
  const result = byId("ask-result");
  const answer = byId("ask-answer");
  const citations = byId("ask-citations");
  const retry = byId("ask-retry");
  const suggestions = byId("ask-suggestions");
  let controller;
  let requestId = 0;
  let lastQuestion = "";

  opener.addEventListener("click", () => {
    panel.showModal();
    opener.setAttribute("aria-expanded", "true");
    input.focus();
    if (location.protocol === "file:") {
      status.classList.remove("ask-sr-only");
      status.textContent =
        "这张书桌需要本地服务帮忙找资料。请打开 http://127.0.0.1:4174/index.html，再来问我。";
    }
  });
  byId("ask-close").addEventListener("click", () => panel.close());
  panel.addEventListener("close", () => {
    requestId++;
    controller?.abort();
    result.removeAttribute("aria-busy");
    if (status.textContent === "正在翻找组内资料…")
      status.textContent = "已收起，可以继续提问。";
    opener.setAttribute("aria-expanded", "false");
    opener.focus({ preventScroll: true });
  });

  function fileLink(value) {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value, location.href);
      return url.origin === location.origin &&
        url.pathname === "/api/file" &&
        /^https?:$/.test(url.protocol)
        ? url.href
        : null;
    } catch {
      return null;
    }
  }

  async function ask(question) {
    question = question.trim();
    if (!question) {
      input.focus();
      return;
    }
    input.value = question;
    lastQuestion = question;
    controller?.abort();
    const current = ++requestId;
    controller = new AbortController();
    const activeController = controller;
    retry.hidden = true;
    result.hidden = true;
    citations.replaceChildren();
    byId("ask-intro").hidden = true;
    status.classList.remove("ask-sr-only");
    status.textContent = "正在翻找组内资料…";
    result.setAttribute("aria-busy", "true");
    if (location.protocol === "file:") {
      status.textContent =
        "这张书桌需要本地服务帮忙找资料。请打开 http://127.0.0.1:4174/index.html，再来问我。";
      result.removeAttribute("aria-busy");
      return;
    }
    const timeout = setTimeout(() => activeController.abort(), 20000);
    try {
      const response = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: activeController.signal,
      });
      if (!response.ok) throw new Error("request");
      const data = await response.json();
      if (current !== requestId) return;
      if (typeof data.answer !== "string" || !Array.isArray(data.citations))
        throw new Error("response");
      answer.textContent = data.answer;
      for (const citation of data.citations) {
        const href = fileLink(citation.url);
        if (!href) continue;
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const extension = String(citation.fileName || "")
          .split(".")
          .pop()
          .toUpperCase();
        link.textContent =
          extension === "PDF"
            ? "打开 PDF ↗"
            : ["PPT", "PPTX"].includes(extension)
              ? `下载 ${extension} ↗`
              : "打开原件 ↗";
        const action = link.textContent;
        link.title = citation.fileName || citation.title || "原始文件";
        if (data.citations.length > 1) {
          const shortTitle = document.createElement("span");
          shortTitle.className = "ask-file-title";
          const title = String(
            citation.title || citation.fileName || "",
          ).replace(/\.[a-z0-9]+$/i, "");
          shortTitle.textContent =
            title.length > 56 ? title.slice(0, 56) + "…" : title;
          link.append(shortTitle);
        }
        if (["PPT", "PPTX"].includes(extension))
          link.download = citation.fileName;
        const meta = document.createElement("small");
        meta.textContent = [citation.date, citation.presenter]
          .filter(Boolean)
          .join(" · ");
        link.setAttribute(
          "aria-label",
          [action, meta.textContent, citation.fileName || citation.title]
            .filter(Boolean)
            .join("，"),
        );
        link.append(meta);
        item.append(link);
        citations.append(item);
      }
      result.hidden = false;
      suggestions.hidden = true;
      status.classList.add("ask-sr-only");
      status.textContent = data.answer;
    } catch {
      if (current !== requestId) return;
      status.textContent = activeController.signal.aborted
        ? "找得有点久，请再试一次。"
        : "暂时没能连上资料服务，请再试一次。";
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      if (current === requestId) result.removeAttribute("aria-busy");
    }
  }
  byId("ask-form").addEventListener("submit", (event) => {
    event.preventDefault();
    ask(input.value);
  });
  document.querySelectorAll(".ask-suggestions button").forEach((button) => {
    button.addEventListener("click", () => ask(button.textContent));
  });
  retry.addEventListener("click", () => ask(lastQuestion));
})();
