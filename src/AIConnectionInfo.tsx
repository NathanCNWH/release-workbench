import { useEffect, useState } from "react";
import { api } from "./api";
import { Button, Note, downloadText } from "./ui";
export default function AIConnectionInfo() {
  const [info, setInfo] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void api("/info")
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, []);
  const configuration = info
    ? JSON.stringify({ mcpServers: { "release-workbench": info.mcp } }, null, 2)
    : "";
  return (
    <section className="panel mcp-settings">
      <h2>连接外部 AI 工具</h2>
      <p>本地应用保持运行，在支持 MCP 的客户端添加以下 stdio 服务。</p>
      {error && <div className="error-message">{error}</div>}
      {configuration && (
        <>
          <pre>{configuration}</pre>
          <div className="actions">
            <Button
              onClick={() =>
                downloadText(
                  "release-workbench-mcp.json",
                  configuration,
                  "application/json",
                )
              }
            >
              下载 MCP 配置示例
            </Button>
            <a
              className="button button-secondary"
              href="/api/skill/download"
              download="SKILL.md"
            >
              下载 Skill 说明
            </a>
          </div>
        </>
      )}
      <Note>
        提供项目、服务、环境、版本及
        SQL/配置资料的增删改查，以及版本合并、发布预览、Jenkins
        触发和日志查询。SQL 与配置可编辑为资料，执行与更新仍由人工处理。启动 MCP
        前先启动本地应用。
      </Note>
      <h3>让外部 AI 管理资料</h3>
      <p>
        例如：“创建项目并登记服务”“为测试环境的 API
        服务关联两台主机”“新建版本并保存 SQL
        变更”“合并这两个版本的发布资料，先给我看冲突”。
      </p>
      <p className="muted small">
        records_list / record_get 查询后携带 revision 调用
        record_create、record_update 或
        record_delete。已有引用资料不能删除，就绪版本可归档。version_merge
        先处理冲突，再生成发布预览。
      </p>
    </section>
  );
}
