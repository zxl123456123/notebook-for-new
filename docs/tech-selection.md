# 技术选型：研究生科研门户

状态：Phase 0 设计建议，待确认；调查日期：2026-11-23。本文不代表已安装、运行或压测任何候选。

## 1. 结论与依据

建议以 **Payload + Next.js + PostgreSQL** 为主方案：用现成 CMS 管理结构化内容、账户、草稿与版本，用 Next.js 实现研究生科研门户的导航、筛选、地图和详情页面。初期使用单应用、单数据库；不另建 Wiki、独立搜索服务或 AI 编排平台。

这是基于产品需求的取舍：门户需要关联科研资源、机构、地点和主题，不只是按目录阅读文章；正文需要易维护，浏览端需要较自由的设计。Payload 能在 Next.js 内提供后台和数据 API，避免再维护一套 Python/PHP 服务。若维护团队以 Python 为主，或免费多阶段审批成为硬要求，应改选 Wagtail；若必须承接学校既有 Drupal 平台，应优先沿用 Drupal。

本地调查：任务开始时工作目录为空，`rg --files` 未发现实现、依赖清单或已有技术规范；`git status` 报告不是 Git 仓库。因此没有可复用代码或迁移成本证据，不能以“现有系统采用 TypeScript”为选型理由。团队实际技术经验仍待确认。

## 2. 三套完整候选

下表中的成本与适配度是本项目判断，并非上游性能声明。

| 维度 | A：Payload + Next.js + PostgreSQL | B：Wagtail + Django + PostgreSQL | C：Drupal + PHP + PostgreSQL |
| --- | --- | --- | --- |
| 落地结构 | 同一 Next.js 应用容纳门户与 CMS 后台 | Django/Wagtail 服务端页面，地图局部用 JavaScript | Drupal 内容类型、Views、Twig 主题，地图局部用 JavaScript |
| 结构化科研内容 | Collection、关系字段和代码化 schema 适合自定义关联 | Page、Snippet、Django model；页面树与非页面实体需分清 | 内容类型、字段、Taxonomy、Views 配置能力强 |
| 正文维护 | 配置 Markdown 文本字段及预览；不把上传内容当可执行 MDX | 富文本与 StreamField 成熟；Markdown 需扩展或导入约定 | CKEditor 与内容字段现成；Markdown 依赖选定扩展或转换 |
| 草稿与历史 | 内置 Versions/Drafts，按 Collection 启用 | 修订、发布与审核工作流适合编辑团队 | 核心 Content Moderation + Workflows |
| 权限 | 代码定义集合/文档/字段级规则；服务端调用必须保持同一规则 | Django 权限及 Wagtail 页面/集合授权；业务实体另核对 | 角色权限、内容访问及状态转换权限，复杂规则要核对模块组合 |
| 模块与长期升级 | 按业务注册 Collection 和路由；升级时联测 Payload 与 Next.js | 用 Django app、migration 和 Wagtail hooks 划分模块；适合已有 Python 维护人 | 模块、配置导出和升级机制成熟；每次大版本升级要检查贡献模块兼容性 |
| 社区与维护路径 | 官方 monorepo、发布记录和适配器集中；关键依赖集中在同一维护方 | Wagtail 和 Django 两个上游，编辑人员和开发人员各有文档 | Drupal.org 维护核心、扩展和安全公告，GitHub 镜像的互动量不能代表社区规模 |
| 接入权限感知 RAG | TypeScript 模块可直接复用当前身份与指南查询；需自己实现索引同步和引用核验 | Python 检索库选项多，也能在应用内读取授权内容；需映射页面修订与访问限制 | 可用实体 API 抽取文本；若采用外部 AI 服务，还要对接 Drupal 内容访问和修订撤回 |
| 门户视觉与交互 | React 组件直接实现，最贴合独立设计 | 模板足够；复杂 React 前端会增加第二套边界 | 主题可实现；复杂交互与配置导出需 Drupal 专长 |
| 部署与维护 | Node.js 应用 + PostgreSQL + 文件存储 | Python 应用 + PostgreSQL + 文件存储 | PHP 应用 + PostgreSQL + 文件存储；Composer 管理依赖 |
| 主要代价 | 需开发者维护 schema、权限和升级；企业功能不等于免费核心 | 若前后端拆分，部署与类型契约增加；团队 Python 能力未知 | 配置、模块兼容和主题开发学习成本较高 |
| 推荐触发条件 | 本项目默认；自定义门户与统一 TypeScript 栈优先 | Python 团队，或审核流程比前端定制更重要 | 校方已运营 Drupal，或大量配置化编辑治理需求 |

### A. Payload 的证据与边界

