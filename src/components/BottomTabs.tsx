import { Tab } from "../state/useAppData";

interface BottomTabsProps {
  tab: Tab;
  setTab(tab: Tab): void;
}

export function BottomTabs({ tab, setTab }: BottomTabsProps) {
  return (
    <nav className="tabs" aria-label="Main navigation">
      {[
        ["notes", "Notes"],
        ["tasks", "Tasks"],
        ["today", "Today"],
        ["projects", "Projects"],
        ["more", "More"],
      ].map(([id, label]) => (
        <button
          key={id}
          aria-current={tab === id ? "page" : undefined}
          className={tab === id ? "active" : ""}
          onClick={() => setTab(id as Tab)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
