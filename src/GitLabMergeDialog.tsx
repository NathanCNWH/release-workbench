import { useEffect, useState } from "react";
import { ExternalLink, GitPullRequest, RefreshCw } from "lucide-react";
import { api, post } from "./api";
import { Badge, Button, Field, Modal } from "./ui";
import type { Release } from "./types";
import {
  memberLabel,
  type GitLabMergeRequest,
  type GitLabPreview,
  type GitLabPreviewRow,
  type GitLabResult,
} from "./gitLabTypes";

interface Selection {
  included: boolean;
  targetBranch: string;
  assigneeId: string;
  remember: boolean;
  reassign: boolean;
}

const resultLabels: Record<GitLabResult["status"], [string, string]> = {
  created: ["已创建", "green"],
  assigned: ["已指派", "green"],
  reused: ["已复用", "blue"],
  pending: ["待确认", "orange"],
  failed: ["失败", "red"],
};

function MrLink({ mr }: { mr: GitLabMergeRequest }) {
  return mr.url ? (
    <a href={mr.url} target="_blank" rel="noreferrer" className="text-button">
      MR !{mr.iid} <ExternalLink size={13} />
    </a>
  ) : <span>MR !{mr.iid}</span>;
}

function ExistingRequest({ mr }: { mr: GitLabMergeRequest }) {
  return (
    <div className="inline gitlab-existing">
      <MrLink mr={mr} />
      <span className="muted small">
        {mr.assignee ? "当前合并人 " + memberLabel(mr.assignee) : "尚未指派合并人"}
      </span>
    </div>
  );
}

function RepositoryRow({
  row, selection, sourceBranch, submitting, onChange,
}: {
  row: GitLabPreviewRow;
  selection?: Selection;
  sourceBranch: string;
  submitting: boolean;
  onChange: (value: Partial<Selection>) => void;
}) {
  const existing = row.existing?.find((mr) => mr.targetBranch === selection?.targetBranch.trim());
  const willChangeAssignee = !!existing?.assignee && !!selection?.assigneeId &&
    String(existing.assignee.id) !== selection.assigneeId;
  const selectedMember = selection?.assigneeId;
  const disabled = submitting || !selection?.included;
  return (
    <section className="gitlab-repository">
      <div className="gitlab-repository-heading">
        {selection && (
          <input
            type="checkbox"
            aria-label={"选择仓库 " + row.repository}
            checked={selection.included}
            disabled={submitting}
            onChange={(event) => onChange({ included: event.target.checked })}
          />
        )}
        <div>
          <strong>{row.services.join("、")}</strong>
          <code>{row.repository}</code>
        </div>
      </div>
      {row.error ? (
        <p className="error-message" role="alert">{row.error}</p>
      ) : selection && row.members ? (
        <>
          <div className="form-grid gitlab-inputs">
            <Field label="目标分支">
              <input
                value={selection.targetBranch}
                maxLength={160}
                disabled={disabled}
                onChange={(event) => onChange({ targetBranch: event.target.value, reassign: false })}
              />
            </Field>
            <Field label="合并人">
              <select
                value={selection.assigneeId}
                disabled={disabled}
                onChange={(event) => onChange({ assigneeId: event.target.value, remember: false, reassign: false })}
              >
                <option value="">选择 GitLab 成员</option>
                {row.members.map((member) => (
                  <option key={member.id} value={member.id}>{memberLabel(member)}</option>
                ))}
              </select>
            </Field>
          </div>
          {selection.included && selection.targetBranch.trim() === sourceBranch && (
            <p className="error-message" role="alert">源分支和目标分支必须不同。</p>
          )}
          {existing && <ExistingRequest mr={existing} />}
          {willChangeAssignee && (
            <label className="inline small">
              <input
                type="checkbox"
                checked={selection.reassign}
                disabled={disabled}
                onChange={(event) => onChange({ reassign: event.target.checked })}
              />
              将已有 MR 改派给所选合并人
            </label>
          )}
          {selectedMember && row.defaultAssignee && String(row.defaultAssignee.id) !== selectedMember ? (
            <label className="inline small">
              <input
                type="checkbox"
                checked={selection.remember}
                disabled={disabled}
                onChange={(event) => onChange({ remember: event.target.checked })}
              />
              设为此仓库的默认合并人
            </label>
          ) : selectedMember && !row.defaultAssignee ? (
            <p className="muted small">确认后自动记为此仓库的默认合并人。</p>
          ) : row.defaultAssignee && !row.members.some((member) => member.id === row.defaultAssignee?.id) ? (
            <p className="muted small">已保存的合并人不在当前成员列表中，请重新选择。</p>
          ) : null}
        </>
      ) : <p className="muted small">这个仓库暂无可用的 GitLab 成员。</p>}
    </section>
  );
}

