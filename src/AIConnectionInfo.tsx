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
        提供项目资料查询、发布预览、Jenkins 触发和日志查询。SQL
        与配置只读参考，不提供自动执行入口。启动 MCP 前先启动本地应用。
      </Note>
    </section>
  );
}
