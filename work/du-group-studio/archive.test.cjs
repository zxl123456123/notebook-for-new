"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { buildCatalog, prepareCatalog } = require("./archive-adapter.js");
const { createArchiveServer } = require("./archive-server.cjs");

test("catalog groups multiple presenters, deduplicates and keeps partial talks", () => {
  const paper = { path: "组会/2026-11-25 讨论/张三 - 论文/论文.pdf" };
  const slides = { path: "组会/2026-11-25 讨论/李四 - 方法/演示.pptx" };
  const entries = [paper, slides, paper, { path: "资料/计算机/方法/入门.pdf" }];
  const catalog = buildCatalog(entries);
  assert.equal(catalog.meetings.length, 1);
  assert.equal(catalog.meetings[0].talks.length, 2);
  const talks = catalog.meetings[0].talks;
  assert.equal(
    talks.find((talk) => talk.presenter === "张三").papers.length,
    1,
  );
  assert.equal(
    talks.find((talk) => talk.presenter === "李四").papers.length,
    0,
  );
  assert.equal(
    talks.find((talk) => talk.presenter === "李四").slides.length,
    1,
  );
  assert.equal(catalog.resources[0].category, "计算机/方法");
  assert.deepEqual(buildCatalog(entries.slice().reverse()), catalog);
});

test("catalog reports invalid paths, dates and unsupported formats", () => {
  const catalog = buildCatalog(
    [
      "资料/../越界.pdf",
      "/资料/分类/绝对路径.pdf",
      "资料//空目录.pdf",
      "组会/2026-02-29 日期错误/张三 - 论文/a.pdf",
      "资料/分类/a.exe",
      "相册/2026-11-25 秋游/a.gif",
    ].map((path) => ({ path })),
  );
  assert.equal(catalog.issues.length, 6);
  assert.equal(
    catalog.meetings.length + catalog.resources.length + catalog.albums.length,
    0,
  );
  assert.equal(buildCatalog([{ path: "资料/.隐藏/a.pdf" }]).issues.length, 0);
});

