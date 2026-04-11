import { useRef } from "react";

interface SettingsModalProps {
  showDebugTools: boolean;
  setShowDebugTools(next: boolean): void;
  swVersion: string;
  logicalDay: string;
  logicalOffset: number;
  isCheckingUpdate: boolean;
  isApplyingUpdate: boolean;
  closeSettingsPopup(): void;
  checkForUpdates(): Promise<void>;
  exportData(): Promise<void>;
  importData(file: File): Promise<void>;
  deleteAllData(): Promise<void>;
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
  logicalOffset,
  isCheckingUpdate,
  isApplyingUpdate,
  closeSettingsPopup,
  checkForUpdates,
  exportData,
  importData,
  deleteAllData,
  decrementLogicalDay,
  incrementLogicalDay,
  resetLogicalDayToToday,
  setLogicalDay,
}: SettingsModalProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

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
        <div className="card">
          <div className="title">Data Management</div>
          <div className="tags">Export, import, or reset your app data.</div>
          <div className="actions">
            <button onClick={() => void exportData()}>Export data to JSON</button>
            <button onClick={() => importInputRef.current?.click()}>Import data from JSON</button>
            <button className="danger" onClick={() => void deleteAllData()}>
              Delete all data
            </button>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) {
                void importData(file);
              }
              e.currentTarget.value = "";
            }}
          />
        </div>
        {showDebugTools && (
          <div className="card">
            <div className="title">Debug Date Control</div>
            <div className="tags">
              Logical Day: {logicalDay} (offset {logicalOffset >= 0 ? `+${logicalOffset}` : logicalOffset})
            </div>
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
