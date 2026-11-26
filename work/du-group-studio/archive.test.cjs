"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { buildCatalog } = require("./archive-adapter.js");
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
  await write(paper);
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
  assert.equal((await catalog()).resources.length, 1);
  await write("资料/方法/新增.pdf");
  assert.equal((await catalog()).resources.length, 2);
  const ppt = (await catalog()).meetings[0].talks[0].slides[0];

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
  assert.equal((await catalog()).resources.length, 1);
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

test("optional talk covers remain separate and require attachments", () => {
  const base = "组会/2026-11-20 讨论/张三 - 方法/";
  const file = { name: "local-cover" };
  const entries = [
    { path: base + "cover.webp", file },
    { path: base + "paper.pdf" },
  ];
  const result = buildCatalog(entries);
  const talk = result.meetings[0].talks[0];
  assert.equal(talk.cover.file, file);
  assert.equal(talk.papers.length, 1);
  assert.equal(talk.slides.length, 0);
  assert.deepEqual(buildCatalog(entries.slice().reverse()), result);
  assert.equal(buildCatalog(entries.slice(0, 1)).meetings.length, 0);
  assert.equal(buildCatalog(entries.slice(0, 1)).issues.length, 1);
  assert.equal(buildCatalog([{ path: base + "other.webp" }]).issues.length, 1);
  assert.equal(
    "cover" in buildCatalog(entries.slice(1)).meetings[0].talks[0],
    false,
  );
});

test("server serves optional covers only with a valid companion", async (t) => {
  const root = await fs.mkdtemp(path.join(__dirname, ".archive-test-"));
  const folder = "组会/2026-11-20 讨论/张三 - 方法/";
  await fs.mkdir(path.join(root, folder), { recursive: true });
  await fs.writeFile(path.join(root, folder, "cover.webp"), "cover-bytes");
  const server = await createArchiveServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    assert.equal(path.dirname(root), __dirname);
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const coverUrl =
    "/api/file?path=" + encodeURIComponent(folder + "cover.webp");
  assert.equal((await fetch(base + coverUrl)).status, 404);
  await fs.writeFile(path.join(root, folder, "paper.pdf"), "pdf");
  const catalog = await (await fetch(base + "/api/archive")).json();
  assert.equal(catalog.meetings[0].talks[0].cover.url, coverUrl);
  const response = await fetch(base + coverUrl);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(await response.text(), "cover-bytes");
  await fs.unlink(path.join(root, folder, "paper.pdf"));
  assert.equal((await fetch(base + coverUrl)).status, 404);
});