test("server refreshes the catalog and reads only a valid requested asset without scanning", async (t) => {
  const root = await fs.mkdtemp(path.join(__dirname, ".archive-test-"));
  const linked = path.join(root, "资料/链接");
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await fs.unlink(linked).catch(() => {});
    assert.equal(path.dirname(root), __dirname);
    await fs.rm(root, { recursive: true, force: true });
  });
  async function write(relative, content = "pdf-data") {
    const destination = path.join(root, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
  }
  const paper = "资料/方法/中文.pdf";
  await write("资料/写作/模板.docx", "word");
  await write("资料/写作/经验.md", "# notes");
  await write(
    "资料/写作/讲座.url",
    "[InternetShortcut]\nURL=https://example.com/talk",
  );
  await write("资料/写作/恶意.url", "[InternetShortcut]\nURL=file:///private");
  await write("资料/写作/过大.url", "x".repeat(16385));
  const coverPath = "组会/2026-11-25 讨论/张三 - 论文/cover.webp";
  await write(coverPath, "private legacy cover");
  await write(paper);
  const cameraPhoto = "相册/2026-11-27/DCIM/A/IMG_0001.jpg";
  await write(cameraPhoto, "camera-photo");
  await write("相册/2026-11-27 秋游/IMG_0001.jpg", "trip-photo");
  await write("资料/方法/非法.txt");
  await write("资料/方法/.隐藏.pdf");
  await write("不公开/私有.pdf");
  await write("组会/2026-11-25 讨论/张三 - 论文/演示.pptx", "slides");
  await fs.symlink(path.join(root, "资料/方法"), linked, "junction");
  server = await createArchiveServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const catalog = async () => (await fetch(base + "/api/archive")).json();
  const asset = (relative) =>
    fetch(base + "/api/file?path=" + encodeURIComponent(relative));
  const albumCatalog = (await catalog()).albums;
  assert.equal(albumCatalog.length, 2);
  const photoResponse = await asset(cameraPhoto);
  assert.equal(photoResponse.status, 200);
  assert.equal(photoResponse.headers.get("content-type"), "image/jpeg");
  assert.equal(await photoResponse.text(), "camera-photo");
  assert.equal((await asset("相册/2026-11-27 秋游/IMG_0001.jpg")).status, 200);
  assert.equal((await asset("相册/2026-11-31/DCIM/A/IMG_0001.jpg")).status, 404);
  assert.equal((await catalog()).resources.length, 4);
  await write("资料/方法/新增.pdf");
  assert.equal((await catalog()).resources.length, 5);
  const ppt = (await catalog()).meetings[0].talks[0].slides[0];
  const resourceList = (await catalog()).resources;
  assert.equal(
    resourceList.find((item) => item.href).href,
    "https://example.com/talk",
  );
  for (const [name, type] of [
    [
      "模板.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    ["经验.md", "text/markdown; charset=utf-8"],
  ]) {
    const response = await asset("资料/写作/" + name);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), type);
    assert.match(response.headers.get("content-disposition"), /^attachment/);
    await response.arrayBuffer();
  }
  for (const relative of [
    coverPath,
    "资料/写作/讲座.url",
    "资料/写作/恶意.url",
    "资料/写作/过大.url",
  ])
    assert.equal((await asset(relative)).status, 404);
  assert.equal(
    await fs.readFile(path.join(root, coverPath), "utf8"),
    "private legacy cover",
  );

  // A file request must not enumerate the archive, even when many photos are loaded.
  const originalReadDir = fs.readdir;
  fs.readdir = async () => {
    throw new Error("Unexpected directory scan");
  };
  try {
    const response = await asset(paper);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "pdf-data");
    assert.equal(response.headers.get("content-length"), "8");
    assert.match(
      response.headers.get("content-disposition"),
      /^inline;.*UTF-8/,
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const presentation = await fetch(base + ppt.url);
    assert.match(
      presentation.headers.get("content-disposition"),
      /^attachment/,
    );
    assert.equal(await presentation.text(), "slides");
    for (const relative of [
      "资料/方法/非法.txt",
      "资料/方法/.隐藏.pdf",
      "不公开/私有.pdf",
      "资料/链接/中文.pdf",
      "../archive-server.cjs",
      "/资料/方法/中文.pdf",
      "资料//方法/中文.pdf",
      "资料/方法/./中文.pdf",
      "资料\\方法\\中文.pdf",
    ])
      assert.equal((await asset(relative)).status, 404, relative);
    await fs.unlink(path.join(root, paper));
    assert.equal((await asset(paper)).status, 404);
  } finally {
    fs.readdir = originalReadDir;
  }
  assert.equal((await catalog()).resources.length, 4);
  assert.equal((await fetch(base + "/archive-server.cjs")).status, 404);
  const badHostStatus = await new Promise((resolve, reject) => {
    http
      .get(
        base + "/api/archive",
        { headers: { Host: "evil.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      )
      .on("error", reject);
  });
  assert.equal(badHostStatus, 403);
  assert.equal(
    (
      await fetch(base + "/api/archive", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
});

test("direct dated meetings accept files and silently ignore legacy covers", () => {
  const result = buildCatalog([
    { path: "组会/2026-11-27/a.pdf" },
    { path: "组会/2026-11-27/b.pptx" },
    { path: "组会/2026-11-27/cover.webp" },
    { path: "组会/2026-11-28 组会/a.ppt" },
    { path: "组会/2026-11-28 组会/张三 - 论文/cover.webp" },
    { path: "组会/2026-11-28 组会/张三 - 论文/a.pdf" },
    { path: "组会/2026-11-27/多余/目录/a.pdf" },
  ]);
  assert.equal(result.meetings.length, 2);
  assert.equal(result.meetings[0].talks[0].presenter, "");
  assert.equal(result.meetings[0].talks[0].papers.length, 1);
  assert.equal(result.meetings[0].talks[0].slides.length, 1);
  assert.equal(result.issues.length, 1);
  assert.equal(JSON.stringify(result).includes("cover"), false);
});

test("resource files and HTTP shortcuts share directory and File preparation", async () => {
  const entries = [
    "pdf",
    "ppt",
    "pptx",
    "doc",
    "docx",
    "dotx",
    "md",
    "tex",
    "bib",
    "zip",
  ].map((ext) => ({ path: "资料/写作/模板." + ext }));
  const shortcuts = [
    "https://example.com/a",
    "http://example.com/",
    "javascript:alert(1)",
    "file:///tmp/a",
    "https://example.com/\nURL=https://other.example/",
  ];
  const content = shortcuts.map((url) => "[InternetShortcut]\nURL=" + url);
  const links = content.map((text, i) => ({
    path: "资料/写作/链接" + i + ".url",
    file: new Blob([text]),
  }));
  const fromFiles = await prepareCatalog([...entries, ...links]);
  const fromDirectory = await prepareCatalog(
    [...entries, ...links.map(({ path }) => ({ path }))],
    (entry) => content[Number(/链接(\d+)/.exec(entry.path)[1])],
  );
  assert.deepEqual(fromFiles, fromDirectory);
  assert.equal(fromFiles.resources.length, 12);
  assert.equal(fromFiles.issues.length, 3);
  assert.equal(fromFiles.resources.filter((item) => item.href).length, 2);
  assert.equal(
    buildCatalog([{ path: "资料/写作/link.url" }]).resources.length,
    0,
  );
  let read = false;
  const large = await prepareCatalog([
    {
      path: "资料/写作/large.url",
      file: {
        size: 16385,
        arrayBuffer: () => {
          read = true;
        },
      },
    },
  ]);
  assert.equal(read, false);
  assert.equal(large.issues.length, 1);
});

test("albums accept date-only folders and camera subdirectories without renaming photos", () => {
  const catalog = buildCatalog([
    { path: "相册/2026-11-27/IMG_0001.jpg" },
    { path: "相册/2026-11-27/DCIM/A/IMG_0001.jpg" },
    { path: "相册/2026-11-27 秋游/IMG_0001.jpg" },
  ]);
  assert.equal(catalog.albums.length, 2);
  const unnamed = catalog.albums.find((album) => album.title === "2026-11-27");
  assert.equal(unnamed.photos.length, 2);
  assert.notEqual(unnamed.photos[0].path, unnamed.photos[1].path);
  assert.ok(catalog.albums.some((album) => album.title === "秋游"));
  assert.equal(catalog.issues.length, 0);
});

test("imports a Unicode Windows website shortcut without reading its target", async () => {
  const file = new Blob([
    Buffer.from(
      "\uFEFF[InternetShortcut]\r\nURL=https://example.org/算法",
      "utf16le",
    ),
  ]);
  const catalog = await prepareCatalog([{ path: "资料/算法/讲义.url", file }]);
  assert.equal(
    catalog.resources[0].href,
    new URL("https://example.org/算法").href,
  );
});
