/** Deep-link targets used by notifications, service worker, and URL params. */
export type SettingsSection = "profile" | "household" | "categories" | "appearance" | "data";

export type AppNavigationIntent = {
  viewMode?: "household";
  settingsSection?: SettingsSection;
  openSettings?: boolean;
  openAddExpense?: boolean;
};

export function parseAppNavigation(
  input: string | null | undefined,
  searchParams?: URLSearchParams,
): AppNavigationIntent {
  const intent: AppNavigationIntent = {};

  if (searchParams) {
    const view = searchParams.get("view")?.toLowerCase();
    const settings = (searchParams.get("settings") ?? searchParams.get("tab"))?.toLowerCase();
    if (view === "household") intent.viewMode = "household";
    if (settings === "household") {
      intent.settingsSection = "household";
      intent.openSettings = true;
    }
    if (searchParams.get("action")?.toLowerCase() === "add") intent.openAddExpense = true;
    return intent;
  }

  if (!input) return intent;

  let path = input;
  let query = "";
  try {
    const url = new URL(input, typeof window !== "undefined" ? window.location.origin : "https://finlo.local");
    path = url.pathname;
    query = url.search;
  } catch {
    // relative path only
  }

  const params = new URLSearchParams(query);
  if (path.includes("settings") || params.get("tab") === "household" || params.get("settings") === "household") {
    intent.openSettings = true;
    intent.settingsSection = "household";
  }
  if (params.get("view") === "household" || path.includes("view=household")) {
    intent.viewMode = "household";
  }
  if (params.get("action") === "add") intent.openAddExpense = true;

  return intent;
}

export function householdNotificationLink() {
  return "/?settings=household";
}

export function householdViewLink() {
  return "/?view=household";
}
