import { useState } from "react";
import { Database, Download, HardDrive } from "lucide-react";
import { Button, Badge, Field, Empty, Note } from "./ui";
import { post } from "./api";
import { useWorkbench } from "./state";
import type { Environment } from "./types";

export default function BackupsPage({
  projectId,
  environments,
}: {
  projectId: string;
  environments: Environment[];
}) {
  const { state, refresh } = useWorkbench(),
    [environmentId, setEnvironmentId] = useState(environments[0]?.id || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const records = state.backups.filter(
    (b) => !b.projectId || b.projectId === projectId,
  );
  async function backup(kind: string) {
    setBusy(true);
    setError("");
    try {
      await post(`/backups/${kind}`, { environmentId });
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LOCAL BACKUPS</div>
          <h1>备份管理</h1>
          <p>数据库备份独立发起，不包含在 Jenkins 发布流程中。</p>
        </div>
        <Button disabled={busy} onClick={() => void backup("workspace")}>
          <HardDrive size={16} />
          备份工作台资料
        </Button>
      </div>
      <section className="panel backup-controls">
        <Field label="数据库所属环境">
          <select
            value={environmentId}
            onChange={(e) => setEnvironmentId(e.target.value)}
          >
            <option value="" disabled>
              请选择环境
            </option>
            {environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.database || "未配置数据库"}
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="primary"
          disabled={busy || !environmentId}
          onClick={() => void backup("mysql")}
        >
          <Database size={16} />
          创建 MySQL 备份
        </Button>
      </section>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      <Note>
        MySQL 备份需要本机安装 mysqldump（可用 RW_MYSQLDUMP
        指定路径），使用已保存的数据库连接。工作台资料备份包含项目、环境、版本资源和记录，不导出连接密码或
        Token；SQL 和配置文本保留原样。
      </Note>
      <section className="panel">
        <div className="table-scroll">
          {records.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>备份资料</th>
                  <th>类型 / 环境</th>
                  <th>状态</th>
                  <th>大小 / 时间</th>
                  <th>下载</th>
                </tr>
              </thead>
              <tbody>
                {records.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.name}</strong>
                      {b.sha256 && (
                        <small className="table-subtext checksum">
                          SHA256：{b.sha256}
                        </small>
                      )}
                      {b.error && (
                        <div className="error-message">{b.error}</div>
                      )}
                    </td>
                    <td>
                      {b.type}
                      <small className="table-subtext">
                        {environments.find((e) => e.id === b.environmentId)
                          ?.name || "本机工作台"}
                      </small>
                    </td>
                    <td>
                      <Badge>{b.status}</Badge>
                    </td>
                    <td>
                      {b.size}
                      <small className="table-subtext">
                        {new Date(b.created).toLocaleString("zh-CN")}
                      </small>
                    </td>
                    <td>
                      {b.status === "备份完成" && (
                        <a
                          className="button button-secondary"
                          href={`/api/backups/${b.id}/download`}
                          download
                        >
                          <Download size={14} />
                          下载
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty
              title="暂无备份"
              detail="按需创建数据库备份，或导出本机工作台资料。"
            />
          )}
        </div>
      </section>
    </>
  );
}
