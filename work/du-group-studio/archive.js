(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let catalog = null;
  let active = "meetings";
  const urls = new Map();
  let photos = [];
  let photoIndex = 0;
  const viewer = $("photo-viewer");
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function url(asset) {
    if (!asset.file) {
      if (!asset.url || !/^https?:$/.test(location.protocol)) return null;
      try {
        const remote = new URL(asset.url, location.href);
        return remote.origin === location.origin &&
          remote.pathname === "/api/file"
          ? remote.href
          : null;
      } catch {
        return null;
      }
    }
    if (!urls.has(asset.file))
      urls.set(asset.file, URL.createObjectURL(asset.file));
    return urls.get(asset.file);
  }
  function release() {
    if (viewer.open) viewer.close();
    $("full-photo").removeAttribute("src");
    urls.forEach((value) => URL.revokeObjectURL(value));
    urls.clear();
  }
  function assetLink(asset) {
    const href = url(asset);
    if (!href) return node("span", asset.name + "（文件不可用）", "missing");
    const link = node("a", asset.name);
    link.href = href;
    if (/\.pdf$/i.test(asset.name)) {
      link.target = "_blank";
      link.rel = "noopener";
      link.append(" ↗");
      link.setAttribute("aria-label", asset.name + "，在新标签页打开 PDF");
    } else {
      link.download = asset.name;
      link.append(" ↓");
    }
    return link;
  }
  function assetRows(container, label, assets) {
    if (!assets.length) {
      container.append(node("p", "暂缺" + label, "missing"));
      return;
    }
    assets.forEach((asset) => {
      const row = node("div", undefined, "asset-row");
      row.append(node("strong", label), assetLink(asset));
      container.append(row);
    });
  }
  function showPhoto(index) {
    photoIndex = (index + photos.length) % photos.length;
    const asset = photos[photoIndex];
    $("full-photo").src = url(asset);
    $("full-photo").alt = asset.name;
    $("photo-caption").textContent =
      `${photoIndex + 1} / ${photos.length} · ${asset.name}`;
    $("previous").disabled = $("next").disabled = photos.length < 2;
    if (!viewer.open) viewer.showModal();
  }
  function matches(item) {
    const text = [
      item.title,
      item.category,
      ...(item.photos || []).map((photo) => photo.name),
      ...(item.talks || []).flatMap((talk) => [
        talk.presenter,
        talk.title,
        ...talk.papers.map((a) => a.name),
        ...talk.slides.map((a) => a.name),
      ]),
    ]
      .join(" ")
      .toLocaleLowerCase();
    if (!text.includes($("query").value.trim().toLocaleLowerCase()))
      return false;
    if (active === "resources")
      return !$("category").value || item.category === $("category").value;
    const date = item.date || "";
    return (
      (!$("year").value || date.startsWith($("year").value)) &&
      (!$("from").value || date >= $("from").value) &&
      (!$("until").value || date <= $("until").value)
    );
  }
  function render() {
    const resources = active === "resources";
    $("category-label").hidden = !resources;
    ["year", "from", "until"].forEach((id) => {
      $(id).parentElement.hidden = resources;
    });
    const results = $("results");
    results.replaceChildren();
    $("empty").hidden =
      !!catalog &&
      ["meetings", "resources", "albums"].some((key) => catalog[key].length);
    if (!catalog) {
      $("result-status").textContent = "";
      return;
    }
    const items = catalog[active].filter(matches);
    if (!resources) items.sort((a, b) => b.date.localeCompare(a.date));
    $("result-status").textContent =
      `显示 ${items.length} / ${catalog[active].length} 条`;
    if (!items.length && $("empty").hidden)
      results.append(
        node(
          "p",
          "没有符合条件的记录。可清除筛选，或检查所选文件夹中的目录。",
          "empty",
        ),
      );
    items.forEach((item) => {
      const card = node("article", undefined, "record");
      card.append(
        node("div", item.date || item.category || "未分类", "date"),
        node("h2", item.title),
      );
      if (active === "meetings") {
        if (!item.talks.length)
          card.append(node("p", "尚无分享资料", "missing"));
        item.talks.forEach((talk) => {
          const section = node("section", undefined, "talk");
          section.append(
            node(
              "h3",
              [talk.presenter, talk.title].filter(Boolean).join(" · "),
            ),
          );
          assetRows(section, "论文", talk.papers);
          assetRows(section, "幻灯片", talk.slides);
          card.append(section);
        });
      } else if (resources) card.append(assetLink(item.asset));
      else {
        const grid = node("div", undefined, "gallery");
        item.photos.forEach((asset, index) => {
          if (!url(asset)) return;
          const button = node("button", undefined, "photo");
          button.type = "button";
          const img = node("img");
          img.src = url(asset);
          img.alt = asset.name;
          img.loading = "lazy";
          button.append(img, node("span", asset.name));
          button.addEventListener("click", () => {
            photos = item.photos.filter((photo) => url(photo));
            showPhoto(photos.indexOf(asset));
          });
          grid.append(button);
        });
        card.append(grid);
      }
      results.append(card);
    });
  }
  function options(id, values, first) {
    $(id).replaceChildren(
      new Option(first, ""),
      ...values.map((value) => new Option(value, value)),
    );
  }
  function reset() {
    ["query", "year", "from", "until", "category"].forEach((id) => {
      $(id).value = "";
    });
  }
  const localPrivacy = $("privacy").textContent;
  function acceptCatalog(next, status, server) {
    const previousFilters =
      server && catalog
        ? Object.fromEntries(
            ["query", "year", "from", "until", "category"].map((id) => [
              id,
              $(id).value,
            ]),
          )
        : null;
    release();
    catalog = next;
    reset();
    options(
      "year",
      [
        ...new Set(
          [...catalog.meetings, ...catalog.albums]
            .map((item) => (item.date || "").slice(0, 4))
            .filter(Boolean),
        ),
      ]
        .sort()
        .reverse(),
      "全部年份",
    );
    options(
      "category",
      [
        ...new Set(
          catalog.resources.map((item) => item.category).filter(Boolean),
        ),
      ].sort(),
      "全部分类",
    );
    if (previousFilters) {
      for (const [id, value] of Object.entries(previousFilters)) {
        const field = $(id);
        if (
          !field.options ||
          [...field.options].some((option) => option.value === value)
        )
          field.value = value;
      }
    }
    ["meetings", "resources", "albums"].forEach((key) => {
      $("count-" + key).textContent = catalog[key].length;
    });
    $("library-status").textContent = status;
    $("privacy").textContent = server
      ? "正在浏览服务器上的档案目录。材料留在服务器，刷新页面后仍可读取；“刷新档案”会重新读取目录。也可选择本地文件夹临时浏览。"
      : localPrivacy;
    $("issues").hidden = !catalog.issues.length;
    $("issue-list").replaceChildren(
      ...catalog.issues.map((issue) => node("li", issue)),
    );
    render();
  }
  let loadVersion = 0;
  async function loadServer(manual = false) {
    const version = ++loadVersion;
    $("refresh").disabled = true;
    try {
      const response = await fetch("/api/archive", { cache: "no-store" });
      if (!response.ok) throw new Error("目录接口不可用");
      const next = await response.json();
      if (
        !["meetings", "resources", "albums", "issues"].every((key) =>
          Array.isArray(next[key]),
        )
      )
        throw new Error("目录格式不正确");
      if (version !== loadVersion) return;
      acceptCatalog(next, "已连接服务器档案目录", true);
      $("refresh").hidden = false;
    } catch (error) {
      if (manual && version === loadVersion)
        $("library-status").textContent =
          "刷新失败：" + error.message + "。当前资料保持可用。";
    } finally {
      $("refresh").disabled = false;
    }
  }
  $("refresh").addEventListener("click", () => loadServer(true));
  $("folder").addEventListener("change", (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    if (!files.length) return;
    ++loadVersion;
    try {
      const entries = files.map((file) => ({
        path: file.webkitRelativePath.split("/").slice(1).join("/"),
        file,
      }));
      const next = window.TeamArchive.buildCatalog(entries);
      acceptCatalog(
        next,
        `已读取 ${files[0].webkitRelativePath.split("/")[0]} · ${files.length} 个文件`,
        false,
      );
    } catch (error) {
      $("library-status").textContent =
        "读取失败：" + error.message + "。请检查目录后重新选择。";
    }
  });
  document.querySelectorAll("[data-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      active = button.dataset.tab;
      document
        .querySelectorAll("[data-tab]")
        .forEach((tab) =>
          tab.setAttribute("aria-pressed", String(tab === button)),
        );
      render();
    }),
  );
  ["query", "year", "from", "until", "category"].forEach((id) =>
    $(id).addEventListener("input", render),
  );
  $("reset").addEventListener("click", () => {
    reset();
    render();
  });
  $("close-photo").addEventListener("click", () => viewer.close());
  $("previous").addEventListener("click", () => showPhoto(photoIndex - 1));
  $("next").addEventListener("click", () => showPhoto(photoIndex + 1));
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      showPhoto(photoIndex + (event.key === "ArrowRight" ? 1 : -1));
    }
  });
  addEventListener("pagehide", release);
  addEventListener("pageshow", (event) => {
    if (event.persisted) render();
  });
  render();
  if (/^https?:$/.test(location.protocol)) loadServer();
})();
