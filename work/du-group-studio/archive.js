(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let catalog = null;
  const sections = {
    meetings: {
      summary: "按日期查组会，按汇报人找论文与幻灯片。",
      placeholder: "搜索汇报人、论文题目或文件名",
    },
    resources: {
      summary: "按分类查找组内资料与参考文档。",
      placeholder: "搜索资料名称或分类",
    },
    albums: {
      summary: "按活动与日期翻看相册。",
      placeholder: "搜索活动或照片名称",
    },
  };
  let active = Object.hasOwn(sections, location.hash.slice(1))
    ? location.hash.slice(1)
    : "meetings";
  let demo = false;
  let realSnapshot = null;
  let serverSource = false;
  const demoImages = Array.from(
    $("sample-scenes").content.querySelectorAll("img"),
    (image) => image.dataset.src,
  );
  const demoAsset = (name) => ({ name, demo: true });
  const demoCatalog = {
    meetings: [
      {
        date: "2026-11-20",
        title: "论文讨论",
        talks: [
          {
            presenter: "汇报人 A",
            title: "研究问题与方法比较",
            papers: [demoAsset("论文 PDF")],
            slides: [demoAsset("讲解 PPTX")],
          },
          {
            presenter: "汇报人 B",
            title: "实验设计与结果分析",
            papers: [demoAsset("论文 PDF")],
            slides: [demoAsset("讲解 PPTX")],
          },
        ],
      },
      {
        date: "2026-11-13",
        title: "研究进展交流",
        talks: [
          {
            presenter: "汇报人 C",
            title: "阶段进展与下一步工作",
            papers: [],
            slides: [demoAsset("讲解 PPTX")],
          },
        ],
      },
    ],
    resources: [
      {
        title: "论文修改检查表",
        category: "写作经验",
        asset: demoAsset("论文修改检查表.pdf"),
      },
      {
        title: "论文排版模板",
        category: "论文模板",
        asset: demoAsset("论文排版模板.dotx"),
      },
      {
        title: "算法学习笔记",
        category: "算法教学",
        asset: demoAsset("算法学习笔记.pdf"),
      },
      {
        title: "学术讲座记录",
        category: "讲座分享",
        asset: demoAsset("学术讲座记录.pdf"),
      },
      {
        title: "arXiv 论文检索",
        category: "常用网站",
        href: "https://arxiv.org/",
      },
    ],
    albums: [
      {
        date: "2026-11-20",
        title: "秋日漫步",
        photos: [1, 2, 3].map((index) => ({
          name: ["林间小径", "秋叶", "湖面"][index - 1],
          demo: true,
          previewIndex: index - 1,
        })),
      },
    ],
    issues: [],
  };
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
    if (asset.demo)
      return demo && Number.isInteger(asset.previewIndex)
        ? demoImages[asset.previewIndex] || null
        : null;
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
    if (demo && asset.demo) return node("span", asset.name, "demo-asset");
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
  function showPhoto(index) {
    photoIndex = (index + photos.length) % photos.length;
    const asset = photos[photoIndex];
    $("full-photo").src = url(asset);
    $("full-photo").alt = asset.name;
    $("photo-caption").textContent =
      `${photoIndex + 1} / ${photos.length} · ${asset.name}`;
    $("previous").disabled = $("next").disabled = photos.length < 2;
    const strip = $("filmstrip");
    strip.replaceChildren();
    const first = Math.max(0, Math.min(photoIndex - 3, photos.length - 7));
    for (let i = first; i < Math.min(photos.length, first + 7); i++) {
      const button = node("button");
      button.type = "button";
      button.setAttribute(
        "aria-label",
        "第 " + (i + 1) + " 张：" + photos[i].name,
      );
      button.setAttribute("aria-pressed", String(i === photoIndex));
      const thumbnail = node("img");
      thumbnail.src = url(photos[i]);
      thumbnail.alt = "";
      button.append(thumbnail);
      button.addEventListener("click", () => {
        showPhoto(i);
        strip
          .querySelector('[aria-pressed="true"]')
          .focus({ preventScroll: true });
      });
      strip.append(button);
    }
    if (!viewer.open) viewer.showModal();
  }
  function matches(item) {
    const text = [
      item.title,
      item.category,
      item.asset?.name,
      item.href,
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
  const meetingState = { real: new Map(), demo: new Map() };
  function renderMeetings(items, results) {
    const state = demo ? meetingState.demo : meetingState.real;
    const filtered = ["query", "year", "from", "until"].some(
      (id) => $(id).value,
    );
    let month = "";
    let folderList;
    items.forEach((item, index) => {
      const nextMonth = item.date.slice(0, 7);
      if (month !== nextMonth) {
        month = nextMonth;
        const group = node("section", undefined, "chronology");
        const label = node("h2", undefined, "month-stamp");
        label.append(
          node("small", item.date.slice(0, 4)),
          node("strong", item.date.slice(5, 7)),
          node("span", "月"),
        );
        group.setAttribute("aria-label", month);
        folderList = node("div", undefined, "month-folders");
        group.append(label, folderList);
        results.append(group);
      }
      const key = item.id || item.date + "|" + item.title;
      const folder = node("details", undefined, "meeting-folder");
      folder.dataset.meeting = key;
      folder.open = filtered || (state.has(key) ? state.get(key) : index === 0);
      folder.addEventListener("toggle", () => {
        if (folder.isConnected && !filtered) state.set(key, folder.open);
      });
      const summary = node("summary", undefined, "meeting-summary");
      const date = node("time", item.date, "meeting-date");
      date.dateTime = item.date;
      summary.append(
        node("span", undefined, "folder-icon"),
        date,
        node("span", item.title, "meeting-title"),
        node(
          "span",
          item.talks.reduce(
            (count, talk) => count + talk.papers.length + talk.slides.length,
            0,
          ) + " 份文件",
          "meeting-count",
        ),
      );
      const talks = node("div", undefined, "meeting-talks");
      const needle = $("query").value.trim().toLocaleLowerCase();
      const visibleTalks =
        !needle || item.title.toLocaleLowerCase().includes(needle)
          ? item.talks
          : item.talks.filter((talk) =>
              [
                talk.presenter,
                talk.title,
                ...talk.papers.map((a) => a.name),
                ...talk.slides.map((a) => a.name),
              ]
                .join(" ")
                .toLocaleLowerCase()
                .includes(needle),
            );
      visibleTalks.forEach((talk) => {
        const section = node("section", undefined, "talk");
        if (talk.presenter)
          section.append(node("p", talk.presenter, "presenter"));
        if (talk.presenter) section.append(node("h3", talk.title));
        else section.classList.add("loose-files");
        const attachments = node("div", undefined, "talk-assets");
        [
          [talk.papers, "阅读论文"],
          [talk.slides, "下载 PPT"],
        ].forEach(([assets, label]) => {
          assets.forEach((asset, assetIndex) => {
            const link = assetLink(asset);
            link.textContent =
              !talk.presenter || assets.length > 1
                ? asset.name.replaceAll("_", " ")
                : label + (assets.length > 1 ? " " + (assetIndex + 1) : "");
            if (label === "下载 PPT" && link.tagName === "A") {
              link.download = asset.name;
              link.removeAttribute("target");
            }
            link.dataset.format =
              asset.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase() ||
              (label === "下载 PPT" ? "PPT" : "PDF");
            link.title = asset.name;
            link.setAttribute("aria-label", label + "：" + asset.name);
            attachments.append(link);
          });
        });
        if (!attachments.childElementCount)
          attachments.append(node("span", "资料待补充", "missing"));
        section.append(attachments);
        talks.append(section);
      });
      folder.append(summary, talks);
      folderList.append(folder);
    });
  }
  function resourceLink(item) {
    if (item.asset) {
      const link = assetLink(item.asset);
      link.textContent = /\.pdf$/i.test(item.asset.name) ? "打开" : "下载";
      link.title = item.asset.name;
      return link;
    }
    try {
      const target = new URL(item.href);
      if (!/^https?:$/.test(target.protocol)) throw new Error();
      const link = node("a", "打开 ↗");
      link.href = target.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      return link;
    } catch {
      return node("span", "链接不可用", "missing");
    }
  }
  function render() {
    const resources = active === "resources";
    $("collection-title").textContent = {
      meetings: "组会文件夹",
      resources: "组内资料库",
      albums: "活动相册",
    }[active];
    $("section-summary").textContent = sections[active].summary;
    $("query").placeholder = sections[active].placeholder;
    document
      .querySelectorAll("[data-tab]")
      .forEach((tab) =>
        tab.setAttribute("aria-pressed", String(tab.dataset.tab === active)),
      );
    $("preview-toggle").textContent = demo ? "退出示例" : "查看排版示例";
    $("preview-toggle").setAttribute("aria-pressed", String(demo));
    $("preview-status").hidden = !demo;
    $("category-label").hidden = !resources;
    $("date-filters").hidden = resources;
    const results = $("results");
    results.className = active;
    results.replaceChildren();
    $("empty").hidden = !!catalog && catalog[active].length > 0;
    if (!$("empty").hidden) {
      const sample = node("div", undefined, "sample-shelf");
      const action = node(
        "button",
        "查看" +
          { meetings: "组会", resources: "资料库", albums: "相册" }[active] +
          "样例　↗",
      );
      action.type = "button";
      action.addEventListener("click", () => $("preview-toggle").click());
      sample.append(action);
      if (active === "resources") {
        const index = node("div", undefined, "topic-swatches");
        demoCatalog.resources.forEach((item, i) => {
          const tab = node("button", item.category);
          tab.type = "button";
          tab.setAttribute("aria-label", "查看" + item.category + "样例");
          tab.style.setProperty("--slot", i);
          tab.addEventListener("click", () => {
            $("preview-toggle").click();
            $("category").value = item.category;
            render();
            $("category").focus({ preventScroll: true });
          });
          index.append(tab);
        });
        sample.append(index);
      } else if (active === "albums") {
        const stack = node("span", undefined, "album-sample");
        demoImages.slice(0, 3).forEach((src) => {
          const img = node("img");
          img.src = src;
          img.alt = "";
          stack.append(img);
        });
        action.prepend(stack);
      }
      $("empty").replaceChildren(sample);
    }
    if (!catalog) {
      $("result-status").textContent = "";
      return;
    }
    const reel = $("date-reel");
    reel.replaceChildren();
    if (!resources) {
      const dates = [...new Set(catalog[active].map((item) => item.date))]
        .sort()
        .reverse()
        .slice(0, 8);
      dates.forEach((date) => {
        const day = node("button");
        day.type = "button";
        day.setAttribute("aria-label", date);
        day.setAttribute(
          "aria-pressed",
          String($("from").value === date && $("until").value === date),
        );
        day.append(
          node("small", date.slice(0, 7).replace("-", " / ")),
          node("strong", date.slice(-2)),
        );
        day.addEventListener("click", () => {
          $("year").value = "";
          $("from").value = $("until").value = date;
          $("date-filters").open = false;
          render();
          $("date-filters").querySelector("summary").focus();
        });
        reel.append(day);
      });
    }
    $("date-caption").textContent =
      $("from").value && $("from").value === $("until").value
        ? $("from").value.slice(5).replace("-", "/")
        : "日期";
    const items = catalog[active].filter(matches);
    if (!resources) items.sort((a, b) => b.date.localeCompare(a.date));
    $("result-status").textContent =
      `${demo ? "排版示例 · " : ""}显示 ${items.length} / ${catalog[active].length} 条`;
    $("result-status").classList.toggle(
      "sr-only",
      !(
        $("query").value ||
        $("from").value ||
        $("until").value ||
        $("year").value ||
        $("category").value
      ),
    );
    if (!items.length && $("empty").hidden)
      results.append(node("p", "没有匹配结果，试试清除筛选。", "empty"));
    if (active === "meetings") {
      renderMeetings(items, results);
      return;
    }
    let previousCategory = null;
    let topicItems;
    if (resources)
      items.sort(
        (a, b) =>
          a.category.localeCompare(b.category, "zh-CN") ||
          a.title.localeCompare(b.title, "zh-CN"),
      );
    items.forEach((item) => {
      if (resources && item.category !== previousCategory) {
        const group = node("section", undefined, "topic-group");
        group.append(node("h2", item.category || "未分类", "category-heading"));
        topicItems = node("div", undefined, "topic-items");
        group.append(topicItems);
        results.append(group);
        previousCategory = item.category;
      }
      const card = node("article", undefined, "record");
      if (resources) {
        card.classList.add("resource-row");
        const extension = item.asset?.name
          .match(/\.([^.]+)$/)?.[1]
          ?.toUpperCase();
        card.append(
          node("span", item.asset ? extension || "文件" : "网站", "file-kind"),
          node("span", item.title, "resource-title"),
          resourceLink(item),
        );
      } else {
        const date = node("time", undefined, "date");
        date.dateTime = item.date;
        date.append(
          node("span", item.date.slice(0, 7).replace("-", " / "), "date-month"),
          node("strong", item.date.slice(8), "date-day"),
        );
        const content = node("div", undefined, "record-content");
        content.append(node("h2", item.title));
        const available = item.photos.filter((photo) => url(photo));
        content.append(
          node(
            "p",
            item.photos.length + " 张照片 · 点击照片翻阅",
            "record-meta",
          ),
        );
        const grid = node("div", undefined, "gallery");
        available.slice(0, 4).forEach((asset, index) => {
          const button = node("button", undefined, "photo");
          button.type = "button";
          button.setAttribute(
            "aria-label",
            "查看 " +
              asset.name +
              "，第 " +
              (index + 1) +
              " 张，共 " +
              available.length +
              " 张",
          );
          const img = node("img");
          img.src = url(asset);
          img.alt = asset.name;
          img.loading = "lazy";
          button.append(
            img,
            node(
              "span",
              index === 3 && available.length > 4
                ? "查看全部 " + available.length + " 张 →"
                : asset.name,
            ),
          );
          button.addEventListener("click", () => {
            photos = available;
            showPhoto(index);
          });
          grid.append(button);
        });
        content.append(grid);
        card.append(date, content);
      }
      (resources ? topicItems : results).append(card);
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
  function acceptCatalog(next, status, server, preview = false) {
    const wasDemo = demo;
    if (!preview) realSnapshot = null;
    demo = preview;
    serverSource = server;
    if ($("archive-management").open) $("archive-management").close();
    const previousFilters =
      server && catalog && !preview && !wasDemo
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
      $("count-" + key).textContent = catalog[key].length || "";
    });
    const latest = next.meetings.reduce(
      (date, item) => (item.date > date ? item.date : date),
      "",
    );
    $("calendar-day").textContent = latest ? latest.slice(-2) : "–";
    $("library-status").textContent = status;
    $("privacy").textContent = server
      ? "新增文件后点刷新，即可同步目录。"
      : localPrivacy;
    $("refresh").hidden = !server;
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
  function leaveDemo() {
    if (!demo) return;
    const saved = realSnapshot;
    acceptCatalog(saved.catalog, saved.status, saved.server);
    Object.entries(saved.filters).forEach(([id, value]) => {
      $(id).value = value;
    });
    render();
  }
  $("preview-toggle").addEventListener("click", () => {
    if (demo) {
      leaveDemo();
      return;
    }
    ++loadVersion;
    realSnapshot = {
      catalog: catalog || {
        meetings: [],
        resources: [],
        albums: [],
        issues: [],
      },
      status: $("library-status").textContent,
      server: serverSource,
      filters: Object.fromEntries(
        ["query", "year", "from", "until", "category"].map((id) => [
          id,
          $(id).value,
        ]),
      ),
    };
    acceptCatalog(demoCatalog, realSnapshot.status, serverSource, true);
  });
  $("refresh").addEventListener("click", () => {
    leaveDemo();
    loadServer(true);
  });
  $("folder").addEventListener("change", async (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    if (!files.length) return;
    const version = ++loadVersion;
    leaveDemo();
    try {
      const entries = files.map((file) => ({
        path: file.webkitRelativePath.split("/").slice(1).join("/"),
        file,
      }));
      const next = await window.TeamArchive.prepareCatalog(entries);
      if (version !== loadVersion) return;
      acceptCatalog(
        next,
        `已读取 ${files[0].webkitRelativePath.split("/")[0]} · ${files.length} 个文件`,
        false,
      );
    } catch (error) {
      if (version !== loadVersion) return;
      $("library-status").textContent =
        "读取失败：" + error.message + "。请检查目录后重新选择。";
    }
  });
  document.querySelectorAll("[data-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      if (active !== button.dataset.tab) {
        reset();
        active = button.dataset.tab;
        location.hash = active;
        render();
      }
    }),
  );
  addEventListener("hashchange", () => {
    active = Object.hasOwn(sections, location.hash.slice(1))
      ? location.hash.slice(1)
      : "meetings";
    render();
  });
  ["query", "year", "from", "until", "category"].forEach((id) =>
    $(id).addEventListener("input", render),
  );
  document.addEventListener("keydown", (event) => {
    if (
      event.key !== "/" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      document.querySelector("dialog[open]") ||
      event.target.closest("input, textarea, select, [contenteditable=true]")
    )
      return;
    event.preventDefault();
    $("query").focus();
  });
  $("reset").addEventListener("click", () => {
    reset();
    render();
  });
  $("close-photo").addEventListener("click", () => viewer.close());
  $("previous").addEventListener("click", () => showPhoto(photoIndex - 1));
  $("next").addEventListener("click", () => showPhoto(photoIndex + 1));
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const insideStrip = $("filmstrip").contains(document.activeElement);
      event.preventDefault();
      showPhoto(photoIndex + (event.key === "ArrowRight" ? 1 : -1));
      if (insideStrip)
        $("filmstrip")
          .querySelector('[aria-pressed="true"]')
          .focus({ preventScroll: true });
    }
  });
  addEventListener("pagehide", release);
  addEventListener("pageshow", (event) => {
    if (event.persisted) render();
  });
  render();
  const initialLoad = /^https?:$/.test(location.protocol)
    ? loadServer()
    : Promise.resolve();
  if (new URLSearchParams(location.search).get("view") === "example") {
    initialLoad.then(() => {
      if (!demo) $("preview-toggle").click();
    });
  }
})();
