"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createArchiveServer } = require("./archive-server.cjs");

test("metadata navigation returns real attachments, missing types and refreshed sources", async (t) => {
  const root = await fs.mkdtemp(path.join(__dirname, ".assistant-test-"));
  const names = [
    "组会/2025-03-14 讨论/甲同学 - 示例方法/original-codeA.pdf",
    "组会/2025-03-14 讨论/乙同学 - 示例研究/deck.pptx",
    "组会/2025-03-21 讨论/甲同学 - 示例方法/another.pdf",
    "组会/2025-03-21 讨论/甲同学 - 示例方法/presentation.pptx",
    "组会/2025-03-28/lone.pdf",
    "相册/2025-03-14/photo.jpg",
  ];
  for (const name of names) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), "fixture");
  }
  const server = await createArchiveServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    assert.equal(path.dirname(root), __dirname);
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const ask = async (question) =>
    (
      await fetch(base + "/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      })
    ).json();
  const originalReadDir = fs.readdir;
  const scannedCategories = [];
  fs.readdir = async (directory, ...args) => {
    if (["相册", "资料"].includes(path.basename(directory)))
      scannedCategories.push(path.basename(directory));
    return originalReadDir(directory, ...args);
  };
  try {
    assert.equal(
      (await ask("近期组会材料有哪些？")).citations[0].date,
      "2025-03-28",
    );
    assert.deepEqual(scannedCategories, []);
  } finally {
    fs.readdir = originalReadDir;
  }
  const sameName = await ask("甲同学汇报的是哪篇？");
  assert.equal(sameName.status, "answered");
  assert.equal(sameName.citations.length, 2);
  assert.deepEqual(
    sameName.citations.map((item) => item.date),
    ["2025-03-14", "2025-03-21"],
  );
  assert.equal(sameName.citations[0].title, "示例方法");
  assert.equal(sameName.citations[0].fileName, "original-codeA.pdf");
  assert.doesNotMatch(sameName.answer, /PPT|original|another/);
  assert.match(sameName.answer, /2025 年 3 月 14 日，甲同学汇报了《示例方法》/);
  for (const citation of sameName.citations) {
    assert.ok(citation.url.startsWith("/api/file?path="));
    assert.equal((await fetch(base + citation.url)).status, 200);
  }
  const two = await ask("3月14号两篇是什么？");
  assert.equal(two.citations.length, 2);
  assert.doesNotMatch(two.answer, /未查到论文 PDF/);
  assert.equal((await ask("3 月 14 日有哪些汇报？")).citations.length, 2);
  assert.equal((await ask("3.14组会的文件")).citations.length, 2);
  assert.equal((await ask("3月14日和3月21日有哪些汇报？")).citations.length, 0);
  assert.equal((await ask("丙同学3月14日汇报的是哪篇？")).citations.length, 0);
  assert.equal((await ask("3月14日丙同学汇报的是哪篇？")).citations.length, 0);
  assert.equal((await ask("3月14日不存在同学汇报的论文")).citations.length, 0);
  assert.equal((await ask("请问甲同学汇报的是哪篇？")).citations.length, 2);
  assert.equal((await ask("我想问下甲同学汇报的是哪篇？")).citations.length, 2);
  assert.equal(
    (await ask("甲同学和乙同学分别汇报的是哪篇？")).citations.length,
    3,
  );
  assert.equal((await ask("甲同学今天吃了什么？")).citations.length, 0);
  assert.equal(
    (await ask("codeA是哪篇材料？")).citations[0].fileName,
    "original-codeA.pdf",
  );
  assert.equal(
    (await ask("codeA的方法效果如何？")).status,
    "insufficient_sources",
  );
  const missingSlides = await ask("3月14日甲同学的PPT在哪？");
  assert.equal(missingSlides.status, "insufficient_sources");
  assert.match(missingSlides.answer, /未收录 PPT.*PDF.*备选/);
  assert.equal(missingSlides.citations.length, 1);
  assert.equal(
    (await ask("3月21日甲同学的PPT在哪？")).citations[0].fileName,
    "presentation.pptx",
  );
  assert.equal(
    (await ask("乙同学的 PPT 在哪？")).citations[0].presenter,
    "乙同学",
  );
  const direct = await ask("2025-03-28 的文件");
  assert.equal(direct.citations[0].title, "lone.pdf");
  assert.equal(direct.citations[0].presenter, "");
  assert.match(direct.answer, /未提供论文标题和汇报人/);
  assert.equal(
    (await ask("甲同学论文比基线快多少？")).status,
    "insufficient_sources",
  );
  for (const question of [
    "甲同学这篇论文的准确率是多少？",
    "甲同学的论文快多少倍？",
    "甲同学的论文怎么实现？",
  ]) {
    const result = await ask(question);
    assert.equal(result.status, "insufficient_sources");
    assert.match(result.answer, /无法回答论文正文问题/);
    assert.ok(result.citations.length);
  }
  assert.equal((await ask("不存在同学讲了什么？")).citations.length, 0);
  assert.equal(
    (await ask("第一次汇报怎么准备？")).status,
    "insufficient_sources",
  );
  assert.equal(
    (await ask("上次组会谁讲了什么？")).citations[0].date,
    "2025-03-28",
  );
  await fs.unlink(path.join(root, names[0]));
  assert.equal((await ask("甲同学汇报的是哪篇？")).citations.length, 1);

  const route = base + "/api/assistant/query";
  assert.equal((await fetch(route)).status, 405);
  for (const [body, status] of [
    ["{", 400],
    ["{}", 400],
    ['{"question":42}', 400],
    [JSON.stringify({ question: "a".repeat(9000) }), 413],
  ]) {
    assert.equal(
      (
        await fetch(route, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      ).status,
      status,
    );
  }
  assert.equal((await fetch(route, { method: "POST", body: "x" })).status, 415);
  assert.equal(
    (
      await fetch(route, {
        method: "POST",
        headers: {
          Origin: "https://other.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(base + "/api/archive", { method: "POST" })).status,
    405,
  );
});
