import packageJson from "../../package.json";

/** App release version from package.json (e.g. "1.2.2"). */
export const APP_VERSION = packageJson.version;

export const APP_VERSION_LABEL = `v${APP_VERSION}`;
