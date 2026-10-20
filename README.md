# Release Workbench 项目发布工作台

Windows 本地 Web 工具，管理项目、服务、环境及版本资料，并通过已有 Jenkins Job 发布所选服务。React 前端 + Node.js 后端 + 本机 SQLite，单人单机使用。

**当前版本 v0.4：已实现本地前后端、持久化和 Jenkins/API/MCP 对接。首次启动为空工作台，连接信息由用户配置。**

- [启动、停止与使用说明](docs/启动与使用-v0.4.md)
- [本次开发范围](docs/临时修改计划-本地前后端-v0.4.md)
- [最新需求确认](docs/需求确认记录-v0.4.md)
- [验证记录及边界](docs/验证记录-v0.4.md)
- [历史功能设计](docs/功能设计说明书-v0.1.md)（与后续已确认需求冲突时，以 v0.4 计划及使用说明为准）

新建版本只登记版本资料，不提前选择服务。过程中维护 SQL 和配置差异；发布时选环境、服务和分支。从版本详情发布会关联回版本，独立发布可不关联版本。SQL 及配置由人工处理，工具自身不执行或推送。

## 本地目录

`D:\git_rep\release-workbench`

## 启动与停止

需要 Node.js 24 或以上。在项目目录执行：

```powershell
npm run start:background
```

打开 <http://127.0.0.1:4173/>。也可双击根目录 `启动.cmd`；后台运行，无需保持启动窗口打开。

```powershell
npm run stop
npm run status
```

停止也可双击 `停止.cmd`。脚本校验目标实例和进程归属，不会结束其他 Node 程序。停止本机应用不会中止远端 Jenkins。

启动脚本按 lock 文件安装依赖、构建前端并等待就绪。数据在 `data/`，日志在 `data/logs/`；密码、Token、私钥单独加密。迁移时保留完整数据目录及 `.master-key`。本仓库不保存实际数据、凭据或备份。

项目维护服务和 Git；环境维护多台服务器、一份共用路径和一个数据库。全局共用前后端两套 Jenkins 连接，环境按服务绑定 Job 及参数。可读取 Job 公开的分支选项；插件未公开时手动维护。

数据库备份独立使用 mysqldump，支持 gzip 下载及 SHA256；工作台资料可导出为不含连接凭据的 JSON。外部 AI 页面提供 stdio MCP 配置和 Skill 下载，没有内置模型。

## 开发与验证

```powershell
npm ci
npm test
npm run build
npm run dev
```

开发模式前端 5173、后端 4175；日常后台服务为 4173。GitHub 此后在默认 main 分支迭代。

受控测试覆盖 API、持久化、Jenkins 生命周期、重复提交保护及 MCP；浏览器和启停重启已验证。未连接用户真实 Jenkins、SSH 或 MySQL，未实际发布用户项目。历史离线 HTML 是评审样稿，真实应用需访问本机服务。
