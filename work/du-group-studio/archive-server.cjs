"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const { pipeline } = require("node:stream");
const { buildCatalog, prepareCatalog } = require("./archive-adapter.js");

const staticFiles = new Map([
  ["/archive.html", "text/html; charset=utf-8"],
  ["/archive.css", "text/css; charset=utf-8"],
  ["/archive.js", "text/javascript; charset=utf-8"],
  ["/archive-adapter.js", "text/javascript; charset=utf-8"],
  ["/index.html", "text/html; charset=utf-8"],
  ["/studio.webp", "image/webp"],
]);
const mediaTypes = new Map([
  [".pdf", "application/pdf"],
  [".doc", "application/msword"],
  [".tex", "application/x-tex"],
  [".bib", "text/plain; charset=utf-8"],
  [".zip", "application/zip"],
  [
    ".docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [
    ".dotx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  ],
  [".md", "text/markdown; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".ppt", "application/vnd.ms-powerpoint"],
  [
    ".pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
]);

function hidden(name) {
  return name.startsWith(".") || name === "__MACOSX";
}

// Inspect every component before opening; never traverse directory links/junctions.
async function checkedPath(root, relative) {
  if (typeof relative !== "string") throw new Error("Missing relative path");
  const parts = relative.split("/");
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        hidden(part) ||
        /[\\:\x00-\x1f]/.test(part),
    )
  ) {
    throw new Error("Invalid relative path");
  }
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    const stat = await fsp.lstat(current);
    if (stat.isSymbolicLink() || (await fsp.realpath(current)) !== current)
      throw new Error("Links are not served");
  }
  const relativeToRoot = path.relative(root, current);
  if (
    !relativeToRoot ||
    relativeToRoot.startsWith("..") ||
    path.isAbsolute(relativeToRoot)
  )
    throw new Error("Outside archive");
  return current;
}

async function readCatalog(root) {
  const entries = [],
    scanIssues = [];
  async function walk(relative) {
    try {
      const absolute = await checkedPath(root, relative);
      const stat = await fsp.lstat(absolute);
      if (stat.isFile()) entries.push({ path: relative });
      else if (stat.isDirectory()) {
        for (const item of await fsp.readdir(absolute, {
          withFileTypes: true,
        })) {
          if (!hidden(item.name)) await walk(relative + "/" + item.name);
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT")
        scanIssues.push("无法读取或已跳过链接：" + relative);
    }
  }
  for (const category of ["组会", "资料", "相册"]) await walk(category);
  const catalog = await prepareCatalog(entries, async (entry) => {
    const absolute = await checkedPath(root, entry.path);
    const handle = await fsp.open(
      absolute,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    );
    try {
      if ((await handle.stat()).size > 16 * 1024)
        throw new Error("Shortcut too large");
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  });
  catalog.issues.push(...scanIssues);
  function attach(asset) {
    asset.url = "/api/file?path=" + encodeURIComponent(asset.path);
  }
  for (const meeting of catalog.meetings) {
    for (const talk of meeting.talks)
      [...talk.papers, ...talk.slides].forEach(attach);
  }
  catalog.resources.forEach((resource) => {
    if (resource.asset) attach(resource.asset);
  });
  catalog.albums.forEach((album) => album.photos.forEach(attach));
  return catalog;
}

function reply(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function sendFile(response, absolute, type, downloadName) {
  const handle = await fsp.open(
    absolute,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("Not a regular file");
    const headers = { "Content-Type": type, "Content-Length": stat.size };
    if (downloadName) {
      const disposition = /\.(pdf|jpg|jpeg|png|webp)$/i.test(downloadName)
        ? "inline"
        : "attachment";
      const encodedName = encodeURIComponent(downloadName).replace(
        /['()*]/g,
        (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
      );
      headers["Content-Disposition"] =
        disposition +
        '; filename="download' +
        path.extname(downloadName).toLowerCase() +
        "\"; filename*=UTF-8''" +
        encodedName;
    }
    response.writeHead(200, headers);
    pipeline(handle.createReadStream(), response, () => {});
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function createArchiveServer(directory) {
  const requestedRoot = path.resolve(directory);
  if ((await fsp.lstat(requestedRoot)).isSymbolicLink())
    throw new Error("材料根目录不能是符号链接或目录联接");
  const root = await fsp.realpath(requestedRoot);
  if (!(await fsp.stat(root)).isDirectory())
    throw new Error("材料根目录必须是目录");
  return http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    const port = request.socket.localPort;
    if (
      !["127.0.0.1:" + port, "localhost:" + port].includes(request.headers.host)
    ) {
      return reply(response, 403, "仅允许本机回环地址访问");
    }
    if (
      request.headers.origin &&
      !["http://127.0.0.1:" + port, "http://localhost:" + port].includes(
        request.headers.origin,
      )
    ) {
      return reply(response, 403, "仅允许同源访问");
    }
    if (request.method !== "GET") return reply(response, 405, "仅支持 GET");
    try {
      const url = new URL(request.url, "http://127.0.0.1:" + port);
      if (url.pathname === "/") {
        response.writeHead(302, { Location: "/archive.html" });
        return response.end();
      }
      if (url.pathname === "/api/archive") {
        const catalog = await readCatalog(root);
        return reply(
          response,
          200,
          JSON.stringify(catalog),
          "application/json; charset=utf-8",
        );
      }
      if (url.pathname === "/api/file") {
        const relative = url.searchParams.get("path");
        const absolute = await checkedPath(root, relative);
        const entries = [{ path: relative }];
        const catalog = buildCatalog(entries);
        if (
          !catalog.meetings.length &&
          !catalog.resources.length &&
          !catalog.albums.length
        ) {
          return reply(response, 404, "文件不在有效归档目录中");
        }
        return await sendFile(
          response,
          absolute,
          mediaTypes.get(path.extname(relative).toLowerCase()),
          path.basename(relative),
        );
      }
      if (staticFiles.has(url.pathname)) {
        const absolute = await checkedPath(__dirname, url.pathname.slice(1));
        return await sendFile(
          response,
          absolute,
          staticFiles.get(url.pathname),
        );
      }
      reply(response, 404, "未找到");
    } catch (error) {
      if (response.headersSent) response.destroy();
      else reply(response, 404, "文件不存在或无法读取");
    }
  });
}

if (require.main === module) {
  const directory = process.argv[2];
  const port = process.argv[3] === undefined ? 4173 : Number(process.argv[3]);
  if (!directory || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(
      "用法：node archive-server.cjs <真实材料根目录> [port，默认 4173]",
    );
    process.exitCode = 1;
  } else {
    createArchiveServer(directory)
      .then((server) => {
        server.on("error", (error) => {
          console.error(error.message);
          process.exitCode = 1;
        });
        server.listen(port, "127.0.0.1", () =>
          console.log("归档预览：http://127.0.0.1:" + port + "/archive.html"),
        );
      })
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}

module.exports = { createArchiveServer };
