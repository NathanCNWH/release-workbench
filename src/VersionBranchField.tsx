import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { Badge, Button } from "./ui";

type RepositoryCheck = { repository: string; services: string[] } & (
  | { kind: "missing"; targetExists: boolean; masterExists: boolean }
  | { kind: "error"; message: string }
  | {
      kind: "compared";
      commonAncestors: string[];
      masterOnly: number;
      branchOnly: number;
      earlyCount: number;
      earlyCommits: { id: string; committedAt: string }[];
    }
);

type BranchCheck = { branchDate: string | null; results: RepositoryCheck[] };
type CheckState = { scope: string } & (
  | { state: "checking" }
  | { state: "result"; value: BranchCheck }
  | { state: "error"; message: string }
);

const beijingTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  dateStyle: "short",
  timeStyle: "short",
});

function RepositoryResult({
  result,
  hasBranchDate,
}: {
  result: RepositoryCheck;
  hasBranchDate: boolean;
}) {
  return (
    <li className="branch-check-repository">
      <strong>{result.services.join("、")}</strong>
      <code className="branch-check-address">{result.repository}</code>
      {result.kind === "error" && (
        <div className="branch-check-status">
          <Badge tone="red">读取失败</Badge>
          <span>{result.message}</span>
        </div>
      )}
      {result.kind === "missing" && (
        <div className="branch-check-status">
          {!result.targetExists && <Badge tone="red">目标分支不存在</Badge>}
          {!result.masterExists && <Badge tone="red">master 不存在</Badge>}
        </div>
      )}
      {result.kind === "compared" && (
        <>
          <div className="branch-check-status">
            {!result.commonAncestors.length && <Badge tone="orange">无共同祖先</Badge>}
            {result.earlyCount > 0 && <Badge tone="orange">需核对</Badge>}
            {hasBranchDate && !!result.commonAncestors.length && !result.earlyCount && (
              <Badge tone="green">未发现较早独有提交</Badge>
            )}
            <span>仅 master {result.masterOnly} 条</span>
            <span>仅目标分支 {result.branchOnly} 条</span>
          </div>
          {!!result.commonAncestors.length && (
            <div className="branch-check-status">
              <span>共同祖先</span>
              {result.commonAncestors.map((id) => (
                <code key={id} title={id}>{id.slice(0, 12)}</code>
              ))}
            </div>
          )}
          {result.earlyCount > 0 && (
            <details className="branch-check-evidence">
              <summary>
                较早独有提交 {result.earlyCount} 条
                {result.earlyCount > result.earlyCommits.length &&
                  `（显示最早 ${result.earlyCommits.length} 条）`}
              </summary>
              <ul>
                {result.earlyCommits.map((commit) => (
                  <li key={commit.id}>
                    <code title={commit.id}>{commit.id.slice(0, 12)}</code>
                    <time dateTime={commit.committedAt}>
                      {beijingTime.format(new Date(commit.committedAt))}
                    </time>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </li>
  );
}

export default function VersionBranchField({
  projectId,
  branchName,
  serviceIds,
  children,
}: {
  projectId: string;
  branchName: string;
  serviceIds: string[];
  children: ReactNode;
}) {
  const [check, setCheck] = useState<CheckState | null>(null);
  const request = useRef<AbortController | null>(null);
  const scope = JSON.stringify([projectId, branchName, serviceIds]);
  useEffect(() => {
    setCheck(null);
    return () => request.current?.abort();
  }, [scope]);
  const current = check?.scope === scope ? check : null;
  const checking = current?.state === "checking";
  const disabledReason = !branchName.trim()
    ? "请先填写分支名。"
    : !serviceIds.length
      ? "请先勾选涉及服务。"
      : undefined;

  async function detect() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setCheck({ scope, state: "checking" });
    try {
      const value = await api<BranchCheck>("/versions/check-branch", {
        method: "POST",
        body: JSON.stringify({ projectId, branchName, serviceIds }),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setCheck({ scope, state: "result", value });
    } catch (error) {
      if (!controller.signal.aborted)
        setCheck({
          scope,
          state: "error",
          message: error instanceof Error ? error.message : "分支检测失败。",
        });
    }
  }

  return (
    <div className="version-branch-field">
      <div className="branch-check-controls">
        {children}
        <Button
          disabled={checking || !!disabledReason}
          title={disabledReason}
          onClick={() => void detect()}
        >
          {checking ? "检测中…" : "检测"}
        </Button>
      </div>
      <div aria-live="polite" aria-busy={checking}>
        {current?.state === "error" && (
          <div className="error-message" role="alert">{current.message}</div>
        )}
        {current?.state === "result" && (
          <div className="branch-check-results">
            <small>
              {current.value.branchDate
                ? `较早提交以 ${current.value.branchDate} 北京时间零点为界。`
                : "分支名中未识别到明确日期，仅显示分支状态和提交差异。"}
            </small>
            <ul>
              {current.value.results.map((result) => (
                <RepositoryResult
                  key={result.repository}
                  result={result}
                  hasBranchDate={!!current.value.branchDate}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
