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
        title: "论文阅读笔记",
        category: "论文阅读",
        asset: demoAsset("论文阅读笔记 PDF"),
      },
      {
        title: "文献整理方法",
        category: "论文阅读",
        asset: demoAsset("文献整理方法 PDF"),
      },
      {
        title: "学术写作提纲",
        category: "学术写作",
        asset: demoAsset("学术写作提纲 PDF"),
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
  let selectedMeeting = "";
  let selectedTalk = 0;
  function renderMeetings(items, results) {
    if (!items.length) return;
    const key = (item) => item.id || item.date + "|" + item.title;
    const query = $("query").value.trim().toLocaleLowerCase();
    if (query) {
      items = items.map((item) => {
        if (item.title.toLocaleLowerCase().includes(query)) return item;
        return {
          ...item,
          talks: item.talks.filter((talk) =>
            [
              talk.title,
              talk.presenter,
              ...talk.papers.map((p) => p.name),
              ...talk.slides.map((p) => p.name),
            ].some((text) => text.toLocaleLowerCase().includes(query)),
          ),
        };
      });
    }
    let meeting =
      items.find((item) => key(item) === selectedMeeting) || items[0];
    selectedMeeting = key(meeting);
    selectedTalk = Math.min(
      selectedTalk,
      Math.max(0, meeting.talks.length - 1),
    );
    const layout = node("div", undefined, "screening-room");
    const timeline = node("nav", undefined, "meeting-timeline");
    timeline.setAttribute("aria-label", "按日期选择组会");
    items.forEach((item) => {
      const button = node("button", undefined, "meeting-choice");
      button.type = "button";
      button.setAttribute("aria-pressed", String(item === meeting));
      const date = node("time", item.date.replaceAll("-", "."));
      date.dateTime = item.date;
      button.append(date, node("span", item.title));
      button.addEventListener("click", () => {
        selectedMeeting = key(item);
        selectedTalk = 0;
        render();
      });
      timeline.append(button);
    });
    const stage = node("section", undefined, "paper-stage");
    stage.id = "paper-stage";
    stage.tabIndex = 0;
    stage.setAttribute("aria-label", "论文放映室，左右方向键切换汇报");
    const toolbar = node("div", undefined, "stage-toolbar");
    toolbar.append(
      node("span", "组会", "stage-label"),
      node("time", meeting.date.replaceAll("-", "."), "stage-date"),
    );
    const presenters = node("div", undefined, "presenter-tabs");
    presenters.setAttribute("aria-label", "选择汇报人");
    const frame = node("div", undefined, "paper-frame");
    frame.id = "paper-frame";
    frame.setAttribute("aria-live", "polite");
    const footer = node("div", undefined, "stage-footer");
    const counter = node("span", undefined, "stage-counter");
    const arrows = node("div", undefined, "stage-arrows");
    const previous = node("button", "←", "stage-arrow");
    const next = node("button", "→", "stage-arrow");
    previous.type = next.type = "button";
    previous.id = "paper-previous";
    next.id = "paper-next";
    previous.setAttribute("aria-label", "上一项汇报");
    next.setAttribute("aria-label", "下一项汇报");
    function paint() {
      frame.replaceChildren();
      const talk = meeting.talks[selectedTalk];
      counter.textContent = meeting.talks.length
        ? String(selectedTalk + 1).padStart(2, "0") +
          " / " +
          String(meeting.talks.length).padStart(2, "0")
        : "尚无分享资料";
      previous.disabled = next.disabled = meeting.talks.length < 2;
      [...presenters.children].forEach((button, index) =>
        button.setAttribute("aria-pressed", String(index === selectedTalk)),
      );
      if (!talk) return;
      const poster = node("div", undefined, "paper-poster");
      frame.dataset.variant = String(selectedTalk % 2);
      const coverUrl = talk.cover && url(talk.cover);
      if (coverUrl) {
        const image = node("img", undefined, "paper-cover");
        image.src = coverUrl;
        image.alt = talk.title + " · 论文图示";
        image.addEventListener(
          "error",
          () => {
            image.parentElement?.remove();
            poster.classList.add("abstract-poster");
          },
          { once: true },
        );
        const zoom = node("button", undefined, "diagram-zoom");
        zoom.type = "button";
        zoom.title = "放大论文原图";
        zoom.setAttribute("aria-label", talk.title + "，放大图示");
        zoom.append(image, node("span", "⤢", "zoom-glyph"));
        zoom.addEventListener("click", () => {
          const dialog = $("diagram-dialog");
          const enlarged = dialog.querySelector("img");
          enlarged.src = coverUrl;
          enlarged.alt = image.alt;
          dialog.showModal();
        });
        poster.append(zoom);
      } else poster.classList.add("abstract-poster");

      const details = node("div", undefined, "paper-details");
      details.append(
        node("p", talk.presenter, "paper-presenter"),
        node("h2", talk.title, "paper-title"),
      );
      const attachments = node("div", undefined, "paper-attachments");
      talk.papers.forEach((asset, index) => {
        const link = assetLink(asset);
        link.classList.add("paper-read");
        if (link.tagName === "A")
          link.textContent =
            (index ? "阅读论文 " + (index + 1) : "阅读论文") + " ↗";
        attachments.append(link);
      });
      if (!talk.papers.length)
        attachments.append(node("span", "论文待补充", "paper-missing"));
      talk.slides.forEach((asset) => {
        const link = assetLink(asset);
        link.classList.add("paper-slides");
        attachments.append(link);
      });
      if (!talk.slides.length)
        attachments.append(node("span", "幻灯片待补充", "paper-missing"));
      details.append(attachments);
      frame.append(poster, details);
    }
    function move(delta) {
      if (meeting.talks.length < 2) return;
      selectedTalk =
        (selectedTalk + delta + meeting.talks.length) % meeting.talks.length;
      paint();
    }
    meeting.talks.forEach((talk, index) => {
      const button = node("button", talk.presenter, "presenter-tab");
      button.type = "button";
      button.addEventListener("click", () => {
        selectedTalk = index;
        paint();
      });
      presenters.append(button);
    });
    previous.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    stage.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowRight" ? 1 : -1);
      }
    });
    let touchStart;
    frame.addEventListener(
      "touchstart",
      (event) => {
        touchStart = event.touches.length === 1 ? event.touches[0] : null;
      },
      { passive: true },
    );
    frame.addEventListener(
      "touchend",
      (event) => {
        const end = event.changedTouches[0];
        if (!touchStart || !end) return;
        const dx = end.clientX - touchStart.clientX;
        if (
          Math.abs(dx) > 60 &&
          Math.abs(end.clientY - touchStart.clientY) < Math.abs(dx) / 2
        )
          move(dx < 0 ? 1 : -1);
        touchStart = null;
      },
      { passive: true },
    );
    arrows.append(previous, next);
    footer.append(counter, arrows);
    toolbar.append(presenters, footer);
    stage.append(toolbar, frame);
    layout.append(stage);
    if (items.length > 1) layout.append(timeline);
    results.append(layout);
    paint();
  }
  function render() {
    const resources = active === "resources";
    $("collection-title").textContent = {
      meetings: "组会放映室",
      resources: "组内资料库",
      albums: "活动影集",
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
    const examples = {
      meetings: [
        "暂无组会记录",
        "组会 / YYYY-MM-DD 主题 / 汇报人 - 论文简称 /",
        "论文.pdf  ·  分享.pptx",
        "每次组会按日期排列，论文与幻灯片随汇报人归在一起。",
      ],
      resources: [
        "暂无组内资料",
        "资料 / 分类 /",
        "资料名称.pdf",
        "沿用文件夹分类，选好目录后即可按书目检索。",
      ],
      albums: [
        "暂无活动相册",
        "相册 / YYYY-MM-DD 活动名 /",
        "照片.jpg  ·  照片.png",
        "一次活动一本相册，点开照片可连续翻阅。",
      ],
    };
    $("empty").hidden = !!catalog && catalog[active].length > 0;
    const example = examples[active];
    $("empty").replaceChildren(
      node("h2", example[0]),
      node("p", example[3]),
      node("pre", example[1] + "\n└─ " + example[2]),
    );
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
      results.append(
        node(
          "p",
          "没有符合条件的记录。可清除筛选，或检查所选文件夹中的目录。",
          "empty",
        ),
      );
    if (active === "meetings") {
      renderMeetings(items, results);
      return;
    }
    let previousCategory = null;
    if (resources)
      items.sort(
        (a, b) =>
          a.category.localeCompare(b.category, "zh-CN") ||
          a.title.localeCompare(b.title, "zh-CN"),
      );
    items.forEach((item) => {
      if (resources && item.category !== previousCategory) {
        results.append(
          node("h2", item.category || "未分类", "category-heading"),
        );
        previousCategory = item.category;
      }
      const card = node("article", undefined, "record");
      if (resources) {
        card.append(node("span", "PDF", "file-kind"), assetLink(item.asset));
      } else {
        const date = node("time", undefined, "date");
        date.dateTime = item.date;
        date.append(
          node("span", item.date.slice(0, 7).replace("-", " / "), "date-month"),
          node("strong", item.date.slice(8), "date-day"),
        );
        const content = node("div", undefined, "record-content");
        content.append(node("h2", item.title));
        if (active === "meetings") {
          content.append(
            node("p", item.talks.length + " 项汇报", "record-meta"),
          );
          if (!item.talks.length)
            content.append(node("p", "尚无分享资料", "missing"));
          item.talks.forEach((talk) => {
            const section = node("section", undefined, "talk");
            section.append(
              node("p", talk.presenter, "presenter"),
              node("h3", talk.title),
            );
            assetRows(section, "论文", talk.papers);
            assetRows(section, "幻灯片", talk.slides);
            content.append(section);
          });
        } else {
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
        }
        card.append(date, content);
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
  $("folder").addEventListener("change", (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    if (!files.length) return;
    ++loadVersion;
    leaveDemo();
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
      if (active !== button.dataset.tab) {
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
