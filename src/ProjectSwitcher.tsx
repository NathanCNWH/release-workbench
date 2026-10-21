import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, FolderGit2 } from "lucide-react";
import type { Project } from "./types";

export default function ProjectSwitcher({
  projects,
  project,
  onSelect,
}: {
  projects: Project[];
  project: Project;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [focused, setFocused] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    options = useRef<Array<HTMLButtonElement | null>>([]),
    id = useId();
  useEffect(() => {
    if (!open) return;
    options.current[focused]?.focus();
  }, [open, focused]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const show = () => {
    setFocused(
      Math.max(
        0,
        projects.findIndex((p) => p.id === project.id),
      ),
    );
    setOpen(true);
  };
  return (
    <div
      className="project-switcher"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          setOpen(false);
      }}
    >
      <button
        type="button"
        className="project-switcher-trigger"
        ref={trigger}
        aria-label={`切换当前项目，当前：${project.name}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        disabled={!projects.length}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            show();
          }
          if (event.key === "Escape") close();
        }}
      >
        <span className={`mini-project-avatar ${project.color}`}>
          <FolderGit2 size={17} />
        </span>
        <span className="project-switcher-label">{project.name}</span>
        <ChevronDown size={15} className={open ? "expanded" : ""} />
      </button>
      {open && (
        <div
          className="project-switcher-menu"
          id={id}
          role="listbox"
          aria-label="项目列表"
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              setFocused(
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? projects.length - 1
                    : (focused +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        projects.length) %
                      projects.length,
              );
            }
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        >
          {projects.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={item.id === project.id}
              tabIndex={focused === index ? 0 : -1}
              ref={(element) => {
                options.current[index] = element;
              }}
              className={item.id === project.id ? "selected" : ""}
              key={item.id}
              onFocus={() => setFocused(index)}
              onClick={() => {
                onSelect(item.id);
                close();
              }}
            >
              <span className={`mini-project-avatar ${item.color}`}>
                <FolderGit2 size={15} />
              </span>
              <span>
                <strong>{item.name}</strong>
                <small>{item.key}</small>
              </span>
              {item.id === project.id && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