[官方仓库](https://github.com/payloadcms/payload)为 MIT 许可，提供 Next.js 集成、后台与 API；[Postgres 适配器](https://payloadcms.com/docs/database/postgres)基于 Drizzle/node-postgres，并提供迁移能力。采用官方适配器，不自行生成一套重复 CRUD 后端。生产数据库变更通过审阅后的迁移执行，不照搬开发模式自动同步。

[Versions](https://payloadcms.com/docs/versions/overview)提供历史比较、恢复和草稿；[Access Control](https://payloadcms.com/docs/access-control/overview)可限制公开内容与编辑权限。**高级审批流程是独立的企业功能**，见 [Publishing Workflows](https://payloadcms.com/enterprise/publishing-workflows)。初期只承诺草稿、发布与简单角色限制，不把可视化多级审核、SSO、自动向量化当作免费内置能力，也不为避开付费功能自建通用工作流引擎。

尤其注意 [Local API](https://payloadcms.com/docs/local-api/overview)：面向读者/编辑者的服务端查询必须显式设置 `overrideAccess: false` 并传递实际身份；没有用户时按匿名权限处理。UI 隐藏按钮不能替代数据层授权。业务权限需覆盖门户、REST、Local API、搜索和将来的 AI 检索。

### B. Wagtail 的证据与边界

[官方仓库](https://github.com/wagtail/wagtail)为 BSD-3-Clause，基于 Django，提供 StreamField、内容 API 与 PostgreSQL 搜索后端。[权限文档](https://docs.wagtail.org/en/stable/topics/permissions.html)和[审核工作流指南](https://guide.wagtail.org/en/how-to-guides/configure-workflows-for-moderation/?target_version=latest)支持编辑治理需求。

备选方案采用 Django 模板直接渲染，而非默认再加 Next.js。这样可以减少跨服务接口，但自定义门户需维护 Python 及浏览器 JavaScript。未选为默认的原因是统一 React 交互与数据定义更符合当前方案，不是 Wagtail 能力不足。

### C. Drupal 的证据与边界

[GitHub 仓库](https://github.com/drupal/drupal)是官方代码镜像，不接收 GitHub PR；权威维护入口是 [Drupal 项目页](https://www.drupal.org/project/drupal)。核心已有字段、Taxonomy、Views、JSON:API、PostgreSQL 和 [Content Moderation](https://www.drupal.org/docs/8/core/modules/content-moderation)。

按[官方许可说明](https://www.drupal.org/about/licensing)，Drupal 为 GPL-2.0-or-later；分发衍生代码需遵守 GPL，不能将模块生态一概当作可闭源复制的素材库。站点文章、第三方资产与代码许可分别判断。当前不选择它，是因为没有既有 Drupal 运维基础，配置与模块体系的引入不直接减少本项目地图与关联内容的定制工作。

## 3. 许可证和近期维护快照

以下为访问时页面可见记录，不是未来支持承诺，也不是安装版本锁定。实施时重新核对兼容矩阵、安全公告并锁定版本。

| 项目 | 许可范围 | 可见维护证据 |
| --- | --- | --- |
| Payload | 核心 MIT；企业扩展、托管服务另有商业条件 | [Releases](https://github.com/payloadcms/payload/releases)：v3.94.1，2026-11-20 |
| Wagtail | BSD-3-Clause，保留版权/免责声明，不以原作者名义背书 | [Releases](https://github.com/wagtail/wagtail/releases)：8.1，2026-11-02 |
| Drupal | GPL-2.0-or-later，分发与衍生作品有相应义务 | [项目发布页](https://www.drupal.org/project/drupal)：11.4.13，2026-11-18；Drupal 7 已停止官方支持 |
| Wiki.js | 当前仓库 AGPL-3.0；修改后通过网络提供服务涉及对应源码义务 | [Releases](https://github.com/requarks/wiki/releases)：可见 3.5.0，2026-11-20；不依赖旧版印象判断活跃度 |
| Docusaurus | 代码 MIT；仓库还标示文档 CC-BY-4.0，转载文档需另遵守署名条件 | [Releases](https://github.com/meta/docusaurus/releases)：可见 3.10.1，2026-04-30；此记录不声称为最新版本 |

主方案中的 Next.js 采用 MIT，PostgreSQL 采用允许商业使用、修改和再分发的 PostgreSQL License。交付安装包时保留各依赖要求的版权和许可文本；首个锁文件生成后再核对上传组件与传递依赖的实际版本。[Next.js 许可](https://github.com/vercel/next.js/blob/canary/license.md)、[PostgreSQL 许可](https://www.postgresql.org/about/licence/)

## 4. 为什么不直接用 Wiki 或文档站

| 候选 | 适合的工作 | 本项目处理 |
| --- | --- | --- |
| [Wiki.js](https://github.com/requarks/wiki) | 团队知识页、协作编辑、目录式阅读 | 能承载科研手册，但机构/事件/资源关联、结构化筛选和地图仍需开发。另起 Wiki 会增加账号与内容同步边界，因此不作为主系统 |
| [Docusaurus](https://github.com/meta/docusaurus) | Git 管理的公开文档、版本化技术手册 | 若需求收缩为纯公开手册可采用；当前编辑后台、对象关系与动态权限不适合只靠静态构建实现 |
| CMS 中存 Markdown | 维护正文，同时将机构、主题、来源、地理位置保存为结构化字段 | 采用。数据库为发布内容唯一事实源；导入/导出 Markdown 是边界能力，不维护 Git 与数据库双主写入 |

正文采用安全 Markdown 渲染，明确 HTML、链接协议和图片来源规则。用户提交文本不以 MDX 执行 JavaScript；地图也不是正文随意嵌入的脚本，而是受控的门户组件。

## 5. 地图与图表

推荐 [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js)作为地理地图组件：[官方文档](https://maplibre.org/maplibre-gl-js/docs/)提供交互地图 API，BSD-3-Clause 允许自托管和定制。它负责浏览、缩放与展示机构地点，不负责提供合法底图、地理编码或替用户维护地点数据。

[Apache ECharts](https://github.com/apache/echarts)为 Apache-2.0，可用于统计图与示意地图；[官方示例](https://echarts.apache.org/handbook/en/how-to/component-types/geo/svg-base-map/)支持 SVG/GeoJSON 底图。若只是按区域着色和比较数量，它更轻便；本项目需要地点浏览和连续地图交互，所以优先 MapLibre。没有统计图需求前不同时引入 ECharts。

地图代码、地图数据、瓦片服务三种许可必须分开。OSM 公共瓦片不是无限免费 CDN，[官方使用政策](https://operations.osmfoundation.org/policies/tiles/)明确无 SLA、需署名和遵守缓存规则。正式上线前选择可在目标地区访问、许可允许目标用途的服务，核对配额、边界数据、坐标系及署名。Phase 0 不承诺具体底图商与地图加载性能；地图加载失败时仍应能通过机构列表访问同一批公开内容。

## 6. 搜索与 AI RAG

初期使用 PostgreSQL，对标题、摘要和正文纯文本做参数化子串匹配，配合内容类型与主题筛选。这里的“全文范围检索”不等于已经实现分词、相关性排序的全文搜索引擎。[PostgreSQL 全文检索文档](https://www.postgresql.org/docs/current/textsearch.html)提供词典、索引与排名方案，但中文分词效果要用真实语料验证，不能直接套用英文配置后宣称中文检索可用。

在关键词基线和带预期答案的中文问题集建立后，再评估 RAG。只为当前用户可见的已发布版本生成候选证据；引用必须定位内容及版本，删除或撤回内容后失效；证据不足时明确无法回答。检索权限不能交给模型提示词控制，也不能把私有材料发给尚未获准的外部模型服务。

| 路径 | 官方依据与许可 | 取舍 |
| --- | --- | --- |
| PostgreSQL + pgvector + 模型 API | [pgvector](https://github.com/pgvector/pgvector)支持精确/近似向量检索；[许可原文](https://raw.githubusercontent.com/pgvector/pgvector/master/LICENSE)为 PostgreSQL 风格宽松许可 | 后续优先验证；沿用数据库，避免立即引入独立向量数据库。仍需自己处理切片、版本、权限、评估和调用费用 |
| LlamaIndex | [官方仓库](https://github.com/run-llama/llama_index)，MIT | 文档接入复杂时再评估；不因为要做 RAG 就先引入 Python 服务或整套编排框架 |
| Dify | [官方仓库](https://github.com/langgenius/dify)及[许可原文](https://raw.githubusercontent.com/langgenius/dify/main/LICENSE) | 可快速试验工作流，但不是无附加条件的 Apache-2.0：多租户运营与使用其前端时的品牌修改存在限制。当前不引入另一套账号、内容索引和运行服务 |

上述路线均不等于“已选模型”。模型供应商、嵌入模型、地域、数据保留、额度和质量阈值待后续实测确认；向量维度与模型版本不能在切换时静默混用。Phase 0 不安装向量扩展、不导入语料、不产生模型费用。

## 7. 实施前的验证门槛与未核实项

1. 以一个真实内容类型验证编辑、草稿、发布、撤回、版本恢复；匿名访问不得得到草稿或受限字段。
2. 验证页面、API、Local API、搜索与地图列表采用相同可见性规则；审核角色只能进行设计允许的状态变更。
3. 验证 Markdown 表格、公式需求、代码块、中文及图片；公式组件是否需要引入以实际内容为准。
4. 使用真实规模内容检查中文搜索、地图移动端体验和部署资源；不从框架宣传材料推导吞吐量或成本。
5. 锁定 Payload/Next.js/Node.js/PostgreSQL 兼容组合，验证迁移、备份恢复与文件持久化。本文未执行安装或数据库演练。

调查限制：GitHub REST 元数据请求被匿名限流，未取得可信的 `pushed_at` 数据，已改读官方仓库与发布页，不用空值推断项目失活。Wagtail 旧路径的工作流文档返回 404，已使用上文官方 Guide 新入口。未逐一核验地图/RAG 辅助库的最新发布日期、所有传递依赖与企业报价；它们未被纳入当前必须安装范围。
