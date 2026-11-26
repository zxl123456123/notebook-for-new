# 模块设计

本文是待实现的后端规格。2026-11-25 工作目录已有 `work/` 下的本地页面预览；预览不代表已部署 Payload、数据库、鉴权或持久文件服务。默认采用 Next.js、Payload、PostgreSQL 单体；四个业务模块为 `portal`、`guides`、`alumni`、`assistant`。

## 设计依据与取舍

采用 Payload 代码配置的 Collections、Globals、Access Control、Drafts 与 migrations，避免另造 CMS、权限引擎和版本表。模块注册表是本项目的一小段组合配置，不是运行时插件平台。[官方配置文档](https://payloadcms.com/docs/configuration/overview)

用集合权限限制记录，用字段权限保护角色、发布状态与个人位置；导航隐藏仅改善体验，不能替代服务端鉴权。Payload Local API 的调用须显式携带当前用户并设置 `overrideAccess: false`，不能把服务端调用视为天然安全。[集合权限](https://payloadcms.com/docs/access-control/collections)、[字段权限](https://payloadcms.com/docs/access-control/fields)、[Local API](https://payloadcms.com/docs/local-api/overview)

使用原生草稿和版本，不自行维护两份正文；指南正文唯一来源为 Markdown，预览通过受控渲染产生，禁止原始 HTML 与危险链接。首期搜索用 PostgreSQL 对已授权标题、正文做大小写不敏感子串匹配，不引入搜索服务；RAG 延后，先落接口与权限约束。[Drafts](https://payloadcms.com/docs/versions/drafts)

## 边界与依赖

| 模块 | 职责与页面 | 所有数据 | 依赖 |
|---|---|---|---|
| portal | `/`、`/about`、`/news/[slug]`、`/research/[slug]`、`/directions/[slug]`、`/members`、`/albums/[slug]`；团队介绍、新闻、成果、成员与活动相册 | site-settings、news、research-directions、research、members、directory-consents、albums、photo-consents | 共享基础能力 |
| guides | `/guides`、`/guides/[slug]`、`/search`、`/meetings/[slug]`、`/resources`；入组指南、科研流程、每周组会、分类资料与搜索 | guide-stages、guide-categories、guide-tags、guides、meetings、resource-categories、resources | 共享基础能力 |
| alumni | `/alumni`；名单、城市聚合与 MapLibre 地图；管理员维护授权与撤回 | alumni-profiles、location-consents、cities | 共享基础能力、portal 成员只读接口 |
| assistant | `/assistant`、`/api/assistant/query`；引用式问答，首期关闭 | 后续 source-chunks、index-jobs | guides 必须启用 |

portal 与 guides 为核心模块，不允许停用；alumni 和 assistant 是分阶段可选模块。共享基础能力包含认证 users、media、服务端授权、公共布局、审计事件及模块开关；不是第五个可停用业务模块。业务模块不能直接写其他模块的表。门户展示指南入口只消费已授权摘要。校友扩展必须关联唯一成员，成员与登录账号关联可空，不将毕业等同于注销账号或授予内部权限。

组会与科研资料沿用 guides 的内容维护权限，活动相册归 portal；不为三个目录另建插件系统。组会以日期文件夹为入口，PDF、PPT、PPTX 可直接归入该场；有多位汇报人时也可分子目录。资料按主题浏览，同一主题可并列经验笔记、模板、讲座课件、PDF 与网站链接；相册以一次活动为单位持续补图。目录交接格式和 `meetings/resources/albums/issues` 适配器契约见[数据模型](data-model.md#材料交接与增量导入)。本地预览消费适配结果，后续 Payload 适配器通过模块服务写入草稿并报告导入问题；界面不直接依赖磁盘路径作为永久 ID。总体装配仍遵循[宿主架构](architecture.md#3-模块依赖与边界)。

## 注册、配置与启停

以下停用生命周期仅适用于可选模块；核心模块关闭配置在启动时拒绝。第三方扩展必须审查代码、锁版本、检查许可证与迁移后随应用发布。同进程没有安全隔离，不加载未经审查的第三方代码；未来确需不可信插件时使用独立服务/进程和受限 API，另行设计身份与资源隔离。

静态导入每个模块的 manifest，构建时发现重复模块 ID、路径、collection slug 或缺失依赖即失败。Next.js 路由文件固定存在；manifest 描述路由归属与 guard，不尝试运行时创建文件路由。Payload schema 始终注册全部已安装模块，运行开关不参与 schema 生成，以免关闭模块引起删表迁移。

```json
{
  "id": "guides",
  "contractVersion": 1,
  "requires": [],
  "routes": ["/guides", "/guides/[slug]", "/search"],
  "collections": ["guide-stages", "guide-categories", "guide-tags", "guides"],
  "permissions": ["guides.read", "guides.edit", "guides.publish"],
  "navigation": [{ "label": "科研指南", "href": "/guides", "permission": "guides.read" }]
}
```

manifest 是规格示例，不是 Payload 内置 API。生产环境开关由受版本控制的部署配置确定，管理员可见只读状态；首期不做后台热启停。密钥只在服务端环境变量中，站点标题等内容配置放 Global。权限名是集中策略中的常量，不创建动态 RBAC 编辑器。

| 生命周期 | 必须发生的行为 |
|---|---|
| 安装 | 合入模块、schema、路由、测试及显式 migration；默认关闭 |
| 启用 | 校验依赖、配置、数据库 migration 已应用，再部署开关 |
| 运行 | 页面、REST/GraphQL、Local API、附件、搜索和任务都校验所属模块状态 |
| 禁用 | 新业务访问统一 404；移除导航与 sitemap；停止派发任务，运行中的任务在写入前复查；保留数据和 schema |
| 再启用 | 检查数据版本，重建可派生索引，再开放流量 |
| 升级 | 同一 contractVersion 保持兼容；破坏性契约更新在同一发布中迁移所有调用方 |
| 卸载 | 单独批准的数据处置变更，先导出并验证可恢复性，再迁移引用和删除 schema；禁用绝不等于删除 |

依赖禁用时拒绝部署不一致配置，例如 assistant 开启而 guides 关闭。所有页面 guard、导航筛选、集合 access 共享同一份已解析的部署配置；运维迁移账号可维护关闭模块的数据，但普通后台编辑不能绕过关闭状态。

## 角色、可见性与发布

`users.role` 为单值 `member | editor | admin`；访客没有用户记录。所有有效登录账号可读内部已发布内容；editor 可编辑业务内容和预览草稿；admin 同时承担发布者，只有 admin 可发布、撤回发布、改角色；模块配置由代码评审和部署管理，不在后台热修改。校友默认无内部账号，毕业时撤销组内角色/停用账号；Phase 2 由管理员按本人授权证据登记和撤回，处理人不能冒充本人授予同意。若后续增加校友自助登录，须另增只能维护本人公开资料的独立角色，不授予 member 权限。

| 操作 | 访客 | member | editor | admin |
|---|---|---|---|---|
| 公开且已发布页面/搜索/附件 | 是 | 是 | 是 | 是 |
| 内部且已发布内容 | 否 | 是 | 是 | 是 |
| 草稿、历史版本、预览 | 否 | 否 | 是 | 是 |
| 新建与编辑内容草稿 | 否 | 否 | 是 | 是 |
| 发布、取消发布、删除业务记录 | 否 | 否 | 否 | 是 |
| 按本人授权证据登记或撤回城市展示 | 否 | 否 | 否 | 是 |
| 代替他人授予同意 | 否 | 否 | 否 | 否 |
| 用户管理、角色变更 | 否 | 否 | 否 | 是 |

发布权限必须检查更新前后 `_status`，防止 editor 直接调用 API 将草稿发布，或对已发布主版本直接写入。编辑已发布内容保存为新草稿，线上继续读旧发布版本；取消发布后立即不可检索。管理员可撤下校友展示，但不得替本人重新授权。公开页面只输出公开投影，不能把内部对象序列化进前端再隐藏。

草稿并非第三种 visibility：`visibility=public|internal` 与 `_status=draft|published` 正交。版本历史遵循 `readVersions` 权限；预览不进 sitemap、公开缓存或索引。Payload 自动 REST/GraphQL 同样受 access 限制，自定义端点不得自行绕过。

## 附件、搜索及缓存

首期文件置应用挂载的私有持久卷，不放 public 目录；多实例或容量增长后迁移到私有对象存储，资源 ID 与权限语义保持不变。每个附件只归属一个内容记录，下载、缩略图和元数据访问都验证父记录当前发布态、可见性及模块状态。未归属的新上传仅上传者和管理员可读；发布前必须完成归属验证。公开页不能嵌内部附件。首期通过鉴权下载代理传文件，不使用撤回后仍有效的长时公开 URL。上传限制扩展名、实际 MIME 与大小；文件名不用于拼接存储路径。[Payload 上传机制](https://payloadcms.com/docs/upload/overview)

每次材料导入默认为内部草稿；PDF/PPT/PPTX 不因出现在预览中而允许公开下载。相册照片须逐张记录被摄者公开同意，新增照片不继承已有相册授权，撤回后下一次读取即阻断原图与缩略图。公开投影去除照片定位等非必要元数据。私有持久卷随数据库及导入映射一起备份，涵盖仍被历史版本引用的文件；恢复演练验证稳定 ID、父记录关系、文件内容与授权状态，不能只备份数据库或把浏览器缓存视为存档。[数据与同意模型](data-model.md#材料交接与增量导入)

搜索首期只覆盖指南标题和 Markdown 正文，分页返回经过同一 read 规则的结果；附件全文、草稿、版本、校友位置不参与。查询约束先于分页和计数，不能先拿前 N 条再过滤。结果摘要从授权正文生成；未命中只说没有可见结果，不透露内部命中数量。

内部页面与下载 `private, no-store`。公开内容缓存只放公开投影，以记录修订号失效；撤回发布、改为内部、删除及模块停用均清理公开页面、搜索和 CDN 缓存。上线前必须验证旧 URL 和缓存不再泄露；无法证明时首期关闭内容缓存。

## AI 接口与检索约束

首页调用同一接口。试点的来源包括组里确认的专栏段落、组会日期及已有汇报人、资料与附件目录。文件级引用只证明原件已收录，段落级引用才支持对正文的解释。站点负责生成有权打开的链接，组会和资料的目录查询只返回当前用户有权读取的结果。需要生成短答时由服务端适配器调用私网 OpenClaw。范围与实测问题见[首页问答试点](roadmap.md#首页问答试点)。

模块关闭时接口返回 404。仅查找材料时，服务端直接返回授权结果。需要模型解释而模型不可用时，界面保留已找到的来源，说明生成服务暂不可用。供应商配置和密钥只在服务器。下例为已收录相应指南时的设计示例。

```http
POST /api/assistant/query
Content-Type: application/json

{"question":"如何申请服务器账号？","scope":"guides"}
```

```json
{
  "answer": "请先阅读账号申请流程并提交申请。[1]",
  "citations": [{
    "sourceId": "guide-42", "revision": "published-rev-7",
    "title": "服务器账号", "url": "/guides/server-account#apply",
    "anchor": "apply", "excerpt": "填写账号申请表后交管理员审核。"
  }],
  "status": "answered"
}
```

会话身份来自服务端认证，不接受请求里的 userId、role、allowedSources。流程为：校验问题长度与频率 → 用当前用户 ACL 确定可见已发布来源 → 在允许范围检索 → 再查数据库验证来源当前修订与 ACL → 仅把合格片段交给模型 → 校验引用 → 返回前再次复查 ACL，变更则丢弃并重试或拒答。无来源返回 `status=insufficient_sources`，答案明确未找到依据。首期不流式输出，避免最终权限复查前已经泄露。

后续 RAG 索引仅为派生数据，按 sourceId、publishedRevision、anchor、visibility 建索引；撤回、删除、改权限、模块禁用均立即由数据库读规则阻断，再异步清理索引。仅过滤旧索引的 visibility 不足以授权。全文与向量查询均须先限定允许来源，不能把被拒片段送给模型。来源中的指令一律作为不可信引用材料，模型没有写入、抓取任意 URL 或执行工具权限。外部模型使用前确认内部资料可发送的组织政策；默认仅允许公开内容，内部内容需显式部署配置开启。

指南 Markdown 标题使用发布时生成并保存的稳定 anchor 映射；改标题保留原锚点，删除段落标记失效。引用保存发布修订号和原文片段；新版本导致引用过时，界面提示“来源已更新”，不伪装成当前原文。校友资料与城市永不进入 RAG。

## 扩展接口、Hooks 与公共 UI

模块公开服务限定为可见摘要查询、授权正文读取、引用定位及只读导航；调用携带服务端 Principal，不接收客户端自报角色。Payload 原生 afterChange/afterDelete hooks 仅触发本项目明确的 published/withdrawn/access-changed 通知，提交成功后刷新缓存；后续索引任务在数据库事务中登记，再由可重试任务消费，避免数据库提交失败却外发事件。首期不引入通用事件总线。hooks 接收 entityId、revision、eventType，不广播完整私有正文。兼容规则随 contractVersion 记录，破坏性变更同一发布迁移所有消费者。

共享 UI 提供 SiteShell、导航、内容卡片、MarkdownRenderer、授权附件链接、表单和空/错状态；模块复用统一 design tokens，不复制整套布局。AI 提供商接口为 generate(question, authorizedSources, abortSignal) → answer/citations/usage；模型替换不改页面或 guides。检索接口 retrieve(query, Principal, limit) → authorizedSources，内部强制当前 ACL 与发布版本复查；只读工具 navigate(query, Principal) 返回经过权限过滤的站内 href/title，不接受任意 URL 抓取。后续写工具必须独立定义动作权限和确认，不从只读接口隐式升级。

## 新增模块例子：设备预约

新增 `equipment` 时只增该模块目录、固定 `/equipment` 路由、`equipment` 与 `reservations` collections、静态 manifest 条目、权限策略及 migration。复用 users、登录布局与上传，不复制认证。导航登记“设备预约”，默认关闭。依赖共享基础能力，不依赖 portal。验收覆盖禁用直链 404、member 仅能修改自己的预约、冲突预约事务检查、重新启用后记录仍在。新增模块不要求改写 guides 或 assistant；需要加入 AI 来源时须另行扩展来源白名单及授权测试，不能自动全库收录。

## 迁移与验收边界

生产只运行经审阅的 Payload migrations；开发期 schema 自动同步不能带到生产。先在备份恢复库验证 up，再执行备份、迁移、应用发布；优先新增可空字段、回填、切换读取，最后独立删除旧字段。down 不是可靠的数据恢复替代；破坏性迁移回滚依赖已验证备份。[官方迁移文档](https://payloadcms.com/docs/database/migrations)

实现验收至少覆盖四角色 × 两种可见性 × 两种发布态、编辑者直接发布被拒、Local API 未绕过 access、私有附件直接访问、公开转内部后旧缓存与引用、模块关闭的全部入口、停用后重新启用保留数据、校友同意撤回后地图即时消失。本文只定义要求，尚未运行这些应用级测试。