export default function GitLabMergeDialog({
  release, onClose, onSettings,
}: {
  release: Release;
  onClose: () => void;
  onSettings: () => void;
}) {
  const [preview, setPreview] = useState<GitLabPreview | null>(null);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [results, setResults] = useState<GitLabResult[] | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [readVersion, reload] = useState(0);
  const { id: versionId, projectId } = release;

  useEffect(() => {
    const controller = new AbortController();
    setReading(true);
    setPreview(null);
    setResults(null);
    setError("");
    void api<GitLabPreview>("/gitlab/merge-requests/preview", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ projectId, versionId }),
    }).then((data) => {
      if (controller.signal.aborted) return;
      setPreview(data);
      setSelections(Object.fromEntries(data.rows.flatMap((row) => {
        if (!row.members?.length) return [];
        const member = row.members.find((user) => user.id === row.defaultAssignee?.id);
        return [[row.repositoryKey, {
          included: true,
          targetBranch: row.targetBranch,
          assigneeId: member ? String(member.id) : "",
          remember: false,
          reassign: false,
        }]];
      })));
    }).catch((e: Error) => {
      if (!controller.signal.aborted) setError(e.message);
    }).finally(() => {
      if (!controller.signal.aborted) setReading(false);
    });
    return () => controller.abort();
  }, [projectId, versionId, readVersion]);

  const selected = preview?.rows.flatMap((row) => {
    const selection = selections[row.repositoryKey];
    if (!row.gitLabProjectId || !selection?.included) return [];
    const targetBranch = selection.targetBranch.trim();
    const mr = row.existing.find((item) => item.targetBranch === targetBranch);
    return [{
      repositoryKey: row.repositoryKey,
      gitLabProjectId: row.gitLabProjectId,
      apiAddress: row.apiAddress || row.defaultApiAddress,
      targetBranch,
      assigneeId: Number(selection.assigneeId),
      remember: selection.remember,
      reassign: selection.reassign && mr?.assignee
        ? { iid: mr.iid, assigneeId: mr.assignee.id }
        : undefined,
    }];
  }) ?? [];
  const ready = !!preview && selected.length > 0 && selected.every((entry) =>
    !!entry.assigneeId && !!entry.targetBranch && entry.targetBranch !== preview.sourceBranch);

  function close() {
    if (!submitting) onClose();
  }

  async function submit() {
    if (!preview || !ready || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await post<{ results: GitLabResult[] }>("/gitlab/merge-requests/submit", {
        confirmed: true, projectId, versionId, selections: selected, sourceBranch: preview.sourceBranch,
      });
      setResults(response.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "GitLab 请求未完成，请重新读取。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="创建 GitLab MR" subtitle={release.title || release.name} wide onClose={close}>
      <div className="modal-body gitlab-body">
        {preview && (
          <div className="inline muted small">
            <GitPullRequest size={16} />
            源分支 <code>{preview.sourceBranch}</code>
          </div>
        )}
        {reading && <p className="muted" role="status">正在读取 GitLab 仓库和成员…</p>}
        {submitting && <p className="muted" role="status">正在逐仓库提交并回读 GitLab…</p>}
        {error && <div className="error-message" role="alert">{error}</div>}
        {results ? (
          results.map((result) => (
            <section className="gitlab-repository" key={result.repositoryKey}>
              <div className="gitlab-repository-heading">
                <code>{result.repository}</code>
                <Badge tone={resultLabels[result.status][1]}>{resultLabels[result.status][0]}</Badge>
              </div>
              <div className="inline small">
                <span>目标分支 <code>{result.targetBranch}</code></span>
                {result.mr && <ExistingRequest mr={result.mr} />}
              </div>
              {result.message && <p className="muted small">{result.message}</p>}
            </section>
          ))
        ) : preview?.rows.map((row) => (
          <RepositoryRow
            key={row.repositoryKey}
            row={row}
            selection={selections[row.repositoryKey]}
            sourceBranch={preview.sourceBranch}
            submitting={submitting}
            onChange={(value) => setSelections((previous) => ({
              ...previous, [row.repositoryKey]: { ...previous[row.repositoryKey], ...value },
            }))}
          />
        ))}
      </div>
      <div className="modal-footer gitlab-footer">
        <Button onClick={onSettings} disabled={submitting}>GitLab 设置</Button>
        <Button onClick={() => reload((value) => value + 1)} disabled={reading || submitting}>
          <RefreshCw size={14} /> 重新读取
        </Button>
        {results ? <Button variant="primary" onClick={close}>完成</Button> : (
          <>
            <Button onClick={close} disabled={submitting}>取消</Button>
            <Button variant="primary" disabled={!ready || submitting} onClick={() => void submit()}>
              {submitting ? "提交中…" : "确认提交" + (selected.length ? " · " + selected.length + " 个仓库" : "")}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
