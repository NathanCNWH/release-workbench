---
name: release-workbench
description: 通过项目 MCP 管理本机 Release Workbench 的项目、服务、环境、版本与 SQL/配置资料，合并版本发布清单，并按用户授权触发 Jenkins。适用于已配置此 MCP 的外部 AI 客户端。
---

# Release Workbench

本工具可增删改查业务资料和调用已有 Jenkins。SQL/配置内容可编辑保存为版本资料；执行 SQL、更新服务器配置仍由人工完成，不通过 SSH 部署。

## 管理资料

使用 `records_list` / `record_get` 获取最新 `revision`，再调用 `record_create`、`record_update`、`record_delete`。`entity` 为 project、service、environment、version、sql、config；除 project 外指定 projectId，sql/config 还要 versionId。ID 自动生成；新增版本未填 name 时默认北京时间年月日加序号。版本可以通过 serviceIds 登记涉及的项目服务，可先留空；该范围独立于实际发布选择。修改只提交需要变化的字段；遇到修订号冲突，重新读取并核对，不能用旧数组覆盖新资料。

环境可以没有主机，也允许独立新增尚未关联服务的主机。每个服务的主机关系保存在该环境 `bindings[].serverIds`，主机资料放 `servers`，允许复用；页面连线与此关系一致。旧版未关联的主机保留待用户分配。新主机需唯一 id、name、host、port、authentication；仅 environment 认证可省略 username，实际读取应用启动进程的 SSH_NAME / SSH_PWD。绑定还需 serviceId、job、parameters、supportsBranch、branchParameter、branches、defaultBranch；只有支持分支的任务才传分支。数组更新前先保留已有内容，保持用户手动设定的项目服务顺序。

连接密码不通过资料工具读写。删除需用户授权、`confirmed=true` 和最新 revision；有引用或固定的资料不能删除。归档版本用 `record_update` 设置 status=已归档。草稿可编辑资源，就绪/归档版本只允许状态转换，资源变更应新建版本。

## 使用流程

1. 使用 `projects_list` 找到用户指定项目，再用 `project_context` 读取服务、版本和环境。serviceIds 为版本登记的涉及范围，实际发布服务需按本次用户要求独立确认，不能自动触发或按历史记录反推。
2. 用户要求合并发布时，按指定顺序把 versionIds 传给 `version_merge`。相同 SQL 去重；同名不同 SQL 或同路径不同配置返回冲突。向用户展示选择，使用返回的冲突 key 和选项 id 构造 resolutions，不能自动猜测覆盖规则。
3. 用户要求发布时，明确目标环境、要发布的服务及分支。只有任务支持分支参数时才指定分支；不能猜测未配置的 Job 或参数。
4. 调用 `deployment_preview`，传 versionIds、resolutions 和本次选择的服务。原版本保留，发布保存来源、合并内容及主机资料快照。向用户展示具体任务、环境、分支和参数；仅在现有指令已授权此次发布时调用 `deployment_run`，否则请用户确认。独立发布可传空 versionIds。
5. 相同计划重复调用返回同一记录。提交阶段失败或结果未知时，先到 Jenkins 核对，不能另建计划自动重试。
6. 使用 `deployment_get` 等待最终结果，按服务报告成功、失败、中止或未知；需要原因时读取 `deployment_logs`。将构建结果与实际业务运行效果区分说明。

## 连接方式

先启动本地工作台，在外部 AI 客户端中配置 stdio MCP：命令为本机 Node 可执行文件，参数为项目下 `server/mcp.mjs` 的绝对路径。页面「外部 AI 接入」提供当前机器的配置示例。

默认访问 `http://127.0.0.1:4173`；自定义数据目录或端口时，MCP 进程使用相同 `RW_DATA_DIR` / `RW_PORT`。不要把本机 API Token、Jenkins Token、私钥或密码写进对话、仓库或配置示例。
