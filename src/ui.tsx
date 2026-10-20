import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Check, ChevronRight, FileCode2, Info, X } from "lucide-react";

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      type="button"
      className={`button button-${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string;
}) {
  const color =
    tone ||
    (
      {
        草稿: "gray",
        就绪: "green",
        已归档: "gray",
        成功: "green",
        失败: "red",
        新增: "green",
        修改: "blue",
        生产: "orange",
        测试: "blue",
        备份完成: "green",
      } as Record<string, string>
    )[String(children)] ||
    "gray";
  return (
    <span className={`badge badge-${color}`}>
      <i />
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <em>*</em>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const titleId = useId();
  const container = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () =>
      Array.from(
        container.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ) || [],
      );
    (
      container.current?.querySelector<HTMLElement>(
        "input:not([readonly]):not([disabled]),select:not([disabled]),textarea:not([disabled])",
      ) || controls()[0]
    )?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const items = controls();
        if (!items.length) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
          event.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", listener);
      prior?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={container}
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="关闭弹窗"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <FileCode2 size={28} />
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function Note({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`note note-${tone}`}>
      <Info size={16} />
      <div>{children}</div>
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function highlight(line: string) {
  const pattern =
    /(--.*$|'[^']*'|`[^`]*`|\b(?:ALTER|TABLE|ADD|COLUMN|NOT|NULL|DEFAULT|COMMENT|AFTER|UPDATE|SET|WHERE|SHOW|COLUMNS|FROM|LIKE|CREATE|INDEX|ON|DROP|INSERT|INTO|VALUES|SELECT|varchar)\b|\b\d+\b)/gi;
  const result: ReactNode[] = [];
  let end = 0;
  for (const match of line.matchAll(pattern)) {
    const start = match.index!;
    if (start > end) result.push(line.slice(end, start));
    const value = match[0];
    const token = value.startsWith("--")
      ? "comment"
      : value.startsWith("'")
        ? "string"
        : value.startsWith("`")
          ? "identifier"
          : /^\d/.test(value)
            ? "number"
            : "keyword";
    result.push(
      <span key={start} className={`syntax-${token}`}>
        {value}
      </span>,
    );
    end = start + value.length;
  }
  if (end < line.length) result.push(line.slice(end));
  return result;
}

export function CodeView({
  content,
  label = "代码内容",
}: {
  content: string;
  label?: string;
}) {
  return (
    <div className="code-view" aria-label={label}>
      {content.split("\n").map((line, index) => (
        <div className="code-line" key={index}>
          <span className="line-number">{index + 1}</span>
          <code>{highlight(line) || " "}</code>
        </div>
      ))}
    </div>
  );
}

function diffLines(before: string, after: string) {
  const oldLines = before ? before.split("\n") : [];
  const newLines = after ? after.split("\n") : [];
  const lengths = Array.from({ length: oldLines.length + 1 }, () =>
    new Array<number>(newLines.length + 1).fill(0),
  );
  for (let i = oldLines.length - 1; i >= 0; i--)
    for (let j = newLines.length - 1; j >= 0; j--)
      lengths[i][j] =
        oldLines[i] === newLines[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  const result: { text: string; kind: string }[] = [];
  let i = 0,
    j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (
      i < oldLines.length &&
      j < newLines.length &&
      oldLines[i] === newLines[j]
    ) {
      result.push({ text: oldLines[i++], kind: "same" });
      j++;
    } else if (
      j < newLines.length &&
      (i === oldLines.length || lengths[i][j + 1] > lengths[i + 1][j])
    )
      result.push({ text: newLines[j++], kind: "add" });
    else result.push({ text: oldLines[i++], kind: "remove" });
  }
  return result;
}

export function DiffView({ before, after }: { before: string; after: string }) {
  const changes = diffLines(before, after);
  return (
    <div className="diff-view">
      <div className="diff-legend">
        <span>
          <i className="diff-dot add" />
          当前版本
        </span>
        <span>
          <i className="diff-dot remove" />
          上一版内容
        </span>
        {!before && <small>新增文件</small>}
      </div>
      {changes.map((line, index) => (
        <div key={index} className={`diff-line diff-${line.kind}`}>
          <span className="line-number">{index + 1}</span>
          <b>
            {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
          </b>
          <code>{line.text || " "}</code>
        </div>
      ))}
    </div>
  );
}

export function Checklist({ items }: { items: string[] }) {
  return (
    <div className="checklist">
      {items.map((item) => (
        <div key={item}>
          <Check size={15} />
          <span>{item}</span>
          <ChevronRight size={14} />
        </div>
      ))}
    </div>
  );
}

export function downloadText(
  name: string,
  text: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
