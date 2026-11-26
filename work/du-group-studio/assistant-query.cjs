"use strict";

const noSources = {
  answer: "当前目录没有找到对应材料。请补充日期、汇报人、标题或文件代号。",
  citations: [],
  status: "insufficient_sources",
};

// Keep retrieval local to directory metadata; never read paper contents.
function queryArchive(catalog, question) {
  const q = question.trim().toLowerCase();
  const compact = q.replace(/\s+/g, "");
  const rows = catalog.meetings.flatMap((meeting) =>
    meeting.talks.map((talk) => ({ meeting, talk })),
  );
  const dates = [
    ...compact.matchAll(
      /(?:(\d{4})[-年/.])?(\d{1,2})[-月/.](\d{1,2})(?:[日号])?/g,
    ),
  ];
  const names = [
    ...new Set(rows.map(({ talk }) => talk.presenter).filter(Boolean)),
  ];
  const presenters = names.filter((name) =>
    compact.includes(name.toLowerCase()),
  );
  const withoutDates = compact.replace(
    /(?:(\d{4})[-年/.])?\d{1,2}[-月/.]\d{1,2}[日号]?/g,
    "",
  );
  const requestedName =
    /^([\u4e00-\u9fff]{2,8}?)(?:的)?(?:汇报的|汇报了|讲了|讲的|的ppt|的论文)/.exec(
      withoutDates,
    );
  if (
    !presenters.length &&
    requestedName &&
    !/^(上次|最近|最新|这次|谁|哪些|有哪些)/.test(requestedName[1]) &&
    !names.some((name) => requestedName[1] === name.toLowerCase())
  )
    return noSources;

  const codes = compact.match(/[a-z]+[a-z0-9]*/g) || [];
  const fileCodes = codes.filter(
    (code) => !["ppt", "pptx", "pdf"].includes(code),
  );
  const titleMatches = rows.filter(
    ({ talk }) =>
      talk.title !== "本场文件" &&
      compact.includes(talk.title.toLowerCase().replace(/\s+/g, "")),
  );
  const latest =
    /上次|最近|最新|近期/.test(compact) &&
    /组会|汇报|材料|论文|文件/.test(compact);
  const intent = titleMatches.reduce(
    (text, { talk }) =>
      text.replace(talk.title.toLowerCase().replace(/\s+/g, ""), ""),
    compact,
  );
  const contentQuestion =
    /方法|效果|快多少|提升多少|多少倍|是多少|准确率|怎么实现|基线|原理|解释|总结|摘要|结论|创新点|实验结果|正文|为什么/.test(
      intent,
    );
  const navigation =
    /汇报|讲了|讲的|哪篇|两篇|论文|ppt|pdf|材料|文件|组会|哪里|在哪/.test(
      compact,
    );
  if (!navigation && !contentQuestion && !fileCodes.length) return noSources;
  if (
    !dates.length &&
    !presenters.length &&
    !titleMatches.length &&
    !latest &&
    !fileCodes.length
  )
    return noSources;

  let matches = rows.filter(({ meeting, talk }) => {
    if (
      !dates.every((date) => {
        const suffix = `${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;
        return date[1]
          ? meeting.date === `${date[1]}-${suffix}`
          : meeting.date.slice(5) === suffix;
      })
    )
      return false;
    if (presenters.length && !presenters.includes(talk.presenter)) return false;
    if (titleMatches.length && !titleMatches.some((row) => row.talk === talk))
      return false;
    if (
      fileCodes.length &&
      !fileCodes.every((code) =>
        [...talk.papers, ...talk.slides].some((asset) =>
          asset.name
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .includes(code),
        ),
      )
    )
      return false;
    return true;
  });
  if (latest && matches.length) {
    const newest = matches
      .map(({ meeting }) => meeting.date)
      .sort()
      .at(-1);
    matches = matches.filter(({ meeting }) => meeting.date === newest);
  }
  if (!matches.length) return noSources;

  const wantsSlides = /ppt|幻灯片|讲解材料/.test(compact);
  const wantsPaper = /哪篇|论文|pdf/.test(compact);
  const citations = [];
  let missingRequested = false;
  const lines = matches.map(({ meeting, talk }) => {
    let assets = [...talk.papers, ...talk.slides];
    let note = "";
    if (wantsSlides) {
      assets = talk.slides;
      if (!assets.length) {
        missingRequested = true;
        assets = talk.papers;
        note = " 尚未收录 PPT。下方 PDF 为论文原件备选。";
      }
    } else if (wantsPaper) {
      assets = talk.papers;
      if (!assets.length) {
        missingRequested = true;
        assets = talk.slides;
        note = " 尚未收录论文 PDF。下方为幻灯片备选。";
      }
    }
    for (const asset of assets)
      citations.push({
        title: talk.title === "本场文件" ? asset.name : talk.title,
        url: asset.url,
        date: meeting.date,
        presenter: talk.presenter,
        fileName: asset.name,
      });
    const [, month, day] = meeting.date.split("-");
    const dateLabel = `${meeting.date.slice(0, 4)} 年 ${Number(month)} 月 ${Number(day)} 日`;
    const summary =
      talk.title === "本场文件"
        ? `${dateLabel}，收录本场文件，目录未提供论文标题和汇报人。`
        : `${dateLabel}，${talk.presenter || "未标注汇报人"}汇报了《${talk.title}》。`;
    return summary + note;
  });
  return {
    answer:
      (contentQuestion
        ? "目前只能查询目录，无法回答论文正文问题。请打开原件核对。\n"
        : "") + lines.join("\n"),
    citations,
    status:
      contentQuestion || missingRequested ? "insufficient_sources" : "answered",
  };
}

module.exports = { queryArchive };
