// Folks home — the single minimal discovery surface (private AI conversation +
// inline topic matches). The temporary human room is a sibling route that reuses
// this same window (see router.tsx).

import { DiscoveryScreen } from "../components/discovery/discovery-screen";

export function HomeView() {
  return <DiscoveryScreen />;
}
