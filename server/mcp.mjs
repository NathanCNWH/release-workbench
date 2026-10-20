import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = process.env.RW_DATA_DIR || resolve(root, "data");
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
    readFileSync(resolve(data, ".api-token"), "utf8").trim();
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
const server = new McpServer({ name: "release-workbench", version: "0.4.0" });
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
