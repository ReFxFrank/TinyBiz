// One-time localStorage migration from the app's old "tinybiz-*" key names.
// Copy rather than move so a still-open tab running the previous build keeps
// working until it reloads. Called at store-module load, before persist reads.
export function migrateKey(oldKey: string, newKey: string) {
  try {
    if (localStorage.getItem(newKey) === null) {
      const old = localStorage.getItem(oldKey)
      if (old !== null) localStorage.setItem(newKey, old)
    }
  } catch {
    // storage unavailable (private mode etc.) — defaults apply
  }
}
