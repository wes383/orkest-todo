/**
 * The build's version number — printed once, at the foot of the settings page.
 *
 * Read from `package.json` and inlined by Vite at build time, rather than
 * asked of the running binary: the page then needs no async call and no Tauri
 * permission to draw one faint line of grey text, and it renders the same in
 * a plain browser (`pnpm dev`) as it does inside the shell.
 *
 * Which file this reads does not matter as long as the habit holds: the
 * version is bumped in four places at once — here, `src-tauri/tauri.conf.json`,
 * `src-tauri/Cargo.toml` and the `orkest-todo` entry in `Cargo.lock`.
 */
import { version } from "../../package.json";

export const APP_VERSION = version;
