interface TopBarProps {
  logicalDay: string;
  onOpenSearch(): void;
  onOpenSettings(): void;
}

export function TopBar({ logicalDay, onOpenSearch, onOpenSettings }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="meta">{logicalDay}</div>
      <div className="topbar-actions">
        <button className="settings-btn" onClick={onOpenSearch} aria-label="Search all items">
          Search
        </button>
        <button className="settings-btn" onClick={onOpenSettings} aria-label="Open app settings">
          Settings
        </button>
      </div>
    </header>
  );
}
