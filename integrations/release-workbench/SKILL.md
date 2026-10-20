---
name: release-workbench
description: 查询本机 Release Workbench 项目、版本变化和环境资料，并在用户明确授权后调用已绑定的 Jenkins Job 发布服务。适用于已安装此项目 MCP 的外部 AI 客户端。
---

# Release Workbench

本工具管理资料和调用已有 Jenkins。它不调用模型，不执行 SQL，不修改配置，也不通过 SSH 部署。

## 使用流程

1. 使用 `projects_list` 找到用户指定项目，再用 `project_context` 读取服务、版本和环境。项目服务是候选目录，新建版本时不会提前决定发布范围。
2. SQL 和配置只作为版本变化资料交给用户人工处理，不能生成或调用自动执行入口。
3. 用户要求发布时，明确目标环境、要发布的服务及分支。只有任务支持分支参数时才指定分支；不能猜测未配置的 Job 或参数。
4. 调用 `deployment_preview`，向用户展示具体任务、环境、分支和参数。仅在现有用户指令已授权此次发布时调用 `deployment_run`；否则先请用户确认预览。
5. 相同计划重复调用返回同一记录。提交阶段失败或结果未知时，先到 Jenkins 核对，不能另建计划自动重试。
6. 使用 `deployment_get` 等待最终结果，按服务报告成功、失败、中止或未知；需要原因时读取 `deployment_logs`。将构建结果与实际业务运行效果区分说明。

## 连接方式

先启动本地工作台，在外部 AI 客户端中配置 stdio MCP：命令为本机 Node 可执行文件，参数为项目下 `server/mcp.mjs` 的绝对路径。页面「外部 AI 接入」提供当前机器的配置示例。

默认访问 `http://127.0.0.1:4173`；自定义数据目录或端口时，MCP 进程使用相同 `RW_DATA_DIR` / `RW_PORT`。不要把本机 API Token、Jenkins Token、私钥或密码写进对话、仓库或配置示例。
