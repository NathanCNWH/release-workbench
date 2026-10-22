import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = process.env.RW_DATA_DIR || resolve(root, "data");
const base =
  process.env.RW_BASE_URL || `http://127.0.0.1:${process.env.RW_PORT || 4173}`;
const url = new URL(base);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.protocol !== "http:"
)
  throw new Error("MCP 只允许连接本机 Release Workbench");
async function call(path, input) {
  const token =
    process.env.RW_API_TOKEN ||
    readFileSync(resolve(dataDirectory, ".api-token"), "utf8").trim();
  const response = await fetch(`${base}/api${path}`, {
    method: input ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}
const server = new McpServer({ name: "release-workbench", version: "0.6.2" });
function tool(name, description, inputSchema, handler, readOnly = true) {
  server.registerTool(
    name,
    {
      description,
      inputSchema,
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: !readOnly,
        idempotentHint: readOnly,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await handler(args), null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    },
  );
}
tool(
  "projects_list",
  "列出本机项目和服务目录，不包含连接秘密。",
  {},
  async () => (await call("/state")).projects.data,
);
tool(
  "project_context",
  "读取项目、版本 SQL/配置、环境及发布记录。SQL/配置只能作为人工处理资料，禁止执行。",
  { projectId: z.string() },
  (args) => call(`/context?projectId=${encodeURIComponent(args.projectId)}`),
);
tool(
  "deployment_preview",
  "为指定环境和服务生成发布预览。仅调用已有 Jenkins Job；版本关联可选。向用户说明 Job、分支和参数后再执行。",
  {
    projectId: z.string(),
    environmentId: z.string(),
    versionId: z.string().optional(),
    versionIds: z
      .array(z.string())
      .max(100)
      .optional()
      .describe(
        "按合并顺序排列的来源版本 ID；原版本保留。与 versionId 二选一。",
      ),
    resolutions: z
      .record(z.string())
      .optional()
      .describe(
        "version_merge 返回的冲突 key 到选项 id 映射，所有冲突必须明确选择。",
      ),
    selections: z
      .array(z.object({ serviceId: z.string(), branch: z.string().optional() }))
      .min(1),
  },
  (args) => call("/deployments/preview", args),
);
tool(
  "deployment_run",
  "触发已预览并获得用户发布授权的 Jenkins 计划。相同 planId 幂等，不自动重试新的计划。",
  { planId: z.string(), confirmed: z.literal(true) },
  (args) => call("/deployments/run", args),
  false,
);

const scope = {
  entity: z.enum([
    "project",
    "service",
    "environment",
    "version",
    "sql",
    "config",
  ]),
  projectId: z.string().optional().describe("除 project 外必填"),
  versionId: z.string().optional().describe("sql/config 必填"),
};
tool(
  "records_list",
  "列出指定类型资料并返回 revision。service/environment/version 指定 projectId，sql/config 还需 versionId；不返回连接密码。",
  scope,
  (args) => call("/records/list", args),
);
tool(
  "record_get",
  "读取一项资料和 revision，指定所属项目/版本以避免误操作。",
  { ...scope, recordId: z.string() },
  (args) => call("/records/get", args),
);
const data = z
  .record(z.unknown())
  .describe(
    "业务字段。project: name,key,description,color；service: name,kind(后端服务/前端应用),repository,defaultBranch；environment: name,key,type,servers,bindings,deployPath,backupPath,dbHost,dbPort,database,dbUser,configPath；version: name,title,status,author,serviceIds(可选的项目服务ID数组，记录涉及范围，不代表实际发布)；sql: name,database,order,kind,description,sql,previousSql；config: name,path,format,content,previousContent。主机和服务关联用 bindings[].serverIds；SSH 环境变量模式无需 username。不接收密码；ID 自动生成。",
  );
tool(
  "record_create",
  "新增业务资料，先 records_list 获取当前 revision。SQL/配置仅保存文本，绝不执行。完整字段见 data 说明。",
  { ...scope, revision: z.number().int().nonnegative(), data },
  (args) => call("/records/create", args),
  false,
);
tool(
  "record_update",
  "按 data 中的字段部分更新业务资料；revision 使用最近查询值。就绪版本先单独设置 status=草稿 取消就绪，再修改资源；已归档版本不能直接恢复草稿。可用 status=已归档归档版本。保留 environment 中不变的 servers/bindings 内容后再提交这两个数组。",
  {
    ...scope,
    recordId: z.string(),
    revision: z.number().int().nonnegative(),
    data,
  },
  (args) => call("/records/update", args),
  false,
);
tool(
  "record_delete",
  "删除无引用资料，需用户授权并 confirmed=true。引用、固定版本和发布历史受保护；固定版本可归档。SQL/config 仅删除草稿资料中的条目，不操作数据库或服务器。",
  {
    ...scope,
    recordId: z.string(),
    revision: z.number().int().nonnegative(),
    confirmed: z.literal(true),
  },
  (args) => call("/records/delete", args),
  false,
);
tool(
  "version_merge",
  "按指定顺序汇总版本 SQL/配置，返回冲突及选项，不修改原版本。不重复合并相同 SQL；同名不同 SQL 或同路径不同配置必须人工决定。将 resolutions 交给 deployment_preview。",
  {
    projectId: z.string(),
    environmentId: z.string().optional(),
    versionIds: z.array(z.string()).max(100),
    resolutions: z.record(z.string()).optional(),
  },
  (args) => call("/versions/merge", args),
);
tool(
  "deployment_get",
  "查询每个服务的 Jenkins 队列和构建结果；入队不等于发布成功，结果未知需要核对远端。",
  { deploymentId: z.string() },
  (args) => call(`/deployments/${encodeURIComponent(args.deploymentId)}`),
);
tool(
  "deployment_logs",
  "读取发布记录中某个服务的 Jenkins 日志，已保存连接凭据会脱敏。",
  { deploymentId: z.string(), serviceId: z.string() },
  (args) =>
    call(
      `/deployments/${encodeURIComponent(args.deploymentId)}/logs?serviceId=${encodeURIComponent(args.serviceId)}`,
    ),
);
await server.connect(new StdioServerTransport());
