import { useEffect, useState, type RefObject } from "react";
import Markdown from "react-markdown";
import { BookOpen, FileText, Plus, Save, Search, Trash2 } from "lucide-react";
import type { ProjectNote } from "./types";
import { useWorkbench } from "./state";
import { Badge, Button, Empty, Field } from "./ui";

const snapshot = (note: ProjectNote | undefined | null) =>
  note ? JSON.stringify(note) : "";
const date = (value: string) =>
  new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });

export default function ProjectNotes({
  projectId,
  projectName,
  navigationGuard,
  notify,
}: {
  projectId: string;
  projectName: string;
  navigationGuard: RefObject<(() => boolean) | null>;
  notify: (message: string) => void;
}) {
  const workbench = useWorkbench();
  const notes = workbench.state.projectNotes.data
    .filter((note) => note.projectId === projectId)
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
  const [draft, setDraft] = useState<ProjectNote | null>(notes[0] || null);
  const [base, setBase] = useState<ProjectNote | null>(notes[0] || null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty =
    !!draft &&
    (!base || draft.title !== base.title || draft.content !== base.content);
  const live = notes.find((note) => note.id === draft?.id);
  const conflict = !!base && snapshot(live) !== snapshot(base);
  const incoming = snapshot(live);
  const first = snapshot(notes[0]);
  const filtered = notes.filter((note) =>
    `${note.title}\n${note.content}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  function load(note: ProjectNote | null) {
    setDraft(note);
    setBase(note);
    setMode("edit");
    setError("");
  }
  function canLeave() {
    if (busy) {
      notify("笔记正在保存，请稍候。");
      return false;
    }
    return !dirty || window.confirm("笔记有未保存的修改，确定放弃这些修改吗？");
  }
  useEffect(() => {
    navigationGuard.current = canLeave;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      navigationGuard.current = null;
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty, busy, navigationGuard]);
  useEffect(() => {
    if (!dirty && !busy) {
      if (live && snapshot(base) !== incoming) load(live);
      else if ((!draft || (base && !live)) && notes[0]) load(notes[0]);
      else if (base && !live) load(null);
    }
  }, [incoming, first, dirty, busy]);

  function create() {
    if (!canLeave()) return;
    const now = new Date().toISOString();
    setDraft({
      id: crypto.randomUUID(),
      projectId,
      title: "",
      content: "",
      createdAt: now,
      updatedAt: now,
    });
    setBase(null);
    setMode("edit");
    setError("");
  }
  async function save() {
    if (!draft || busy) return;
    if (!draft.title.trim()) return setError("请填写笔记标题。");
    const value = { ...draft, title: draft.title.trim() };
    setBusy(true);
    setError("");
    try {
      await workbench.update("projectNotes", (previous) => {
        const current = previous.find((note) => note.id === value.id);
        if (
          (base && snapshot(current) !== snapshot(base)) ||
          (!base && current)
        )
          throw new Error("笔记已在其他窗口更新，请先加载最新内容。");
        return base
          ? previous.map((note) => (note.id === value.id ? value : note))
          : [...previous, value];
      });
      setDraft(value);
      setBase(value);
      notify("笔记已保存。");
    } catch (e: any) {
      setError(e.message);
      void workbench.refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!draft || busy) return;
    if (
      !window.confirm(
        `${base ? "删除笔记" : "放弃新笔记"}“${draft.title || "未命名笔记"}”？${dirty ? "未保存的修改也会丢弃。" : ""}`,
      )
    )
      return;
    if (!base) return load(notes[0] || null);
    setBusy(true);
    setError("");
    try {
      await workbench.update("projectNotes", (previous) => {
        if (
          snapshot(previous.find((note) => note.id === draft.id)) !==
          snapshot(base)
        )
          throw new Error("笔记已在其他窗口更新，请先加载最新内容再删除。");
        return previous.filter((note) => note.id !== draft.id);
      });
      load(notes.find((note) => note.id !== draft.id) || null);
      notify("笔记已删除。");
    } catch (e: any) {
      setError(e.message);
      void workbench.refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="project-notes">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PROJECT NOTES</p>
          <h1>
            项目笔记 <span className="heading-count">{notes.length}</span>
          </h1>
          <p className="muted">
            {projectName} · 保存项目说明、操作记录与日常备忘。
          </p>
        </div>
        <Button variant="primary" disabled={busy} onClick={create}>
          <Plus size={16} />
          新建笔记
        </Button>
      </div>
      <div className="project-notes-layout">
        <aside className="project-notes-list" aria-label="笔记列表">
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label="搜索笔记"
              placeholder="搜索标题或正文"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {draft && !base && (
            <div className="unsaved-note">
              <FileText size={16} />
              未保存的新笔记
            </div>
          )}
          {filtered.map((note) => (
            <button
              key={note.id}
              className={`project-note-item ${draft?.id === note.id ? "selected" : ""}`}
              aria-pressed={draft?.id === note.id}
              disabled={busy}
              onClick={() => {
                if (note.id !== draft?.id && canLeave()) load(note);
              }}
            >
              <strong>{note.title}</strong>
              <span>
                {note.content.replace(/\s+/g, " ").slice(0, 80) || "暂无正文"}
              </span>
              <small>{date(note.updatedAt)}</small>
            </button>
          ))}
          {!filtered.length && (
            <p className="notes-list-empty">
              {query ? "没有匹配的笔记" : "暂无已保存笔记"}
            </p>
          )}
        </aside>
        <section className="project-note-editor" aria-label="笔记内容">
          {draft ? (
            <>
              <div className="project-note-toolbar">
                <Badge tone={dirty ? "orange" : "green"}>
                  {dirty ? "未保存" : "已保存"}
                </Badge>
                <div className="inline">
                  <Button
                    disabled={busy || conflict}
                    variant="danger"
                    onClick={() => void remove()}
                  >
                    <Trash2 size={15} />
                    {base ? "删除笔记" : "放弃新笔记"}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!dirty || busy || conflict}
                    onClick={() => void save()}
                  >
                    <Save size={15} />
                    {busy ? "保存中…" : "保存笔记"}
                  </Button>
                </div>
              </div>
              {error && (
                <div className="error-message" role="alert">
                  {error}
                </div>
              )}
              {conflict && (
                <div className="error-message" role="alert">
                  此笔记已在其他窗口修改或删除，当前草稿已保留。
                  <Button
                    disabled={busy}
                    onClick={() => {
                      if (canLeave()) load(live || notes[0] || null);
                    }}
                  >
                    加载最新内容
                  </Button>
                </div>
              )}
              <Field label="笔记标题" required>
                <input
                  value={draft.title}
                  maxLength={160}
                  disabled={busy}
                  placeholder="输入笔记标题"
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </Field>
              <div
                className="project-note-tabs"
                role="tablist"
                aria-label="正文模式"
              >
                <button
                  role="tab"
                  aria-selected={mode === "edit"}
                  onClick={() => setMode("edit")}
                >
                  <FileText size={15} />
                  编辑
                </button>
                <button
                  role="tab"
                  aria-selected={mode === "preview"}
                  onClick={() => setMode("preview")}
                >
                  <BookOpen size={15} />
                  预览
                </button>
                <span className="muted small">
                  Markdown · {draft.content.length.toLocaleString()} 字符
                </span>
              </div>
              {mode === "edit" ? (
                <textarea
                  className="project-note-source"
                  aria-label="笔记正文"
                  value={draft.content}
                  maxLength={1000000}
                  disabled={busy}
                  placeholder={
                    "# 项目说明\n\n支持 Markdown，也可以直接输入普通文本。"
                  }
                  onChange={(e) =>
                    setDraft({ ...draft, content: e.target.value })
                  }
                />
              ) : (
                <div
                  className="project-note-preview"
                  role="region"
                  aria-label="Markdown 预览"
                >
                  {draft.content.trim() ? (
                    <Markdown
                      skipHtml
                      disallowedElements={["img"]}
                      components={{
                        a: ({ node: _node, ...props }) => (
                          <a
                            {...props}
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        ),
                      }}
                    >
                      {draft.content}
                    </Markdown>
                  ) : (
                    <p className="muted">暂无正文，切换到编辑添加内容。</p>
                  )}
                </div>
              )}
              <p className="muted small project-note-dates">
                创建：{date(base?.createdAt || draft.createdAt)}
                <span>更新：{base ? date(base.updatedAt) : "尚未保存"}</span>
              </p>
            </>
          ) : (
            <Empty
              title="还没有项目笔记"
              detail="创建第一篇笔记，记录项目说明和备忘。"
              action={
                <Button variant="primary" onClick={create}>
                  <Plus size={16} />
                  新建第一篇笔记
                </Button>
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}
