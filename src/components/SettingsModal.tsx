interface SettingsModalProps {
  showDebugTools: boolean;
  setShowDebugTools(next: boolean): void;
  swVersion: string;
  logicalDay: string;
  isCheckingUpdate: boolean;
  isApplyingUpdate: boolean;
  closeSettingsPopup(): void;
  checkForUpdates(): Promise<void>;
  decrementLogicalDay(): Promise<void>;
  incrementLogicalDay(): Promise<void>;
  resetLogicalDayToToday(): Promise<void>;
  setLogicalDay(day: string): Promise<void>;
}

export function SettingsModal({
  showDebugTools,
  setShowDebugTools,
  swVersion,
  logicalDay,
  isCheckingUpdate,
  isApplyingUpdate,
  closeSettingsPopup,
  checkForUpdates,
  decrementLogicalDay,
  incrementLogicalDay,
  resetLogicalDayToToday,
  setLogicalDay,
}: SettingsModalProps) {
  return (
    <div className="modal-backdrop" onClick={closeSettingsPopup}>
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-top">
          <h3>App Settings</h3>
          <button onClick={closeSettingsPopup}>Close</button>
        </div>
        <div className="card">
          <div className="title">Application Version</div>
          <div className="tags">Version: {swVersion}</div>
          <div className="actions">
            <button onClick={() => void checkForUpdates()} disabled={isCheckingUpdate || isApplyingUpdate}>
              {isApplyingUpdate ? "Applying update..." : isCheckingUpdate ? "Checking updates..." : "Check for update"}
            </button>
            <button onClick={() => setShowDebugTools(!showDebugTools)}>{showDebugTools ? "Hide debug tools" : "Debug tools"}</button>
          </div>
        </div>
        {showDebugTools && (
          <div className="card">
            <div className="title">Debug Date Control</div>
            <div className="tags">Logical Day: {logicalDay}</div>
            <div className="actions">
              <button onClick={() => void decrementLogicalDay()}>-1 Day</button>
              <button onClick={() => void incrementLogicalDay()}>+1 Day</button>
              <button onClick={() => void resetLogicalDayToToday()}>Reset to Today</button>
              <button
                onClick={() => {
                  const day = window.prompt("Set logical day YYYY-MM-DD", logicalDay);
                  if (day) void setLogicalDay(day);
                }}
              >
                Set Date
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
