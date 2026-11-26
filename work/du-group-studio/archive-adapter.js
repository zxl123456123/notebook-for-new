(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TeamArchive = api;
})(typeof window === "undefined" ? null : window, function () {
  "use strict";

  var collator = new Intl.Collator("zh-CN", { numeric: true });
  function compare(a, b) {
    return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
  }

  function datedFolder(folder) {
    var match = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(folder);
    if (!match || !match[2].trim()) return null;
    var parts = match[1].split("-").map(Number);
    var year = parts[0],
      month = parts[1],
      day = parts[2];
    var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1])
      return null;
    return { date: match[1], title: match[2].trim() };
  }

  // Paths are relative to the archive root; the picker removes its selected root.
  function buildCatalog(entries) {
    var meetings = new Map(),
      albums = new Map(),
      resources = [];
    var issues = [],
      unique = new Map();
    for (var entry of entries) {
      if (!entry || typeof entry.path !== "string" || !entry.path) {
        issues.push("忽略无效条目：缺少相对路径。");
        continue;
      }
      var path = entry.path.replace(/\\/g, "/");
      var parts = path.split("/");
      if (
        /^[A-Za-z]:/.test(path) ||
        parts.some(function (part) {
          return (
            !part || part === "." || part === ".." || /[\x00-\x1f]/.test(part)
          );
        })
      ) {
        issues.push("路径无效（必须为根目录内的相对路径）：" + entry.path);
        continue;
      }
      if (
        parts.some(function (part) {
          return part.startsWith(".") || part === "__MACOSX";
        })
      )
        continue;
      // Prefer the entry carrying the actual File when duplicate paths occur.
      if (
        !unique.has(path) ||
        (unique.get(path).file === undefined && entry.file !== undefined)
      ) {
        unique.set(path, entry);
      }
    }

    for (var path of Array.from(unique.keys()).sort(compare)) {
      var entry = unique.get(path);
      var parts = path.split("/");
      var name = parts[parts.length - 1];
      var extension = name.includes(".")
        ? name.slice(name.lastIndexOf(".")).toLowerCase()
        : "";
      var asset = { path: path, name: name };
      if (entry.file !== undefined) asset.file = entry.file;

      if (parts[0] === "组会") {
        var meetingInfo = datedFolder(parts[1] || "");
        var talkInfo = /^(.*?)\s+-\s+(.+)$/.exec(parts[2] || "");
        if (
          parts.length !== 4 ||
          !meetingInfo ||
          !talkInfo ||
          !talkInfo[1].trim() ||
          !talkInfo[2].trim()
        ) {
          issues.push(
            "组会目录格式或日期无效（组会/YYYY-MM-DD 主题/汇报人 - 论文简称/文件）：" +
              path,
          );
          continue;
        }
        if (
          name !== "cover.webp" &&
          ![".pdf", ".ppt", ".pptx"].includes(extension)
        ) {
          issues.push(
            "组会文件格式不支持（仅 PDF、PPT、PPTX 或 cover.webp）：" + path,
          );
          continue;
        }
        var meetingId = parts.slice(0, 2).join("/");
        var talkId = parts.slice(0, 3).join("/");
        if (!meetings.has(meetingId)) {
          meetings.set(meetingId, {
            id: meetingId,
            date: meetingInfo.date,
            title: meetingInfo.title,
            talks: new Map(),
          });
        }
        var meeting = meetings.get(meetingId);
        if (!meeting.talks.has(talkId)) {
          meeting.talks.set(talkId, {
            id: talkId,
            presenter: talkInfo[1].trim(),
            title: talkInfo[2].trim(),
            papers: [],
            slides: [],
          });
        }
        var talk = meeting.talks.get(talkId);
        if (name === "cover.webp") talk.cover = asset;
        else (extension === ".pdf" ? talk.papers : talk.slides).push(asset);
      } else if (parts[0] === "资料") {
        if (parts.length < 3) {
          issues.push("资料缺少分类目录（资料/分类/名称.pdf）：" + path);
          continue;
        }
        if (extension !== ".pdf") {
          issues.push("资料文件格式不支持（仅 PDF）：" + path);
          continue;
        }
        if (!name.slice(0, -4).trim()) {
          issues.push("资料文件名称为空：" + path);
          continue;
        }
        resources.push({
          id: path,
          title: name.slice(0, -4),
          category: parts.slice(1, -1).join("/"),
          asset: asset,
        });
      } else if (parts[0] === "相册") {
        var albumInfo = datedFolder(parts[1] || "");
        if (parts.length !== 3 || !albumInfo) {
          issues.push(
            "相册目录格式或日期无效（相册/YYYY-MM-DD 活动名/照片）：" + path,
          );
          continue;
        }
        if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
          issues.push("照片格式不支持（仅 JPG、JPEG、PNG、WEBP）：" + path);
          continue;
        }
        var albumId = parts.slice(0, 2).join("/");
        if (!albums.has(albumId)) {
          albums.set(albumId, {
            id: albumId,
            date: albumInfo.date,
            title: albumInfo.title,
            photos: [],
          });
        }
        albums.get(albumId).photos.push(asset);
      } else {
        issues.push("未识别的目录（应为组会、资料或相册）：" + path);
      }
    }

    var meetingList = Array.from(meetings.values());
    meetingList.forEach(function (meeting) {
      meeting.talks = Array.from(meeting.talks.values()).filter(
        function (talk) {
          if (talk.papers.length || talk.slides.length) return true;
          issues.push("封面缺少论文或幻灯片：" + talk.cover.path);
          return false;
        },
      );
    });
    return {
      meetings: meetingList.filter(function (meeting) {
        return meeting.talks.length;
      }),
      resources: resources,
      albums: Array.from(albums.values()),
      issues: issues.sort(compare),
    };
  }

  return { buildCatalog: buildCatalog };
});
