import { Outlet } from "@tanstack/react-router";
import * as React from "react";
import { Status, Toaster } from "@glaze/core/components";
import { useTheme, useConnection, useEnvironment } from "@glaze/core/hooks";

export function RootView() {
  useTheme();

  // IPC connection and environment
  const connectionQuery = useConnection();
  const environmentQuery = useEnvironment();

  // Cleanup IPC connection on unmount
  React.useEffect(() => {
    return () => {
      window.glazeAPI?.glaze?.ipc?.disconnect();
    };
  }, []);

  // Full-bleed shell; each screen provides its own top drag-region header.
  return (
    <div className="h-full w-full">
      <Outlet />
      <Toaster />

      <div className="flex flex-col items-end gap-1 mt-2 fixed bottom-12 right-2 z-40">
        {import.meta.env.DEV ? (
          <>
            {connectionQuery.error ? <Status variant="error">Backend disconnected</Status> : null}
            {environmentQuery.data ? null : <Status variant="error">Dev Server not found</Status>}
          </>
        ) : null}
      </div>
    </div>
  );
}
