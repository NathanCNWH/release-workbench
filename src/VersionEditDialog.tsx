import { useState } from "react";
import type { Release } from "./types";
import { Button, Field, Modal } from "./ui";
import VersionBranchField from "./VersionBranchField";

export default function VersionEditDialog({
  release,
  registeredBranch,
  otherProjects,
  onSave,
  onClose,
}: {
  release: Release;
  registeredBranch?: string;
  otherProjects: string[];
  onSave: (values: {
    title: string;
    branchName?: string;
    confirmed: boolean;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [branch, setBranch] = useState(registeredBranch || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const branchName = branch.trim();
  const changesOtherProjects =
    !!registeredBranch &&
    !!branchName &&
    branchName !== registeredBranch &&
    otherProjects.length > 0;
  const close = () => {
    if (!saving) onClose();
  };

  return (
    <Modal title="编辑版本" subtitle={release.name} onClose={close}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const title = String(new FormData(event.currentTarget).get("title") || "").trim();
          if (!title) return setError("请填写分支描述。");
          if (registeredBranch && !branchName) return setError("请填写分支名。");
          if (
            changesOtherProjects &&
            !window.confirm(
              `将版本「${release.name}」的分支改为「${branchName}」，并同步到其他项目「${otherProjects.join("、")}」？`,
            )
          )
            return;
          setSaving(true);
          setError("");
          try {
            await onSave({
              title,
              branchName: branchName || undefined,
              confirmed: changesOtherProjects,
            });
          } catch (error) {
            setError(error instanceof Error ? error.message : "保存版本失败。");
            setSaving(false);
          }
        }}
      >
        <div className="modal-body">
          <Field label="分支描述" required>
            <input
              name="title"
              defaultValue={release.title}
              required
              maxLength={160}
              disabled={saving}
            />
          </Field>
          <VersionBranchField
            projectId={release.projectId}
            branchName={branchName}
            serviceIds={release.serviceIds || []}
          >
            <Field
              label="分支名"
              required={!!registeredBranch}
              hint={
                changesOtherProjects
                  ? `将同步到 ${otherProjects.join("、")}`
                  : "feature/zy_yyyyMMdd_{功能}"
              }
            >
              <input
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                required={!!registeredBranch}
                maxLength={160}
                disabled={saving}
              />
            </Field>
          </VersionBranchField>
          {error && <div className="error-message" role="alert">{error}</div>}
        </div>
        <div className="modal-footer">
          <Button onClick={close} disabled={saving}>取消</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
